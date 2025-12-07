/**
 * Quality Coach Chat Client
 * Handles API communication and state management for the chat widget.
 */
class QualityCoachClient {
    constructor(config = {}) {
        this.apiBase = config.apiBase || 'http://localhost:8000';
        this.storageKey = config.storageKey || 'qc_thread_id';
        this.accessToken = null;
        this.threadId = null;
        this.storage = config.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    }

    /**
     * Initialize the client, restoring thread ID from storage.
     */
    init() {
        if (this.storage) {
            this.threadId = this.storage.getItem(this.storageKey);
        }
        if (!this.threadId) {
            this.threadId = this.generateClientThreadId();
            if (this.storage) {
                this.storage.setItem(this.storageKey, this.threadId);
            }
        }
        return this.threadId;
    }

    /**
     * Generate a UUID v4 for the client thread ID.
     * Uses crypto.randomUUID if available, otherwise falls back to a random string.
     */
    generateClientThreadId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    setAccessToken(token) {
        this.accessToken = token;
    }

    /**
     * Check access permission for the user.
     */
    async checkAccess(email) {
        if (!email) throw new Error('Email is required');
        
        const response = await fetch(`${this.apiBase}/api/v1/access/check`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        if (!response.ok) {
            throw new Error(`Access check failed: ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Send a message to the chat API.
     */
    async sendMessage(message, history = [], context = {}) {
        if (!this.accessToken) throw new Error('Access token required');
        if (!this.threadId) this.init();

        const response = await fetch(`${this.apiBase}/api/v1/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.accessToken}`
            },
            body: JSON.stringify({
                message,
                thread_id: this.threadId,
                history,
                context
            })
        });

        if (!response.ok) {
            throw new Error(`Chat request failed: ${response.status}`);
        }

        const data = await response.json();
        
        // Update thread ID if the server returns a new one (though it shouldn't usually)
        if (data.thread_id && data.thread_id !== this.threadId) {
            this.threadId = data.thread_id;
            if (this.storage) {
                this.storage.setItem(this.storageKey, this.threadId);
            }
        }

        return data;
    }

    /**
     * Load conversation history from the server.
     */
    async getHistory() {
        if (!this.accessToken) throw new Error('Access token required');
        if (!this.threadId) return [];

        const response = await fetch(`${this.apiBase}/api/v1/conversations/${this.threadId}/messages`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });

        if (!response.ok) {
            // 404 means no history yet, which is fine
            if (response.status === 404) return [];
            throw new Error(`Failed to load history: ${response.status}`);
        }

        return await response.json();
    }
}

// Export for Node.js environments (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QualityCoachClient;
}

// Export for Browser environments
if (typeof window !== 'undefined') {
    window.QualityCoachClient = QualityCoachClient;
}
