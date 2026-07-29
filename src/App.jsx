import { useCallback, useRef } from 'react';
import ReactFlow, { Background, Controls, MiniMap, useReactFlow, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { useStore } from './store.js';
import { makeMessageNode, makeAuthNode, makeSetNode, makeInputNode, makeConditionNode } from './nodeFactory.js';
import Toolbar from './components/Toolbar.jsx';
import BlockPalette from './components/BlockPalette.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';
import StartNode from './components/StartNode.jsx';
import MessageNode from './components/MessageNode.jsx';
import AuthNode from './components/AuthNode.jsx';
import SetVarNode from './components/SetVarNode.jsx';
import InputNode from './components/InputNode.jsx';
import ConditionNode from './components/ConditionNode.jsx';

const nodeTypes = {
  start: StartNode, message: MessageNode, auth: AuthNode,
  setvar: SetVarNode, input: InputNode, condition: ConditionNode,
};

function Canvas() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const setSelected = useStore((s) => s.setSelected);
  const addNode = useStore((s) => s.addNode);

  const wrapper = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('application/x-bot-block');
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (kind === 'message') addNode(makeMessageNode(position));
    else if (kind === 'auth') addNode(makeAuthNode(position));
    else if (kind === 'setvar') addNode(makeSetNode(position));
    else if (kind === 'input') addNode(makeInputNode(position));
    else if (kind === 'condition') addNode(makeConditionNode(position));
  }, [addNode, screenToFlowPosition]);

  return (
    <div ref={wrapper} className="canvas" onDragOver={onDragOver} onDrop={onDrop}>
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
  );
}

export default function App() {
  return (
    <div className="app">
      <div className="toolbar"><Toolbar /></div>
      <div className="palette"><BlockPalette /></div>
      <ReactFlowProvider>
        <Canvas />
      </ReactFlowProvider>
      <div className="properties"><PropertiesPanel /></div>
    </div>
  );
}
