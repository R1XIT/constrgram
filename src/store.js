import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';
import { makeStartNode, resetNodeIdCounter } from './nodeFactory.js';

const initial = () => ({
  token: '',
  mode: 'polling',
  nodes: [makeStartNode()],
  edges: [],
  selectedId: null,
});

export const useStore = create((set, get) => ({
  ...initial(),

  reset: () => {
    resetNodeIdCounter();
    set(initial());
  },

  setToken: (token) => set({ token }),
  setMode: (mode) => set({ mode }),
  setSelected: (id) => set({ selectedId: id }),

  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) }),

  onEdgesChange: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (connection) =>
    set({ edges: addEdge(connection, get().edges) }),

  addNode: (node) => set({ nodes: [...get().nodes, node] }),

  updateNodeData: (id, patch) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
      ),
    }),

  loadProject: (project) => {
    resetNodeIdCounter();
    set({
      token: project.token ?? '',
      mode: project.mode ?? 'polling',
      nodes: project.nodes ?? [makeStartNode()],
      edges: project.edges ?? [],
      selectedId: null,
    });
  },

  toProjectJSON: () => {
    const { token, mode, nodes, edges } = get();
    return { version: '1.0', token, mode, nodes, edges };
  },
}));
