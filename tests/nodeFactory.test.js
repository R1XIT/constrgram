import { describe, it, expect } from 'vitest';
import { makeSetNode, makeInputNode, makeConditionNode } from '../src/nodeFactory.js';

describe('node factories (variables & logic)', () => {
  it('makeSetNode has type setvar and empty variable/value', () => {
    const n = makeSetNode({ x: 0, y: 0 });
    expect(n.type).toBe('setvar');
    expect(n.data).toEqual({ variable: '', value: '' });
    expect(n.position).toEqual({ x: 0, y: 0 });
  });

  it('makeInputNode has type input with promptText and variable', () => {
    const n = makeInputNode({ x: 1, y: 2 });
    expect(n.type).toBe('input');
    expect(n.data).toEqual({ promptText: '', variable: '' });
  });

  it('makeConditionNode starts with one empty equals rule', () => {
    const n = makeConditionNode({ x: 0, y: 0 });
    expect(n.type).toBe('condition');
    expect(n.data.rules).toEqual([{ variable: '', op: 'equals', value: '' }]);
  });

  it('gives unique ids to successive nodes', () => {
    const a = makeSetNode({ x: 0, y: 0 });
    const b = makeSetNode({ x: 0, y: 0 });
    expect(a.id).not.toBe(b.id);
  });
});
