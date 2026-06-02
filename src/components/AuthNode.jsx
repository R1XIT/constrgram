import { Handle, Position } from 'reactflow';

export default function AuthNode({ data }) {
  const text = data.promptText || '(пусто)';
  const preview = text.length > 40 ? text.slice(0, 40) + '…' : text;

  return (
    <div style={{
      background: '#8e44ad', color: '#fff', padding: '10px 14px',
      borderRadius: 6, minWidth: 200, position: 'relative',
    }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Авторизация</div>
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{preview}</div>
      <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
        → {'{{first_name}}'}, {'{{last_name}}'}, {'{{phone}}'}
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{
          position: 'relative', background: '#6c3483',
          padding: '4px 8px', borderRadius: 4, marginTop: 4, fontSize: 12,
        }}>
          📱 {data.contactButtonText || 'Поделиться контактом'}
          <Handle type="source" position={Position.Right} id="contact" style={{ top: '50%' }} />
        </div>
        {data.refusalEnabled && (
          <div style={{
            position: 'relative', background: '#6c3483',
            padding: '4px 8px', borderRadius: 4, marginTop: 4, fontSize: 12,
          }}>
            ✖ {data.refusalButtonText || 'Отказаться'}
            <Handle type="source" position={Position.Right} id="refused" style={{ top: '50%' }} />
          </div>
        )}
      </div>
    </div>
  );
}
