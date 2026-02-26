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
        this.ACCESS_LAG_MESSAGE_MS = 500; // Reduced from 4000ms for faster feedback
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

        this.personaFocus = {
            'QUALITY_COACH': ['Facilitating workshops', 'Coaching techniques', 'Role definition'],
            'ENGINEERING_MANAGER': ['Team leadership', 'Quality strategy', 'Cross-team consistency'],
            'DELIVERY_LEAD': ['Delivery processes', 'Sprint planning', 'Release quality'],
            'CEO_EXECUTIVE': ['Strategic alignment', 'ROI and business value', 'Organizational quality'],
            'SOFTWARE_ENGINEER': ['Developer experience', 'Technical practices', 'Reducing technical debt'],
            'TEST_LEAD': ['Testing techniques', 'Test strategy', 'Transition to coaching'],
            'OTHER': ['General coaching guidance']
        };

        // State
        this.accessToken = null;
        this.hasAccess = false;
        this.isOpen = false;
        this.isLocked = false;
        this.conversationHistory = [];
        this.questionCount = 0;  // Track questions asked in this session
        this.personaPromptShown = false;
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
        this.messageCount = 0;
        this.hasShownPersonaReminder = false;

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
            personaPrefix: document.getElementById('qc-persona-prefix'),
            personaPopover: document.getElementById('qc-persona-popover'),
            tokenUsage: document.getElementById('qc-token-usage')
        };

        if (!this.elements.chatButton || !this.elements.chatWindow || !this.elements.closeButton) {
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

        // Initialize access for both members and guests
        this.initializeAccess();

        this.monitorPortalTrigger();
        this.restorePersonaBadge();
        this.setupEventListeners();
        this.checkReturnToChat();
    }

    checkReturnToChat() {
        try {
            const shouldReturn = localStorage.getItem('qc_return_to_chat');
            if (shouldReturn === 'true' && this.config.memberEmail) {
                // User just signed in/up and came back
                // Small delay to ensure UI is ready
                setTimeout(() => {
                    this.openChatWindow();
                    localStorage.removeItem('qc_return_to_chat');
                }, 500);
            }
        } catch (e) {
            // Ignore storage errors
        }
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
        if (this.elements.input) {
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
        }

        if (this.elements.sendButton) {
            this.elements.sendButton.addEventListener('click', () => this.sendMessage());
        }
        
        // Persona popover toggle
        if (this.elements.personaButton && this.elements.personaPopover) {
            this.elements.personaButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = this.elements.personaPopover.style.display === 'block';
                this.elements.personaPopover.style.display = isVisible ? 'none' : 'block';
                this.elements.personaButton.setAttribute('aria-expanded', !isVisible);
            });

            // Close button in popover
            const personaCloseBtn = document.getElementById('qc-popover-close');
            if (personaCloseBtn) {
                personaCloseBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.elements.personaPopover.style.display = 'none';
                    this.elements.personaButton.setAttribute('aria-expanded', 'false');
                });
            }

            // Close popover when clicking outside
            document.addEventListener('click', (e) => {
                if (!this.elements.personaButton.contains(e.target) && !this.elements.personaPopover.contains(e.target)) {
                    this.elements.personaPopover.style.display = 'none';
                    this.elements.personaButton.setAttribute('aria-expanded', 'false');
                }
            });

            // Handle persona option clicks (popover in header)
            document.addEventListener('click', (e) => {
                const opt = e.target.closest && e.target.closest('.qc-persona-option');
                if (!opt) return;
                if (!this.elements.personaPopover.contains(opt)) return;

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

                this.elements.personaPopover.style.display = 'none';
                this.elements.personaButton.setAttribute('aria-expanded', 'false');

                setTimeout(() => {
                    try {
                        localStorage.setItem('qc_persona_choice', selectedPersona);
                        localStorage.setItem('qc_persona_confirmed', 'true');
                    } catch (err) {}
                }, 150);
            });

            // Handle persona option clicks (welcome screen selector)
            document.addEventListener('click', (e) => {
                const selectOption = e.target.closest && e.target.closest('.qc-persona-select-option');
                if (!selectOption) return;
                const personaPrompt = document.getElementById('qc-persona-prompt');
                if (!personaPrompt || !personaPrompt.contains(selectOption)) return;

                const selectedPersona = selectOption.dataset.persona;

                // Save selection
                try {
                    localStorage.setItem('qc_persona_choice', selectedPersona);
                    localStorage.setItem('qc_persona_confirmed', 'true');
                } catch (err) {}

                // Update UI
                this.currentPersona = selectedPersona;
                this.updatePersonaDropdown(selectedPersona, true);

                // Hide persona prompt, show example questions
                personaPrompt.style.display = 'none';
                const exampleQuestionsContainer = document.getElementById('qc-example-questions-container');
                if (exampleQuestionsContainer) {
                    exampleQuestionsContainer.style.display = 'block';
                }

                // Track selection
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'persona_selected_upfront', {
                        'persona': selectedPersona
                    });
                }
            });
        }

        // Handle example question clicks
        document.addEventListener('click', (e) => {
            const exampleBtn = e.target.closest && e.target.closest('.qc-example-question');
            if (!exampleBtn) return;

            const question = exampleBtn.dataset.question;
            if (question && this.elements.input) {
                this.elements.input.value = question;
                this.elements.input.focus();
                // Auto-send the question
                this.sendMessage();
            }
        });

        // Guest Signin/Signup Tracking
        const guestLinks = document.querySelectorAll('.qc-signin-container a');
        guestLinks.forEach(link => {
            link.addEventListener('click', () => {
                try {
                    localStorage.setItem('qc_return_to_chat', 'true');
                } catch (e) {}
            });
        });
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

        // Badge is always visible now
        if (this.elements.personaBadge) {
            this.elements.personaBadge.style.display = 'flex';
        }

        if (hasConfirmed && savedPersona && this.elements.personaLabel && this.elements.personaPrefix) {
            // Show selected persona
            this.currentPersona = savedPersona;
            this.elements.personaPrefix.textContent = 'Tailored for:';
            this.elements.personaLabel.textContent = this.personaNames[savedPersona] || savedPersona;
            this.elements.personaButton.classList.remove('not-set');
        } else if (this.elements.personaLabel && this.elements.personaPrefix && this.elements.personaButton) {
            // Show "Personalize" state
            this.elements.personaPrefix.innerHTML = '<svg class="qc-gear-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M12 1v6m0 6v6m-9-9h6m6 0h6"></path></svg>';
            this.elements.personaLabel.textContent = 'Personalize';
            this.elements.personaButton.classList.add('not-set');
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
        console.log('[QC Debug] applyAccessSuccess called', { source, hasData: !!data, hasToken: !!(data && data.access_token) });
        if (!data || !data.access_token) {
            console.log('[QC Debug] applyAccessSuccess EARLY RETURN - no data or token');
            return;
        }
        this.accessToken = data.access_token;
        this.hasAccess = true;  // Enable sending messages
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

        // Update token usage display if tier_info is available
        if (data.tier_info) {
            this.updateTokenUsageDisplay(data.tier_info);
        }

        // Show example questions immediately for everyone
        const exampleQuestionsContainer = document.getElementById('qc-example-questions-container');
        if (exampleQuestionsContainer) {
            exampleQuestionsContainer.style.display = 'block';
        }

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
                    this.addMessage(msg.content, msg.role, null, false, false, msg.id);
                    this.conversationHistory.push({ role: msg.role, content: msg.content });
                });
            }
        } catch (error) {
            console.debug('Failed to load conversation history', error);
        }
    }

    async initializeAccess() {
        console.log('[QC Debug] initializeAccess started');
        try {
            const restored = this.attemptRestoreCachedAccess();
            if (restored) {
                console.log('[QC Debug] Access restored from cache');
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

            console.log('[QC Debug] Performing access check');
            await this.performAccessCheck();
            console.log('[QC Debug] Access check completed');
        } catch (error) {
            console.error('[QC Debug] initializeAccess error:', error);
            // Ensure widget is accessible even if access check fails
            this.setButtonAccessibility({ loading: false });
            if (this.elements.widgetContainer) {
                this.elements.widgetContainer.classList.remove('qc-widget--initializing');
            }
        }
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

        // Don't show persona prompt upfront - let user ask first
        // Progressive disclosure: show after first answer instead

        if (this.elements.input) {
            this.elements.input.focus();
        }

        if (typeof gtag !== 'undefined') {
            gtag('event', 'qc_chat_opened', {
                'post_slug': this.config.postSlug,
                'post_title': this.config.postTitle
            });
        }
    }

    showPersonaSuggestion() {
        // Show inline suggestion after 3rd answer
        this.personaPromptShown = true;

        // Create inline suggestion message
        const suggestion = document.createElement('div');
        suggestion.className = 'qc-persona-suggestion';
        suggestion.innerHTML = `
            <div class="qc-suggestion-content">
                <span class="qc-suggestion-icon">💡</span>
                <p class="qc-suggestion-text">
                    <strong>Tip:</strong> I can tailor my responses to your role. Check the settings in the header if you'd like to try it.
                </p>
            </div>
        `;

        // Add to messages area
        if (this.elements.messages) {
            this.elements.messages.appendChild(suggestion);

            // Scroll to show suggestion
            setTimeout(() => {
                suggestion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }

        // Track analytics
        if (typeof gtag !== 'undefined') {
            gtag('event', 'qc_persona_suggestion_shown', {
                'trigger': 'third_question',
                'post_slug': this.config.postSlug
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

        const { messageOverride = null, isFeedbackOverride = null, skipUserMessage = false, feedbackRating = null, messageId = null } = options;
        const usingPrimaryInput = messageOverride === null;
        const sourceValue = usingPrimaryInput 
            ? (this.elements.input ? this.elements.input.value : '') 
            : messageOverride;
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

        if (usingPrimaryInput && this.elements.input) {
            this.elements.input.value = '';
            this.elements.input.style.height = 'auto';
        }

        if (usingPrimaryInput) {
            if (this.elements.input) {
                this.elements.input.disabled = true;
            }
            if (this.elements.sendButton) {
                this.elements.sendButton.disabled = true;
            }
        }
        this.elements.typingIndicator.style.display = 'flex';

        return this.client.sendMessage(cleanedMessage, this.conversationHistory, {
            post_slug: this.config.postSlug,
            post_title: this.config.postTitle,
            member_email: this.config.memberEmail,
            is_feedback: isFeedback,
            rating: feedbackRating,
            persona: this.currentPersona,
            message_id: messageId
        })
        .then(data => {
            this.elements.typingIndicator.style.display = 'none';

            if (data.answer) {
                if (!isFeedback) {
                    // Update persona state first (don't show badge yet if confirmation needed)
                    if (data.persona) {
                        this.currentPersona = data.persona;
                        this.currentPersonaConfidence = data.persona_confidence;
                        this.detectedPersonaMessage = cleanedMessage;

                        const needsConfirmation = !this.hasShownPersonaConfirmation &&
                                                !localStorage.getItem('qc_persona_confirmed');

                        // Only show badge in header if confirmation NOT needed (i.e., already confirmed)
                        this.updatePersonaDropdown(data.persona, !needsConfirmation);
                    }

                    // ALWAYS show the answer immediately (no blocking)
                    this.addMessage(data.answer, 'assistant', data.sources, false, data.low_relevance, data.message_id, data.external_links || []);
                    this.conversationHistory.push({ role: 'user', content: cleanedMessage });
                    this.conversationHistory.push({ role: 'assistant', content: data.answer });

                    // Increment question count
                    this.questionCount++;

                    // Show inline suggestion after 3rd answer
                    const personaConfirmed = localStorage.getItem('qc_persona_confirmed');
                    if (this.questionCount === 3 && !this.personaPromptShown && !personaConfirmed) {
                        setTimeout(() => {
                            this.showPersonaSuggestion();
                        }, 1500);
                    }
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
                if (this.elements.input) {
                    this.elements.input.disabled = false;
                    this.elements.input.focus();
                }
                if (this.elements.sendButton) {
                    this.elements.sendButton.disabled = false;
                }
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

        // Only show the header badge if the persona is confirmed
        if (this.elements.personaBadge && isConfirmed) {
            this.elements.personaBadge.style.display = 'flex';
        }

        try {
            localStorage.setItem('qc_persona_choice', persona);
            if (isConfirmed) {
                localStorage.setItem('qc_persona_confirmed', 'true');
            }
        } catch (e) {}
    }
    
    showSoftPersonaPrompt() {
        // Progressive disclosure: soft prompt after first answer
        const softPromptDiv = document.createElement('div');
        softPromptDiv.className = 'qc-soft-persona-prompt';
        softPromptDiv.innerHTML = `
            <div class="qc-soft-persona-content">
                <div class="qc-soft-persona-header">
                    <span class="qc-soft-persona-icon">💡</span>
                    <strong>I can tailor advice to your role</strong>
                </div>
                <div class="qc-soft-persona-options">
                    <button class="qc-soft-persona-btn" data-persona="ENGINEERING_MANAGER">
                        <span class="qc-persona-icon">👔</span>
                        <span>Manager</span>
                    </button>
                    <button class="qc-soft-persona-btn" data-persona="SOFTWARE_ENGINEER">
                        <span class="qc-persona-icon">💻</span>
                        <span>Engineer</span>
                    </button>
                    <button class="qc-soft-persona-btn" data-persona="QUALITY_COACH">
                        <span class="qc-persona-icon">🎯</span>
                        <span>Coach</span>
                    </button>
                    <button class="qc-soft-persona-btn" data-persona="TEST_LEAD">
                        <span class="qc-persona-icon">🧪</span>
                        <span>Test Lead</span>
                    </button>
                    <button class="qc-soft-persona-btn" data-persona="DELIVERY_LEAD">
                        <span class="qc-persona-icon">📊</span>
                        <span>Delivery Lead</span>
                    </button>
                    <button class="qc-soft-persona-btn qc-soft-persona-more" data-action="show-more">
                        <span>More ▼</span>
                    </button>
                </div>
                <button class="qc-soft-persona-skip">Skip for now</button>
            </div>
        `;

        // Handle selection clicks
        softPromptDiv.querySelectorAll('.qc-soft-persona-btn[data-persona]').forEach(btn => {
            btn.addEventListener('click', () => {
                const selectedPersona = btn.dataset.persona;

                // Save selection
                try {
                    localStorage.setItem('qc_persona_choice', selectedPersona);
                    localStorage.setItem('qc_persona_confirmed', 'true');
                } catch (err) {}

                // Update UI
                this.currentPersona = selectedPersona;
                this.updatePersonaDropdown(selectedPersona, true);

                // Remove prompt
                softPromptDiv.classList.add('qc-fade-out');
                setTimeout(() => softPromptDiv.remove(), 300);

                // Track selection
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'persona_selected_after_first_answer', {
                        'persona': selectedPersona
                    });
                }
            });
        });

        // Handle "More" button - show full selector
        const moreBtn = softPromptDiv.querySelector('[data-action="show-more"]');
        if (moreBtn) {
            moreBtn.addEventListener('click', () => {
                this.showFullPersonaSelector(softPromptDiv);
            });
        }

        // Handle skip
        const skipBtn = softPromptDiv.querySelector('.qc-soft-persona-skip');
        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                softPromptDiv.classList.add('qc-fade-out');
                setTimeout(() => softPromptDiv.remove(), 300);
            });
        }

        this.elements.messages.appendChild(softPromptDiv);

        // Add subtle bounce animation to hint at presence (no auto-scroll)
        setTimeout(() => {
            softPromptDiv.style.animation = 'qc-gentle-bounce 1s ease-in-out';
        }, 2000); // Small delay before hint animation
    }

    showFullPersonaSelector(softPromptDiv) {
        // Replace soft prompt with full 6-option selector
        softPromptDiv.innerHTML = `
            <div class="qc-soft-persona-content">
                <div class="qc-soft-persona-header">
                    <strong>What's your role?</strong>
                </div>
                <div class="qc-persona-selector qc-persona-selector-inline">
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
                <button class="qc-soft-persona-skip">Skip for now</button>
            </div>
        `;

        // Re-attach handlers for full selector
        softPromptDiv.querySelectorAll('.qc-persona-select-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const selectedPersona = btn.dataset.persona;

                try {
                    localStorage.setItem('qc_persona_choice', selectedPersona);
                    localStorage.setItem('qc_persona_confirmed', 'true');
                } catch (err) {}

                this.currentPersona = selectedPersona;
                this.updatePersonaDropdown(selectedPersona, true);

                softPromptDiv.classList.add('qc-fade-out');
                setTimeout(() => softPromptDiv.remove(), 300);

                if (typeof gtag !== 'undefined') {
                    gtag('event', 'persona_selected_from_full_selector', {
                        'persona': selectedPersona
                    });
                }
            });
        });

        const skipBtn = softPromptDiv.querySelector('.qc-soft-persona-skip');
        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                softPromptDiv.classList.add('qc-fade-out');
                setTimeout(() => softPromptDiv.remove(), 300);
            });
        }
    }

    showPersonaReminder() {
        if (this.hasShownPersonaReminder) return;
        this.hasShownPersonaReminder = true;

        const displayName = this.personaNames[this.currentPersona] || this.currentPersona;

        const reminderDiv = document.createElement('div');
        reminderDiv.className = 'qc-persona-reminder';
        reminderDiv.innerHTML = `
            <div class="qc-persona-reminder-content">
                <span class="qc-persona-reminder-icon">💡</span>
                <div class="qc-persona-reminder-text">
                    <strong>Tip:</strong> I'm tailoring advice for ${displayName}s.
                    Not quite right? Click the badge in the header to change it.
                </div>
                <button class="qc-persona-reminder-dismiss" aria-label="Dismiss">×</button>
            </div>
        `;

        const dismissBtn = reminderDiv.querySelector('.qc-persona-reminder-dismiss');
        dismissBtn.addEventListener('click', () => {
            reminderDiv.classList.add('qc-fade-out');
            setTimeout(() => reminderDiv.remove(), 300);
        });

        // Auto-dismiss after 8 seconds
        setTimeout(() => {
            if (reminderDiv.parentNode) {
                reminderDiv.classList.add('qc-fade-out');
                setTimeout(() => reminderDiv.remove(), 300);
            }
        }, 8000);

        this.elements.messages.appendChild(reminderDiv);
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }

    showPersonaConfirmation(persona) {
        const hasConfirmed = localStorage.getItem('qc_persona_confirmed');

        if (this.hasShownPersonaConfirmation || hasConfirmed) {
            return;
        }

        this.hasShownPersonaConfirmation = true;

        const displayName = this.personaNames[persona] || persona;
        const focusAreas = this.personaFocus[persona] || this.personaFocus['OTHER'];
        const focusList = focusAreas.map(area => `• ${area}`).join('\n');

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
                    <strong>I'm responding as if you're a ${displayName}, so I'll focus on:</strong>
                    <div class="qc-persona-focus-list">${focusList}</div>
                    <span class="qc-persona-confirm-question">Is that right?</span>
                </div>
                <div class="qc-persona-confirmation-actions">
                    <button class="qc-persona-confirm-yes" data-action="confirm">Yes, that's right</button>
                    <button class="qc-persona-confirm-change" data-action="change">Actually, I'm a...</button>
                </div>
            </div>
        `;
        
        this.elements.messages.appendChild(confirmDiv);
        // Don't auto-scroll or focus - let answer remain in view
        
        confirmDiv.querySelector('[data-action="confirm"]').addEventListener('click', () => {
            this.confirmPersona(persona);
            confirmDiv.classList.add('qc-fade-out');
            setTimeout(() => confirmDiv.remove(), 300);

            // Note: Answer already shown above, no need to defer display
        });
        
        confirmDiv.querySelector('[data-action="change"]').addEventListener('click', () => {
            this.showPersonaSelector(confirmDiv);
        });
    }

    showPersonaSelector(confirmDiv) {
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

                // Note: Answer already shown above, persona preference updated for next time
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

    addMessage(content, role, sources, isFeedbackMessage = false, lowRelevance = false, messageId = null, externalLinks = []) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'qc-message qc-message-' + role;
        if (messageId) {
            messageDiv.dataset.messageId = messageId;
        }

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
                sourcesDiv.innerHTML = `
                    <div class="qc-sources-badge qc-sources-general">
                        <span class="qc-sources-icon">ℹ️</span>
                        <span class="qc-sources-label">Outside the Handbook's scope</span>
                    </div>
                `;
            } else {
                sourcesDiv.innerHTML = `
                    <div class="qc-sources-badge qc-sources-general">
                        <span class="qc-sources-icon">ℹ️</span>
                        <span class="qc-sources-label">Outside the Handbook's scope</span>
                    </div>
                `;
            }

            // Add external links if provided and low relevance
            if (externalLinks && externalLinks.length > 0 && (lowRelevance || llmDisclaimedHandbook)) {
                const externalLinksDiv = document.createElement('div');
                externalLinksDiv.className = 'qc-sources-badge qc-sources-external';
                externalLinksDiv.innerHTML = `
                    <span class="qc-sources-icon">🔗</span>
                    <span class="qc-sources-label">Further Reading:</span>
                `;

                const linksContainer = document.createElement('div');
                linksContainer.className = 'qc-external-links-list';

                externalLinks.forEach(link => {
                    const linkElement = document.createElement('a');
                    linkElement.href = link.url;
                    linkElement.target = '_blank';
                    linkElement.rel = 'noopener noreferrer';
                    linkElement.className = 'qc-external-link';
                    linkElement.title = link.description;
                    linkElement.innerHTML = `
                        ${link.title}
                        <svg class="qc-external-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    `;
                    linksContainer.appendChild(linkElement);
                });

                externalLinksDiv.appendChild(linksContainer);
                sourcesDiv.appendChild(externalLinksDiv);

                // Track external link clicks
                linksContainer.querySelectorAll('.qc-external-link').forEach(link => {
                    link.addEventListener('click', () => {
                        if (typeof gtag !== 'undefined') {
                            gtag('event', 'external_link_clicked', {
                                'link_url': link.href,
                                'link_title': link.textContent.trim()
                            });
                        }
                    });
                });
            }

            messageDiv.appendChild(sourcesDiv);
        }

        if (role === 'assistant') {
            this.lastAssistantMessage = messageDiv;

            // Add inline feedback banner (much more visible than icon buttons)
            const feedbackBanner = document.createElement('div');
            feedbackBanner.className = 'qc-feedback-banner';
            feedbackBanner.innerHTML = `
                <div class="qc-feedback-banner-content">
                    <div class="qc-feedback-banner-text">
                        <span class="qc-feedback-icon">💬</span>
                        <span class="qc-feedback-question">Was this helpful?</span>
                    </div>
                    <div class="qc-feedback-banner-actions">
                        <button class="qc-feedback-btn qc-feedback-positive" data-rating="positive">
                            <span class="qc-feedback-emoji">👍</span>
                            <span class="qc-feedback-label">Yes, helpful</span>
                        </button>
                        <button class="qc-feedback-btn qc-feedback-negative" data-rating="negative">
                            <span class="qc-feedback-emoji">👎</span>
                            <span class="qc-feedback-label">Needs work</span>
                        </button>
                    </div>
                </div>
            `;

            // Add click handlers for feedback buttons
            const positiveBtn = feedbackBanner.querySelector('.qc-feedback-positive');
            const negativeBtn = feedbackBanner.querySelector('.qc-feedback-negative');

            positiveBtn.onclick = () => this.handleFeedback(messageDiv, 'positive', feedbackBanner);
            negativeBtn.onclick = () => this.handleFeedback(messageDiv, 'negative', feedbackBanner);

            messageDiv.appendChild(feedbackBanner);

            // Auto-collapse banner after 10 seconds if no interaction
            setTimeout(() => {
                if (feedbackBanner.parentNode && !feedbackBanner.classList.contains('is-responded')) {
                    feedbackBanner.classList.add('qc-fade-out');
                    setTimeout(() => {
                        if (feedbackBanner.parentNode) {
                            feedbackBanner.style.display = 'none';
                        }
                    }, 300);
                }
            }, 10000);
        }

        this.elements.messages.appendChild(messageDiv);

        // Scroll to show the TOP of the message (especially important for long assistant answers)
        if (role === 'assistant') {
            // Scroll to the answer bubble specifically, not the whole message (which includes sources)
            const bubble = messageDiv.querySelector('.qc-message-bubble');
            if (bubble) {
                bubble.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            // For user messages, scroll to bottom as usual
            this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
        }
    }

    handleFeedback(messageDiv, rating, feedbackBanner) {
        // Remove any existing feedback form
        const existingForm = messageDiv.querySelector('.qc-feedback-followup');
        if (existingForm) existingForm.remove();

        // Mark banner as responded (prevents auto-collapse)
        feedbackBanner.classList.add('is-responded');

        // Hide the banner (it's served its purpose)
        feedbackBanner.classList.add('qc-fade-out');
        setTimeout(() => {
            if (feedbackBanner.parentNode) {
                feedbackBanner.style.display = 'none';
            }
        }, 300);

        if (rating === 'positive') {
            // Thumbs up: Just show toast and submit
            this.showToast('Thanks for your feedback!', 'success');
            const messageId = messageDiv.dataset.messageId;
            this.submitFeedback(rating, '', messageId);

            // Track analytics
            if (typeof gtag !== 'undefined') {
                gtag('event', 'feedback_positive', {
                    'message_id': messageId,
                    'post_slug': this.config.postSlug
                });
            }
        } else {
            // Thumbs down: Show improved follow-up form
            setTimeout(() => {
                this.showFeedbackFollowup(messageDiv);
            }, 400);
        }
    }

    showFeedbackFollowup(messageDiv) {
        const form = document.createElement('div');
        form.className = 'qc-feedback-followup';

        const title = document.createElement('div');
        title.className = 'qc-followup-title';
        title.textContent = 'What went wrong? (optional)';

        const tags = document.createElement('div');
        tags.className = 'qc-followup-tags';

        const tagOptions = [
            'Off-topic',
            'Too vague',
            'Inaccurate',
            'Missing context',
            'Other'
        ];

        const selectedTags = new Set();

        tagOptions.forEach(tagText => {
            const tag = document.createElement('button');
            tag.className = 'qc-followup-tag';
            tag.textContent = tagText;
            tag.onclick = () => {
                tag.classList.toggle('selected');
                if (tag.classList.contains('selected')) {
                    selectedTags.add(tagText);
                } else {
                    selectedTags.delete(tagText);
                }
            };
            tags.appendChild(tag);
        });

        const textarea = document.createElement('textarea');
        textarea.className = 'qc-followup-textarea';
        textarea.placeholder = 'Any additional details? (optional - press Enter to submit)';
        textarea.maxLength = 500;

        // Character counter
        const charCounter = document.createElement('div');
        charCounter.className = 'qc-followup-char-counter';
        charCounter.textContent = '0 / 500';

        // Update character counter on input
        textarea.addEventListener('input', () => {
            const length = textarea.value.length;
            charCounter.textContent = `${length} / 500`;
        });

        // Sticky submit area
        const submitArea = document.createElement('div');
        submitArea.className = 'qc-followup-submit-area';

        const submitBtn = document.createElement('button');
        submitBtn.className = 'qc-followup-submit';
        submitBtn.textContent = 'Send feedback';

        const hint = document.createElement('span');
        hint.className = 'qc-followup-hint';
        hint.textContent = 'Press Enter ↵';

        const submitHandler = () => {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';

            const messageId = messageDiv.dataset.messageId;
            const comment = textarea.value.trim();
            const tagsArray = Array.from(selectedTags);
            const fullComment = tagsArray.length > 0
                ? `Tags: ${tagsArray.join(', ')}${comment ? `\n${comment}` : ''}`
                : comment;

            this.submitFeedback('negative', fullComment, messageId).then(() => {
                form.innerHTML = '<div style="color: #16a34a; font-weight: 500; font-size: 13px;">✓ Feedback received. Thank you!</div>';
                this.showToast('Feedback received. Thank you!', 'success');
                setTimeout(() => {
                    form.remove();
                }, 2000);

                // Track analytics
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'feedback_negative', {
                        'message_id': messageId,
                        'tags': tagsArray.join(','),
                        'has_comment': !!comment,
                        'post_slug': this.config.postSlug
                    });
                }
            }).catch(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send feedback';
                this.showToast('Failed to send feedback. Please try again.', 'error');
            });
        };

        // Add Enter key support (submit on Enter, Shift+Enter for new line)
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitHandler();
            }
        });

        // Add click handler to submit button
        submitBtn.onclick = submitHandler;

        // Assemble submit area
        submitArea.appendChild(charCounter);
        submitArea.appendChild(hint);
        submitArea.appendChild(submitBtn);

        // Assemble form
        form.appendChild(title);
        form.appendChild(tags);
        form.appendChild(textarea);
        form.appendChild(submitArea);

        messageDiv.appendChild(form);

        // Scroll to show the follow-up
        setTimeout(() => {
            form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }

    showToast(message, type = 'success') {
        // Remove any existing toast
        const existing = document.querySelector('.qc-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `qc-toast qc-toast-${type}`;
        toast.innerHTML = `
            <span class="qc-toast-icon">${type === 'success' ? '✓' : '⚠️'}</span>
            <span class="qc-toast-message">${message}</span>
        `;

        document.body.appendChild(toast);

        // Animate out and remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'qc-toast-out 0.3s ease-out forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    submitFeedback(rating, comment, messageId) {
        return this.sendMessage({
            messageOverride: comment || rating,
            isFeedbackOverride: true,
            feedbackRating: rating,
            messageId: messageId
        });
    }

    /**
     * Update token usage display with progressive disclosure.
     * Shows usage after first query, with upgrade prompts at thresholds.
     */
    updateTokenUsageDisplay(tierInfo) {
        if (!this.elements.tokenUsage || !tierInfo) return;

        const { tokens_used_today, daily_limit, tier, has_capacity } = tierInfo;

        // Don't show for unlimited tiers
        if (daily_limit === -1) {
            this.elements.tokenUsage.style.display = 'none';
            return;
        }

        const percentUsed = (tokens_used_today / daily_limit) * 100;
        const tokensRemaining = daily_limit - tokens_used_today;

        // Progressive disclosure based on usage
        // Different strategies: Guests (convert early) vs Free (respect, upgrade late)
        let message = '';
        let showUpgrade = false;

        if (percentUsed < 30) {
            // Low usage: Just show remaining subtly for everyone
            message = `${tokensRemaining} tokens remaining today`;
        } else if (percentUsed < 80) {
            // Medium usage:
            // - Guests: Encourage signup (they haven't converted yet)
            // - Free: Just show count (don't nag existing customers)
            message = `${tokensRemaining} tokens left`;
            if (tier === 'guest') {
                showUpgrade = true;
                message += ' • <a href="#/portal/signup" data-portal="signup">Sign up for 5x more</a>';
            }
        } else if (has_capacity) {
            // High usage (80-100%):
            // - Guests: Stronger signup prompt
            // - Free: Gentle upgrade suggestion
            message = `⚠️ Running low: ${tokensRemaining} tokens left`;
            if (tier === 'guest') {
                showUpgrade = true;
                message += ' • <a href="#/portal/signup" data-portal="signup" style="font-weight: 600;">Sign up to continue</a>';
            } else if (tier === 'free') {
                showUpgrade = true;
                message += ' • <a href="#/portal/upgrade" data-portal="upgrade">Upgrade for unlimited</a>';
            }
        } else {
            // No capacity (100%): Clear upgrade CTA for everyone
            message = '⛔ Daily limit reached';
            if (tier === 'guest') {
                message += ' • <a href="#/portal/signup" data-portal="signup" style="font-weight: 600;">Sign up for 5x more questions</a>';
            } else if (tier === 'free') {
                message += ' • <a href="#/portal/upgrade" data-portal="upgrade" style="font-weight: 600;">Upgrade for unlimited</a>';
            }
        }

        this.elements.tokenUsage.innerHTML = message;
        this.elements.tokenUsage.style.display = 'block';

        // Add click tracking for signup links
        if (showUpgrade || !has_capacity) {
            const links = this.elements.tokenUsage.querySelectorAll('[data-portal]');
            links.forEach(link => {
                link.addEventListener('click', () => {
                    if (typeof gtag !== 'undefined') {
                        gtag('event', 'qc_upgrade_prompt_clicked', {
                            'trigger': has_capacity ? 'usage_warning' : 'limit_reached',
                            'percent_used': percentUsed.toFixed(1),
                            'tier': tier
                        });
                    }
                });
            });
        }
    }
}

// Export for Browser environments
if (typeof window !== 'undefined') {
    window.QualityCoach = window.QualityCoach || {};
    window.QualityCoach.UI = QualityCoachUI;
}
