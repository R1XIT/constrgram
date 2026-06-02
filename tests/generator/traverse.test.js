import { describe, it, expect } from 'vitest';
import { traverse } from '../../src/generator/traverse.js';

describe('traverse', () => {
  it('returns empty tables when Start has no outgoing edge', () => {
    const project = {
      nodes: [{ id: 'start', type: 'start', data: {} }],
      edges: [],
    };
    const { messages, transitions, initialNext } = traverse(project);
    expect(messages).toEqual({});
    expect(transitions).toEqual({});
    expect(initialNext).toBe(null);
  });

  it('walks Start → msg1 → msg2 linear chain', () => {
    const project = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'msg1', type: 'message', data: { text: 'Hello', buttonsEnabled: false } },
        { id: 'msg2', type: 'message', data: { text: 'World', buttonsEnabled: false } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'msg1' },
        { id: 'e2', source: 'msg1', target: 'msg2' },
      ],
    };
    const { messages, transitions, initialNext } = traverse(project);
    expect(initialNext).toBe('msg1');
    expect(messages.msg1).toEqual({ text: 'Hello', buttons: null });
    expect(messages.msg2).toEqual({ text: 'World', buttons: null });
    expect(transitions.msg1).toEqual({ default: 'msg2' });
    expect(transitions.msg2).toEqual({ default: null });
  });

  it('routes each button to its own target via sourceHandle', () => {
    const project = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'm1', type: 'message', data: {
          text: 'Choose',
          buttonsEnabled: true,
          buttons: [{ text: 'Yes' }, { text: 'No' }],
        } },
        { id: 'm2', type: 'message', data: { text: 'Yay', buttonsEnabled: false } },
        { id: 'm3', type: 'message', data: { text: 'Nay', buttonsEnabled: false } },
      ],
      edges: [
        { id: 'e0', source: 'start', target: 'm1' },
        { id: 'e1', source: 'm1', sourceHandle: 'btn-0', target: 'm2' },
        { id: 'e2', source: 'm1', sourceHandle: 'btn-1', target: 'm3' },
      ],
    };
    const { messages, transitions } = traverse(project);
    expect(messages.m1.buttons).toEqual([
      { text: 'Yes', payload: 'btn_0' },
      { text: 'No', payload: 'btn_1' },
    ]);
    expect(transitions.m1).toEqual({ btn_0: 'm2', btn_1: 'm3' });
  });

  it('does not loop forever when graph has a cycle', () => {
    const project = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'a', type: 'message', data: { text: 'A', buttonsEnabled: false } },
        { id: 'b', type: 'message', data: { text: 'B', buttonsEnabled: false } },
      ],
      edges: [
        { id: 'e0', source: 'start', target: 'a' },
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
    };
    const { messages, transitions } = traverse(project);
    expect(Object.keys(messages).sort()).toEqual(['a', 'b']);
    expect(transitions.b).toEqual({ default: 'a' });
  });

  it('emits authPrompts entry with contact button only when refusal disabled', () => {
    const project = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'a1', type: 'auth', data: {
          promptText: 'Авторизуйтесь',
          contactButtonText: 'Контакт',
          refusalEnabled: false,
          refusalButtonText: 'Нет',
        } },
        { id: 'm1', type: 'message', data: { text: 'Готово', buttonsEnabled: false } },
      ],
      edges: [
        { id: 'e0', source: 'start', target: 'a1' },
        { id: 'e1', source: 'a1', sourceHandle: 'contact', target: 'm1' },
      ],
    };
    const { authPrompts, transitions, initialNext, messages } = traverse(project);
    expect(initialNext).toBe('a1');
    expect(authPrompts.a1).toEqual({
      promptText: 'Авторизуйтесь',
      contactButton: { text: 'Контакт' },
      refusalButton: null,
    });
    expect(transitions.a1).toEqual({ contact: 'm1' });
    expect(messages.m1).toEqual({ text: 'Готово', buttons: null });
  });

  it('emits refusal button and refused transition when enabled', () => {
    const project = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'a1', type: 'auth', data: {
          promptText: 'P',
          contactButtonText: 'C',
          refusalEnabled: true,
          refusalButtonText: 'R',
        } },
        { id: 'm1', type: 'message', data: { text: 'ok', buttonsEnabled: false } },
        { id: 'm2', type: 'message', data: { text: 'reject', buttonsEnabled: false } },
      ],
      edges: [
        { id: 'e0', source: 'start', target: 'a1' },
        { id: 'e1', source: 'a1', sourceHandle: 'contact', target: 'm1' },
        { id: 'e2', source: 'a1', sourceHandle: 'refused', target: 'm2' },
      ],
    };
    const { authPrompts, transitions, messages } = traverse(project);
    expect(authPrompts.a1).toEqual({
      promptText: 'P',
      contactButton: { text: 'C' },
      refusalButton: { text: 'R', payload: 'auth_refuse_a1' },
    });
    expect(transitions.a1).toEqual({ contact: 'm1', refused: 'm2' });
    expect(messages.m1.text).toBe('ok');
    expect(messages.m2.text).toBe('reject');
  });

  it('uses default button text when fields are blank', () => {
    const project = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'a1', type: 'auth', data: {
          promptText: '', contactButtonText: '',
          refusalEnabled: true, refusalButtonText: '',
        } },
      ],
      edges: [{ id: 'e0', source: 'start', target: 'a1' }],
    };
    const { authPrompts } = traverse(project);
    expect(authPrompts.a1.contactButton.text).toBe('Поделиться контактом');
    expect(authPrompts.a1.refusalButton.text).toBe('Отказаться');
  });
});
