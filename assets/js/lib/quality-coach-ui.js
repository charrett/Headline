/**
 * Quality Coach UI Controller
 * Handles the UI logic for the chat widget.
 */
class QualityCoachUI {
    constructor(config) {
        this.config = Object.assign({
            apiBase: 'http://localhost:8000',
            memberEmail: '',
            isPaidMember: false,
            postSlug: '',
            postTitle: ''
        }, config);

        // Constants
        this.DEFAULT_PLACEHOLDER = 'Ask a question...';
        this.FEEDBACK_PREFIX = 'feedback:';
        this.ACCESS_CACHE_PREFIX = 'qc_access_cache:';
        this.ACCESS_CACHE_MIN_VALID_MS = 30 * 1000;
        this.ACCESS_REFRESH_BUFFER_MS = 5 * 60 * 1000;
        this.ACCESS_LAG_MESSAGE_MS = 4000;
        this.PORTAL_SELECTORS = [
            '.gh-portal-triggerbtn',
            '.gh-portal-triggerbtn-root',
            '#ghost-portal-root',
            'iframe[src*="ghost" i][title*="portal" i]'
        ];
        this.PORTAL_OFFSET_CLASS = 'qc-offset-for-portal';
        this.PORTAL_CHECK_INTERVAL_MS = 2000;
        this.PORTAL_FALLBACK_TIMEOUT_MS = 5000;
        
        this.QC_STATE = Object.freeze({
            INIT: 0,
            READY: 1,
            OPEN: 2,
            LOCKED: 3
        });

        this.personaNames = {
            'QUALITY_COACH': 'Quality Coach',
            'ENGINEERING_MANAGER': 'Engineering Manager',
            'DELIVERY_LEAD': 'Delivery Lead',
            'CEO_EXECUTIVE': 'CEO/Executive',
            'SOFTWARE_ENGINEER': 'Software Engineer',
            'TEST_LEAD': 'Test Lead',
            'OTHER': 'Other'
        };

        // State
        this.accessToken = null;
        this.hasAccess = false;
        this.isOpen = false;
        this.isLocked = false;
        this.conversationHistory = [];
        this.qcState = this.QC_STATE.INIT;
        
        this.portalObserver = null;
        this.portalInterval = null;
        this.portalFallbackTimer = null;
        this.lastAssistantMessage = null;
        this.accessRefreshTimer = null;
        this.accessLagTimer = null;
        
        this.currentPersona = null;
        this.currentPersonaConfidence = 0;
        this.detectedPersonaMessage = '';
        this.hasShownPersonaConfirmation = false;

        // DOM Elements (initialized in init)
        this.elements = {};
        
        // Test Access Skip Check
        this.QC_TEST_SKIP_ACCESS = (function() {
            try {
                if (window.__QC_TEST_SKIP_ACCESS === true) return true;
                const params = new URLSearchParams(window.location.search);
                return params.get('qc_test_skip_access') === '1';
            } catch (e) {
                return false;
            }
        })();

        this.init();
    }

