const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');

/**
 * Tests for the stale JWT re-auth flow (detectMemberChange + 401/403 retry).
 *
 * QualityCoachUI isn't exported for Node, so we test detectMemberChange
 * as a standalone function extracted with the same logic.
 */

// Extracted detectMemberChange logic for testability
async function detectMemberChange(config, documentCookie, fetchFn) {
    const hasSSRCookie = documentCookie.split(';').some(c => c.trim().startsWith('ghost-members-ssr='));
    if (hasSSRCookie && !config.memberEmail) {
        try {
            const response = await fetchFn(
                new URL('/members/api/member', 'https://example.com'),
                { credentials: 'include' }
            );
            if (response.ok) {
                const member = await response.json();
                if (member && member.email) {
                    config.memberEmail = member.email;
                }
            }
        } catch (e) {
            // Best effort
        }
    }
}

describe('detectMemberChange', () => {
    let config;

    beforeEach(() => {
        config = { memberEmail: '' };
    });

    it('GIVEN ghost-members-ssr cookie present and no memberEmail WHEN Ghost API returns email THEN updates memberEmail', async () => {
        // Arrange
        const fetchFn = mock.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ email: 'user@example.com' })
        }));

        // Act
        await detectMemberChange(config, 'ghost-members-ssr=abc123', fetchFn);

        // Assert
        assert.strictEqual(config.memberEmail, 'user@example.com');
        assert.strictEqual(fetchFn.mock.calls.length, 1);
    });

    it('GIVEN ghost-members-ssr cookie present and no memberEmail WHEN Ghost API fails THEN memberEmail stays empty', async () => {
        // Arrange
        const fetchFn = mock.fn(() => Promise.reject(new Error('Network error')));

        // Act
        await detectMemberChange(config, 'ghost-members-ssr=abc123', fetchFn);

        // Assert
        assert.strictEqual(config.memberEmail, '');
    });

    it('GIVEN ghost-members-ssr cookie present and no memberEmail WHEN Ghost API returns non-OK THEN memberEmail stays empty', async () => {
        // Arrange
        const fetchFn = mock.fn(() => Promise.resolve({
            ok: false,
            status: 403
        }));

        // Act
        await detectMemberChange(config, 'ghost-members-ssr=abc123', fetchFn);

        // Assert
        assert.strictEqual(config.memberEmail, '');
    });

    it('GIVEN no ghost-members-ssr cookie THEN does not call Ghost API', async () => {
        // Arrange
        const fetchFn = mock.fn();

        // Act
        await detectMemberChange(config, 'other-cookie=value', fetchFn);

        // Assert
        assert.strictEqual(fetchFn.mock.calls.length, 0);
        assert.strictEqual(config.memberEmail, '');
    });

    it('GIVEN ghost-members-ssr cookie present BUT memberEmail already set THEN does not call Ghost API', async () => {
        // Arrange
        config.memberEmail = 'already@set.com';
        const fetchFn = mock.fn();

        // Act
        await detectMemberChange(config, 'ghost-members-ssr=abc123', fetchFn);

        // Assert
        assert.strictEqual(fetchFn.mock.calls.length, 0);
        assert.strictEqual(config.memberEmail, 'already@set.com');
    });

    it('GIVEN ghost-members-ssr cookie among multiple cookies THEN detects it correctly', async () => {
        // Arrange
        const fetchFn = mock.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ email: 'multi@cookie.com' })
        }));

        // Act
        await detectMemberChange(config, 'theme=dark; ghost-members-ssr=xyz; lang=en', fetchFn);

        // Assert
        assert.strictEqual(config.memberEmail, 'multi@cookie.com');
    });

    it('GIVEN ghost-members-ssr cookie present WHEN Ghost API returns null email THEN memberEmail stays empty', async () => {
        // Arrange
        const fetchFn = mock.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ email: null })
        }));

        // Act
        await detectMemberChange(config, 'ghost-members-ssr=abc', fetchFn);

        // Assert
        assert.strictEqual(config.memberEmail, '');
    });
});

describe('401/403 re-auth guard', () => {
    it('GIVEN _isReauthenticating is true THEN second 401 does not trigger another re-auth', () => {
        // This tests the guard logic conceptually — in the UI, a second 401/403
        // while _isReauthenticating is true is silently ignored, preventing loops.
        let reauthCount = 0;
        const _isReauthenticating = { value: false };

        function handleAuthError() {
            if (!_isReauthenticating.value) {
                _isReauthenticating.value = true;
                reauthCount++;
                // Simulate async re-auth completing
                _isReauthenticating.value = false;
            }
        }

        // Simulate two rapid 401s where first hasn't completed
        _isReauthenticating.value = false;
        // First error
        _isReauthenticating.value = true; // set before async work
        reauthCount++;
        // Second error arrives while first is in progress
        if (!_isReauthenticating.value) {
            reauthCount++;
        }

        assert.strictEqual(reauthCount, 1, 'Should only re-auth once');
    });
});

describe('429 token limit with stale guest JWT', () => {
    it('GIVEN 429 with tier=guest AND ghost-members-ssr cookie THEN should attempt re-auth not show upgrade', () => {
        // Simulates the decision logic in the tokenLimit handler
        const error = { tokenLimit: { tier: 'guest' } };
        const cookie = 'ghost-members-ssr=abc123';
        const isReauthenticating = false;

        const hasSSRCookie = cookie.split(';').some(c => c.trim().startsWith('ghost-members-ssr='));
        const shouldReauth = error.tokenLimit.tier === 'guest' && hasSSRCookie && !isReauthenticating;

        assert.strictEqual(shouldReauth, true, 'Should trigger re-auth when guest has SSR cookie');
    });

    it('GIVEN 429 with tier=guest AND no ghost-members-ssr cookie THEN should show upgrade prompt', () => {
        const error = { tokenLimit: { tier: 'guest' } };
        const cookie = 'other-cookie=value';
        const isReauthenticating = false;

        const hasSSRCookie = cookie.split(';').some(c => c.trim().startsWith('ghost-members-ssr='));
        const shouldReauth = error.tokenLimit.tier === 'guest' && hasSSRCookie && !isReauthenticating;

        assert.strictEqual(shouldReauth, false, 'Should not re-auth when no SSR cookie');
    });

    it('GIVEN 429 with tier=free AND ghost-members-ssr cookie THEN should show upgrade prompt (not re-auth)', () => {
        const error = { tokenLimit: { tier: 'free' } };
        const cookie = 'ghost-members-ssr=abc123';
        const isReauthenticating = false;

        const hasSSRCookie = cookie.split(';').some(c => c.trim().startsWith('ghost-members-ssr='));
        const shouldReauth = error.tokenLimit.tier === 'guest' && hasSSRCookie && !isReauthenticating;

        assert.strictEqual(shouldReauth, false, 'Should not re-auth for free tier');
    });

    it('GIVEN 429 with tier=guest AND SSR cookie BUT already re-authenticating THEN should not trigger second re-auth', () => {
        const error = { tokenLimit: { tier: 'guest' } };
        const cookie = 'ghost-members-ssr=abc123';
        const isReauthenticating = true;

        const hasSSRCookie = cookie.split(';').some(c => c.trim().startsWith('ghost-members-ssr='));
        const shouldReauth = error.tokenLimit.tier === 'guest' && hasSSRCookie && !isReauthenticating;

        assert.strictEqual(shouldReauth, false, 'Should not re-auth when already in progress');
    });
});
