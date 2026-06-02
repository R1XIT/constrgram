import Toolbar from './components/Toolbar.jsx';
import BlockPalette from './components/BlockPalette.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';

export default function App() {
  return (
    <div className="app">
      <div className="toolbar"><Toolbar /></div>
      <div className="palette"><BlockPalette /></div>
      <div className="canvas">
        {/* React Flow goes here in Task 10 */}
        <div style={{ padding: 20, color: '#888' }}>Canvas placeholder</div>
      </div>
      <div className="properties"><PropertiesPanel /></div>
    </div>
  );
}
