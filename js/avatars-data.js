/**
 * MY GAME CENTRE - Built-In Neon Arcade Avatars Collection
 * 12 embedded high-resolution SVG presets styled with Cyberpunk Neon themes.
 * Zero external asset dependencies; loaded entirely in client memory.
 * IDs strictly mirror the database constraint 'chk_avatar_path_valid'.
 */

const AvatarsData = {
    presets: [
        {
            id: 'preset:cyber_ninja',
            name: 'Cyber Ninja',
            color: '#00f0ff',
            svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="48" fill="#0e1322" stroke="#00f0ff" stroke-width="3"/>
                <path d="M25 52C25 36 36 24 50 24C64 24 75 36 75 52V68C75 72 70 76 65 76H35C30 76 25 72 25 68V52Z" fill="#161f36" stroke="#00f0ff" stroke-width="2"/>
                <rect x="30" y="44" width="40" height="12" rx="3" fill="#070a13" stroke="#ff007f" stroke-width="2"/>
                <circle cx="42" cy="50" r="3" fill="#00f0ff"/>
                <circle cx="58" cy="50" r="3" fill="#00f0ff"/>
                <path d="M38 32L50 20L62 32" stroke="#00f0ff" stroke-width="2" stroke-linecap="round"/>
                <path d="M50 24V14" stroke="#ff007f" stroke-width="2" stroke-linecap="round"/>
            </svg>`
        },
        {
            id: 'preset:neon_bot',
            name: 'Neon Bot',
            color: '#a855f7',
            svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="48" fill="#0e1322" stroke="#a855f7" stroke-width="3"/>
                <rect x="28" y="32" width="44" height="40" rx="8" fill="#161f36" stroke="#a855f7" stroke-width="2"/>
                <rect x="36" y="44" width="10" height="8" rx="2" fill="#00f0ff"/>
                <rect x="54" y="44" width="10" height="8" rx="2" fill="#00f0ff"/>
                <path d="M42 60H58" stroke="#00ff9d" stroke-width="2" stroke-linecap="round"/>
                <path d="M50 32V20M46 20H54" stroke="#a855f7" stroke-width="2" stroke-linecap="round"/>
                <circle cx="24" cy="52" r="3" fill="#a855f7"/>
                <circle cx="76" cy="52" r="3" fill="#a855f7"/>
            </svg>`
        },
        {
            id: 'preset:retro_pixel',
            name: 'Retro Pixel',
            color: '#ffd700',
            svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="48" fill="#0e1322" stroke="#ffd700" stroke-width="3"/>
                <rect x="32" y="28" width="36" height="36" fill="#161f36" stroke="#ffd700" stroke-width="2"/>
                <rect x="40" y="36" width="6" height="6" fill="#ffd700"/>
                <rect x="54" y="36" width="6" height="6" fill="#ffd700"/>
                <path d="M38 52H62V58H38V52Z" fill="#ff007f"/>
                <rect x="44" y="64" width="12" height="10" fill="#ffd700"/>
            </svg>`
        },
        {
            id: 'preset:viper_cyber',
            name: 'Viper Cyber',
            color: '#00ff9d',
            svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="48" fill="#0e1322" stroke="#00ff9d" stroke-width="3"/>
                <path d="M50 20L72 40L62 76L50 82L38 76L28 40L50 20Z" fill="#161f36" stroke="#00ff9d" stroke-width="2"/>
                <polygon points="42,46 48,50 42,54" fill="#00ff9d"/>
                <polygon points="58,46 52,50 58,54" fill="#00ff9d"/>
                <path d="M50 60V70M46 70H54" stroke="#ff007f" stroke-width="2" stroke-linecap="round"/>
            </svg>`
        },
        {
            id: 'preset:cosmic_fox',
            name: 'Cosmic Fox',
            color: '#ff7700',
            svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="48" fill="#0e1322" stroke="#ff7700" stroke-width="3"/>
                <polygon points="26,30 38,50 26,60" fill="#ff7700"/>
                <polygon points="74,30 62,50 74,60" fill="#ff7700"/>
                <polygon points="50,34 68,56 50,78 32,56" fill="#161f36" stroke="#ff7700" stroke-width="2"/>
                <circle cx="42" cy="52" r="3" fill="#00f0ff"/>
                <circle cx="58" cy="52" r="3" fill="#00f0ff"/>
                <polygon points="50,62 54,66 46,66" fill="#ff007f"/>
            </svg>`
        },
        {
            id: 'preset:laser_knight',
            name: 'Laser Knight',
            color: '#0077ff',
            svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="48" fill="#0e1322" stroke="#0077ff" stroke-width="3"/>
                <path d="M30 40C30 26 38 20 50 20C62 20 70 26 70 40V68L50 80L30 68V40Z" fill="#161f36" stroke="#0077ff" stroke-width="2"/>
                <rect x="36" y="42" width="28" height="6" fill="#00f0ff"/>
                <line x1="50" y1="48" x2="50" y2="72" stroke="#0077ff" stroke-width="2"/>
            </svg>`
        },
        {
            id: 'preset:arcade_wizard',
            name: 'Arcade Wizard',
            color: '#a855f7',
            svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="48" fill="#0e1322" stroke="#a855f7" stroke-width="3"/>
                <polygon points="50,18 72,56 28,56" fill="#161f36" stroke="#a855f7" stroke-width="2"/>
                <circle cx="50" cy="68" r="14" fill="#161f36" stroke="#00ff9d" stroke-width="2"/>
                <circle cx="46" cy="66" r="2" fill="#00f0ff"/>
                <circle cx="54" cy="66" r="2" fill="#00f0ff"/>
                <path d="M42 42L58 42" stroke="#ffd700" stroke-width="2"/>
            </svg>`
        },
        {
            id: 'preset:glitch_skull',
            name: 'Glitch Skull',
            color: '#ff007f',
            svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="48" fill="#0e1322" stroke="#ff007f" stroke-width="3"/>
                <path d="M32 46C32 32 40 24 50 24C60 24 68 32 68 46C68 56 62 62 62 70H38C38 62 32 56 32 46Z" fill="#161f36" stroke="#ff007f" stroke-width="2"/>
                <circle cx="42" cy="46" r="4" fill="#00f0ff"/>
                <circle cx="58" cy="46" r="4" fill="#00f0ff"/>
                <path d="M42 66V72M50 66V72M58 66V72" stroke="#ff007f" stroke-width="2"/>
            </svg>`
        },
        {
            id: 'preset:quantum_cat',
            name: 'Quantum Cat',
            color: '#00f0ff',
            svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="48" fill="#0e1322" stroke="#00f0ff" stroke-width="3"/>
                <polygon points="30,28 42,44 26,48" fill="#00f0ff"/>
                <polygon points="70,28 58,44 74,48" fill="#00f0ff"/>
                <circle cx="50" cy="56" r="22" fill="#161f36" stroke="#00f0ff" stroke-width="2"/>
                <line x1="38" y1="54" x2="44" y2="54" stroke="#ff007f" stroke-width="2"/>
                <line x1="56" y1="54" x2="62" y2="54" stroke="#ff007f" stroke-width="2"/>
                <polygon points="50,60 52,64 48,64" fill="#00ff9d"/>
            </svg>`
        },
        {
            id: 'preset:mecha_pilot',
            name: 'Mecha Pilot',
            color: '#ffd700',
            svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="48" fill="#0e1322" stroke="#ffd700" stroke-width="3"/>
                <path d="M28 46C28 32 36 24 50 24C64 24 72 32 72 46V68H28V46Z" fill="#161f36" stroke="#ffd700" stroke-width="2"/>
                <path d="M34 44H66V56C66 62 60 66 50 66C40 66 34 62 34 56V44Z" fill="#070a13" stroke="#00f0ff" stroke-width="2"/>
                <line x1="34" y1="50" x2="66" y2="50" stroke="#ff007f" stroke-width="1.5"/>
            </svg>`
        },
        {
            id: 'preset:synthwave_sun',
            name: 'Synthwave Sun',
            color: '#ff007f',
            svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="48" fill="#0e1322" stroke="#ff007f" stroke-width="3"/>
                <circle cx="50" cy="46" r="22" fill="#ffd700"/>
                <line x1="28" y1="46" x2="72" y2="46" stroke="#0e1322" stroke-width="2"/>
                <line x1="32" y1="52" x2="68" y2="52" stroke="#0e1322" stroke-width="2.5"/>
                <line x1="36" y1="58" x2="64" y2="58" stroke="#0e1322" stroke-width="3"/>
                <polygon points="18,74 82,74 74,86 26,86" fill="#a855f7"/>
            </svg>`
        },
        {
            id: 'preset:hyper_orb',
            name: 'Hyper Orb',
            color: '#00ff9d',
            svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="48" fill="#0e1322" stroke="#00ff9d" stroke-width="3"/>
                <circle cx="50" cy="50" r="22" fill="#161f36" stroke="#00ff9d" stroke-width="2"/>
                <ellipse cx="50" cy="50" rx="30" ry="10" stroke="#00f0ff" stroke-width="2"/>
                <ellipse cx="50" cy="50" rx="10" ry="30" stroke="#ff007f" stroke-width="2"/>
                <circle cx="50" cy="50" r="6" fill="#ffd700"/>
            </svg>`
        }
    ],

    /**
     * Returns the array of all 12 built-in preset avatars.
     * @returns {Array<Object>}
     */
    getAll() {
        return this.presets;
    },

    /**
     * Checks if an ID matches one of the 12 approved built-in presets.
     * @param {string} id
     * @returns {boolean}
     */
    isValidPreset(id) {
        return this.presets.some(p => p.id === id);
    },

    /**
     * Returns the preset object matching the ID, or the default Cyber Ninja preset.
     * @param {string} id
     * @returns {Object}
     */
    getById(id) {
        return this.presets.find(p => p.id === id) || this.presets[0];
    },

    /**
     * Generates a sanitized data-URI representation of the SVG preset for use in <img> tags.
     * @param {string} id
     * @returns {string}
     */
    toDataUri(id) {
        const preset = this.getById(id);
        const encoded = encodeURIComponent(preset.svg);
        return `data:image/svg+xml;charset=utf-8,${encoded}`;
    }
};

// Expose globally
window.AvatarsData = AvatarsData;
