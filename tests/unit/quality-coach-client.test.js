const { test, describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const QualityCoachClient = require('../../assets/js/lib/quality-coach-client');

// Mock global fetch and localStorage
global.fetch = mock.fn();
global.crypto = { randomUUID: () => '1234-5678-90ab-cdef' };

const mockStorage = {
    store: {},
    getItem: (key) => mockStorage.store[key] || null,
    setItem: (key, value) => { mockStorage.store[key] = value; },
    clear: () => { mockStorage.store = {}; }
};

describe('QualityCoachClient', () => {
    let client;

    beforeEach(() => {
        mockStorage.clear();
        // Reset fetch mock completely
        global.fetch = mock.fn();
        
        client = new QualityCoachClient({
            storage: mockStorage,
            apiBase: 'http://test-api.com'
        });
    });

    it('should generate a valid UUID client thread ID on init if none exists', () => {
        const threadId = client.init();
        // Check if it looks like a UUID
        assert.match(threadId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        assert.strictEqual(mockStorage.getItem('qc_thread_id'), threadId);
    });

    it('should retrieve existing thread ID from storage', () => {
        mockStorage.setItem('qc_thread_id', 'existing-uuid');
        const threadId = client.init();
        assert.strictEqual(threadId, 'existing-uuid');
    });

    it('should check access successfully', async () => {
        global.fetch.mock.mockImplementationOnce(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'fake-token' })
        }));

        const result = await client.checkAccess('test@example.com');
        assert.deepStrictEqual(result, { access_token: 'fake-token' });
        
        const call = global.fetch.mock.calls[0];
        assert.strictEqual(call.arguments[0], 'http://test-api.com/api/v1/access/check');
    });

    it('should throw error if access check fails', async () => {
        global.fetch.mock.mockImplementationOnce(() => Promise.resolve({
            ok: false,
            status: 403,
            json: () => Promise.resolve({})
        }));

        await assert.rejects(
            async () => await client.checkAccess('test@example.com'),
            { message: 'Request failed: 403' }
        );
    });

    it('should send message with correct headers and body', async () => {
        client.setAccessToken('valid-token');
        client.init(); // Ensure thread ID

        global.fetch.mock.mockImplementationOnce(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ answer: 'Hello' })
        }));

        await client.sendMessage('Hi', [], { context: 'test' });

        const call = global.fetch.mock.calls[0];
        const url = call.arguments[0];
        const options = call.arguments[1];

        assert.strictEqual(url, 'http://test-api.com/api/v1/chat');
        assert.strictEqual(options.headers['Authorization'], 'Bearer valid-token');
        
        const body = JSON.parse(options.body);
        assert.strictEqual(body.message, 'Hi');
        assert.strictEqual(body.thread_id, client.threadId);
    });
});
