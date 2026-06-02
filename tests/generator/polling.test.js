import { describe, it, expect } from 'vitest';
import { generatePolling } from '../../src/generator/polling.js';

describe('generatePolling', () => {
  it('produces parseable JS that contains TOKEN and tables', () => {
    const code = generatePolling({
      token: 'tok123',
      messages: { m1: { text: 'hi', buttons: null } },
      transitions: { m1: { default: null } },
      initialNext: 'm1',
    });
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain("const TOKEN = 'tok123'");
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
        sent.push(JSON.parse(opts.body));
        return { json: async () => ({}) };
      }
      return { json: async () => ({ updates: [] }) };
    };
    const { handle, userState } = factory(fakeFetch);
    await handle(42, undefined);
    expect(sent[0].text).toBe('hi');
    expect(userState.get(42)).toBe('m1');
    await handle(42, 'btn_0');
    expect(sent[1].text).toBe('bye');
    expect(userState.get(42)).toBe('start'); // m2 is terminal
    delete globalThis.__SKIP_POLL__;
  });
});
