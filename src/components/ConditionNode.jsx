import { Handle, Position } from 'reactflow';

const OP_LABELS = {
  equals: '=', not_equals: '≠', contains: '⊂', not_contains: '⊄',
  empty: 'пусто', not_empty: 'не пусто', gt: '>', lt: '<', gte: '≥', lte: '≤',
};

function ruleLabel(rule) {
  const name = rule.variable || '?';
  const op = OP_LABELS[rule.op] ?? rule.op;
  if (rule.op === 'empty' || rule.op === 'not_empty') return `${name} ${op}`;
  return `${name} ${op} ${rule.value || ''}`.trim();
}

export default function ConditionNode({ data }) {
  const rules = data.rules ?? [];
  return (
    <div style={{
      background: '#b7950b', color: '#fff', padding: '10px 14px',
      borderRadius: 6, minWidth: 200, position: 'relative',
    }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Условие</div>
      <div style={{ marginTop: 4 }}>
        {rules.map((r, i) => (
          <div key={i} style={{
            position: 'relative', background: '#9a7d0a',
            padding: '4px 8px', borderRadius: 4, marginTop: 4, fontSize: 12,
          }}>
            {ruleLabel(r)}
            <Handle type="source" position={Position.Right} id={`rule-${i}`} style={{ top: '50%' }} />
          </div>
        ))}
        <div style={{
          position: 'relative', background: '#7d6608',
          padding: '4px 8px', borderRadius: 4, marginTop: 4, fontSize: 12, fontStyle: 'italic',
        }}>
          иначе
          <Handle type="source" position={Position.Right} id="else" style={{ top: '50%' }} />
        </div>
      </div>
    </div>
  );
}
