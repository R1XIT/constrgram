import { useStore } from '../store.js';
import { makeMessageNode, makeAuthNode, makeSetNode, makeInputNode, makeConditionNode } from '../nodeFactory.js';

export default function BlockPalette() {
  const addNode = useStore((s) => s.addNode);

  function onDragStart(kind) {
    return (e) => {
      e.dataTransfer.setData('application/x-bot-block', kind);
      e.dataTransfer.effectAllowed = 'move';
    };
  }

  // Клик добавляет блок на холст — надёжная альтернатива нативному drag,
  // который в упакованном Electron не всегда стартует. Позиция каскадируется,
  // чтобы повторные клики не ложились точно друг на друга.
  function addBlock(kind) {
    const n = useStore.getState().nodes.length;
    const position = { x: 320 + (n % 6) * 40, y: 80 + (n % 6) * 40 };
    if (kind === 'message') addNode(makeMessageNode(position));
    else if (kind === 'auth') addNode(makeAuthNode(position));
    else if (kind === 'setvar') addNode(makeSetNode(position));
    else if (kind === 'input') addNode(makeInputNode(position));
    else if (kind === 'condition') addNode(makeConditionNode(position));
  }

  const itemStyle = {
    background: '#3498db', color: '#fff', padding: '10px 12px',
    borderRadius: 6, cursor: 'pointer', userSelect: 'none',
  };

  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Блоки</div>
      <div style={{ fontSize: 11, color: '#7f8c8d', marginBottom: 8 }}>
        Клик или перетаскивание
      </div>
      <div
        draggable
        onDragStart={onDragStart('message')}
        onClick={() => addBlock('message')}
        style={itemStyle}
      >
        📩 Сообщение
      </div>
      <div
        draggable
        onDragStart={onDragStart('auth')}
        onClick={() => addBlock('auth')}
        style={{ ...itemStyle, background: '#8e44ad', marginTop: 8 }}
      >
        🔐 Авторизация
      </div>
      <div
        draggable
        onDragStart={onDragStart('setvar')}
        onClick={() => addBlock('setvar')}
        style={{ ...itemStyle, background: '#6c3483', marginTop: 8 }}
      >
        🔧 Переменная
      </div>
      <div
        draggable
        onDragStart={onDragStart('input')}
        onClick={() => addBlock('input')}
        style={{ ...itemStyle, background: '#d35400', marginTop: 8 }}
      >
        ⌨️ Ввод пользователя
      </div>
      <div
        draggable
        onDragStart={onDragStart('condition')}
        onClick={() => addBlock('condition')}
        style={{ ...itemStyle, background: '#b7950b', marginTop: 8 }}
      >
        🔀 Условие
      </div>
    </>
  );
}
