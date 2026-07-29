import { describe, it, expect } from 'vitest';
import { collectVariableNames, BUILTIN_VARS } from '../src/variables.js';

describe('collectVariableNames', () => {
  it('returns built-in auth vars for an empty graph', () => {
    expect(collectVariableNames([])).toEqual(BUILTIN_VARS);
  });

  it('adds variable names from setvar and input nodes, deduped', () => {
    const nodes = [
      { type: 'setvar', data: { variable: 'age' } },
      { type: 'input', data: { variable: 'city' } },
      { type: 'setvar', data: { variable: 'age' } },
      { type: 'message', data: { text: 'hi' } },
    ];
    const names = collectVariableNames(nodes);
    expect(names).toContain('age');
    expect(names).toContain('city');
    expect(names.filter((x) => x === 'age')).toHaveLength(1);
  });

  it('ignores setvar/input nodes whose variable is empty', () => {
    const names = collectVariableNames([{ type: 'setvar', data: { variable: '' } }]);
    expect(names).toEqual(BUILTIN_VARS);
  });
});
