/**
 * MY GAME CENTRE - Central EventBus
 * Lightweight, zero-dependency Publish/Subscribe event system.
 * Facilitates decoupled communication between games, UI controllers, audio, and services.
 */

const EventBus = {
    events: {},

    /**
     * Subscribe to an event
     * @param {string} event - The event name
     * @param {Function} callback - Function invoked when the event is emitted
     * @returns {Function} Unsubscribe function for easy cleanup
     */
    on(event, callback) {
        if (typeof callback !== 'function') return () => {};
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
        return () => this.off(event, callback);
    },

    /**
     * Unsubscribe a specific callback from an event
     * @param {string} event - The event name
     * @param {Function} callback - The callback reference to remove
     */
    off(event, callback) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(cb => cb !== callback);
        if (this.events[event].length === 0) {
            delete this.events[event];
        }
    },

    /**
     * Emit an event to all registered listeners
     * @param {string} event - The event name
     * @param {Object} [data={}] - Payload data passed to callbacks
     */
    emit(event, data = {}) {
        if (!this.events[event]) return;
        // Slice to protect against listeners modifying the array during execution
        const listeners = this.events[event].slice();
        listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[EventBus] Error executing listener for '${event}':`, error);
            }
        });
    },

    /**
     * Clear all listeners for a specific event or all events
     * @param {string} [event=null] - Specific event name or null for all
     */
    clear(event = null) {
        if (event) {
            delete this.events[event];
        } else {
            this.events = {};
        }
    }
};

// Expose globally
window.EventBus = EventBus;
