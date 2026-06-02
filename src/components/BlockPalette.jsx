export default function BlockPalette() {
  function onDragStart(kind) {
    return (e) => {
      e.dataTransfer.setData('application/x-bot-block', kind);
      e.dataTransfer.effectAllowed = 'move';
    };
  }
  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Блоки</div>
      <div
        draggable
        onDragStart={onDragStart('message')}
        style={{
          background: '#3498db', color: '#fff', padding: '10px 12px',
          borderRadius: 6, cursor: 'grab', userSelect: 'none',
        }}
      >
        📩 Сообщение
      </div>
      <div
        draggable
        onDragStart={onDragStart('auth')}
        style={{
          background: '#8e44ad', color: '#fff', padding: '10px 12px',
          borderRadius: 6, cursor: 'grab', userSelect: 'none', marginTop: 8,
        }}
      >
        🔐 Авторизация
      </div>
    </>
  );
}
