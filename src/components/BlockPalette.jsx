export default function BlockPalette() {
  function onDragStart(e) {
    e.dataTransfer.setData('application/x-bot-block', 'message');
    e.dataTransfer.effectAllowed = 'move';
  }
  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Блоки</div>
      <div
        draggable
        onDragStart={onDragStart}
        style={{
          background: '#3498db', color: '#fff', padding: '10px 12px',
          borderRadius: 6, cursor: 'grab', userSelect: 'none',
        }}
      >
        📩 Сообщение
      </div>
    </>
  );
}
