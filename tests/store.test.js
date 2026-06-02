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

  it('prunes edges when their sourceHandle no longer exists', () => {
    useStore.getState().addNode({
      id: 'msg_1', type: 'message',
      position: { x: 0, y: 0 },
      data: { text: '', buttonsEnabled: true, buttons: [{ text: 'A' }, { text: 'B' }] },
    });
    useStore.getState().addNode({
      id: 'msg_2', type: 'message',
      position: { x: 200, y: 0 },
      data: { text: '', buttonsEnabled: false, buttons: [] },
    });
    useStore.setState({
      edges: [
        { id: 'e0', source: 'msg_1', sourceHandle: 'btn-0', target: 'msg_2' },
        { id: 'e1', source: 'msg_1', sourceHandle: 'btn-1', target: 'msg_2' },
      ],
    });
    useStore.getState().updateNodeData('msg_1', { buttons: [{ text: 'A' }] });
    const edges = useStore.getState().edges;
    expect(edges.map((e) => e.sourceHandle)).toEqual(['btn-0']);
  });

  it('makeAuthNode default data has empty prompt, default button texts, refusal off', async () => {
    const { makeAuthNode } = await import('../src/nodeFactory.js');
    const n = makeAuthNode({ x: 10, y: 20 });
    expect(n.type).toBe('auth');
    expect(n.position).toEqual({ x: 10, y: 20 });
    expect(n.data).toEqual({
      promptText: '',
      contactButtonText: 'Поделиться контактом',
      refusalEnabled: false,
      refusalButtonText: 'Отказаться',
    });
    expect(n.id).toMatch(/^auth_\d+$/);
  });

  it('prunes refused edge when auth refusalEnabled toggles off', () => {
    useStore.getState().addNode({
      id: 'auth_1', type: 'auth', position: { x: 0, y: 0 },
      data: { promptText: '', contactButtonText: 'C', refusalEnabled: true, refusalButtonText: 'R' },
    });
    useStore.getState().addNode({
      id: 'msg_x', type: 'message', position: { x: 200, y: 0 },
      data: { text: '', buttonsEnabled: false, buttons: [] },
    });
    useStore.setState({
      edges: [
        { id: 'e0', source: 'auth_1', sourceHandle: 'contact', target: 'msg_x' },
        { id: 'e1', source: 'auth_1', sourceHandle: 'refused', target: 'msg_x' },
      ],
    });
    useStore.getState().updateNodeData('auth_1', { refusalEnabled: false });
    const handles = useStore.getState().edges
      .filter((e) => e.source === 'auth_1')
      .map((e) => e.sourceHandle)
      .sort();
    expect(handles).toEqual(['contact']);
  });

  it('keeps refused edge when refusalEnabled remains on', () => {
    useStore.getState().addNode({
      id: 'auth_1', type: 'auth', position: { x: 0, y: 0 },
      data: { promptText: '', contactButtonText: 'C', refusalEnabled: true, refusalButtonText: 'R' },
    });
    useStore.setState({
      edges: [
        { id: 'e0', source: 'auth_1', sourceHandle: 'contact', target: 'x' },
        { id: 'e1', source: 'auth_1', sourceHandle: 'refused', target: 'x' },
      ],
    });
    useStore.getState().updateNodeData('auth_1', { promptText: 'hi' });
    const handles = useStore.getState().edges
      .map((e) => e.sourceHandle).sort();
    expect(handles).toEqual(['contact', 'refused']);
  });
});
