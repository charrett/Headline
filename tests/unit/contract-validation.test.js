/**
 * Consumer-side contract validation tests.
 *
 * Validates that the request bodies sent by quality-coach-client.js
 * and the response shapes it expects to receive both conform to the
 * shared OpenAPI consumer contract spec.
 *
 * The spec lives in the sibling qchb_chat repo at:
 *   backend/contract/openapi_consumer.yaml
 *
 * These tests do NOT call a live API. They validate JSON shapes against
 * the spec using ajv, catching contract drift between frontend and backend.
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { createValidator } = require('../helpers/openapi-validator');

let v; // validator instance

before(() => {
    v = createValidator(process.env.OPENAPI_SPEC_PATH || undefined);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertValid(result, label) {
    assert.strictEqual(
        result.valid, true,
        `${label} failed validation:\n${JSON.stringify(result.errors, null, 2)}`
    );
}

function assertInvalid(result, label) {
    assert.strictEqual(result.valid, false, `${label} should have failed validation`);
}

// ---------------------------------------------------------------------------
// POST /api/v1/access/check
// ---------------------------------------------------------------------------

describe('Contract: POST /api/v1/access/check', () => {
    const path = '/api/v1/access/check';

    describe('request body', () => {
        it('with email matches AccessCheckRequest', () => {
            const result = v.validateRequest(path, 'post', {
                email: 'user@example.com'
            });
            assertValid(result, 'checkAccess with email');
        });

        it('without email (guest) matches AccessCheckRequest', () => {
            // Client sends {} when no email provided
            const result = v.validateRequest(path, 'post', {});
            assertValid(result, 'checkAccess guest (empty body)');
        });

        it('with null email matches AccessCheckRequest', () => {
            const result = v.validateRequest(path, 'post', { email: null });
            assertValid(result, 'checkAccess with null email');
        });
    });

    describe('response body', () => {
        it('guest access response matches AccessCheckResponse', () => {
            const result = v.validateResponse(path, 'post', '200', {
                has_access: true,
                access_token: 'eyJhbGciOiJIUzI1NiJ9.test.signature',
                access_expires_at: '2026-03-14T00:00:00Z',
                access_granted_via: 'guest',
                is_beta_tester: false,
                is_paid_member: false,
                reason: null,
                tier: 'guest',
                session_fingerprint: 'abc123def456',
                tier_info: {
                    tokens_used_today: 0,
                    daily_limit: 1000,
                    tier: 'guest',
                    has_capacity: true
                }
            });
            assertValid(result, 'guest AccessCheckResponse');
        });

        it('denied access response matches AccessCheckResponse', () => {
            const result = v.validateResponse(path, 'post', '200', {
                has_access: false,
                access_token: null,
                access_expires_at: null,
                access_granted_via: null,
                is_beta_tester: false,
                is_paid_member: false,
                reason: 'Beta access required',
                tier: 'guest',
                session_fingerprint: null,
                tier_info: null
            });
            assertValid(result, 'denied AccessCheckResponse');
        });

        it('422 error matches ValidationErrorResponse', () => {
            const result = v.validateResponse(path, 'post', '422', {
                detail: [
                    { loc: ['body', 'email'], msg: 'invalid email', type: 'value_error' }
                ]
            });
            assertValid(result, '422 ValidationErrorResponse');
        });
    });
});

// ---------------------------------------------------------------------------
// POST /api/v1/chat
// ---------------------------------------------------------------------------

describe('Contract: POST /api/v1/chat', () => {
    const path = '/api/v1/chat';

    describe('request body', () => {
        it('minimal request (message only) matches ChatRequest', () => {
            const result = v.validateRequest(path, 'post', {
                message: 'What is quality coaching?'
            });
            assertValid(result, 'minimal ChatRequest');
        });

        it('full request as sent by client matches ChatRequest', () => {
            // Matches what quality-coach-client.js:134-139 actually sends
            const result = v.validateRequest(path, 'post', {
                message: 'How do I coach upwards?',
                thread_id: '00000000-0000-0000-0000-000000000001',
                history: [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi there!' }
                ],
                context: { persona: 'QUALITY_COACH' }
            });
            assertValid(result, 'full ChatRequest');
        });

        it('request without stream field is valid (defaults to false)', () => {
            // Client never sends stream — spec defaults it to false
            const result = v.validateRequest(path, 'post', {
                message: 'Test',
                thread_id: null,
                history: [],
                context: null
            });
            assertValid(result, 'ChatRequest without stream');
        });
    });

    describe('response body', () => {
        it('full response matches ChatResponse', () => {
            const result = v.validateResponse(path, 'post', '200', {
                answer: 'Quality coaching helps teams improve.',
                sources: [{
                    id: 'chunk-1',
                    label: 'Chapter 3: Coaching Fundamentals',
                    similarity: 0.92,
                    page: '45',
                    section: 'Coaching Basics'
                }],
                usage: {
                    prompt_tokens: 120,
                    completion_tokens: 45,
                    total_tokens: 165,
                    llm_latency_ms: 1234.5
                },
                thread_id: '00000000-0000-0000-0000-000000000001',
                message_id: 'msg-abc-123',
                model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
                persona: 'QUALITY_COACH',
                persona_confidence: 0.88,
                low_relevance: false,
                external_links: [{
                    title: 'Further Reading',
                    url: 'https://example.com',
                    description: 'A useful resource'
                }]
            });
            assertValid(result, 'full ChatResponse');
        });

        it('minimal response (answer only) matches ChatResponse', () => {
            const result = v.validateResponse(path, 'post', '200', {
                answer: 'Hello!'
            });
            assertValid(result, 'minimal ChatResponse');
        });

        it('response with null optional fields matches ChatResponse', () => {
            const result = v.validateResponse(path, 'post', '200', {
                answer: 'Some answer',
                sources: [],
                usage: null,
                thread_id: null,
                message_id: null,
                model: null,
                persona: null,
                persona_confidence: null,
                low_relevance: null,
                external_links: []
            });
            assertValid(result, 'ChatResponse with nulls');
        });

        it('response missing answer fails validation', () => {
            const result = v.validateResponse(path, 'post', '200', {
                sources: [],
                thread_id: 'abc'
            });
            assertInvalid(result, 'ChatResponse without answer');
        });
    });
});

// ---------------------------------------------------------------------------
// POST /api/v1/feedback
// ---------------------------------------------------------------------------

describe('Contract: POST /api/v1/feedback', () => {
    const path = '/api/v1/feedback';

    describe('request body', () => {
        it('feedback with all fields matches FeedbackRequest', () => {
            // Matches what quality-coach-client.js:165-169 sends
            const result = v.validateRequest(path, 'post', {
                thread_id: '00000000-0000-0000-0000-000000000001',
                rating: 'positive',
                comment: 'Very helpful answer!',
                message_id: 'msg-abc-123'
            });
            assertValid(result, 'full FeedbackRequest');
        });

        it('feedback with minimal fields matches FeedbackRequest', () => {
            const result = v.validateRequest(path, 'post', {
                comment: 'Great'
            });
            assertValid(result, 'minimal FeedbackRequest');
        });

        it('feedback with null optional fields matches FeedbackRequest', () => {
            const result = v.validateRequest(path, 'post', {
                thread_id: null,
                rating: null,
                comment: null,
                message_id: null
            });
            assertValid(result, 'FeedbackRequest with nulls');
        });
    });
});

// ---------------------------------------------------------------------------
// GET /api/v1/conversations/{thread_id}/messages
// ---------------------------------------------------------------------------

describe('Contract: GET /api/v1/conversations/{thread_id}/messages', () => {
    const path = '/api/v1/conversations/{thread_id}/messages';

    describe('response body', () => {
        it('message array matches MessageResponse[] schema', () => {
            const result = v.validateResponse(path, 'get', '200', [
                {
                    id: '00000000-0000-0000-0000-000000000001',
                    thread_id: '00000000-0000-0000-0000-000000000002',
                    role: 'user',
                    content: 'What is quality coaching?',
                    created_at: '2026-03-13T10:00:00Z'
                },
                {
                    id: '00000000-0000-0000-0000-000000000003',
                    thread_id: '00000000-0000-0000-0000-000000000002',
                    role: 'assistant',
                    content: 'Quality coaching helps teams...',
                    created_at: '2026-03-13T10:00:01Z'
                }
            ]);
            assertValid(result, 'MessageResponse array');
        });

        it('empty message array is valid', () => {
            const result = v.validateResponse(path, 'get', '200', []);
            assertValid(result, 'empty MessageResponse array');
        });

        it('404 error matches ErrorDetail', () => {
            const result = v.validateResponse(path, 'get', '404', {
                detail: 'Thread not found'
            });
            assertValid(result, '404 ErrorDetail');
        });
    });
});
