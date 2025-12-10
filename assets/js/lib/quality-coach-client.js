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
     * Execute fetch with retry logic and error handling.
     */
    async fetchWithRetry(url, options, retries = 3, backoff = 1000) {
        try {
            const response = await fetch(url, options);
            
            // Handle 429 Too Many Requests specifically
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : backoff;
                if (retries > 0) {
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    return this.fetchWithRetry(url, options, retries - 1, backoff * 2);
                }
            }

            // Handle 5xx Server Errors
            if (response.status >= 500 && retries > 0) {
                await new Promise(resolve => setTimeout(resolve, backoff));
                return this.fetchWithRetry(url, options, retries - 1, backoff * 2);
            }

            if (!response.ok) {
                // Try to parse error message from JSON
                let errorMessage = `Request failed: ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData.detail) errorMessage = errorData.detail;
                    else if (errorData.message) errorMessage = errorData.message;
                } catch (e) {
                    // Ignore JSON parse error
                }
                
                const error = new Error(errorMessage);
                error.status = response.status;
                throw error;
            }

            return response;
        } catch (error) {
            if (retries > 0 && (error.name === 'TypeError' || error.name === 'AbortError')) {
                // Network errors (TypeError)
                await new Promise(resolve => setTimeout(resolve, backoff));
                return this.fetchWithRetry(url, options, retries - 1, backoff * 2);
            }
            throw error;
        }
    }

    /**
     * Check access permission for the user.
     */
    async checkAccess(email) {
        if (!email) throw new Error('Email is required');
        
        const response = await this.fetchWithRetry(`${this.apiBase}/api/v1/access/check`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        return await response.json();
    }

    /**
     * Send a message to the chat API.
     */
    async sendMessage(message, history = [], context = {}) {
        if (!this.accessToken) throw new Error('Access token required');
        if (!this.threadId) this.init();

        // Handle feedback submission separately
        if (context.is_feedback) {
            return this.sendFeedback(message, context);
        }

        const response = await this.fetchWithRetry(`${this.apiBase}/api/v1/chat`, {
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
     * Send feedback to the API.
     */
    async sendFeedback(comment, context = {}) {
        const response = await this.fetchWithRetry(`${this.apiBase}/api/v1/feedback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.accessToken}`
            },
            body: JSON.stringify({
                thread_id: this.threadId,
                rating: 'comment',
                comment: comment,
                message_id: context.message_id
            })
        });

        // Return a mock chat response to satisfy the UI
        return {
            answer: "Thanks for your feedback! I've shared it with Anne-Marie.",
            sources: [],
            thread_id: this.threadId
        };
    }

    /**
     * Load conversation history from the server.
     */
    async getHistory() {
        if (!this.accessToken) throw new Error('Access token required');
        if (!this.threadId) return [];

        try {
            const response = await this.fetchWithRetry(`${this.apiBase}/api/v1/conversations/${this.threadId}/messages`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            return await response.json();
        } catch (error) {
            // 404 means no history yet, which is fine
            if (error.status === 404) return [];
            throw error;
        }
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
