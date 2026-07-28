import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BlockPalette from '../src/components/BlockPalette.jsx';
import { useStore } from '../src/store.js';

describe('BlockPalette — click to add (drag fallback)', () => {
  beforeEach(() => {
    useStore.getState().reset();
    cleanup();
  });

  it('adds a message node to the canvas when the message block is clicked', () => {
    const before = useStore.getState().nodes.length;
    render(<BlockPalette />);
    fireEvent.click(screen.getByText(/Сообщение/));
    const nodes = useStore.getState().nodes;
    expect(nodes.length).toBe(before + 1);
    expect(nodes.some((n) => n.type === 'message')).toBe(true);
  });

  it('adds an auth node to the canvas when the auth block is clicked', () => {
    render(<BlockPalette />);
    fireEvent.click(screen.getByText(/Авторизация/));
    expect(useStore.getState().nodes.some((n) => n.type === 'auth')).toBe(true);
  });

  it('cascades positions so repeated clicks do not stack exactly', () => {
    render(<BlockPalette />);
    fireEvent.click(screen.getByText(/Сообщение/));
    fireEvent.click(screen.getByText(/Сообщение/));
    const added = useStore.getState().nodes.filter((n) => n.type === 'message');
    expect(added).toHaveLength(2);
    expect(added[0].position).not.toEqual(added[1].position);
  });

  it('keeps native drag start wiring (draggable items set dnd payload)', () => {
    render(<BlockPalette />);
    const item = screen.getByText(/Сообщение/).closest('[draggable]');
    expect(item).not.toBeNull();
    const setData = [];
    fireEvent.dragStart(item, {
      dataTransfer: { setData: (t, v) => setData.push([t, v]), effectAllowed: '' },
    });
    expect(setData).toContainEqual(['application/x-bot-block', 'message']);
  });
});
