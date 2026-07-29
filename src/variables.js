export const BUILTIN_VARS = ['first_name', 'last_name', 'phone'];

export function collectVariableNames(nodes) {
  const names = new Set(BUILTIN_VARS);
  for (const n of nodes) {
    if ((n.type === 'setvar' || n.type === 'input') && n.data && n.data.variable) {
      names.add(n.data.variable);
    }
  }
  return [...names];
}
