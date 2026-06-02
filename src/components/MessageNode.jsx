import { Handle, Position } from 'reactflow';

export default function MessageNode({ data }) {
  const text = data.text || '(пусто)';
  const preview = text.length > 40 ? text.slice(0, 40) + '…' : text;
  const buttons = data.buttonsEnabled ? (data.buttons ?? []) : [];

  return (
    <div style={{
      background: '#3498db', color: '#fff', padding: '10px 14px',
      borderRadius: 6, minWidth: 180, position: 'relative',
    }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{preview}</div>
      {buttons.length === 0 ? (
        <Handle type="source" position={Position.Right} id="default" />
      ) : (
        <div style={{ marginTop: 8 }}>
          {buttons.map((b, i) => (
            <div key={i} style={{
              position: 'relative', background: '#2980b9',
              padding: '4px 8px', borderRadius: 4, marginTop: 4, fontSize: 12,
            }}>
              {b.text || `Кнопка ${i + 1}`}
              <Handle
                type="source"
                position={Position.Right}
                id={`btn-${i}`}
                style={{ top: '50%' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