    init() {
        // Select Elements
        this.elements = {
            accessMessage: document.getElementById('qc-access-message'),
            widgetContainer: document.getElementById('quality-coach-widget'),
            chatButton: document.getElementById('qc-chat-button'),
            chatWindow: document.getElementById('qc-chat-window'),
            closeButton: document.getElementById('qc-close-button'),
            messages: document.getElementById('qc-messages'),
            input: document.getElementById('qc-input'),
            sendButton: document.getElementById('qc-send'),
            typingIndicator: document.getElementById('qc-typing'),
            personaBadge: document.getElementById('qc-persona-badge'),
            personaButton: document.getElementById('qc-persona-button'),
            personaLabel: document.getElementById('qc-persona-label'),
            personaDropdown: document.getElementById('qc-persona-dropdown')
        };

        if (!this.elements.chatButton || !this.elements.chatWindow || !this.elements.input || !this.elements.sendButton || !this.elements.closeButton) {
            return;
        }

        // Initialize Session Global
        if (typeof window !== 'undefined') {
            window.QUALITY_COACH_SESSION = {
                status: 'pending',
                email: this.config.memberEmail
            };
        }

        // Initialize Client
        const ClientClass = (window.QualityCoach && window.QualityCoach.Client) || window.QualityCoachClient;
        if (!ClientClass) {
            console.error('QualityCoach.Client not loaded');
            return;
        }

        this.client = new ClientClass({
            apiBase: this.config.apiBase,
            storageKey: 'qc_thread_id'
        });
        
        this.clientThreadId = this.client.init();

        // Setup UI
        this.elements.chatButton.classList.add('is-loading');
        if (this.elements.input) {
            this.elements.input.placeholder = this.DEFAULT_PLACEHOLDER;
        }

        this.initializeAccess();
        this.monitorPortalTrigger();
        this.restorePersonaBadge();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Toggle chat window
        this.elements.chatButton.addEventListener('click', () => {
            if (this.elements.chatButton.getAttribute('aria-disabled') === 'true') {
                const lockedCopy = this.isLocked
                    ? 'The Researcher is available to approved members. Reach out to join the beta.'
                    : 'Still checking access…';
                this.showStatus(lockedCopy, this.isLocked ? 'warning' : 'info');
                return;
            }

            if (this.isOpen) {
                this.closeChatWindow();
            } else {
                this.openChatWindow();
            }
        });

        this.elements.closeButton.addEventListener('click', () => this.closeChatWindow());

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isOpen) {
                this.closeChatWindow();
            }
        });

        // Auto-resize textarea
        this.elements.input.addEventListener('input', () => {
            this.elements.input.style.height = 'auto';
            this.elements.input.style.height = Math.min(this.elements.input.scrollHeight, 120) + 'px';
        });

        // Send on Enter (Shift+Enter for newline)
        this.elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.elements.sendButton.addEventListener('click', () => this.sendMessage());
        
        // Persona dropdown toggle
        if (this.elements.personaButton && this.elements.personaDropdown) {
            this.elements.personaButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = this.elements.personaDropdown.style.display === 'block';
                this.elements.personaDropdown.style.display = isVisible ? 'none' : 'block';
                this.elements.personaButton.setAttribute('aria-expanded', !isVisible);
            });
            
            // Close button in dropdown
            const personaCloseBtn = document.getElementById('qc-persona-close');
            if (personaCloseBtn) {
                personaCloseBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.elements.personaDropdown.style.display = 'none';
                    this.elements.personaButton.setAttribute('aria-expanded', 'false');
                });
            }
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!this.elements.personaButton.contains(e.target) && !this.elements.personaDropdown.contains(e.target)) {
                    this.elements.personaDropdown.style.display = 'none';
                    this.elements.personaButton.setAttribute('aria-expanded', 'false');
                }
            });
            
            // Handle persona option clicks
            document.addEventListener('click', (e) => {
                const opt = e.target.closest && e.target.closest('.qc-persona-option');
                if (!opt) return;
                if (!this.elements.personaDropdown.contains(opt)) return;

                const selectedPersona = opt.dataset.persona;
                try {
                    localStorage.setItem('qc_persona_choice', selectedPersona);
                    localStorage.setItem('qc_persona_confirmed', 'true');
                } catch (err) {}

                try {
                    this.correctPersona(selectedPersona, 'user_selected');
                } catch (e) {
                    console.error('Error calling correctPersona from delegated handler', e);
                }

                this.elements.personaDropdown.style.display = 'none';
                this.elements.personaButton.setAttribute('aria-expanded', 'false');

                setTimeout(() => {
                    try {
                        localStorage.setItem('qc_persona_choice', selectedPersona);
                        localStorage.setItem('qc_persona_confirmed', 'true');
                    } catch (err) {}
                }, 150);
            });
        }
    }

    setState(newState) {
        if (this.qcState === newState) return;
        this.qcState = newState;
        
        try {
            window.QUALITY_COACH_SESSION = window.QUALITY_COACH_SESSION || {};
            window.QUALITY_COACH_SESSION.status = Object.keys(this.QC_STATE).find(k => this.QC_STATE[k] === newState) || String(newState);
        } catch (e) {}

        switch (newState) {
            case this.QC_STATE.INIT:
                this.hasAccess = false;
                this.isLocked = false;
                this.isOpen = false;
                this.setButtonAccessibility({ disabled: true, loading: true, tooltip: 'Checking access' });
                break;
            case this.QC_STATE.READY:
                this.hasAccess = true;
                this.isLocked = false;
                this.isOpen = false;
                this.setButtonAccessibility({ disabled: false, loading: false, tooltip: 'Open Quality Coach Researcher' });
                this.showStatus('');
                try {
                    if (this.currentPersona) {
                        localStorage.setItem('qc_persona_choice', this.currentPersona);
                        localStorage.setItem('qc_persona_confirmed', 'true');
                    }
                } catch (e) {}
                break;
            case this.QC_STATE.OPEN:
                this.hasAccess = true;
                this.isLocked = false;
                this.isOpen = true;
                this.setButtonAccessibility({ disabled: false, loading: false, tooltip: 'Close Quality Coach Researcher' });
                try {
                    if (this.currentPersona) {
                        localStorage.setItem('qc_persona_choice', this.currentPersona);
                        localStorage.setItem('qc_persona_confirmed', 'true');
                    }
                } catch (e) {}
                break;
            case this.QC_STATE.LOCKED:
                this.hasAccess = false;
                this.isLocked = true;
                this.isOpen = false;
                this.setButtonAccessibility({ disabled: true, loading: false, tooltip: 'Unable to verify beta access. Please refresh and try again.' });
                break;
        }
    }

    restorePersonaBadge() {
        const savedPersona = localStorage.getItem('qc_persona_choice');
        const hasConfirmed = localStorage.getItem('qc_persona_confirmed');
        
        if (hasConfirmed && savedPersona && this.elements.personaBadge && this.elements.personaLabel) {
            this.currentPersona = savedPersona;
            this.elements.personaLabel.textContent = this.personaNames[savedPersona] || savedPersona;
            this.elements.personaBadge.style.display = 'flex';
        }
    }

    showStatus(message, variant = 'info') {
        if (!this.elements.accessMessage) return;
        if (!message) {
            this.elements.accessMessage.textContent = '';
            this.elements.accessMessage.style.display = 'none';
            this.elements.accessMessage.className = 'qc-access-message';
            return;
        }
        this.elements.accessMessage.textContent = message;
        this.elements.accessMessage.style.display = 'flex';
        this.elements.accessMessage.className = `qc-access-message qc-${variant}`;
    }

    startAccessLagTimer() {
        if (this.accessLagTimer) {
            clearTimeout(this.accessLagTimer);
        }
        this.accessLagTimer = setTimeout(() => {
            this.showStatus('Still checking access…', 'info');
        }, this.ACCESS_LAG_MESSAGE_MS);
    }

    stopAccessLagTimer() {
        if (this.accessLagTimer) {
            clearTimeout(this.accessLagTimer);
            this.accessLagTimer = null;
        }
    }

    attemptRestoreCachedAccess() {
        const cached = this.loadAccessCache();
        if (!cached) {
            return false;
        }
        if (!this.canUseCachedAccess(cached)) {
            this.clearAccessCache();
            return false;
        }
        this.applyAccessSuccess({
            access_token: cached.access_token,
            access_expires_at: cached.access_expires_at,
            access_granted_via: cached.access_granted_via,
            is_beta_tester: cached.is_beta_tester,
            is_paid_member: cached.is_paid_member
        }, {
            source: 'cache',
            skipCache: true
        });
        return true;
    }

    applyAccessSuccess(data, { source = 'network', skipCache = false } = {}) {
        if (!data || !data.access_token) {
            return;
        }
        this.accessToken = data.access_token;
        this.client.setAccessToken(this.accessToken);

        if (this.elements.widgetContainer) {
            this.elements.widgetContainer.classList.remove('qc-widget--hidden');
            this.elements.widgetContainer.classList.remove('qc-widget--initializing');
        }
        window.QUALITY_COACH_SESSION = Object.assign(window.QUALITY_COACH_SESSION || {}, {
            token: this.accessToken,
            expires_at: data.access_expires_at,
            granted_via: data.access_granted_via,
            email: this.config.memberEmail,
            source,
            is_beta_tester: data.is_beta_tester,
            is_paid_member: data.is_paid_member
        });

        this.setState(this.QC_STATE.READY);
        if (!skipCache) {
            this.saveAccessCache({
                access_token: data.access_token,
                access_expires_at: data.access_expires_at,
                access_granted_via: data.access_granted_via,
                is_beta_tester: data.is_beta_tester,
                is_paid_member: data.is_paid_member
            });
        }
        this.scheduleAccessRefresh(data.access_expires_at);
        this.showStatus('');
        
        this.loadConversationHistory();
    }

    scheduleAccessRefresh(expiresAt) {
        if (this.accessRefreshTimer) {
            clearTimeout(this.accessRefreshTimer);
            this.accessRefreshTimer = null;
        }
        if (!expiresAt) return;
        const expiryTime = Date.parse(expiresAt);
        if (!expiryTime) return;
        const delay = expiryTime - Date.now() - this.ACCESS_REFRESH_BUFFER_MS;
        if (delay <= 0) {
            this.accessRefreshTimer = setTimeout(() => {
                this.refreshAccessToken('expired');
            }, 1000);
            return;
        }
        this.accessRefreshTimer = setTimeout(() => {
            this.refreshAccessToken('scheduled');
        }, delay);
    }

    async refreshAccessToken(reason = 'scheduled') {
        try {
            await this.performAccessCheck({ silent: true });
        } catch (error) {
            if (typeof console !== 'undefined' && console.debug) {
                console.debug('Access refresh failed', reason, error);
            }
        }
    }

    getCacheKey() {
        return `${this.ACCESS_CACHE_PREFIX}${this.config.memberEmail || 'anonymous'}`;
    }

    loadAccessCache() {
        if (typeof sessionStorage === 'undefined') return null;
        try {
            const raw = sessionStorage.getItem(this.getCacheKey());
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (error) {
            this.clearAccessCache();
            return null;
        }
    }

    saveAccessCache(payload) {
        if (typeof sessionStorage === 'undefined' || !payload) return;
        const cacheEntry = {
            ...payload,
            cached_at: new Date().toISOString(),
            member_email: this.config.memberEmail
        };
        try {
            sessionStorage.setItem(this.getCacheKey(), JSON.stringify(cacheEntry));
        } catch (error) {
            // Ignore quota errors silently
        }
    }

    clearAccessCache() {
        if (typeof sessionStorage === 'undefined') return;
        sessionStorage.removeItem(this.getCacheKey());
        if (this.accessRefreshTimer) {
            clearTimeout(this.accessRefreshTimer);
            this.accessRefreshTimer = null;
        }
    }

    canUseCachedAccess(entry) {
        if (!entry || !entry.access_token || !entry.access_expires_at) {
            return false;
        }
        const expiryTime = Date.parse(entry.access_expires_at);
        if (!expiryTime) {
            return false;
        }
        if (expiryTime - Date.now() <= this.ACCESS_CACHE_MIN_VALID_MS) {
            return false;
        }
        return true;
    }

    monitorPortalTrigger() {
        if (typeof document === 'undefined') return;

        this.updatePortalOffset();

        if (typeof MutationObserver !== 'undefined') {
            if (this.portalObserver) {
                this.portalObserver.disconnect();
            }
            this.portalObserver = new MutationObserver(() => {
                this.updatePortalOffset();
            });
            this.portalObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        if (!this.portalInterval) {
            this.portalInterval = setInterval(() => {
                this.updatePortalOffset();
            }, this.PORTAL_CHECK_INTERVAL_MS);
        }

        if (!this.portalFallbackTimer) {
            this.portalFallbackTimer = setTimeout(() => {
                if (document.body && !document.body.classList.contains(this.PORTAL_OFFSET_CLASS)) {
                    document.body.classList.add(this.PORTAL_OFFSET_CLASS);
                }
            }, this.PORTAL_FALLBACK_TIMEOUT_MS);
        }
    }

    updatePortalOffset() {
        if (!document.body) return;
        const portalElement = this.findPortalElement();
        const hasPortal = Boolean(portalElement);
        document.body.classList.toggle(this.PORTAL_OFFSET_CLASS, hasPortal);

        if (hasPortal && this.portalFallbackTimer) {
            clearTimeout(this.portalFallbackTimer);
            this.portalFallbackTimer = null;
        }

        if (hasPortal && this.portalInterval) {
            clearInterval(this.portalInterval);
            this.portalInterval = null;
        }
    }

    findPortalElement() {
        for (const selector of this.PORTAL_SELECTORS) {
            if (!selector) continue;
            const el = document.querySelector(selector);
            if (el) {
                return el;
            }
        }
        return null;
    }

    async loadConversationHistory() {
        if (!this.clientThreadId || !this.accessToken) return;
        
        if (this.conversationHistory.length > 0) return;

        try {
            const messages = await this.client.getHistory();
            
            if (Array.isArray(messages) && messages.length > 0) {
                const welcomeMsg = document.querySelector('.qc-welcome-message');
                if (welcomeMsg) welcomeMsg.style.display = 'none';

                messages.forEach(msg => {
                    this.addMessage(msg.content, msg.role);
                    this.conversationHistory.push({ role: msg.role, content: msg.content });
                });
            }
        } catch (error) {
            console.debug('Failed to load conversation history', error);
        }
    }

    async initializeAccess() {
        const restored = this.attemptRestoreCachedAccess();
        if (restored) {
            return;
        }

        if (this.QC_TEST_SKIP_ACCESS) {
            try {
                const fakeExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
                const fakeData = {
                    has_access: true,
                    access_token: 'qc-test-token',
                    access_expires_at: fakeExpires,
                    access_granted_via: 'localtest',
                    is_beta_tester: true,
                    is_paid_member: true
                };
                this.client.setAccessToken(fakeData.access_token);
                this.applyAccessSuccess(fakeData, { source: 'localtest', skipCache: true });
                return;
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('QC test access shortcut failed, falling back to network check', e);
                }
            }
        }

        await this.performAccessCheck();
    }

    async performAccessCheck({ silent = false } = {}) {
        if (!silent) {
            this.showStatus('Checking access…');
            this.startAccessLagTimer();
        }

        try {
            const data = await this.client.checkAccess(this.config.memberEmail);

            if (this.elements.widgetContainer) {
                this.elements.widgetContainer.classList.remove('qc-widget--initializing');
            }

            if (!data.has_access || !data.access_token) {
                this.setState(this.QC_STATE.LOCKED);
                this.hideChatWidget();
                this.showStatus(data.reason || 'The Researcher is available to beta testers only right now.', 'warning');
                this.clearAccessCache();
                return false;
            }

            this.client.setAccessToken(data.access_token);

            this.applyAccessSuccess(data, {
                source: silent ? 'refresh' : 'network'
            });
            return true;
        } catch (error) {
            this.setState(this.QC_STATE.LOCKED);
            if (this.elements.widgetContainer) {
                this.elements.widgetContainer.classList.remove('qc-widget--initializing');
            }
            if (!silent) {
                this.showStatus('Unable to verify beta access. Please refresh and try again.', 'error');
            }
            this.clearAccessCache();
            return false;
        } finally {
            if (!silent) {
                this.stopAccessLagTimer();
            }
        }
    }

    setButtonAccessibility({ disabled, loading, tooltip }) {
        if (!this.elements.chatButton) return;
        this.elements.chatButton.classList.toggle('is-loading', Boolean(loading));
        if (typeof disabled !== 'undefined') {
            if (disabled) {
                this.elements.chatButton.setAttribute('aria-disabled', 'true');
                this.elements.chatButton.disabled = true;
            } else {
                this.elements.chatButton.removeAttribute('aria-disabled');
                this.elements.chatButton.disabled = false;
            }
        }
        if (tooltip) {
            this.elements.chatButton.setAttribute('title', tooltip);
        } else {
            this.elements.chatButton.removeAttribute('title');
        }
    }

    hideChatWidget() {
        if (this.elements.widgetContainer) {
            this.elements.widgetContainer.classList.add('qc-widget--hidden');
        }
        this.setButtonAccessibility({ disabled: true, loading: false });
    }

    openChatWindow() {
        if (this.qcState !== this.QC_STATE.READY && this.qcState !== this.QC_STATE.OPEN) {
            this.showStatus('The Researcher is available to approved members. Reach out to join the beta.', 'warning');
            return;
        }
        this.setState(this.QC_STATE.OPEN);
        this.elements.chatWindow.classList.add('is-visible');
        this.elements.chatButton.classList.add('is-open');
        this.elements.chatButton.setAttribute('aria-expanded', 'true');
        this.elements.chatButton.setAttribute('aria-label', 'Close Quality Coach Researcher');
        this.elements.input.focus();

        if (typeof gtag !== 'undefined') {
            gtag('event', 'quality_coach_opened', {
                'post_slug': this.config.postSlug,
                'post_title': this.config.postTitle
            });
        }
    }

    closeChatWindow() {
        this.setState(this.QC_STATE.READY);
        this.elements.chatWindow.classList.remove('is-visible');
        this.elements.chatButton.classList.remove('is-open');
        this.elements.chatButton.setAttribute('aria-expanded', 'false');
        this.elements.chatButton.setAttribute('aria-label', 'Open Quality Coach Researcher');
        this.elements.chatButton.focus();
    }

    sendMessage(options = {}) {
        if (!this.hasAccess || !this.accessToken) {
            this.showStatus('Your access token expired. Refresh the page to continue.', 'warning');
            return;
        }

        const { messageOverride = null, isFeedbackOverride = null, skipUserMessage = false } = options;
        const usingPrimaryInput = messageOverride === null;
        const sourceValue = usingPrimaryInput ? this.elements.input.value : messageOverride;
        const rawMessage = (sourceValue || '').trim();
        if (!rawMessage) return;

        const hasLegacyFeedbackPrefix = usingPrimaryInput && rawMessage.toLowerCase().startsWith(this.FEEDBACK_PREFIX);
        const cleanedMessage = hasLegacyFeedbackPrefix
            ? rawMessage.slice(this.FEEDBACK_PREFIX.length).trimStart()
            : rawMessage;
        const isFeedback = typeof isFeedbackOverride === 'boolean'
            ? isFeedbackOverride
            : hasLegacyFeedbackPrefix;

        if (isFeedback && !cleanedMessage) {
            this.showStatus('Share a short note before sending feedback.', 'warning');
            return;
        }

        if (isFeedback) {
            this.showStatus('Thanks for the feedback — it goes straight to Anne-Marie.', 'info');
        }

        const displayMessage = isFeedback ? cleanedMessage : rawMessage;
        if (!isFeedback && !skipUserMessage) {
            this.addMessage(displayMessage, 'user', null, null, isFeedback);
        }

        if (usingPrimaryInput) {
            this.elements.input.value = '';
            this.elements.input.style.height = 'auto';
        }

        if (usingPrimaryInput) {
            this.elements.input.disabled = true;
            this.elements.sendButton.disabled = true;
        }
        this.elements.typingIndicator.style.display = 'flex';

        return this.client.sendMessage(cleanedMessage, this.conversationHistory, {
            post_slug: this.config.postSlug,
            post_title: this.config.postTitle,
            member_email: this.config.memberEmail,
            is_feedback: isFeedback,
            persona: this.currentPersona
        })
        .then(data => {
            this.elements.typingIndicator.style.display = 'none';

            if (data.answer) {
                if (!isFeedback) {
                    const needsConfirmation = data.persona && 
                                            !this.hasShownPersonaConfirmation && 
                                            !localStorage.getItem('qc_persona_confirmed');

                    if (needsConfirmation) {
                        this.currentPersona = data.persona;
                        this.currentPersonaConfidence = data.persona_confidence;
                        this.detectedPersonaMessage = cleanedMessage;
                        
                        this.updatePersonaDropdown(data.persona, false);
                        
                        this.showPersonaConfirmation(data.persona, data.persona_confidence, {
                            answer: data.answer,
                            sources: data.sources,
                            originalMessage: cleanedMessage,
                            lowRelevance: data.low_relevance
                        });
                        return;
                    }

                    if (data.persona) {
                        this.currentPersona = data.persona;
                        this.currentPersonaConfidence = data.persona_confidence;
                        this.detectedPersonaMessage = cleanedMessage;
                        
                        this.updatePersonaDropdown(data.persona);
                    }
                    
                    this.addMessage(data.answer, 'assistant', data.sources, false, data.low_relevance);
                    this.conversationHistory.push({ role: 'user', content: cleanedMessage });
                    this.conversationHistory.push({ role: 'assistant', content: data.answer });
                }
                
                if (isFeedback && typeof gtag !== 'undefined') {
                    gtag('event', 'quality_coach_feedback_submitted', {
                        'post_slug': this.config.postSlug,
                        'post_title': this.config.postTitle
                    });
                }
            } else {
                this.addMessage('Sorry, I encountered an error. Please try again.', 'error', null, null);
            }
        })
        .catch(error => {
            this.elements.typingIndicator.style.display = 'none';
            
            if (error.message.includes('401') || error.message.includes('403')) {
                this.hasAccess = false;
                this.isLocked = true;
                this.showStatus('Your access expired. Refresh the page to continue.', 'warning');
                this.setButtonAccessibility({ disabled: true, loading: false, tooltip: 'Access expired - refresh to continue.' });
            } else {
                this.addMessage('Sorry, I\'m having trouble connecting. Please try again later.', 'error');
            }
        })
        .finally(() => {
            if (usingPrimaryInput) {
                this.elements.input.disabled = false;
                this.elements.sendButton.disabled = false;
                this.elements.input.focus();
            }
        });
    }

    formatMessage(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/^- (.*?)$/gm, '• $1')
            .replace(/\n/g, '<br>');
    }
    
    updatePersonaDropdown(persona, isConfirmed = true) {
        if (!persona) return;
        
        const options = document.querySelectorAll('.qc-persona-option');
        options.forEach(opt => {
            if (opt.dataset.persona === persona) {
                opt.classList.add('is-active');
            } else {
                opt.classList.remove('is-active');
            }
        });
        
        if (this.elements.personaLabel) {
            this.elements.personaLabel.textContent = this.personaNames[persona] || persona;
        }

        if (this.elements.personaBadge) {
            this.elements.personaBadge.style.display = 'flex';
        }

        try {
            localStorage.setItem('qc_persona_choice', persona);
            if (isConfirmed) {
                localStorage.setItem('qc_persona_confirmed', 'true');
            }
        } catch (e) {}
    }
    
    showPersonaConfirmation(persona, confidence, deferredData = null) {
        const hasConfirmed = localStorage.getItem('qc_persona_confirmed');
        
        if (this.hasShownPersonaConfirmation || hasConfirmed) {
            if (deferredData && deferredData.answer) {
                 this.addMessage(deferredData.answer, 'assistant', deferredData.sources, false, deferredData.lowRelevance);
                 this.conversationHistory.push({ role: 'user', content: deferredData.originalMessage });
                 this.conversationHistory.push({ role: 'assistant', content: deferredData.answer });
            }
            return;
        }
        
        this.hasShownPersonaConfirmation = true;
        
        const displayName = this.personaNames[persona] || persona;
        const confirmDiv = document.createElement('div');
        confirmDiv.className = 'qc-persona-confirmation';
        confirmDiv.setAttribute('tabindex', '-1');
        confirmDiv.innerHTML = `
            <div class="qc-persona-confirmation-content">
                <div class="qc-persona-confirmation-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                </div>
                <div class="qc-persona-confirmation-text">
                    <strong>I'm responding as if you're a ${displayName}.</strong>
                    <span>Is that right?</span>
                </div>
                <div class="qc-persona-confirmation-actions">
                    <button class="qc-persona-confirm-yes" data-action="confirm">Yes, that's right</button>
                    <button class="qc-persona-confirm-change" data-action="change">Actually, I'm a...</button>
                </div>
            </div>
        `;
        
        this.elements.messages.appendChild(confirmDiv);
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
        confirmDiv.focus();
        
        confirmDiv.querySelector('[data-action="confirm"]').addEventListener('click', () => {
            this.confirmPersona(persona);
            confirmDiv.classList.add('qc-fade-out');
            setTimeout(() => confirmDiv.remove(), 300);

            if (deferredData && deferredData.answer) {
                 this.addMessage(deferredData.answer, 'assistant', deferredData.sources, false, deferredData.lowRelevance);
                 this.conversationHistory.push({ role: 'user', content: deferredData.originalMessage });
                 this.conversationHistory.push({ role: 'assistant', content: deferredData.answer });
            }
        });
        
        confirmDiv.querySelector('[data-action="change"]').addEventListener('click', () => {
            this.showPersonaSelector(confirmDiv, persona, deferredData);
        });
    }
    
    showPersonaSelector(confirmDiv, originalPersona, deferredData = null) {
        confirmDiv.innerHTML = `
            <div class="qc-persona-confirmation-content">
                <div class="qc-persona-confirmation-text">
                    <strong>What's your role?</strong>
                </div>
                <div class="qc-persona-selector">
                    <button class="qc-persona-select-option" data-persona="QUALITY_COACH">
                        <span class="qc-persona-icon">🎯</span>
                        <span>Quality Coach</span>
                    </button>
                    <button class="qc-persona-select-option" data-persona="ENGINEERING_MANAGER">
                        <span class="qc-persona-icon">👔</span>
                        <span>Engineering Manager</span>
                    </button>
                    <button class="qc-persona-select-option" data-persona="DELIVERY_LEAD">
                        <span class="qc-persona-icon">📊</span>
                        <span>Delivery Lead</span>
                    </button>
                    <button class="qc-persona-select-option" data-persona="CEO_EXECUTIVE">
                        <span class="qc-persona-icon">💼</span>
                        <span>CEO/Executive</span>
                    </button>
                    <button class="qc-persona-select-option" data-persona="SOFTWARE_ENGINEER">
                        <span class="qc-persona-icon">💻</span>
                        <span>Software Engineer</span>
                    </button>
                    <button class="qc-persona-select-option" data-persona="TEST_LEAD">
                        <span class="qc-persona-icon">🧪</span>
                        <span>Test Lead</span>
                    </button>
                </div>
            </div>
        `;
        
        confirmDiv.querySelectorAll('.qc-persona-select-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const newPersona = btn.dataset.persona;
                try {
                    localStorage.setItem('qc_persona_choice', newPersona);
                    localStorage.setItem('qc_persona_confirmed', 'true');
                } catch (e) {}

                this.correctPersona(newPersona, 'user_selected');
                confirmDiv.classList.add('qc-fade-out');
                setTimeout(() => confirmDiv.remove(), 300);

                if (deferredData && deferredData.originalMessage) {
                    this.sendMessage({
                        messageOverride: deferredData.originalMessage,
                        skipUserMessage: true
                    });
                }
            });
        });
    }
    
    confirmPersona(persona) {
        localStorage.setItem('qc_persona_confirmed', 'true');
        localStorage.setItem('qc_persona_choice', persona);
        
        if (this.elements.personaBadge) {
            this.elements.personaBadge.style.display = 'flex';
            if (this.elements.personaLabel) {
                this.elements.personaLabel.textContent = this.personaNames[persona] || persona;
            }
        }
    }
    
    async correctPersona(newPersona, reason = 'user_selected') {
        if (!newPersona || newPersona === this.currentPersona) return;

        const originalPersona = this.currentPersona;
        
        // Optimistically update state immediately so subsequent messages use the new persona
        this.currentPersona = newPersona;
        
        const lastUserMessage = this.conversationHistory.length > 0
            ? this.conversationHistory[this.conversationHistory.length - 2]?.content
            : null;

        this.updatePersonaDropdown(newPersona);

        try {
            localStorage.setItem('qc_persona_confirmed', 'true');
            localStorage.setItem('qc_persona_choice', newPersona);
        } catch (e) {}

        if (this.elements.personaBadge) {
            this.elements.personaBadge.style.display = 'flex';
            if (this.elements.personaLabel) {
                this.elements.personaLabel.textContent = this.personaNames[newPersona] || newPersona;
            }
        }

        if (!this.accessToken) {
            try { console.warn('correctPersona: no access token, skipping remote correction'); } catch (e) {}
            return;
        }

        const postCorrection = async () => {
            try {
                const resp = await fetch(`${this.config.apiBase}/api/v1/persona/correct`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.accessToken}`
                    },
                    body: JSON.stringify({
                        thread_id: this.clientThreadId,
                        user_id: this.config.memberEmail,
                        corrected_persona: newPersona,
                        original_persona: originalPersona,
                        original_confidence: this.currentPersonaConfidence,
                        message_context: lastUserMessage,
                        correction_reason: reason
                    })
                });
                return resp;
            } catch (err) {
                throw err;
            }
        };

        try {
            let response = await postCorrection();

            if (response.status === 401) {
                try {
                    await this.refreshAccessToken('correct-persona-retry');
                } catch (e) {
                    console.warn('correctPersona: refreshAccessToken failed', e);
                }
                response = await postCorrection();
            }

            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    this.showStatus(`Persona updated to ${this.personaNames[newPersona]}. Your next responses will be tailored accordingly.`, 'info');
                    setTimeout(() => this.showStatus('', ''), 3000);

                    if (typeof gtag !== 'undefined') {
                        gtag('event', 'persona_corrected', {
                            'from': originalPersona,
                            'to': newPersona,
                            'reason': reason
                        });
                    }
                } else {
                    console.warn('correctPersona: server returned non-success', data);
                }
            } else {
                console.warn('correctPersona: server responded with', response.status);
            }
        } catch (error) {
            console.error('Failed to update persona (network/error):', error);
        }
    }

    addMessage(content, role, sources, isFeedbackMessage = false, lowRelevance = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'qc-message qc-message-' + role;

        const bubble = document.createElement('div');
        bubble.className = 'qc-message-bubble';

        if (role === 'user') {
            bubble.textContent = content;
        } else {
            bubble.innerHTML = this.formatMessage(content);
        }

        if (isFeedbackMessage) {
            messageDiv.classList.add('qc-message-feedback');
            const feedbackLabel = document.createElement('div');
            feedbackLabel.className = 'qc-feedback-message-label';
            feedbackLabel.textContent = 'Feedback sent to Anne-Marie';
            messageDiv.appendChild(feedbackLabel);
        }

        messageDiv.appendChild(bubble);

        if (role === 'assistant') {
            const sourcesDiv = document.createElement('div');
            sourcesDiv.className = 'qc-sources-container';
            
            const handbookSources = sources && sources.filter(s => s.similarity >= 0.5);
            
            const disclaimerPhrases = [
                "handbook doesn't",
                "handbook does not",
                "handbook doesn't directly",
                "handbook does not directly",
                "doesn't define",
                "does not define",
                "doesn't cover",
                "does not cover",
                "not covered in the handbook",
                "not in the handbook"
            ];
            const contentLower = content.toLowerCase();
            const llmDisclaimedHandbook = disclaimerPhrases.some(phrase => contentLower.includes(phrase));
            
            const hasHandbookSources = !lowRelevance && !llmDisclaimedHandbook && handbookSources && handbookSources.length > 0;
            const hasRelatedTopics = llmDisclaimedHandbook && handbookSources && handbookSources.length > 0;
            
            if (hasHandbookSources) {
                const chapterNames = [...new Set(
                    handbookSources.map(s => s.section || s.label || s.chapter || 'Handbook')
                )].slice(0, 3);
                
                sourcesDiv.innerHTML = `
                    <div class="qc-sources-badge qc-sources-handbook">
                        <span class="qc-sources-icon">📚</span>
                        <span class="qc-sources-label">From the Handbook:</span>
                        <span class="qc-sources-chapters">${chapterNames.join(', ')}</span>
                    </div>
                `;
            } else if (hasRelatedTopics) {
                const relatedChapters = [...new Set(
                    handbookSources.map(s => s.section || s.label || s.chapter || 'Handbook')
                )].slice(0, 2);
                
                sourcesDiv.innerHTML = `
                    <div class="qc-sources-badge qc-sources-general">
                        <span class="qc-sources-icon">💡</span>
                        <span class="qc-sources-label">General coaching guidance</span>
                    </div>
                    <div class="qc-sources-badge qc-sources-related">
                        <span class="qc-sources-icon">📖</span>
                        <span class="qc-sources-label">Related content from the Handbook:</span>
                        <span class="qc-sources-chapters">${relatedChapters.join(', ')}</span>
                    </div>
                `;
            } else {
                sourcesDiv.innerHTML = `
                    <div class="qc-sources-badge qc-sources-general">
                        <span class="qc-sources-icon">💡</span>
                        <span class="qc-sources-label">General coaching guidance</span>
                    </div>
                `;
            }
            
            messageDiv.appendChild(sourcesDiv);
        }

        if (role === 'assistant') {
            this.lastAssistantMessage = messageDiv;
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'qc-message-actions';
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'qc-action-btn';
            copyBtn.title = 'Copy to clipboard';
            copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(content);
                copyBtn.classList.add('is-active');
                setTimeout(() => copyBtn.classList.remove('is-active'), 1000);
            };
            
            const upBtn = document.createElement('button');
            upBtn.className = 'qc-action-btn';
            upBtn.title = 'Helpful';
            upBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>';
            upBtn.onclick = () => this.handleFeedback(messageDiv, 'positive', upBtn);

            const downBtn = document.createElement('button');
            downBtn.className = 'qc-action-btn';
            downBtn.title = 'Not helpful';
            downBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>';
            downBtn.onclick = () => this.handleFeedback(messageDiv, 'negative', downBtn);

            actionsDiv.appendChild(copyBtn);
            actionsDiv.appendChild(upBtn);
            actionsDiv.appendChild(downBtn);
            messageDiv.appendChild(actionsDiv);
        }

        this.elements.messages.appendChild(messageDiv);
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }

    handleFeedback(messageDiv, rating, btn) {
        const existingForm = messageDiv.querySelector('.qc-inline-feedback');
        if (existingForm) existingForm.remove();

        const buttons = messageDiv.querySelectorAll('.qc-action-btn');
        buttons.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');

        const form = document.createElement('div');
        form.className = 'qc-inline-feedback';
        
        const textarea = document.createElement('textarea');
        textarea.placeholder = rating === 'positive' ? 'What was helpful? (Optional)' : 'How can we improve this? (Optional)';
        
        const actions = document.createElement('div');
        actions.className = 'qc-inline-actions';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'qc-btn-xs qc-btn-ghost';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => {
            form.remove();
            btn.classList.remove('is-active');
        };

        const submitBtn = document.createElement('button');
        submitBtn.className = 'qc-btn-xs qc-btn-primary';
        submitBtn.textContent = 'Send Feedback';
        submitBtn.onclick = () => {
            const comment = textarea.value.trim();
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
            
            this.submitFeedback(rating, comment).then(() => {
                form.innerHTML = '<div style="color: var(--qc-accent); font-size: 13px; font-weight: 500;">Thanks for your feedback!</div>';
                setTimeout(() => {
                    form.remove();
                }, 2000);
            }).catch(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Feedback';
            });
        };

        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        form.appendChild(textarea);
        form.appendChild(actions);
        
        messageDiv.appendChild(form);
        textarea.focus();
    }

    submitFeedback(rating, comment) {
        return this.sendMessage({
            messageOverride: comment || rating,
            isFeedbackOverride: true
        });
    }
}

// Export for Browser environments
if (typeof window !== 'undefined') {
    window.QualityCoach = window.QualityCoach || {};
    window.QualityCoach.UI = QualityCoachUI;
}
