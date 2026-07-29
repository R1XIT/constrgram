export function traverse(project) {
  const nodes = new Map(project.nodes.map((n) => [n.id, n]));
  const outgoing = new Map();
  for (const e of project.edges) {
    const list = outgoing.get(e.source) ?? [];
    list.push(e);
    outgoing.set(e.source, list);
  }

  const startNode = project.nodes.find((n) => n.type === 'start');
  if (!startNode) return { messages: {}, authPrompts: {}, setters: {}, inputs: {}, conditions: {}, transitions: {}, initialNext: null };

  const startEdges = outgoing.get(startNode.id) ?? [];
  if (startEdges.length === 0) return { messages: {}, authPrompts: {}, setters: {}, inputs: {}, conditions: {}, transitions: {}, initialNext: null };

  const initialNext = startEdges[0].target;

  const messages = {};
  const authPrompts = {};
  const setters = {};
  const inputs = {};
  const conditions = {};
  const transitions = {};
  const queue = [initialNext];
  const seen = new Set();

  while (queue.length > 0) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);

    const node = nodes.get(id);
    if (!node) continue;

    const outs = outgoing.get(id) ?? [];

    if (node.type === 'message') {
      const buttons = node.data.buttonsEnabled
        ? (node.data.buttons ?? []).map((b, i) => ({ text: b.text, payload: `btn_${i}` }))
        : null;
      messages[id] = { text: node.data.text ?? '', buttons };
      const trans = {};
      if (buttons) {
        for (let i = 0; i < buttons.length; i++) {
          const handle = `btn-${i}`;
          const edge = outs.find((e) => e.sourceHandle === handle);
          const next = edge ? edge.target : null;
          trans[`btn_${i}`] = next;
          if (next) queue.push(next);
        }
      } else {
        const edge = outs[0];
        const next = edge ? edge.target : null;
        trans.default = next;
        if (next) queue.push(next);
      }
      transitions[id] = trans;
      continue;
    }

    if (node.type === 'auth') {
      const contactText = (node.data.contactButtonText || '').trim() || 'Поделиться контактом';
      const refusalText = (node.data.refusalButtonText || '').trim() || 'Отказаться';
      const refusalButton = node.data.refusalEnabled
        ? { text: refusalText }
        : null;
      authPrompts[id] = {
        promptText: node.data.promptText ?? '',
        contactButton: { text: contactText },
        refusalButton,
      };
      const trans = {};
      const contactEdge = outs.find((e) => e.sourceHandle === 'contact');
      trans.contact = contactEdge ? contactEdge.target : null;
      if (trans.contact) queue.push(trans.contact);
      if (node.data.refusalEnabled) {
        const refusedEdge = outs.find((e) => e.sourceHandle === 'refused');
        trans.refused = refusedEdge ? refusedEdge.target : null;
        if (trans.refused) queue.push(trans.refused);
      }
      transitions[id] = trans;
      continue;
    }

    if (node.type === 'setvar') {
      setters[id] = { variable: node.data.variable ?? '', value: node.data.value ?? '' };
      const edge = outs[0];
      const next = edge ? edge.target : null;
      transitions[id] = { default: next };
      if (next) queue.push(next);
      continue;
    }

    if (node.type === 'input') {
      inputs[id] = { promptText: node.data.promptText ?? '', variable: node.data.variable ?? '' };
      const edge = outs[0];
      const next = edge ? edge.target : null;
      transitions[id] = { default: next };
      if (next) queue.push(next);
      continue;
    }

    if (node.type === 'condition') {
      const rules = (node.data.rules ?? []).map((r) => ({
        variable: r.variable ?? '', op: r.op ?? 'equals', value: r.value ?? '',
      }));
      conditions[id] = { rules };
      const trans = {};
      rules.forEach((_, i) => {
        const edge = outs.find((e) => e.sourceHandle === `rule-${i}`);
        const next = edge ? edge.target : null;
        trans[`rule_${i}`] = next;
        if (next) queue.push(next);
      });
      const elseEdge = outs.find((e) => e.sourceHandle === 'else');
      trans.else = elseEdge ? elseEdge.target : null;
      if (trans.else) queue.push(trans.else);
      transitions[id] = trans;
      continue;
    }
  }

  return { messages, authPrompts, setters, inputs, conditions, transitions, initialNext };
}
