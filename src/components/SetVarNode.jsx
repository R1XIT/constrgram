import { Handle, Position } from 'reactflow';

export default function SetVarNode({ data }) {
  const name = data.variable || '(имя)';
  const value = data.value || '(пусто)';
  return (
    <div style={{
      background: '#6c3483', color: '#fff', padding: '10px 14px',
      borderRadius: 6, minWidth: 160, position: 'relative',
    }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Задать переменную</div>
      <div style={{ fontSize: 13 }}>
        <code>{name}</code> = {value.length > 24 ? value.slice(0, 24) + '…' : value}
      </div>
      <Handle type="source" position={Position.Right} id="default" />
    </div>
  );
}
