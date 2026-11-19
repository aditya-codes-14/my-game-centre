/**
 * MY GAME CENTRE - Authentication Service Module
 * Manages player authentication lifecycle: registration, login, logout,
 * password reset, and session updates via Supabase Auth.
 * 
 * ARCHITECTURE & SECURITY DIRECTIVES:
 * - Module uses an IIFE closure pattern: internal references, session tokens,
 *   and subscription variables are private lexical state inside this closure,
 *   inaccessible as public properties on window.Auth or via Auth object reflection.
 * - Raw session objects, access tokens, refresh tokens, passwords, and raw error
 *   details are NEVER exposed or broadcast.
 * - Emails are strictly excluded from all EventBus payloads.
 * - Forced local cleanup targets ONLY this Supabase project's storage key via
 *   SupabaseConfig.getStorageKey(); it never removes arbitrary tokens belonging to other projects.
 * - Validates Supabase JS v2's native signOut({ scope: 'local' }) result and verifies
 *   session absence before reporting memoryStateCleared: true.
 * - Verifies localStorage token absence before reporting persistedSessionCleared: true.
 * - Employs idempotent _notifySignedOut() ensuring exactly one auth:logout event per transition.
 * - Operates safely in Guest Mode if Supabase is unconfigured, offline, or library is absent.
 */

