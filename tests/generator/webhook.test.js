import { describe, it, expect } from 'vitest';
import { generateWebhook } from '../../src/generator/webhook.js';

describe('generateWebhook', () => {
  it('produces parseable JS that uses http.createServer on port 3000', () => {
    const code = generateWebhook({
      token: 'T',
      messages: { m1: { text: 'hi', buttons: null } },
      authPrompts: {},
      transitions: { m1: { default: null } },
      initialNext: 'm1',
    });
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain("require('http')");
    expect(code).toContain('3000');
  });

  it('contains AUTH_PROMPTS, userVars and render', () => {
    const code = generateWebhook({
      token: 'T',
      messages: {},
      authPrompts: { a1: { promptText: 'p', contactButton: { text: 'c' }, refusalButton: null } },
      transitions: { a1: { contact: null } },
      initialNext: 'a1',
    });
    expect(code).toContain('AUTH_PROMPTS');
    expect(code).toContain('userVars');
    expect(code).toContain('function render');
    expect(code).toContain('request_contact');
  });
});
