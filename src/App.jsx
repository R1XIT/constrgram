import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import { useStore } from './store.js';
import Toolbar from './components/Toolbar.jsx';
import BlockPalette from './components/BlockPalette.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';
import StartNode from './components/StartNode.jsx';
import MessageNode from './components/MessageNode.jsx';

const nodeTypes = { start: StartNode, message: MessageNode };

export default function App() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const setSelected = useStore((s) => s.setSelected);

  return (
    <div className="app">
      <div className="toolbar"><Toolbar /></div>
      <div className="palette"><BlockPalette /></div>
      <div className="canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_e, n) => setSelected(n.id)}
          onPaneClick={() => setSelected(null)}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background variant="dots" gap={16} size={1} />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
      <div className="properties"><PropertiesPanel /></div>
    </div>
  );
}