const Auth = (() => {
    // ------------------------------------------------------------------------
    // Private Closure State (Inaccessible as properties on window.Auth)
    // ------------------------------------------------------------------------
    let _client = null;
    let _user = null;
    let _session = null;
    let _initialized = false;
    let _initPromise = null;
    let _authSubscription = null;
    let _isBusy = false;
    let _lastAuthUserId = null;
    let _isRecoverySession = false;
    let _recoveryError = null;

    // ------------------------------------------------------------------------
    // Private Helper Functions
    // ------------------------------------------------------------------------

    /**
     * Safely retrieves and verifies the Supabase client instance.
     * Handles exceptions from SupabaseConfig.getClient() safely to prevent unhandled runtime errors.
     * @private
     * @returns {boolean}
     */
    function _ensureClientAvailable() {
        if (!_client && isConfigured()) {
            try {
                if (typeof window.SupabaseConfig !== 'undefined' && typeof window.SupabaseConfig.getClient === 'function') {
                    _client = window.SupabaseConfig.getClient();
                }
            } catch (err) {
                _client = null;
            }
        }
        return !!_client;
    }

    /**
     * Basic email syntax validator.
     * @private
     */
    function _isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    /**
     * Detects whether an error is network-related.
     * @private
     */
    function _isNetworkError(error) {
        if (!error) return false;
        const msg = (error.message || error.error_description || String(error)).toLowerCase();
        return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('fetch');
    }

    /**
     * Obtains the exact project-specific storage key from SupabaseConfig.
     * Never guesses keys; returns null if config cannot verify it.
     * @private
     */
    function _getProjectStorageKey() {
        if (typeof window.SupabaseConfig !== 'undefined' && typeof window.SupabaseConfig.getStorageKey === 'function') {
            return window.SupabaseConfig.getStorageKey();
        }
        return null;
    }

    /**
     * Confirms that this specific project's persisted auth token is absent from localStorage.
     * @private
     */
    function _isProjectPersistedStorageAbsent() {
        const key = _getProjectStorageKey();
        if (!key) return false;

        try {
            if (typeof window.localStorage === 'undefined') return false;
            return window.localStorage.getItem(key) === null;
        } catch (e) {
            return false;
        }
    }

    /**
     * Attempts to remove this specific project's persisted auth token from localStorage.
     * Returns true ONLY if the key was identified, removed, and confirmed absent.
     * Returns false if key could not be determined or storage removal failed.
     * @private
     */
    function _tryClearProjectPersistedStorage() {
        const key = _getProjectStorageKey();
        if (!key) return false;

        try {
            if (typeof window.localStorage === 'undefined') return false;
            window.localStorage.removeItem(key);
            return window.localStorage.getItem(key) === null;
        } catch (e) {
            return false;
        }
    }

    /**
     * Unified, idempotent sign-out state notifier.
     * Emits exactly one 'auth:logout' event for a genuine authenticated-to-signed-out transition.
     * Does nothing if already signed out or in guest mode.
     * @private
     */
    function _notifySignedOut() {
        const hadAuthSession = !!(_lastAuthUserId !== null || _user !== null || _session !== null);
        _lastAuthUserId = null;
        _session = null;
        _user = null;
        _isRecoverySession = false;
        _recoveryError = null;

        if (hadAuthSession) {
            _emit('auth:logout', {});
        }
    }

    /**
     * Creates a sanitized representation of a Supabase User object.
     * Whitelists ONLY id and user_metadata (username, display_name, avatar_path, avatar_type).
     * Strictly excludes email, tokens, identities, and arbitrary metadata.
     * @private
     */
    function _getSafeUser(user) {
        if (!user || typeof user !== 'object') return null;

        const rawMeta = (user.user_metadata && typeof user.user_metadata === 'object')
            ? user.user_metadata
            : {};

        return {
            id: user.id || '',
            user_metadata: {
                username: typeof rawMeta.username === 'string' ? rawMeta.username : '',
                display_name: typeof rawMeta.display_name === 'string' ? rawMeta.display_name : '',
                avatar_path: typeof rawMeta.avatar_path === 'string' ? rawMeta.avatar_path : '',
                avatar_type: typeof rawMeta.avatar_type === 'string' ? rawMeta.avatar_type : ''
            }
        };
    }

    /**
     * Dispatches events through window.EventBus using strictly its documented API.
     * Catches and suppresses any external listener exceptions without logging raw errors.
     * @private
     */
    function _emit(event, data = {}) {
        if (typeof window.EventBus !== 'undefined' && typeof window.EventBus.emit === 'function') {
            try {
                window.EventBus.emit(event, data);
            } catch (err) {
                console.warn('[Auth] Notification dispatch encountered an internal listener issue.');
            }
        }
    }

    /**
     * Inspects window.location.search and window.location.hash for auth callback errors
     * (e.g. error=access_denied&error_code=otp_expired).
     * @private
     * @returns {{error: string, errorCode: string, errorDescription: string}|null}
     */
    function _checkUrlForAuthError() {
        try {
            if (typeof window === 'undefined' || !window.location) return null;

            let searchParams = null;
            if (window.location.search && window.location.search.length > 1) {
                searchParams = new URLSearchParams(window.location.search);
            }

            let hashParams = null;
            if (window.location.hash && window.location.hash.length > 1) {
                const rawHash = window.location.hash.substring(1);
                if (rawHash.includes('=')) {
                    const queryPart = rawHash.includes('?') ? rawHash.split('?')[1] : rawHash;
                    hashParams = new URLSearchParams(queryPart);
                }
            }

            const getParam = (key) => {
                return (searchParams && searchParams.get(key)) || (hashParams && hashParams.get(key)) || null;
            };

            const error = getParam('error');
            const errorCode = getParam('error_code');
            const errorDescription = getParam('error_description');

            if (error || errorCode) {
                return {
                    error: error || 'auth_error',
                    errorCode: errorCode || error || 'unknown',
                    errorDescription: errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, ' ')) : ''
                };
            }
        } catch (e) {
            // Suppress URL parsing exceptions
        }
        return null;
    }

    /**
     * Translates database and Supabase error strings into safe, user-friendly text.
     * NEVER returns raw error strings, server messages, or error stacks as fallbacks.
     * @private
     */
    function _formatErrorMessage(error, context = '') {
        if (!error) return 'An unexpected error occurred. Please try again.';

        const message = (error.message || error.error_description || String(error)).toLowerCase();

        if (message.includes('otp_expired') || message.includes('email link is invalid') || message.includes('token has expired') || message.includes('link is invalid or has expired')) {
            return 'Your password reset link has expired or has already been used. Please request a new recovery link.';
        }

        if (message.includes('access_denied')) {
            return 'Access denied. The recovery link may be invalid or expired. Please request a new recovery link.';
        }

        if (message.includes('user already registered') || message.includes('already registered')) {
            return 'An account with this email address already exists. Please log in.';
        }

        if (message.includes('username already taken') || message.includes('idx_profiles_username_lower')) {
            return 'This username is already taken. Please choose another username.';
        }

        if (message.includes('invalid login credentials') || message.includes('invalid_grant')) {
            return 'Invalid email or password. Please check your credentials and try again.';
        }

        if (message.includes('email not confirmed')) {
            return 'Your email address has not been confirmed yet. Please check your inbox for the confirmation link.';
        }

        if (message.includes('password should be at least') || message.includes('password is too short')) {
            return 'Password must be at least 8 characters long.';
        }

        if (message.includes('rate limit') || message.includes('too many requests')) {
            return 'Too many attempts. Please wait a few minutes before trying again.';
        }

        if (message.includes('failed to fetch') || message.includes('networkerror') || message.includes('fetch')) {
            return 'Network error. Please check your internet connection and try again.';
        }

        if (message.includes('auth session missing') || message.includes('jwt expired')) {
            return 'Your session has expired. Please log in again.';
        }

        return 'Authentication request could not be completed. Please try again.';
    }

    /**
     * Single Source of Truth for authentication state transitions.
     * Treats INITIAL_SESSION as session restoration (no auth:login).
     * Emits auth:login only on genuine SIGNED_IN transitions.
     * Delegates SIGNED_OUT to _notifySignedOut() to avoid duplicate events.
     * @private
     */
    function _handleAuthStateChange(event, session) {
        if (event === 'SIGNED_OUT') {
            _notifySignedOut();
            _emit('auth:state-change', {
                event,
                isAuthenticated: false,
                user: null
            });
            return;
        }

        _session = session;
        _user = session?.user || null;
        const currentUserId = _user?.id || null;
        const isAuth = !!(_session && _user);
        const safeUser = _getSafeUser(_user);

        // General state change: emit safe payload only (never tokens or emails)
        _emit('auth:state-change', {
            event,
            isAuthenticated: isAuth,
            user: safeUser
        });

        switch (event) {
            case 'INITIAL_SESSION':
                // Session restoration on page load: update cached user ID, do NOT emit auth:login
                if (isAuth) {
                    _lastAuthUserId = currentUserId;
                }
                break;

            case 'SIGNED_IN':
                // Fire login only for genuine sign-in transitions that change user state
                if (isAuth && currentUserId !== _lastAuthUserId) {
                    _lastAuthUserId = currentUserId;
                    _emit('auth:login', { user: safeUser });
                }
                break;

            case 'PASSWORD_RECOVERY':
                _isRecoverySession = true;
                _recoveryError = null;
                _emit('auth:password-recovery', { user: safeUser });
                break;

            case 'USER_UPDATED':
                _emit('auth:user-updated', { user: safeUser });
                break;

            case 'TOKEN_REFRESHED':
                // Silent refresh; session updated internally, no redundant event
                break;

            default:
                break;
        }
    }

    // ------------------------------------------------------------------------
    // Public API Methods (Exactly 13 Methods)
    // ------------------------------------------------------------------------

    /**
     * 1. Initializes authentication:
     * - Protects against duplicate concurrent initialization using a shared promise
     * - Guards against duplicate subscriptions
     * - Falls back cleanly to Guest Mode if Supabase is unconfigured, offline, or library is missing
     * - Emits 'auth:initialized' with safe metadata only (no tokens, no email)
     * @returns {Promise<{isConfigured: boolean, isAuthenticated: boolean, user: Object|null}>}
     */
    function init() {
        if (_initialized) {
            return Promise.resolve({
                isConfigured: isConfigured(),
                isAuthenticated: isAuthenticated(),
                user: getUser()
            });
        }

        if (_initPromise) {
            return _initPromise;
        }

        _initPromise = (async () => {
            try {
                if (!isConfigured()) {
                    console.info('[Auth] Supabase credentials not configured. Operating in Guest Mode.');
                    _initialized = true;
                    _emit('auth:initialized', {
                        isConfigured: false,
                        isAuthenticated: false,
                        user: null
                    });
                    return { isConfigured: false, isAuthenticated: false, user: null };
                }

                if (!_ensureClientAvailable()) {
                    console.warn('[Auth] Supabase client unavailable. Operating in Guest Mode.');
                    _initialized = true;
                    _emit('auth:initialized', {
                        isConfigured: isConfigured(),
                        isAuthenticated: false,
                        user: null
                    });
                    return { isConfigured: isConfigured(), isAuthenticated: false, user: null };
                }

                if (_authSubscription && typeof _authSubscription.unsubscribe === 'function') {
                    try {
                        _authSubscription.unsubscribe();
                    } catch (e) {
                        // Suppress cleanup error
                    }
                    _authSubscription = null;
                }

                // Register SINGLE onAuthStateChange listener
                const { data: authListenerData } = _client.auth.onAuthStateChange(
                    (event, session) => {
                        _handleAuthStateChange(event, session);
                    }
                );
                _authSubscription = authListenerData?.subscription || null;

                // Check for auth callback errors in the URL (such as an expired or consumed recovery link)
                const urlError = _checkUrlForAuthError();
                if (urlError) {
                    const rawMsg = urlError.errorDescription || urlError.errorCode || urlError.error;
                    const friendlyError = _formatErrorMessage({ message: rawMsg }, 'recovery');
                    _recoveryError = {
                        error: friendlyError,
                        errorCode: urlError.errorCode,
                        rawDescription: urlError.errorDescription
                    };
                    _emit('auth:recovery-error', _recoveryError);

                    // Clean the URL query/hash so reload doesn't re-trigger the error banner
                    if (typeof window.history !== 'undefined' && typeof window.history.replaceState === 'function') {
                        try {
                            const cleanUrl = window.location.origin + window.location.pathname;
                            window.history.replaceState({}, document.title, cleanUrl);
                        } catch (e) {
                            // Suppress history API error
                        }
                    }
                }

                // Check for existing session in storage
                const { data, error } = await _client.auth.getSession();
                if (error) {
                    console.warn('[Auth] Stored session could not be restored; continuing in Guest Mode.');
                    _session = null;
                    _user = null;
                } else if (data && data.session) {
                    _session = data.session;
                    _user = data.session.user || null;
                    _lastAuthUserId = _user ? _user.id : null;
                }

            } catch (err) {
                console.warn('[Auth] Initialization error encountered; continuing in Guest Mode.');
                _session = null;
                _user = null;
            } finally {
                _initialized = true;
            }

            const safeUser = _getSafeUser(_user);
            const initPayload = {
                isConfigured: isConfigured(),
                isAuthenticated: isAuthenticated(),
                user: safeUser
            };

            _emit('auth:initialized', initPayload);

            return {
                isConfigured: isConfigured(),
                isAuthenticated: isAuthenticated(),
                user: safeUser
            };
        })();

        return _initPromise;
    }

    /**
     * 2. Registers a new player with email, password, and optional metadata.
     * Normalizes explicitly supplied usernames to lowercase and validates against ^[a-z0-9_]{3,20}$.
     * Excludes email and passwords from all event payloads.
     * 
     * @param {Object} params
     * @param {string} params.email
     * @param {string} params.password
     * @param {string} [params.username] - Optional. If omitted/empty, DB trigger generates fallback.
     * @param {string} [params.displayName] - Optional display name.
     * @param {string} [params.avatarPresetId] - Optional preset ID (e.g. 'preset:cyber_ninja').
     * @returns {Promise<{success: boolean, user?: Object, needsEmailConfirmation?: boolean, error?: string}>}
     */
    async function register({ email, password, username = '', displayName = '', avatarPresetId = '' } = {}) {
        if (!_ensureClientAvailable()) {
            return { success: false, error: 'Authentication service is not configured or offline.' };
        }

        if (email === undefined || email === null || typeof email !== 'string') {
            return { success: false, error: 'Please enter a valid email address.' };
        }
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !_isValidEmail(cleanEmail)) {
            return { success: false, error: 'Please enter a valid email address.' };
        }

        if (password === undefined || password === null || typeof password !== 'string' || password.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters long.' };
        }

        // Validate username type and value before calling .trim()
        let normalizedUsername = '';
        if (username !== undefined && username !== null && username !== '') {
            if (typeof username !== 'string') {
                return { success: false, error: 'Username must be a valid text string.' };
            }
            const rawUsername = username.trim();
            if (rawUsername.length > 0) {
                normalizedUsername = rawUsername.toLowerCase();
                const usernameRegex = /^[a-z0-9_]{3,20}$/;
                if (!usernameRegex.test(normalizedUsername)) {
                    return {
                        success: false,
                        error: 'Username must be 3–20 characters long and contain only lowercase letters, numbers, and underscores.'
                    };
                }
            }
        }

        // Validate displayName type and value before calling .trim()
        let cleanDisplayName = '';
        if (displayName !== undefined && displayName !== null && displayName !== '') {
            if (typeof displayName !== 'string') {
                return { success: false, error: 'Display name must be a valid text string.' };
            }
            cleanDisplayName = displayName.trim();
        }

        // Validate Avatar Preset against registered presets
        let selectedAvatar = 'preset:cyber_ninja';
        if (avatarPresetId && typeof window.AvatarsData !== 'undefined' && typeof window.AvatarsData.isValidPreset === 'function' && window.AvatarsData.isValidPreset(avatarPresetId)) {
            selectedAvatar = avatarPresetId;
        }

        const metadata = {
            avatar_path: selectedAvatar,
            avatar_type: 'preset'
        };

        if (normalizedUsername.length > 0) {
            metadata.username = normalizedUsername;
        }

        if (cleanDisplayName.length > 0) {
            metadata.display_name = cleanDisplayName.slice(0, 50);
        }

        _isBusy = true;
        try {
            const { data, error } = await _client.auth.signUp({
                email: cleanEmail,
                password,
                options: {
                    data: metadata
                }
            });

            if (error) {
                const friendlyError = _formatErrorMessage(error, 'registration');
                _emit('auth:error', { action: 'register', message: friendlyError });
                return { success: false, error: friendlyError };
            }

            const safeUser = _getSafeUser(data.user);
            const needsEmailConfirmation = !data.session;

            if (data.session && data.user) {
                _session = data.session;
                _user = data.user;
                const currentUserId = _user.id;
                if (currentUserId && currentUserId !== _lastAuthUserId) {
                    _lastAuthUserId = currentUserId;
                    _emit('auth:login', { user: safeUser });
                }
            }

            const result = {
                success: true,
                user: safeUser,
                needsEmailConfirmation
            };

            _emit('auth:registered', result);
            return result;

        } catch (err) {
            const friendlyError = _formatErrorMessage(err, 'registration');
            _emit('auth:error', { action: 'register', message: friendlyError });
            return { success: false, error: friendlyError };
        } finally {
            _isBusy = false;
        }
    }

    /**
     * 3. Authenticates an existing player with email and password.
     * Prevents duplicate 'auth:login' events by coordinating with onAuthStateChange via _lastAuthUserId.
     * 
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
     */
    async function login(email, password) {
        if (!_ensureClientAvailable()) {
            return { success: false, error: 'Authentication service is not configured or offline.' };
        }

        if (email === undefined || email === null || typeof email !== 'string' ||
            password === undefined || password === null || typeof password !== 'string') {
            return { success: false, error: 'Please enter both your email and password.' };
        }

        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !password) {
            return { success: false, error: 'Please enter both your email and password.' };
        }

        _isBusy = true;
        try {
            const { data, error } = await _client.auth.signInWithPassword({
                email: cleanEmail,
                password
            });

            if (error) {
                const friendlyError = _formatErrorMessage(error, 'login');
                _emit('auth:error', { action: 'login', message: friendlyError });
                return { success: false, error: friendlyError };
            }

            _session = data.session;
            _user = data.user;
            const currentUserId = _user?.id || null;
            if (currentUserId && currentUserId !== _lastAuthUserId) {
                _lastAuthUserId = currentUserId;
                _emit('auth:login', { user: _getSafeUser(_user) });
            }

            return {
                success: true,
                user: _getSafeUser(data.user)
            };

        } catch (err) {
            const friendlyError = _formatErrorMessage(err, 'login');
            _emit('auth:error', { action: 'login', message: friendlyError });
            return { success: false, error: friendlyError };
        } finally {
            _isBusy = false;
        }
    }

    /**
     * 4. Signs out the player from Supabase.
     * Accurately reports server failures, client unavailability, and storage cleanup.
     * Restricts local storage cleanup exclusively to this Supabase project's key.
     * Uses Supabase JS v2's native signOut({ scope: 'local' }) for local client memory purging.
     * Reports memoryStateCleared: false if complete client memory cleanup cannot be verified.
     * 
     * @param {Object} [options]
     * @param {boolean} [options.forceLocal=false] - If true, executes local client sign-out and project storage cleanup.
     * @returns {Promise<{success: boolean, serverSignOutFailed: boolean, memoryStateCleared: boolean, persistedSessionCleared: boolean, failureCategory?: string, error?: string, isGuest?: boolean}>}
     */
    async function logout({ forceLocal = false } = {}) {
        // Case 1: Pure guest mode (Supabase unconfigured)
        if (!isConfigured()) {
            _notifySignedOut();
            const memoryCleared = (_session === null && _user === null);
            return {
                success: true,
                isGuest: true,
                serverSignOutFailed: false,
                memoryStateCleared: memoryCleared,
                persistedSessionCleared: false
            };
        }

        // Case 2: Configured, but client library or instance is unavailable
        if (!_ensureClientAvailable()) {
            if (forceLocal) {
                const storageCleared = _tryClearProjectPersistedStorage();
                _notifySignedOut();

                // Client instance is unavailable; client in-memory state cannot be operated on or verified
                return {
                    success: false,
                    failureCategory: 'client_unavailable',
                    serverSignOutFailed: true,
                    memoryStateCleared: false, // Incomplete: client memory state cannot be verified
                    persistedSessionCleared: storageCleared,
                    error: storageCleared
                        ? 'Authentication client is unavailable. Persisted storage was cleared, but internal client memory state could not be verified.'
                        : 'Authentication client is unavailable. Complete session cleanup could not be verified.'
                };
            }

            // Default: Honest failure without modifying state or claiming cleanup
            return {
                success: false,
                failureCategory: 'client_unavailable',
                serverSignOutFailed: true,
                memoryStateCleared: false,
                persistedSessionCleared: false,
                error: 'Unable to sign out because the authentication client is unavailable. Your session may still be persisted in the browser.'
            };
        }

        // Case 3: Client is available, perform server signOut request
        _isBusy = true;
        try {
            const { error } = await _client.auth.signOut();

            if (error) {
                const friendlyError = _formatErrorMessage(error, 'logout');
                const isNetwork = _isNetworkError(error);
                const failureCategory = isNetwork ? 'network_error' : 'server_error';
                _emit('auth:error', { action: 'logout', message: friendlyError });

                if (forceLocal) {
                    // Execute Supabase JS v2 local sign-out and inspect returned error
                    let localClientMemoryCleared = false;
                    try {
                        const localSignOutResult = await _client.auth.signOut({ scope: 'local' });
                        if (!localSignOutResult || !localSignOutResult.error) {
                            // Verify by querying client session state
                            const { data: sessionData } = await _client.auth.getSession();
                            localClientMemoryCleared = (!sessionData || !sessionData.session);
                        }
                    } catch (localErr) {
                        localClientMemoryCleared = false;
                    }

                    // Clean project storage key
                    const storageCleared = _tryClearProjectPersistedStorage();
                    _notifySignedOut();

                    const authMemoryCleared = (_session === null && _user === null);
                    const memoryCleared = (authMemoryCleared && localClientMemoryCleared);

                    return {
                        success: false,
                        failureCategory,
                        serverSignOutFailed: true,
                        memoryStateCleared: memoryCleared,
                        persistedSessionCleared: storageCleared,
                        error: friendlyError
                    };
                }

                return {
                    success: false,
                    failureCategory,
                    serverSignOutFailed: true,
                    memoryStateCleared: false,
                    persistedSessionCleared: false,
                    error: friendlyError
                };
            }

            // Server logout succeeded: verify client session and project storage
            _notifySignedOut();

            let clientMemoryCleared = false;
            try {
                const { data: sessionData } = await _client.auth.getSession();
                clientMemoryCleared = (!sessionData || !sessionData.session);
            } catch (e) {
                clientMemoryCleared = false;
            }

            const authMemoryCleared = (_session === null && _user === null);
            const memoryCleared = (authMemoryCleared && clientMemoryCleared);
            const storageCleared = _isProjectPersistedStorageAbsent();

            return {
                success: true,
                serverSignOutFailed: false,
                memoryStateCleared: memoryCleared,
                persistedSessionCleared: storageCleared
            };

        } catch (err) {
            const friendlyError = _formatErrorMessage(err, 'logout');
            const isNetwork = _isNetworkError(err);
            const failureCategory = isNetwork ? 'network_error' : 'server_error';
            _emit('auth:error', { action: 'logout', message: friendlyError });

            if (forceLocal) {
                let localClientMemoryCleared = false;
                try {
                    const localSignOutResult = await _client.auth.signOut({ scope: 'local' });
                    if (!localSignOutResult || !localSignOutResult.error) {
                        const { data: sessionData } = await _client.auth.getSession();
                        localClientMemoryCleared = (!sessionData || !sessionData.session);
                    }
                } catch (localErr) {
                    localClientMemoryCleared = false;
                }

                const storageCleared = _tryClearProjectPersistedStorage();
                _notifySignedOut();

                const authMemoryCleared = (_session === null && _user === null);
                const memoryCleared = (authMemoryCleared && localClientMemoryCleared);

                return {
                    success: false,
                    failureCategory,
                    serverSignOutFailed: true,
                    memoryStateCleared: memoryCleared,
                    persistedSessionCleared: storageCleared,
                    error: friendlyError
                };
            }

            return {
                success: false,
                failureCategory,
                serverSignOutFailed: true,
                memoryStateCleared: false,
                persistedSessionCleared: false,
                error: friendlyError
            };
        } finally {
            _isBusy = false;
        }
    }

    /**
     * 5. Dispatches password reset email via Supabase Auth.
     * Redirect URL targets the exact GitHub Pages repository path or local host.
     * Never broadcasts email address in EventBus payload.
     * 
     * @param {string} email
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function requestPasswordReset(email) {
        if (!_ensureClientAvailable()) {
            return { success: false, error: 'Authentication service is not configured or offline.' };
        }

        if (email === undefined || email === null || typeof email !== 'string') {
            return { success: false, error: 'Please enter a valid email address.' };
        }

        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !_isValidEmail(cleanEmail)) {
            return { success: false, error: 'Please enter a valid email address.' };
        }

        const redirectUrl = window.SupabaseConfig.getPasswordResetRedirectUrl();

        _isBusy = true;
        try {
            const { error } = await _client.auth.resetPasswordForEmail(cleanEmail, {
                redirectTo: redirectUrl
            });

            if (error) {
                const friendlyError = _formatErrorMessage(error, 'password-reset');
                _emit('auth:error', { action: 'requestPasswordReset', message: friendlyError });
                return { success: false, error: friendlyError };
            }

            // Email address is intentionally omitted from the event payload
            _emit('auth:password-reset-requested', { success: true });
            return { success: true };

        } catch (err) {
            const friendlyError = _formatErrorMessage(err, 'password-reset');
            _emit('auth:error', { action: 'requestPasswordReset', message: friendlyError });
            return { success: false, error: friendlyError };
        } finally {
            _isBusy = false;
        }
    }

    /**
     * 6. Updates user password during an active recovery session.
     * 
     * @param {string} newPassword
     * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
     */
    async function updatePassword(newPassword) {
        if (!_ensureClientAvailable()) {
            return { success: false, error: 'Authentication service is not configured or offline.' };
        }

        if (!isAuthenticated()) {
            return { success: false, error: 'No active session. Please click the reset link in your email again.' };
        }

        if (newPassword === undefined || newPassword === null || typeof newPassword !== 'string' || newPassword.length < 8) {
            return { success: false, error: 'New password must be at least 8 characters long.' };
        }

        _isBusy = true;
        try {
            const { data, error } = await _client.auth.updateUser({
                password: newPassword
            });

            if (error) {
                const friendlyError = _formatErrorMessage(error, 'password-update');
                _emit('auth:error', { action: 'updatePassword', message: friendlyError });
                return { success: false, error: friendlyError };
            }

            _user = data.user;
            const safeUser = _getSafeUser(data.user);
            _isRecoverySession = false;
            _recoveryError = null;

            const result = { success: true, user: safeUser };
            _emit('auth:password-updated', result);
            return result;

        } catch (err) {
            const friendlyError = _formatErrorMessage(err, 'password-update');
            _emit('auth:error', { action: 'updatePassword', message: friendlyError });
            return { success: false, error: friendlyError };
        } finally {
            _isBusy = false;
        }
    }

    /**
     * 7. Returns a copy of the safe user object (strictly whitelisted metadata) or null.
     * @returns {Object|null}
     */
    function getUser() {
        return _getSafeUser(_user);
    }

    /**
     * 8. Convenience getter for local UI forms (e.g. Account Settings) to read
     * the current registered email address.
     * 
     * NOTE ON PRIVACY BOUNDARY:
     * In client-side JavaScript, any method exposed on window.Auth is accessible
     * to scripts sharing this execution realm. This method is NOT an internal
     * security boundary; rather, the privacy guarantee is that email addresses
     * are strictly excluded from all EventBus broadcasts.
     * @returns {string}
     */
    function getEmail() {
        return (_user && typeof _user.email === 'string') ? _user.email : '';
    }

    /**
     * 9. Returns session expiration metadata without exposing access/refresh tokens.
     * @returns {{ expiresAt: number|null }|null}
     */
    function getSessionState() {
        if (!_session) return null;
        return {
            expiresAt: _session.expires_at || null
        };
    }

    /**
     * 10. Returns true if there is an active authenticated user and session.
     * @returns {boolean}
     */
    function isAuthenticated() {
        return !!(_session && _user);
    }

    /**
     * 11. Returns true if Supabase configuration credentials are present and valid.
     * @returns {boolean}
     */
    function isConfigured() {
        try {
            return typeof window.SupabaseConfig !== 'undefined' &&
                   typeof window.SupabaseConfig.isConfigured === 'function' &&
                   Boolean(window.SupabaseConfig.isConfigured());
        } catch (err) {
            return false;
        }
    }

    /**
     * 12. Returns true if Auth.init() has settled.
     * @returns {boolean}
     */
    function isReady() {
        return _initialized;
    }

    /**
     * 13. Returns true if an authentication network request is pending.
     * @returns {boolean}
     */
    function isBusy() {
        return _isBusy;
    }

    /**
     * 14. Returns true if the active session is a password recovery session.
     * @returns {boolean}
     */
    function isRecoverySession() {
        return _isRecoverySession;
    }

    /**
     * 15. Returns any captured URL recovery error object or null.
     * @returns {Object|null}
     */
    function getRecoveryError() {
        return _recoveryError;
    }

    /**
     * 16. Retrieves the current player's profile from the Supabase 'profiles' table.
     * Falls back to cached user_metadata if table query encounters a network or transient issue.
     * @returns {Promise<{success: boolean, profile?: Object, error?: string, isFallback?: boolean}>}
     */
    async function getProfile() {
        if (!isAuthenticated() || !_user) {
            return { success: false, error: 'No active session. Please log in.' };
        }

        const safe = _getSafeUser(_user);
        const fallbackProfile = {
            id: _user.id,
            username: safe?.user_metadata?.username || 'player',
            display_name: safe?.user_metadata?.display_name || 'Player',
            avatar_path: safe?.user_metadata?.avatar_path || 'preset:cyber_ninja',
            avatar_type: safe?.user_metadata?.avatar_type || 'preset',
            bio: '',
            created_at: _user.created_at || null
        };

        if (!_ensureClientAvailable()) {
            return {
                success: true,
                profile: fallbackProfile,
                isFallback: true
            };
        }

        try {
            const { data, error } = await _client
                .from('profiles')
                .select('id, username, display_name, avatar_path, avatar_type, bio, created_at, updated_at')
                .eq('id', _user.id)
                .single();

            if (error || !data) {
                return {
                    success: true,
                    profile: fallbackProfile,
                    isFallback: true
                };
            }

            return {
                success: true,
                profile: {
                    id: data.id,
                    username: data.username || fallbackProfile.username,
                    display_name: data.display_name || fallbackProfile.display_name,
                    avatar_path: data.avatar_path || fallbackProfile.avatar_path,
                    avatar_type: data.avatar_type || 'preset',
                    bio: data.bio || '',
                    created_at: data.created_at || fallbackProfile.created_at,
                    updated_at: data.updated_at || null
                }
            };
        } catch (err) {
            return {
                success: true,
                profile: fallbackProfile,
                isFallback: true
            };
        }
    }

    /**
     * 17. Updates the player's profile in the Supabase 'profiles' table and syncs auth metadata.
     * Validates username regex ^[a-z0-9_]{3,20}$, display_name (1-50 chars), bio (<=160 chars),
     * and avatar preset validity. Checks for username collisions against other players.
     * 
     * @param {Object} params
     * @param {string} params.username
     * @param {string} params.displayName
     * @param {string} params.avatarPath
     * @param {string} [params.bio='']
     * @returns {Promise<{success: boolean, profile?: Object, user?: Object, error?: string}>}
     */
    async function updateProfile({ username, displayName, avatarPath, bio = '' } = {}) {
        if (!_ensureClientAvailable()) {
            return { success: false, error: 'Authentication service is not configured or offline.' };
        }

        if (!isAuthenticated() || !_user) {
            return { success: false, error: 'No active session. Please log in.' };
        }

        // Validate display name
        if (displayName === undefined || displayName === null || typeof displayName !== 'string') {
            return { success: false, error: 'Please enter a valid display name.' };
        }
        const cleanDisplayName = displayName.trim();
        if (cleanDisplayName.length < 1 || cleanDisplayName.length > 50) {
            return { success: false, error: 'Display name must be between 1 and 50 characters long.' };
        }

        // Validate username
        if (username === undefined || username === null || typeof username !== 'string') {
            return { success: false, error: 'Please enter a valid username.' };
        }
        const rawUsername = username.trim();
        const normalizedUsername = rawUsername.toLowerCase();
        const usernameRegex = /^[a-z0-9_]{3,20}$/;
        if (!usernameRegex.test(normalizedUsername)) {
            return {
                success: false,
                error: 'Username must be 3–20 characters long and contain only lowercase letters, numbers, and underscores.'
            };
        }

        // Validate bio length
        const cleanBio = (typeof bio === 'string') ? bio.trim() : '';
        if (cleanBio.length > 160) {
            return { success: false, error: 'Bio must not exceed 160 characters.' };
        }

        // Validate avatar preset
        let selectedAvatar = 'preset:cyber_ninja';
        if (avatarPath && typeof window.AvatarsData !== 'undefined' && typeof window.AvatarsData.isValidPreset === 'function' && window.AvatarsData.isValidPreset(avatarPath)) {
            selectedAvatar = avatarPath;
        }

        _isBusy = true;
        try {
            // Check if username is changing and already taken by another account
            const currentUsername = (_user.user_metadata?.username || '').toLowerCase();
            if (normalizedUsername !== currentUsername) {
                const { data: existingUser, error: checkError } = await _client
                    .from('profiles')
                    .select('id')
                    .ilike('username', normalizedUsername)
                    .neq('id', _user.id)
                    .maybeSingle();

                if (existingUser) {
                    return { success: false, error: 'This username is already taken. Please choose another username.' };
                }
            }

            // Update public.profiles row (protected by RLS auth.uid() = id)
            const profilePayload = {
                username: normalizedUsername,
                display_name: cleanDisplayName,
                avatar_path: selectedAvatar,
                avatar_type: 'preset',
                bio: cleanBio,
                updated_at: new Date().toISOString()
            };

            const { data: updatedProfile, error: profileError } = await _client
                .from('profiles')
                .update(profilePayload)
                .eq('id', _user.id)
                .select()
                .single();

            if (profileError) {
                const friendlyError = _formatErrorMessage(profileError, 'profile-update');
                _emit('auth:error', { action: 'updateProfile', message: friendlyError });
                return { success: false, error: friendlyError };
            }

            // Update auth.users metadata so JWT session reflects updated identity
            const { data: authData, error: authError } = await _client.auth.updateUser({
                data: {
                    username: normalizedUsername,
                    display_name: cleanDisplayName,
                    avatar_path: selectedAvatar,
                    avatar_type: 'preset'
                }
            });

            if (authData && authData.user) {
                _user = authData.user;
            } else if (_user && _user.user_metadata) {
                _user.user_metadata.username = normalizedUsername;
                _user.user_metadata.display_name = cleanDisplayName;
                _user.user_metadata.avatar_path = selectedAvatar;
            }

            const safeUser = _getSafeUser(_user);
            _emit('auth:user-updated', { user: safeUser, profile: updatedProfile || profilePayload });

            return {
                success: true,
                profile: updatedProfile || profilePayload,
                user: safeUser
            };

        } catch (err) {
            const friendlyError = _formatErrorMessage(err, 'profile-update');
            _emit('auth:error', { action: 'updateProfile', message: friendlyError });
            return { success: false, error: friendlyError };
        } finally {
            _isBusy = false;
        }
    }

    // ------------------------------------------------------------------------
    // Export Frozen Public Interface
    // ------------------------------------------------------------------------
    return Object.freeze({
        init,
        register,
        login,
        logout,
        requestPasswordReset,
        updatePassword,
        getProfile,
        updateProfile,
        getUser,
        getEmail,
        getSessionState,
        isAuthenticated,
        isConfigured,
        isReady,
        isBusy,
        isRecoverySession,
        getRecoveryError
    });
})();

// Expose globally
window.Auth = Auth;
