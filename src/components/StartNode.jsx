import { Handle, Position } from 'reactflow';

export default function StartNode() {
  return (
    <div style={{
      background: '#27ae60', color: '#fff', padding: '10px 16px',
      borderRadius: 6, fontWeight: 600, minWidth: 80, textAlign: 'center',
    }}>
      Start
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
