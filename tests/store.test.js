import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/store.js';

describe('store', () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it('defaults: empty token, polling mode, one Start node, no edges', () => {
    const s = useStore.getState();
    expect(s.token).toBe('');
    expect(s.mode).toBe('polling');
    expect(s.nodes).toHaveLength(1);
    expect(s.nodes[0].type).toBe('start');
    expect(s.edges).toEqual([]);
    expect(s.selectedId).toBe(null);
  });

  it('setToken updates token', () => {
    useStore.getState().setToken('abc');
    expect(useStore.getState().token).toBe('abc');
  });

  it('setMode updates mode', () => {
    useStore.getState().setMode('webhook');
    expect(useStore.getState().mode).toBe('webhook');
  });

  it('addNode appends to nodes', () => {
    useStore.getState().addNode({ id: 'msg_1', type: 'message', position: { x: 0, y: 0 }, data: {} });
    expect(useStore.getState().nodes).toHaveLength(2);
  });

  it('updateNodeData patches data of matching node', () => {
    useStore.getState().addNode({ id: 'msg_1', type: 'message', position: { x: 0, y: 0 }, data: { text: '' } });
    useStore.getState().updateNodeData('msg_1', { text: 'Hello' });
    const n = useStore.getState().nodes.find((n) => n.id === 'msg_1');
    expect(n.data.text).toBe('Hello');
  });

  it('toProjectJSON includes version, token, mode, nodes, edges', () => {
    useStore.getState().setToken('T');
    const project = useStore.getState().toProjectJSON();
    expect(project.version).toBe('1.0');
    expect(project.token).toBe('T');
    expect(project.mode).toBe('polling');
    expect(project.nodes).toHaveLength(1);
  });

  it('loadProject restores state', () => {
    useStore.getState().loadProject({
      token: 'X', mode: 'webhook',
      nodes: [{ id: 'start', type: 'start', data: {} }, { id: 'm1', type: 'message', data: {} }],
      edges: [{ id: 'e0', source: 'start', target: 'm1' }],
    });
    const s = useStore.getState();
    expect(s.token).toBe('X');
    expect(s.mode).toBe('webhook');
    expect(s.nodes).toHaveLength(2);
    expect(s.edges).toHaveLength(1);
  });
});
