import { describe, it, expect } from 'vitest';
import { generatePolling } from '../../src/generator/polling.js';
import { generate } from '../../src/generator/index.js';

describe('generatePolling', () => {
  it('produces parseable JS that contains TOKEN and tables', () => {
    const code = generatePolling({
      token: 'tok123',
      messages: { m1: { text: 'hi', buttons: null } },
      transitions: { m1: { default: null } },
      initialNext: 'm1',
    });
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain('const TOKEN = "tok123"');
    expect(code).toContain('"m1"');
  });

  it('handle() routes from start to initial message and updates userState', async () => {
    const sent = [];
    const code = generatePolling({
      token: 'T',
      messages: {
        m1: { text: 'hi', buttons: [{ text: 'Y', payload: 'btn_0' }] },
        m2: { text: 'bye', buttons: null },
      },
      transitions: {
        m1: { btn_0: 'm2' },
        m2: { default: null },
      },
      initialNext: 'm1',
    });
    globalThis.__SKIP_POLL__ = true;
    const factory = new Function('fetch', `${code}\nreturn { handle, userState };`);
    const fakeFetch = async (url, opts) => {
      if (opts?.method === 'POST') {
        sent.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      }
      return { ok: true, status: 200, json: async () => ({ updates: [] }), text: async () => '' };
    };
    const { handle, userState } = factory(fakeFetch);
    await handle(42, undefined);
    expect(sent[0].body.text).toBe('hi');
    expect(sent[0].url).toContain('/messages?chat_id=42');
    expect(sent[0].headers.Authorization).toBe('T');
    expect(sent[0].body.recipient).toBeUndefined(); // chat_id in URL, not body
    expect(userState.get(42)).toBe('m1');
    await handle(42, 'btn_0');
    expect(sent[1].body.text).toBe('bye');
    expect(userState.get(42)).toBe('start'); // m2 is terminal
    delete globalThis.__SKIP_POLL__;
  });
});

describe('generate(project)', () => {
  it('dispatches to polling template for mode: "polling"', () => {
    const project = {
      token: 'T',
      mode: 'polling',
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'm1', type: 'message', data: { text: 'hi', buttonsEnabled: false } },
      ],
      edges: [{ id: 'e0', source: 'start', target: 'm1' }],
    };
    const code = generate(project);
    expect(code).toContain('fetch(`${API}/updates');
  });

  it('dispatches to webhook template for mode: "webhook"', () => {
    const project = {
      token: 'T', mode: 'webhook',
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'm1', type: 'message', data: { text: 'hi', buttonsEnabled: false } },
      ],
      edges: [{ id: 'e0', source: 'start', target: 'm1' }],
    };
    const code = generate(project);
    expect(code).toContain("require('http')");
  });
});
