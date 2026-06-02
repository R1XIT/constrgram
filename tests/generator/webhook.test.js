import { describe, it, expect } from 'vitest';
import { generateWebhook } from '../../src/generator/webhook.js';

describe('generateWebhook', () => {
  it('produces parseable JS that uses http.createServer on port 3000', () => {
    const code = generateWebhook({
      token: 'T',
      messages: { m1: { text: 'hi', buttons: null } },
      transitions: { m1: { default: null } },
      initialNext: 'm1',
    });
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain("require('http')");
    expect(code).toContain('3000');
  });
});
