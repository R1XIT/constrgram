import { Handle, Position } from 'reactflow';

export default function InputNode({ data }) {
  const text = data.promptText || '(пусто)';
  const preview = text.length > 40 ? text.slice(0, 40) + '…' : text;
  return (
    <div style={{
      background: '#d35400', color: '#fff', padding: '10px 14px',
      borderRadius: 6, minWidth: 180, position: 'relative',
    }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Ввод пользователя</div>
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{preview}</div>
      <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
        → {'{{'}{data.variable || 'имя'}{'}}'}
      </div>
      <Handle type="source" position={Position.Right} id="default" />
    </div>
  );
}
