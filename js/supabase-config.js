/**
 * MY GAME CENTRE - Supabase Client Configuration
 * Manages connection to Supabase using strictly the Project URL and Public Publishable Key.
 * 
 * SECURITY DIRECTIVE:
 * - Use ONLY the public publishable key (anon key: sb_publishable_... or JWT anon key).
 * - NEVER place a secret, service-role, or admin key in this file or any client code.
 */

const SupabaseConfig = {
    // ------------------------------------------------------------------------
    // Credentials (Replace with your actual Supabase Project credentials)
    // ------------------------------------------------------------------------
    url: 'https://kqkvjjuzuoszjubfavfi.supabase.co',
    publishableKey: 'sb_publishable_La87ugUNay00O-pmB-YFJg_XQUvH0Y4',

    // ------------------------------------------------------------------------
    // GitHub Pages Password Recovery & Redirect URLs
    // Exact repository URL: https://aditya-codes-14.github.io/my-game-centre/
    // ------------------------------------------------------------------------
    productionSiteUrl: 'https://aditya-codes-14.github.io/my-game-centre/',
    productionResetUrl: 'https://aditya-codes-14.github.io/my-game-centre/',

    // Cached Supabase client instance
    _client: null,

    /**
     * Strengthened configuration check:
     * - Validates URL format and https protocol
     * - Enforces valid .supabase.co project domain
     * - Rejects placeholders, examples, and invalid keys
     * @returns {boolean}
     */
    isConfigured() {
        if (!this.url || typeof this.url !== 'string') return false;
        if (!this.publishableKey || typeof this.publishableKey !== 'string') return false;

        const trimmedUrl = this.url.trim();
        const trimmedKey = this.publishableKey.trim();

        // Reject explicit placeholders and default template markers
        if (trimmedUrl.includes('YOUR_PROJECT_ID') || trimmedUrl.includes('example.com')) return false;
        if (trimmedKey.includes('YOUR_SUPABASE') || trimmedKey.includes('placeholder')) return false;

        // Validate Supabase project URL format
        try {
            const parsedUrl = new URL(trimmedUrl);
            if (parsedUrl.protocol !== 'https:') return false;
            if (!parsedUrl.hostname.endsWith('.supabase.co')) return false;

            // Project reference subdomain check (e.g. 'xyzcompany' or 20-char project ref)
            const subdomain = parsedUrl.hostname.replace('.supabase.co', '');
            if (!subdomain || subdomain.length < 8) return false;
        } catch (e) {
            return false;
        }

        // Validate publishable key length (JWT or sb_publishable token)
        if (trimmedKey.length < 30) return false;

        return true;
    },

    /**
     * Returns the Supabase client instance or null if unconfigured or offline.
     * Prevents duplicate client instantiations (singleton pattern).
     * @returns {Object|null}
     */
    getClient() {
        try {
            if (!this.isConfigured()) {
                console.warn('[SupabaseConfig] Supabase credentials are unset or invalid. Operating in Guest Mode.');
                return null;
            }

            if (this._client) {
                return this._client;
            }

            if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
                try {
                    this._client = window.supabase.createClient(this.url.trim(), this.publishableKey.trim(), {
                        auth: {
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: true,
                            flowType: 'pkce' // Strict PKCE authorization flow for GitHub Pages
                        }
                    });
                    return this._client;
                } catch (err) {
                    console.warn('[SupabaseConfig] Initialization error; continuing in Guest Mode:', err);
                    return null;
                }
            } else {
                console.warn('[SupabaseConfig] Supabase JS library not detected on window; continuing in Guest Mode.');
                return null;
            }
        } catch (err) {
            console.warn('[SupabaseConfig] Unexpected error in getClient(); continuing in Guest Mode:', err);
            return null;
        }
    },

    /**
     * Resolves the exact redirect URL for password recovery based on current environment.
     * @returns {string}
     */
    getPasswordResetRedirectUrl() {
        // If running locally, route to clean localhost path (no fragment)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return window.location.origin + window.location.pathname;
        }
        // Canonical production GitHub Pages site URL (clean, no fragment)
        return this.productionResetUrl;
    },

    /**
     * Resolves the exact localStorage key used by the Supabase client for session persistence.
     * Derived from the configured project reference: `sb-${projectRef}-auth-token`.
     * Returns null if unconfigured, if placeholder credentials remain, or if projectRef cannot be verified.
     * Does NOT expose credentials, secret keys, or the full project URL.
     * @returns {string|null}
     */
    getStorageKey() {
        if (!this.isConfigured()) {
            return null;
        }

        try {
            const parsedUrl = new URL(this.url.trim());
            const subdomain = parsedUrl.hostname.split('.')[0];
            if (subdomain && subdomain.length >= 8 && subdomain !== 'YOUR_PROJECT_ID') {
                return `sb-${subdomain}-auth-token`;
            }
        } catch (e) {
            return null;
        }

        return null;
    }
};

// Expose globally
window.SupabaseConfig = SupabaseConfig;
