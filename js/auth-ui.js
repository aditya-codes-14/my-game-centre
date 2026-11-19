/**
 * MY GAME CENTRE - Authentication UI Controller
 * Module: AuthUI
 * 
 * Manages the user interface layer for player authentication:
 * - Guest mode preservation: all games remain freely playable without signing in.
 * - Modal lifecycle: opening, closing, view switching (Login, Register, Forgot Password, Reset Password).
 * - Form validation and safe submission through the frozen Auth service API.
 * - Preset avatar rendering and selection using AvatarsData.
 * - Reactive navbar and account dropdown menu updates based on EventBus auth events.
 * - Game lifecycle integration: pauses active games (such as Snake) when opening modal;
 *   never automatically resumes Snake on modal close (manual resume preserved).
 * - Strict security: safe textContent DOM updates; zero raw token, password, or session exposure;
 *   and strict enforcement of active Supabase recovery session verification before password resets.
 */

const AuthUI = (() => {
    // ------------------------------------------------------------------------
    // Private State
    // ------------------------------------------------------------------------
    let _initialized = false;
    let _currentView = 'login';
    let _hasValidRecoverySession = false;
    let _submitting = false;

    // Cached DOM element references
    let _elements = {};

    // View header configuration (Title & Subtitle for each screen)
    const VIEW_HEADERS = {
        login: {
            title: 'PILOT ACCESS',
            subtitle: 'Sign in to sync your high scores & profile'
        },
        register: {
            title: 'PILOT REGISTRATION',
            subtitle: 'Create your profile to compete on the global leaderboard'
        },
        forgot: {
            title: 'PASSWORD RECOVERY',
            subtitle: "Enter your registered email to receive a recovery link"
        },
        reset: {
            title: 'UPDATE SECURITY KEY',
            subtitle: 'Enter a new password for your account'
        }
    };

    // ------------------------------------------------------------------------
    // DOM Element Retrieval & Caching
    // ------------------------------------------------------------------------
    function _cacheElements() {
        _elements = {
            // Navbar controls
            navAuthBtn: document.getElementById('nav-auth-btn'),
            navUserBtn: document.getElementById('nav-user-btn'),
            navUserAvatar: document.getElementById('nav-user-avatar'),
            navUserName: document.getElementById('nav-user-name'),

            // Account dropdown
            accountDropdown: document.getElementById('account-dropdown'),
            dropdownUserAvatar: document.getElementById('dropdown-user-avatar'),
            dropdownDisplayName: document.getElementById('dropdown-display-name'),
            dropdownUsername: document.getElementById('dropdown-username'),
            dropdownEmail: document.getElementById('dropdown-email'),
            dropdownProfileBtn: document.getElementById('dropdown-profile-btn'),
            dropdownSettingsBtn: document.getElementById('dropdown-settings-btn'),
            accountLogoutBtn: document.getElementById('account-logout-btn'),

            // Profile Modal elements
            modalProfile: document.getElementById('modal-profile'),
            profileModalCloseBtn: document.getElementById('profile-modal-close-btn'),
            profileModalTitle: document.getElementById('profile-modal-title'),
            profileModalSubtitle: document.getElementById('profile-modal-subtitle'),
            profileTabBtn: document.getElementById('profile-tab-btn'),
            settingsTabBtn: document.getElementById('settings-tab-btn'),
            profileErrorBanner: document.getElementById('profile-error-banner'),
            profileErrorText: document.getElementById('profile-error-text'),
            profileSuccessBanner: document.getElementById('profile-success-banner'),
            profileSuccessText: document.getElementById('profile-success-text'),
            profileViewDetails: document.getElementById('profile-view-details'),
            profileViewSettings: document.getElementById('profile-view-settings'),

            // Profile Form elements
            formProfile: document.getElementById('form-profile'),
            profileAvatarPreview: document.getElementById('profile-avatar-preview'),
            profileDisplayUsername: document.getElementById('profile-display-username'),
            profileDisplayName: document.getElementById('profile-display-name'),
            profileUsername: document.getElementById('profile-username'),
            profileBio: document.getElementById('profile-bio'),
            profileBioCounter: document.getElementById('profile-bio-counter'),
            profileAvatarGrid: document.getElementById('profile-avatar-grid'),
            profileSelectedAvatar: document.getElementById('profile-selected-avatar'),
            profileSaveBtn: document.getElementById('profile-save-btn'),

            // Account Settings elements
            settingsEmailDisplay: document.getElementById('settings-email-display'),
            settingsCreatedDate: document.getElementById('settings-created-date'),
            settingsSoundStatus: document.getElementById('settings-sound-status'),
            settingsSoundToggleBtn: document.getElementById('settings-sound-toggle-btn'),
            settingsChangePasswordBtn: document.getElementById('settings-change-password-btn'),

            // Modal container & header
            modal: document.getElementById('modal-auth'),
            modalTitle: document.getElementById('auth-modal-title'),
            modalSubtitle: document.getElementById('auth-modal-subtitle'),
            modalCloseBtn: document.getElementById('auth-modal-close-btn'),

            // Tabs navigation
            tabsNav: document.getElementById('auth-tabs-nav'),
            tabLogin: document.getElementById('auth-tab-login'),
            tabRegister: document.getElementById('auth-tab-register'),

            // Banners (alerts)
            errorBanner: document.getElementById('auth-error-banner'),
            errorText: document.getElementById('auth-error-text'),
            successBanner: document.getElementById('auth-success-banner'),
            successText: document.getElementById('auth-success-text'),

            // View screens
            views: {
                login: document.getElementById('auth-view-login'),
                register: document.getElementById('auth-view-register'),
                forgot: document.getElementById('auth-view-forgot'),
                reset: document.getElementById('auth-view-reset')
            },

            // Login Form
            formLogin: document.getElementById('form-login'),
            loginEmail: document.getElementById('login-email'),
            loginPassword: document.getElementById('login-password'),
            loginSubmitBtn: document.getElementById('login-submit-btn'),
            gotoForgotBtn: document.getElementById('auth-goto-forgot-btn'),
            gotoRegisterBtn: document.getElementById('auth-goto-register-btn'),

            // Register Form
            formRegister: document.getElementById('form-register'),
            registerEmail: document.getElementById('register-email'),
            registerPassword: document.getElementById('register-password'),
            registerUsername: document.getElementById('register-username'),
            registerDisplayName: document.getElementById('register-display-name'),
            registerAvatarGrid: document.getElementById('register-avatar-grid'),
            registerSelectedAvatar: document.getElementById('register-selected-avatar'),
            registerSubmitBtn: document.getElementById('register-submit-btn'),
            gotoLoginBtn: document.getElementById('auth-goto-login-btn'),

            // Forgot Password Form
            formForgot: document.getElementById('form-forgot'),
            forgotEmail: document.getElementById('forgot-email'),
            forgotSubmitBtn: document.getElementById('forgot-submit-btn'),
            forgotBackBtn: document.getElementById('auth-forgot-back-btn'),

            // Reset Password Form
            formReset: document.getElementById('form-reset'),
            resetPassword: document.getElementById('reset-password'),
            resetConfirmPassword: document.getElementById('reset-confirm-password'),
            resetSubmitBtn: document.getElementById('reset-submit-btn'),

            // Global Toast Notification
            toast: document.getElementById('toast-notification')
        };
    }

    // ------------------------------------------------------------------------
    // UI Helpers & Feedback Banners
    // ------------------------------------------------------------------------

    /**
     * Safely displays an error banner using textContent. Never injects innerHTML.
     * @param {string} message 
     */
    function _showError(message) {
        if (_elements.successBanner) _elements.successBanner.classList.add('hidden');
        if (_elements.errorText) {
            _elements.errorText.textContent = message || 'An unexpected error occurred. Please try again.';
        }
        if (_elements.errorBanner) {
            _elements.errorBanner.classList.remove('hidden');
        }
    }

    /**
     * Safely displays a success banner using textContent.
     * @param {string} message 
     */
    function _showSuccess(message) {
        if (_elements.errorBanner) _elements.errorBanner.classList.add('hidden');
        if (_elements.successText) {
            _elements.successText.textContent = message || 'Operation completed successfully.';
        }
        if (_elements.successBanner) {
            _elements.successBanner.classList.remove('hidden');
        }
    }

    /**
     * Clears and hides all modal alert banners.
     */
    function _clearBanners() {
        if (_elements.errorBanner) _elements.errorBanner.classList.add('hidden');
        if (_elements.errorText) _elements.errorText.textContent = '';
        if (_elements.successBanner) _elements.successBanner.classList.add('hidden');
        if (_elements.successText) _elements.successText.textContent = '';
    }

    /**
     * Displays an error banner inside the Profile Management modal using textContent.
     * @param {string} message 
     */
    function _showProfileError(message) {
        if (_elements.profileSuccessBanner) _elements.profileSuccessBanner.classList.add('hidden');
        if (_elements.profileErrorText) {
            _elements.profileErrorText.textContent = message || 'An unexpected error occurred. Please try again.';
        }
        if (_elements.profileErrorBanner) {
            _elements.profileErrorBanner.classList.remove('hidden');
        }
    }

    /**
     * Displays a success banner inside the Profile Management modal using textContent.
     * @param {string} message 
     */
    function _showProfileSuccess(message) {
        if (_elements.profileErrorBanner) _elements.profileErrorBanner.classList.add('hidden');
        if (_elements.profileSuccessText) {
            _elements.profileSuccessText.textContent = message || 'Operation completed successfully.';
        }
        if (_elements.profileSuccessBanner) {
            _elements.profileSuccessBanner.classList.remove('hidden');
        }
    }

    /**
     * Clears all alert banners inside the Profile Management modal.
     */
    function _clearProfileBanners() {
        if (_elements.profileErrorBanner) _elements.profileErrorBanner.classList.add('hidden');
        if (_elements.profileErrorText) _elements.profileErrorText.textContent = '';
        if (_elements.profileSuccessBanner) _elements.profileSuccessBanner.classList.add('hidden');
        if (_elements.profileSuccessText) _elements.profileSuccessText.textContent = '';
    }

    /**
     * Displays a transient toast pill using the website's existing mechanism.
     * @param {string} message 
     */
    function _showToast(message) {
        if (window.App && typeof window.App.showToast === 'function') {
            window.App.showToast(message);
        } else if (_elements.toast) {
            _elements.toast.textContent = message;
            _elements.toast.classList.remove('hidden');
            _elements.toast.classList.add('visible');
            setTimeout(() => {
                _elements.toast.classList.remove('visible');
                setTimeout(() => _elements.toast.classList.add('hidden'), 300);
            }, 2200);
        }
    }

    /**
     * Clears all sensitive password fields in all forms.
     */
    function _clearPasswordFields() {
        if (_elements.loginPassword) _elements.loginPassword.value = '';
        if (_elements.registerPassword) _elements.registerPassword.value = '';
        if (_elements.resetPassword) _elements.resetPassword.value = '';
        if (_elements.resetConfirmPassword) _elements.resetConfirmPassword.value = '';
    }

    /**
     * Sets button busy / loading indicator state to prevent double submissions.
     * @param {HTMLButtonElement} button 
     * @param {boolean} isBusy 
     * @param {string} [busyText='Please wait...']
     */
    function _setButtonBusy(button, isBusy, busyText = 'Please wait...') {
        if (!button) return;
        button.disabled = isBusy;
        const textSpan = button.querySelector('.btn-text');
        if (isBusy) {
            if (!button.dataset.originalText && textSpan) {
                button.dataset.originalText = textSpan.textContent;
            }
            if (textSpan) {
                textSpan.textContent = busyText;
            }
        } else {
            if (button.dataset.originalText && textSpan) {
                textSpan.textContent = button.dataset.originalText;
                delete button.dataset.originalText;
            }
        }
    }

    // ------------------------------------------------------------------------
    // View Switching & Modal Control
    // ------------------------------------------------------------------------

    /**
     * Switches the active authentication screen inside the modal.
     * @param {'login'|'register'|'forgot'|'reset'} viewName 
     */
    function _switchView(viewName) {
        if (!_elements.views || !_elements.views[viewName]) {
            viewName = 'login';
        }

        _clearBanners();
        _clearPasswordFields();

        // Security check for password reset screen
        if (viewName === 'reset') {
            const hasAuthRecovery = typeof window.Auth !== 'undefined' &&
                (window.Auth.isAuthenticated() || (typeof window.Auth.isRecoverySession === 'function' && window.Auth.isRecoverySession()));
            if (!_hasValidRecoverySession || !hasAuthRecovery) {
                console.warn('[AuthUI] Direct navigation to password reset blocked; no active recovery session.');
                viewName = 'forgot';
                _showError('No active password recovery session. Please request a new recovery link.');
            }
        }

        _currentView = viewName;

        // Update modal title and subtitle
        const headerInfo = VIEW_HEADERS[viewName] || VIEW_HEADERS.login;
        if (_elements.modalTitle) _elements.modalTitle.textContent = headerInfo.title;
        if (_elements.modalSubtitle) _elements.modalSubtitle.textContent = headerInfo.subtitle;

        // Toggle top navigation tabs visibility & active state
        if (_elements.tabsNav) {
            if (viewName === 'login' || viewName === 'register') {
                _elements.tabsNav.style.display = 'flex';
                if (_elements.tabLogin) {
                    const isLogin = viewName === 'login';
                    _elements.tabLogin.classList.toggle('active', isLogin);
                    _elements.tabLogin.setAttribute('aria-selected', isLogin ? 'true' : 'false');
                }
                if (_elements.tabRegister) {
                    const isReg = viewName === 'register';
                    _elements.tabRegister.classList.toggle('active', isReg);
                    _elements.tabRegister.setAttribute('aria-selected', isReg ? 'true' : 'false');
                }
            } else {
                // Hide tabs for secondary recovery flows
                _elements.tabsNav.style.display = 'none';
            }
        }

        // Toggle active screen visibility
        Object.keys(_elements.views).forEach(key => {
            const screenEl = _elements.views[key];
            if (!screenEl) return;
            const isTarget = key === viewName;
            screenEl.classList.toggle('active', isTarget);
        });

        // Set focus to the first interactive input field in the newly opened view
        setTimeout(() => {
            const activeScreen = _elements.views[viewName];
            if (activeScreen) {
                const firstInput = activeScreen.querySelector('input:not([type="hidden"])');
                if (firstInput) firstInput.focus();
            }
        }, 60);
    }

    /**
     * Opens the authentication modal.
     * Preserves Snake pause behavior: actively running game is paused cleanly.
     * @param {'login'|'register'|'forgot'|'reset'} [initialView='login'] 
     */
    function _openModal(initialView = 'login') {
        if (!_elements.modal) return;

        // Suspend active game cleanly (Snake, etc.)
        if (typeof window.GameManager !== 'undefined' && typeof window.GameManager.pauseActive === 'function') {
            window.GameManager.pauseActive();
        }

        // Notify system that an authentication modal has opened
        if (window.EventBus) {
            window.EventBus.emit('modal:open', { modalId: 'auth' });
        }

        if (window.SoundManager && typeof window.SoundManager.playClick === 'function') {
            window.SoundManager.playClick();
        }

        _switchView(initialView);
        _elements.modal.classList.remove('hidden');
    }

    /**
     * Closes the authentication modal.
     * CRITICAL LIFECYCLE BEHAVIOR:
     * Emits modal:close on EventBus, but does NOT automatically resume Snake.
     * Snake must remain paused until the user explicitly resumes it manually.
     */
    function _closeModal() {
        if (!_elements.modal || _elements.modal.classList.contains('hidden')) return;

        _elements.modal.classList.add('hidden');
        _clearBanners();
        _clearPasswordFields();

        if (window.SoundManager && typeof window.SoundManager.playClick === 'function') {
            window.SoundManager.playClick();
        }

        // Notify modal:close; does NOT call GameManager.resumeActive()
        if (window.EventBus) {
            window.EventBus.emit('modal:close', { modalId: 'auth' });
        }
    }

    // ------------------------------------------------------------------------
    // Avatar Preset Picker Grid
    // ------------------------------------------------------------------------

    /**
     * Populates the preset avatar picker grid in the registration form.
     */
    function _renderAvatarPresets() {
        const grid = _elements.registerAvatarGrid;
        if (!grid) return;

        // Clear existing children cleanly
        grid.innerHTML = '';

        if (typeof window.AvatarsData === 'undefined' || typeof window.AvatarsData.getAll !== 'function') {
            return;
        }

        const presets = window.AvatarsData.getAll();
        const selectedId = _elements.registerSelectedAvatar ? _elements.registerSelectedAvatar.value : 'preset:cyber_ninja';

        presets.forEach(preset => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'avatar-preset-btn';
            btn.setAttribute('role', 'radio');
            btn.setAttribute('data-preset-id', preset.id);
            btn.setAttribute('aria-label', preset.name);

            const isSelected = preset.id === selectedId;
            btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
            if (isSelected) {
                btn.classList.add('selected');
            }

            const img = document.createElement('img');
            img.src = window.AvatarsData.toDataUri(preset.id);
            img.alt = preset.name;
            img.loading = 'lazy';

            btn.appendChild(img);

            btn.addEventListener('click', () => {
                _selectAvatarPreset(preset.id);
            });

            grid.appendChild(btn);
        });
    }

    /**
     * Updates the selected preset avatar in the registration form.
     * @param {string} presetId 
     */
    function _selectAvatarPreset(presetId) {
        if (_elements.registerSelectedAvatar) {
            _elements.registerSelectedAvatar.value = presetId;
        }

        const buttons = document.querySelectorAll('#register-avatar-grid .avatar-preset-btn');
        buttons.forEach(btn => {
            const isMatch = btn.getAttribute('data-preset-id') === presetId;
            btn.classList.toggle('selected', isMatch);
            btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
        });

        if (window.SoundManager && typeof window.SoundManager.playClick === 'function') {
            window.SoundManager.playClick();
        }
    }

    // ------------------------------------------------------------------------
    // Profile Management Modal & Identity Controls
    // ------------------------------------------------------------------------

    /**
     * Populates the preset avatar grid in the Profile modal.
     * @param {string} [currentPresetId='preset:cyber_ninja']
     */
    function _renderProfileAvatarPresets(currentPresetId = 'preset:cyber_ninja') {
        const grid = _elements.profileAvatarGrid;
        if (!grid) return;

        grid.innerHTML = '';
        if (typeof window.AvatarsData === 'undefined' || typeof window.AvatarsData.getAll !== 'function') {
            return;
        }

        const presets = window.AvatarsData.getAll();
        const selectedId = currentPresetId || (_elements.profileSelectedAvatar ? _elements.profileSelectedAvatar.value : 'preset:cyber_ninja');

        presets.forEach(preset => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'avatar-preset-btn';
            btn.setAttribute('role', 'radio');
            btn.setAttribute('data-preset-id', preset.id);
            btn.setAttribute('aria-label', preset.name);

            const isSelected = preset.id === selectedId;
            btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
            if (isSelected) {
                btn.classList.add('selected');
            }

            const img = document.createElement('img');
            img.src = window.AvatarsData.toDataUri(preset.id);
            img.alt = preset.name;
            img.loading = 'lazy';

            btn.appendChild(img);

            btn.addEventListener('click', () => {
                _selectProfileAvatarPreset(preset.id);
            });

            grid.appendChild(btn);
        });
    }

    /**
     * Updates the selected preset avatar in the Profile modal and updates the live preview.
     * @param {string} presetId 
     */
    function _selectProfileAvatarPreset(presetId) {
        if (_elements.profileSelectedAvatar) {
            _elements.profileSelectedAvatar.value = presetId;
        }

        // Live preview update
        if (_elements.profileAvatarPreview && typeof window.AvatarsData !== 'undefined' && typeof window.AvatarsData.toDataUri === 'function') {
            _elements.profileAvatarPreview.src = window.AvatarsData.toDataUri(presetId);
        }

        const buttons = document.querySelectorAll('#profile-avatar-grid .avatar-preset-btn');
        buttons.forEach(btn => {
            const isMatch = btn.getAttribute('data-preset-id') === presetId;
            btn.classList.toggle('selected', isMatch);
            btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
        });

        if (window.SoundManager && typeof window.SoundManager.playClick === 'function') {
            window.SoundManager.playClick();
        }
    }

    /**
     * Updates the bio character counter and visual warning colors.
     * @param {string} text 
     */
    function _updateBioCounter(text = '') {
        if (!_elements.profileBioCounter) return;
        const len = (typeof text === 'string') ? text.length : 0;
        _elements.profileBioCounter.textContent = `${len}/160`;
        _elements.profileBioCounter.classList.toggle('near-limit', len >= 145 && len < 160);
        _elements.profileBioCounter.classList.toggle('at-limit', len >= 160);
    }

    /**
     * Formats an ISO creation date string into a user-friendly format (e.g. "November 19, 2026").
     * @param {string} dateString 
     */
    function _formatCreationDate(dateString) {
        if (!_elements.settingsCreatedDate || !dateString) return;
        try {
            const d = new Date(dateString);
            if (!isNaN(d.getTime())) {
                const formatted = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                _elements.settingsCreatedDate.textContent = formatted;
                return;
            }
        } catch (e) {
            // Suppress date parsing exceptions
        }
        _elements.settingsCreatedDate.textContent = 'Active Pilot';
    }

    /**
     * Synchronizes the sound preference indicator with SoundManager.
     */
    function _updateSettingsSoundStatus() {
        if (!_elements.settingsSoundStatus) return;
        const isEnabled = typeof window.SoundManager !== 'undefined' && window.SoundManager.isEnabled();
        _elements.settingsSoundStatus.textContent = isEnabled ? 'Sound: ON' : 'Sound: OFF';
        _elements.settingsSoundStatus.style.color = isEnabled ? 'var(--neon-cyan)' : 'var(--text-muted)';
    }

    /**
     * Switches active tab in the Profile Management modal ('profile' or 'settings').
     * @param {'profile'|'settings'} tabName 
     */
    function _switchProfileTab(tabName) {
        _clearProfileBanners();

        const isProfile = tabName === 'profile';

        if (_elements.profileTabBtn) {
            _elements.profileTabBtn.classList.toggle('active', isProfile);
            _elements.profileTabBtn.setAttribute('aria-selected', isProfile ? 'true' : 'false');
        }
        if (_elements.settingsTabBtn) {
            _elements.settingsTabBtn.classList.toggle('active', !isProfile);
            _elements.settingsTabBtn.setAttribute('aria-selected', !isProfile ? 'true' : 'false');
        }

        if (_elements.profileViewDetails) {
            _elements.profileViewDetails.classList.toggle('active', isProfile);
            _elements.profileViewDetails.classList.toggle('hidden', !isProfile);
        }
        if (_elements.profileViewSettings) {
            _elements.profileViewSettings.classList.toggle('active', !isProfile);
            _elements.profileViewSettings.classList.toggle('hidden', isProfile);
        }

        if (_elements.profileModalTitle) {
            _elements.profileModalTitle.textContent = isProfile ? 'PILOT PROFILE' : 'ACCOUNT SETTINGS';
        }
        if (_elements.profileModalSubtitle) {
            _elements.profileModalSubtitle.textContent = isProfile
                ? 'Manage your player identity & public appearance'
                : 'View account credentials & portal preferences';
        }

        if (!isProfile) {
            _updateSettingsSoundStatus();
            if (_elements.settingsEmailDisplay && typeof window.Auth !== 'undefined') {
                _elements.settingsEmailDisplay.textContent = window.Auth.getEmail() || 'Not available';
            }
        }
    }

    /**
     * Opens the Profile Management modal.
     * Suspends active game, closes dropdown, clears banners, and loads player data.
     * @param {'profile'|'settings'} [initialTab='profile'] 
     */
    function _openProfileModal(initialTab = 'profile') {
        if (!_elements.modalProfile) return;

        // Security check: Must be authenticated to access profile
        if (typeof window.Auth === 'undefined' || !window.Auth.isAuthenticated()) {
            _openModal('login');
            return;
        }

        // Suspend active game cleanly (Snake, etc.)
        if (typeof window.GameManager !== 'undefined' && typeof window.GameManager.pauseActive === 'function') {
            window.GameManager.pauseActive();
        }

        if (window.EventBus) {
            window.EventBus.emit('modal:open', { modalId: 'profile' });
        }

        if (window.SoundManager && typeof window.SoundManager.playClick === 'function') {
            window.SoundManager.playClick();
        }

        _toggleAccountDropdown(true);
        _clearProfileBanners();
        _switchProfileTab(initialTab);
        _elements.modalProfile.classList.remove('hidden');

        _loadProfileData();
    }

    /**
     * Closes the Profile Management modal cleanly without resuming games automatically.
     */
    function _closeProfileModal() {
        if (!_elements.modalProfile || _elements.modalProfile.classList.contains('hidden')) return;

        _elements.modalProfile.classList.add('hidden');
        _clearProfileBanners();

        if (window.SoundManager && typeof window.SoundManager.playClick === 'function') {
            window.SoundManager.playClick();
        }

        if (window.EventBus) {
            window.EventBus.emit('modal:close', { modalId: 'profile' });
        }
    }

    /**
     * Loads the player's profile data into the form fields.
     * Uses cached metadata immediately, then updates from Supabase 'profiles' table.
     */
    function _loadProfileData() {
        if (typeof window.Auth === 'undefined') return;

        // Step 1: Immediate hydration from cached metadata
        const safeUser = (typeof window.Auth.getUser === 'function') ? window.Auth.getUser() : null;
        const meta = safeUser?.user_metadata || {};
        const cachedUsername = (meta.username || 'player').replace(/^@+/, '');
        const cachedDisplayName = meta.display_name || meta.username || 'Player';
        const cachedAvatar = meta.avatar_path || 'preset:cyber_ninja';
        const currentEmail = (typeof window.Auth.getEmail === 'function') ? window.Auth.getEmail() : '';

        if (_elements.profileDisplayName) _elements.profileDisplayName.value = cachedDisplayName;
        if (_elements.profileUsername) _elements.profileUsername.value = cachedUsername;
        if (_elements.profileDisplayUsername) _elements.profileDisplayUsername.textContent = `@${cachedUsername}`;
        if (_elements.profileSelectedAvatar) _elements.profileSelectedAvatar.value = cachedAvatar;
        if (_elements.profileAvatarPreview && window.AvatarsData) {
            _elements.profileAvatarPreview.src = window.AvatarsData.toDataUri(cachedAvatar);
        }
        if (_elements.settingsEmailDisplay) {
            _elements.settingsEmailDisplay.textContent = currentEmail || 'Not available';
        }
        _updateSettingsSoundStatus();
        _renderProfileAvatarPresets(cachedAvatar);

        // Step 2: Asynchronously retrieve profile table row from Supabase
        if (typeof window.Auth.getProfile === 'function') {
            window.Auth.getProfile().then(result => {
                if (result && result.success && result.profile) {
                    const p = result.profile;
                    if (_elements.profileDisplayName && p.display_name) {
                        _elements.profileDisplayName.value = p.display_name;
                    }
                    if (_elements.profileUsername && p.username) {
                        _elements.profileUsername.value = p.username;
                        if (_elements.profileDisplayUsername) {
                            _elements.profileDisplayUsername.textContent = `@${p.username}`;
                        }
                    }
                    if (_elements.profileBio) {
                        _elements.profileBio.value = p.bio || '';
                        _updateBioCounter(p.bio || '');
                    }
                    if (p.avatar_path) {
                        if (_elements.profileSelectedAvatar) _elements.profileSelectedAvatar.value = p.avatar_path;
                        if (_elements.profileAvatarPreview && window.AvatarsData) {
                            _elements.profileAvatarPreview.src = window.AvatarsData.toDataUri(p.avatar_path);
                        }
                        _selectProfileAvatarPreset(p.avatar_path);
                    }
                    if (p.created_at) {
                        _formatCreationDate(p.created_at);
                    }
                }
            }).catch(err => {
                console.warn('[AuthUI] getProfile note:', err);
            });
        }
    }

    /**
     * Handles Save Changes submission for the Profile form.
     * @param {Event} e 
     */
    async function _handleProfileSubmit(e) {
        e.preventDefault();
        if (_submitting || (typeof window.Auth !== 'undefined' && window.Auth.isBusy())) return;

        const displayName = _elements.profileDisplayName ? _elements.profileDisplayName.value.trim() : '';
        const username = _elements.profileUsername ? _elements.profileUsername.value.trim() : '';
        const bio = _elements.profileBio ? _elements.profileBio.value.trim() : '';
        const avatarPath = _elements.profileSelectedAvatar ? _elements.profileSelectedAvatar.value : 'preset:cyber_ninja';

        // Validations
        if (!displayName) {
            _showProfileError('Please enter a display name.');
            if (_elements.profileDisplayName) _elements.profileDisplayName.focus();
            return;
        }

        if (displayName.length > 50) {
            _showProfileError('Display name must not exceed 50 characters.');
            if (_elements.profileDisplayName) _elements.profileDisplayName.focus();
            return;
        }

        if (!username) {
            _showProfileError('Please enter a username.');
            if (_elements.profileUsername) _elements.profileUsername.focus();
            return;
        }

        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(username)) {
            _showProfileError('Username must be 3–20 characters long and contain only letters, numbers, and underscores.');
            if (_elements.profileUsername) _elements.profileUsername.focus();
            return;
        }

        if (bio.length > 160) {
            _showProfileError('Bio must not exceed 160 characters.');
            if (_elements.profileBio) _elements.profileBio.focus();
            return;
        }

        _submitting = true;
        _clearProfileBanners();
        _setButtonBusy(_elements.profileSaveBtn, true, 'Saving Changes...');

        try {
            const result = await window.Auth.updateProfile({
                username,
                displayName,
                avatarPath,
                bio
            });

            if (result && result.success) {
                _showProfileSuccess('Profile updated successfully!');
                _showToast('Profile updated!');
                if (_elements.profileDisplayUsername) {
                    _elements.profileDisplayUsername.textContent = `@${username.toLowerCase()}`;
                }

                // Close modal after brief confirmation display
                setTimeout(() => {
                    _closeProfileModal();
                }, 1400);
            } else {
                _showProfileError(result?.error || 'Unable to update profile. Please verify your details.');
            }
        } catch (err) {
            _showProfileError('Profile update service error. Please check your connection.');
        } finally {
            _submitting = false;
            _setButtonBusy(_elements.profileSaveBtn, false);
        }
    }

    /**
     * Handles the sound effect toggle button click in Account Settings.
     */
    function _handleSettingsSoundToggle() {
        if (typeof window.SoundManager === 'undefined') return;
        const enabled = window.SoundManager.toggleSound();
        _updateSettingsSoundStatus();
        if (window.App && typeof window.App.updateSoundButtonUI === 'function') {
            window.App.updateSoundButtonUI();
        }
        _showToast(enabled ? 'Sound Effects Enabled' : 'Sound Effects Muted');
    }

    /**
     * Handles the Change Password button in Account Settings.
     * Uses the secure Supabase recovery flow by dispatching a reset email.
     */
    async function _handleSettingsChangePassword() {
        if (_submitting || (typeof window.Auth !== 'undefined' && window.Auth.isBusy())) return;

        const email = (typeof window.Auth !== 'undefined' && typeof window.Auth.getEmail === 'function')
            ? window.Auth.getEmail()
            : '';

        if (!email) {
            _showProfileError('Could not identify your registered email address. Please re-login.');
            return;
        }

        _setButtonBusy(_elements.settingsChangePasswordBtn, true, 'Sending Link...');
        _clearProfileBanners();

        try {
            const result = await window.Auth.requestPasswordReset(email);
            if (result && result.success) {
                _showProfileSuccess('A secure password reset link has been dispatched to your email address! Please check your inbox.');
                _showToast('Reset email sent! Check your inbox.');
            } else {
                _showProfileError(result?.error || 'Unable to dispatch password reset link. Please try again.');
            }
        } catch (err) {
            _showProfileError('Security service error. Please try again later.');
        } finally {
            _setButtonBusy(_elements.settingsChangePasswordBtn, false);
        }
    }

    // ------------------------------------------------------------------------
    // Navbar & Account Menu Reactive State
    // ------------------------------------------------------------------------

    /**
     * Updates the navbar and account dropdown to match the user's auth state.
     * @param {Object|null} user 
     */
    function _updateNavbarUI(user) {
        const isAuth = !!(user && typeof window.Auth !== 'undefined' && window.Auth.isAuthenticated());

        // Always hide dropdown on state change
        _toggleAccountDropdown(true);

        if (isAuth) {
            if (_elements.navAuthBtn) _elements.navAuthBtn.classList.add('hidden');
            if (_elements.navUserBtn) _elements.navUserBtn.classList.remove('hidden');

            const meta = (user && user.user_metadata && typeof user.user_metadata === 'object')
                ? user.user_metadata
                : {};

            const displayName = meta.display_name || user.display_name || meta.username || user.username || 'Player';
            const avatarPath = meta.avatar_path || user.avatar_path || 'preset:cyber_ninja';

            if (_elements.navUserName) {
                _elements.navUserName.textContent = displayName;
            }

            if (_elements.navUserAvatar && typeof window.AvatarsData !== 'undefined' && typeof window.AvatarsData.toDataUri === 'function') {
                _elements.navUserAvatar.src = window.AvatarsData.toDataUri(avatarPath);
                _elements.navUserAvatar.alt = displayName;
            }

            _updateAccountDropdownUI(user);
        } else {
            // Guest Mode
            if (_elements.navAuthBtn) _elements.navAuthBtn.classList.remove('hidden');
            if (_elements.navUserBtn) _elements.navUserBtn.classList.add('hidden');
        }
    }

    /**
     * Updates profile info in the account dropdown menu.
     * Reads display_name, username, and avatar_path from user.user_metadata.
     * Displays username with exactly one '@' prefix and sets the correct avatar preset.
     * @param {Object} user 
     */
    function _updateAccountDropdownUI(user) {
        if (!user) return;

        const meta = (user && user.user_metadata && typeof user.user_metadata === 'object')
            ? user.user_metadata
            : {};

        const displayName = meta.display_name || user.display_name || meta.username || user.username || 'Player';
        const rawUsername = meta.username || user.username || 'player';
        const cleanUsername = String(rawUsername).replace(/^@+/, '');
        const formattedUsername = `@${cleanUsername || 'player'}`;
        const avatarPath = meta.avatar_path || user.avatar_path || 'preset:cyber_ninja';

        let email = '';
        if (typeof window.Auth !== 'undefined' && typeof window.Auth.getEmail === 'function') {
            email = window.Auth.getEmail();
        }

        if (_elements.dropdownDisplayName) {
            _elements.dropdownDisplayName.textContent = displayName;
        }
        if (_elements.dropdownUsername) {
            _elements.dropdownUsername.textContent = formattedUsername;
        }
        if (_elements.dropdownEmail) {
            _elements.dropdownEmail.textContent = email;
        }
        if (_elements.dropdownUserAvatar && typeof window.AvatarsData !== 'undefined' && typeof window.AvatarsData.toDataUri === 'function') {
            _elements.dropdownUserAvatar.src = window.AvatarsData.toDataUri(avatarPath);
            _elements.dropdownUserAvatar.alt = displayName;
        }
    }

    /**
     * Toggles the account dropdown menu.
     * @param {boolean} [forceClose=false] 
     */
    function _toggleAccountDropdown(forceClose = false) {
        if (!_elements.accountDropdown || !_elements.navUserBtn) return;

        const isCurrentlyOpen = !_elements.accountDropdown.classList.contains('hidden');
        const shouldOpen = forceClose ? false : !isCurrentlyOpen;

        _elements.accountDropdown.classList.toggle('hidden', !shouldOpen);
        _elements.navUserBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    }

    // ------------------------------------------------------------------------
    // Form Submission Handlers
    // ------------------------------------------------------------------------

    /**
     * Handles Sign In form submission.
     * @param {Event} e 
     */
    async function _handleLoginSubmit(e) {
        e.preventDefault();
        if (_submitting || (typeof window.Auth !== 'undefined' && window.Auth.isBusy())) return;

        const email = _elements.loginEmail ? _elements.loginEmail.value.trim() : '';
        const password = _elements.loginPassword ? _elements.loginPassword.value : '';

        if (!email || !password) {
            _showError('Please enter both your email address and password.');
            return;
        }

        _submitting = true;
        _clearBanners();
        _setButtonBusy(_elements.loginSubmitBtn, true, 'Signing In...');

        try {
            const result = await window.Auth.login(email, password);

            if (result && result.success) {
                _clearPasswordFields();
                _closeModal();
                _showToast('Signed in successfully. Welcome back, pilot!');
            } else {
                _showError(result?.error || 'Invalid credentials. Please verify your email and password.');
                if (_elements.loginPassword) {
                    _elements.loginPassword.value = '';
                    _elements.loginPassword.focus();
                }
            }
        } catch (err) {
            _showError('Authentication service could not be reached. Please check your connection.');
        } finally {
            _submitting = false;
            _setButtonBusy(_elements.loginSubmitBtn, false);
        }
    }

    /**
     * Handles Registration form submission.
     * @param {Event} e 
     */
    async function _handleRegisterSubmit(e) {
        e.preventDefault();
        if (_submitting || (typeof window.Auth !== 'undefined' && window.Auth.isBusy())) return;

        const email = _elements.registerEmail ? _elements.registerEmail.value.trim() : '';
        const password = _elements.registerPassword ? _elements.registerPassword.value : '';
        const username = _elements.registerUsername ? _elements.registerUsername.value.trim() : '';
        const displayName = _elements.registerDisplayName ? _elements.registerDisplayName.value.trim() : '';
        const avatarPresetId = _elements.registerSelectedAvatar ? _elements.registerSelectedAvatar.value : 'preset:cyber_ninja';

        // Client-side validations
        if (!email || !password || !username || !displayName) {
            _showError('Please fill in all required registration fields.');
            return;
        }

        if (password.length < 8) {
            _showError('Password must be at least 8 characters long.');
            if (_elements.registerPassword) _elements.registerPassword.focus();
            return;
        }

        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(username)) {
            _showError('Username must be 3–20 characters long and contain only letters, numbers, and underscores.');
            if (_elements.registerUsername) _elements.registerUsername.focus();
            return;
        }

        if (displayName.length > 50) {
            _showError('Display name must not exceed 50 characters.');
            if (_elements.registerDisplayName) _elements.registerDisplayName.focus();
            return;
        }

        _submitting = true;
        _clearBanners();
        _setButtonBusy(_elements.registerSubmitBtn, true, 'Creating Account...');

        try {
            const result = await window.Auth.register({
                email,
                password,
                username,
                displayName,
                avatarPresetId
            });

            if (result && result.success) {
                _clearPasswordFields();

                if (result.needsEmailConfirmation) {
                    _showSuccess('Registration successful! Please check your email inbox to confirm your account before logging in.');
                } else {
                    _closeModal();
                    _showToast('Welcome to MY GAME CENTRE! Profile created.');
                }
            } else {
                _showError(result?.error || 'Registration failed. Please check your information and try again.');
            }
        } catch (err) {
            _showError('Registration service error. Please try again later.');
        } finally {
            _submitting = false;
            _setButtonBusy(_elements.registerSubmitBtn, false);
        }
    }

    /**
     * Handles Forgot Password form submission.
     * @param {Event} e 
     */
    async function _handleForgotSubmit(e) {
        e.preventDefault();
        if (_submitting || (typeof window.Auth !== 'undefined' && window.Auth.isBusy())) return;

        const email = _elements.forgotEmail ? _elements.forgotEmail.value.trim() : '';

        if (!email) {
            _showError('Please enter your email address to receive a password reset link.');
            return;
        }

        _submitting = true;
        _clearBanners();
        _setButtonBusy(_elements.forgotSubmitBtn, true, 'Sending Link...');

        try {
            const result = await window.Auth.requestPasswordReset(email);

            if (result && result.success) {
                _showSuccess('Password recovery link has been dispatched! Please check your email inbox.');
            } else {
                _showError(result?.error || 'Unable to request password reset. Please verify your email.');
            }
        } catch (err) {
            _showError('Recovery request failed. Please check your connection.');
        } finally {
            _submitting = false;
            _setButtonBusy(_elements.forgotSubmitBtn, false);
        }
    }

    /**
     * Handles Password Reset form submission.
     * Strictly verifies active Supabase recovery session before calling updatePassword().
     * @param {Event} e 
     */
    async function _handleResetSubmit(e) {
        e.preventDefault();
        if (_submitting || (typeof window.Auth !== 'undefined' && window.Auth.isBusy())) return;

        // Security assertion: must have valid recovery session confirmed by Auth
        const hasAuthRecovery = typeof window.Auth !== 'undefined' &&
            (window.Auth.isAuthenticated() || (typeof window.Auth.isRecoverySession === 'function' && window.Auth.isRecoverySession()));
        if (!_hasValidRecoverySession || !hasAuthRecovery) {
            _showError('No active password recovery session. Please request a new recovery link.');
            return;
        }

        const newPassword = _elements.resetPassword ? _elements.resetPassword.value : '';
        const confirmPassword = _elements.resetConfirmPassword ? _elements.resetConfirmPassword.value : '';

        if (!newPassword || !confirmPassword) {
            _showError('Please enter and confirm your new password.');
            return;
        }

        if (newPassword.length < 8) {
            _showError('New password must be at least 8 characters long.');
            if (_elements.resetPassword) _elements.resetPassword.focus();
            return;
        }

        if (newPassword !== confirmPassword) {
            _showError('Passwords do not match. Please ensure both fields are identical.');
            if (_elements.resetConfirmPassword) _elements.resetConfirmPassword.focus();
            return;
        }

        _submitting = true;
        _clearBanners();
        _setButtonBusy(_elements.resetSubmitBtn, true, 'Updating Password...');

        try {
            const result = await window.Auth.updatePassword(newPassword);

            if (result && result.success) {
                _hasValidRecoverySession = false;
                _clearPasswordFields();
                _showSuccess('Password updated successfully! You may now sign in with your new password.');

                // Switch back to login view after short delay for user to read success
                setTimeout(() => {
                    _switchView('login');
                    _showSuccess('Password updated successfully. Please sign in.');
                }, 2000);
            } else {
                _showError(result?.error || 'Password update failed. The recovery link may have expired.');
            }
        } catch (err) {
            _showError('Password update could not be completed. Please try again.');
        } finally {
            _submitting = false;
            _setButtonBusy(_elements.resetSubmitBtn, false);
        }
    }

    /**
     * Handles sign-out click from the account dropdown menu.
     * @param {Event} e 
     */
    async function _handleLogoutClick(e) {
        e.preventDefault();
        if (typeof window.Auth === 'undefined' || typeof window.Auth.logout !== 'function') return;

        _toggleAccountDropdown(true);

        try {
            const result = await window.Auth.logout();
            _updateNavbarUI(null);
            _closeModal();
            _closeProfileModal();

            if (result && result.success) {
                _showToast('Signed out successfully.');
            }
        } catch (err) {
            console.warn('[AuthUI] Logout completed with fallback cleanup:', err);
            _updateNavbarUI(null);
            _closeModal();
            _closeProfileModal();
            _showToast('Signed out.');
        }
    }

    // ------------------------------------------------------------------------
    // Event Listeners Binding
    // ------------------------------------------------------------------------

    function _bindEvents() {
        // Navbar buttons
        if (_elements.navAuthBtn) {
            _elements.navAuthBtn.addEventListener('click', () => {
                _openModal('login');
            });
        }

        if (_elements.navUserBtn) {
            _elements.navUserBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                _toggleAccountDropdown();
            });
        }

        // Close dropdown when clicking anywhere outside
        document.addEventListener('click', (e) => {
            if (!_elements.accountDropdown || _elements.accountDropdown.classList.contains('hidden')) return;
            if (_elements.navUserBtn && _elements.navUserBtn.contains(e.target)) return;
            if (_elements.accountDropdown.contains(e.target)) return;
            _toggleAccountDropdown(true);
        });

        // Account Dropdown Buttons
        if (_elements.dropdownProfileBtn) {
            _elements.dropdownProfileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                _openProfileModal('profile');
            });
        }
        if (_elements.dropdownSettingsBtn) {
            _elements.dropdownSettingsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                _openProfileModal('settings');
            });
        }

        // Logout button
        if (_elements.accountLogoutBtn) {
            _elements.accountLogoutBtn.addEventListener('click', (e) => {
                _handleLogoutClick(e);
            });
        }

        // Auth Modal Close Button
        if (_elements.modalCloseBtn) {
            _elements.modalCloseBtn.addEventListener('click', () => {
                _closeModal();
            });
        }

        // Auth Modal Backdrop Click
        if (_elements.modal) {
            _elements.modal.addEventListener('click', (e) => {
                if (e.target === _elements.modal) {
                    _closeModal();
                }
            });
        }

        // Profile Modal Close Button
        if (_elements.profileModalCloseBtn) {
            _elements.profileModalCloseBtn.addEventListener('click', () => {
                _closeProfileModal();
            });
        }

        // Profile Modal Backdrop Click
        if (_elements.modalProfile) {
            _elements.modalProfile.addEventListener('click', (e) => {
                if (e.target === _elements.modalProfile) {
                    _closeProfileModal();
                }
            });
        }

        // Escape Key Modal & Dropdown Dismissal
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (_elements.modal && !_elements.modal.classList.contains('hidden')) {
                    _closeModal();
                }
                if (_elements.modalProfile && !_elements.modalProfile.classList.contains('hidden')) {
                    _closeProfileModal();
                }
                if (_elements.accountDropdown && !_elements.accountDropdown.classList.contains('hidden')) {
                    _toggleAccountDropdown(true);
                }
            }
        });

        // Auth Tabs switching
        if (_elements.tabLogin) {
            _elements.tabLogin.addEventListener('click', () => {
                _switchView('login');
            });
        }
        if (_elements.tabRegister) {
            _elements.tabRegister.addEventListener('click', () => {
                _switchView('register');
            });
        }

        // Profile Tabs switching
        if (_elements.profileTabBtn) {
            _elements.profileTabBtn.addEventListener('click', () => {
                _switchProfileTab('profile');
            });
        }
        if (_elements.settingsTabBtn) {
            _elements.settingsTabBtn.addEventListener('click', () => {
                _switchProfileTab('settings');
            });
        }

        // Profile Form live input reactions
        if (_elements.profileUsername) {
            _elements.profileUsername.addEventListener('input', (e) => {
                const cleanVal = e.target.value.trim().replace(/^@+/, '');
                if (_elements.profileDisplayUsername) {
                    _elements.profileDisplayUsername.textContent = cleanVal ? `@${cleanVal.toLowerCase()}` : '@pilot';
                }
            });
        }
        if (_elements.profileBio) {
            _elements.profileBio.addEventListener('input', (e) => {
                _updateBioCounter(e.target.value);
            });
        }

        // Intra-form view links
        if (_elements.gotoForgotBtn) {
            _elements.gotoForgotBtn.addEventListener('click', () => {
                _switchView('forgot');
            });
        }
        if (_elements.gotoRegisterBtn) {
            _elements.gotoRegisterBtn.addEventListener('click', () => {
                _switchView('register');
            });
        }
        if (_elements.gotoLoginBtn) {
            _elements.gotoLoginBtn.addEventListener('click', () => {
                _switchView('login');
            });
        }
        if (_elements.forgotBackBtn) {
            _elements.forgotBackBtn.addEventListener('click', () => {
                _switchView('login');
            });
        }

        // Form submissions
        if (_elements.formLogin) {
            _elements.formLogin.addEventListener('submit', _handleLoginSubmit);
        }
        if (_elements.formRegister) {
            _elements.formRegister.addEventListener('submit', _handleRegisterSubmit);
        }
        if (_elements.formForgot) {
            _elements.formForgot.addEventListener('submit', _handleForgotSubmit);
        }
        if (_elements.formReset) {
            _elements.formReset.addEventListener('submit', _handleResetSubmit);
        }
        if (_elements.formProfile) {
            _elements.formProfile.addEventListener('submit', _handleProfileSubmit);
        }

        // Account Settings Actions
        if (_elements.settingsSoundToggleBtn) {
            _elements.settingsSoundToggleBtn.addEventListener('click', _handleSettingsSoundToggle);
        }
        if (_elements.settingsChangePasswordBtn) {
            _elements.settingsChangePasswordBtn.addEventListener('click', _handleSettingsChangePassword);
        }
    }

    /**
     * Subscribes to central EventBus events emitted by Auth module.
     * Guaranteed idempotent: subscribed exactly once.
     */
    function _subscribeAuthEvents() {
        if (!window.EventBus || typeof window.EventBus.on !== 'function') return;

        // 1. Successful login
        window.EventBus.on('auth:login', ({ user }) => {
            _updateNavbarUI(user);
            _closeModal();
        });

        // 2. Successful logout
        window.EventBus.on('auth:logout', () => {
            _updateNavbarUI(null);
            _closeModal();
        });

        // 3. Verified Supabase password-recovery event
        window.EventBus.on('auth:password-recovery', ({ user }) => {
            _hasValidRecoverySession = true;
            _openModal('reset');
            _showSuccess('Password recovery session established. Please set your new password.');
        });

        // 4. User profile / metadata updated
        window.EventBus.on('auth:user-updated', ({ user }) => {
            _updateNavbarUI(user);
        });

        // 5. General state change (syncs user or returns to guest mode)
        window.EventBus.on('auth:state-change', ({ isAuthenticated, user }) => {
            if (isAuthenticated && user) {
                _updateNavbarUI(user);
            } else {
                _updateNavbarUI(null);
            }
        });

        // 6. Auth module initialization complete
        window.EventBus.on('auth:initialized', ({ isAuthenticated, user }) => {
            if (isAuthenticated && user) {
                _updateNavbarUI(user);
            } else {
                _updateNavbarUI(null);
            }
        });

        // 7. Password recovery error (e.g. otp_expired, link invalid, access_denied)
        window.EventBus.on('auth:recovery-error', (payload) => {
            _hasValidRecoverySession = false;
            _openModal('forgot');
            const message = (payload && payload.error)
                ? payload.error
                : 'Your password reset link has expired or has already been used. Please request a new recovery link.';
            _showError(message);
        });
    }

    // ------------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------------

    /**
     * Initializes the Authentication UI controller.
     * Safe to invoke multiple times (idempotent).
     */
    function init() {
        if (_initialized) return;
        _initialized = true;

        _cacheElements();
        _renderAvatarPresets();
        _updateSettingsSoundStatus();
        _bindEvents();
        _subscribeAuthEvents();

        // Check if Auth was already initialized before AuthUI loaded or has pending recovery state
        if (typeof window.Auth !== 'undefined') {
            // Check if Auth already captured a URL recovery error (e.g. otp_expired)
            if (typeof window.Auth.getRecoveryError === 'function') {
                const recErr = window.Auth.getRecoveryError();
                if (recErr) {
                    _hasValidRecoverySession = false;
                    _openModal('forgot');
                    const message = (recErr && recErr.error)
                        ? recErr.error
                        : 'Your password reset link has expired or has already been used. Please request a new recovery link.';
                    _showError(message);
                }
            }

            // Check if Auth already established a valid recovery session
            if (typeof window.Auth.isRecoverySession === 'function' && window.Auth.isRecoverySession()) {
                _hasValidRecoverySession = true;
                _openModal('reset');
                _showSuccess('Password recovery session established. Please set your new password.');
            }

            if (typeof window.Auth.isReady === 'function' && window.Auth.isReady()) {
                if (window.Auth.isAuthenticated()) {
                    _updateNavbarUI(window.Auth.getUser());
                } else {
                    _updateNavbarUI(null);
                }
            } else if (typeof window.Auth.init === 'function') {
                window.Auth.init().then(() => {
                    if (typeof window.Auth.getRecoveryError === 'function') {
                        const asyncRecErr = window.Auth.getRecoveryError();
                        if (asyncRecErr) {
                            _hasValidRecoverySession = false;
                            _openModal('forgot');
                            _showError(asyncRecErr.error || 'Your password reset link has expired or has already been used. Please request a new recovery link.');
                        }
                    }
                    if (typeof window.Auth.isRecoverySession === 'function' && window.Auth.isRecoverySession()) {
                        _hasValidRecoverySession = true;
                        _openModal('reset');
                        _showSuccess('Password recovery session established. Please set your new password.');
                    }
                }).catch(err => {
                    console.warn('[AuthUI] Auth.init() background error handled:', err);
                });
            }
        } else {
            // Default to Guest Mode if Auth module is absent
            _updateNavbarUI(null);
        }
    }

    return Object.freeze({
        init,
        openModal: _openModal,
        closeModal: _closeModal,
        switchView: _switchView,
        openProfileModal: _openProfileModal,
        closeProfileModal: _closeProfileModal,
        switchProfileTab: _switchProfileTab
    });
})();

// Expose globally
window.AuthUI = AuthUI;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        AuthUI.init();
    });
} else {
    AuthUI.init();
}
