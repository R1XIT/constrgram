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
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    expect(sent[0].body.text).toBe('hi');
    expect(sent[0].url).toContain('/messages?chat_id=42');
    expect(sent[0].headers.Authorization).toBe('T');
    expect(sent[0].body.recipient).toBeUndefined(); // chat_id in URL, not body
    expect(userState.get(42)).toBe('m1');
    await handle(42, { update_type: 'message_callback', chat_id: 42, callback: { payload: 'btn_0' } });
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

describe('generatePolling — variables & auth', () => {
  function build(args) {
    const code = generatePolling(args);
    globalThis.__SKIP_POLL__ = true;
    const factory = new Function('fetch', `${code}\nreturn { handle, userState, userVars };`);
    const sent = [];
    const fakeFetch = async (url, opts) => {
      if (opts?.method === 'POST') {
        sent.push({ url, body: JSON.parse(opts.body) });
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      }
      return { ok: true, status: 200, json: async () => ({ updates: [] }), text: async () => '' };
    };
    return { ...factory(fakeFetch), sent };
  }

  it('substitutes {{var}} in Message text from userVars', async () => {
    const { handle, userVars, sent } = build({
      token: 'T',
      messages: { m1: { text: 'Hi {{first_name}} {{last_name}}!', buttons: null } },
      authPrompts: {},
      transitions: { m1: { default: null } },
      initialNext: 'm1',
    });
    userVars.set(42, { first_name: 'Иван', last_name: 'Петров' });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    expect(sent[0].body.text).toBe('Hi Иван Петров!');
    delete globalThis.__SKIP_POLL__;
  });

  it('renders unknown variable as empty string', async () => {
    const { handle, sent } = build({
      token: 'T',
      messages: { m1: { text: 'X{{missing}}Y', buttons: null } },
      authPrompts: {},
      transitions: { m1: { default: null } },
      initialNext: 'm1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    expect(sent[0].body.text).toBe('XY');
    delete globalThis.__SKIP_POLL__;
  });

  it('sends auth prompt with request_contact button on initial transition', async () => {
    const { handle, sent } = build({
      token: 'T',
      messages: {},
      authPrompts: {
        a1: {
          promptText: 'Поделитесь',
          contactButton: { text: 'Контакт' },
          refusalButton: null,
        },
      },
      transitions: { a1: { contact: null } },
      initialNext: 'a1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    expect(sent[0].body.text).toBe('Поделитесь');
    expect(sent[0].body.attachments[0].payload.buttons[0]).toEqual([
      { type: 'request_contact', text: 'Контакт' },
    ]);
    delete globalThis.__SKIP_POLL__;
  });

  it('includes refusal callback button when refusalButton present', async () => {
    const { handle, sent } = build({
      token: 'T',
      messages: {},
      authPrompts: {
        a1: {
          promptText: 'P',
          contactButton: { text: 'C' },
          refusalButton: { text: 'R', payload: 'auth_refuse_a1' },
        },
      },
      transitions: { a1: { contact: null, refused: null } },
      initialNext: 'a1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    const btns = sent[0].body.attachments[0].payload.buttons[0];
    expect(btns).toHaveLength(2);
    expect(btns[1]).toEqual({ type: 'callback', text: 'R', payload: 'auth_refuse_a1' });
    delete globalThis.__SKIP_POLL__;
  });

  it('on contact attachment: stores vars and advances on contact transition', async () => {
    const { handle, userVars, userState, sent } = build({
      token: 'T',
      messages: { m1: { text: 'Привет, {{first_name}}!', buttons: null } },
      authPrompts: {
        a1: { promptText: 'P', contactButton: { text: 'C' }, refusalButton: null },
      },
      transitions: { a1: { contact: 'm1' }, m1: { default: null } },
      initialNext: 'a1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    expect(userState.get(42)).toBe('a1');

    await handle(42, {
      update_type: 'message_created',
      chat_id: 42,
      message: { body: { attachments: [{
        type: 'contact',
        max_info: { first_name: 'Иван', last_name: 'Петров', phone: '+71234567890' },
        vcf_info: '',
      }] } },
    });
    expect(userVars.get(42)).toEqual({
      first_name: 'Иван', last_name: 'Петров', phone: '+71234567890',
    });
    expect(sent[1].body.text).toBe('Привет, Иван!');
    delete globalThis.__SKIP_POLL__;
  });

  it('falls back to vcf_info when max_info is missing fields', async () => {
    const { handle, userVars } = build({
      token: 'T',
      messages: { m1: { text: 'ok', buttons: null } },
      authPrompts: {
        a1: { promptText: 'P', contactButton: { text: 'C' }, refusalButton: null },
      },
      transitions: { a1: { contact: 'm1' }, m1: { default: null } },
      initialNext: 'a1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    await handle(42, {
      update_type: 'message_created',
      chat_id: 42,
      message: { body: { attachments: [{
        type: 'contact',
        max_info: {},
        vcf_info: 'BEGIN:VCARD\nN:Иванов;Иван;;;\nFN:Иван Иванов\nTEL;TYPE=CELL:+79991234567\nEND:VCARD',
      }] } },
    });
    expect(userVars.get(42)).toEqual({
      first_name: 'Иван', last_name: 'Иванов', phone: '+79991234567',
    });
    delete globalThis.__SKIP_POLL__;
  });

  it('on refusal callback: advances on refused transition', async () => {
    const { handle, sent, userState } = build({
      token: 'T',
      messages: { m1: { text: 'reject', buttons: null } },
      authPrompts: {
        a1: { promptText: 'P', contactButton: { text: 'C' },
              refusalButton: { text: 'R', payload: 'auth_refuse_a1' } },
      },
      transitions: { a1: { contact: null, refused: 'm1' }, m1: { default: null } },
      initialNext: 'a1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    await handle(42, {
      update_type: 'message_callback', chat_id: 42,
      callback: { payload: 'auth_refuse_a1' },
    });
    expect(sent[1].body.text).toBe('reject');
    expect(userState.get(42)).toBe('start');
    delete globalThis.__SKIP_POLL__;
  });

  it('ignores arbitrary text while waiting for contact', async () => {
    const { handle, sent, userState } = build({
      token: 'T',
      messages: { m1: { text: 'reject', buttons: null } },
      authPrompts: {
        a1: { promptText: 'P', contactButton: { text: 'C' }, refusalButton: null },
      },
      transitions: { a1: { contact: 'm1' }, m1: { default: null } },
      initialNext: 'a1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    expect(userState.get(42)).toBe('a1');
    const beforeLen = sent.length;
    await handle(42, {
      update_type: 'message_created', chat_id: 42,
      message: { body: { text: 'привет' } },
    });
    expect(sent.length).toBe(beforeLen);
    expect(userState.get(42)).toBe('a1');
    delete globalThis.__SKIP_POLL__;
  });
});
