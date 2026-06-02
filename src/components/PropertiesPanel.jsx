import { useStore } from '../store.js';

export default function PropertiesPanel() {
  const selectedId = useStore((s) => s.selectedId);
  const node = useStore((s) => s.nodes.find((n) => n.id === selectedId));
  const updateNodeData = useStore((s) => s.updateNodeData);

  if (!node) {
    return <div style={{ color: '#888' }}>Выберите блок на холсте.</div>;
  }
  if (node.type === 'start') {
    return <div><b>Start</b><div style={{ color: '#888', marginTop: 8 }}>Этот блок не редактируется.</div></div>;
  }
  if (node.type === 'auth') {
    return <AuthEditor node={node} updateNodeData={updateNodeData} />;
  }
  return <MessageEditor node={node} updateNodeData={updateNodeData} />;
}

function MessageEditor({ node, updateNodeData }) {
  const { text = '', buttonsEnabled = false, buttons = [] } = node.data;
  function setText(v) { updateNodeData(node.id, { text: v }); }
  function setButtonsEnabled(v) { updateNodeData(node.id, { buttonsEnabled: v }); }
  function setButtonText(i, v) {
    const next = buttons.map((b, idx) => idx === i ? { ...b, text: v } : b);
    updateNodeData(node.id, { buttons: next });
  }
  function addButton() {
    updateNodeData(node.id, { buttons: [...buttons, { text: '' }] });
  }
  function removeButton(i) {
    updateNodeData(node.id, { buttons: buttons.filter((_, idx) => idx !== i) });
  }
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Сообщение</div>

      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Текст</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ width: '100%', minHeight: 80, padding: 6, fontFamily: 'inherit' }}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
        <input
          type="checkbox"
          checked={buttonsEnabled}
          onChange={(e) => setButtonsEnabled(e.target.checked)}
        />
        Кнопки
      </label>

      {buttonsEnabled && (
        <div style={{ marginTop: 8 }}>
          {buttons.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <input
                value={b.text}
                onChange={(e) => setButtonText(i, e.target.value)}
                placeholder={`Кнопка ${i + 1}`}
                style={{ flex: 1, padding: 4 }}
              />
              <button onClick={() => removeButton(i)} style={{ padding: '0 8px' }}>✕</button>
            </div>
          ))}
          <button onClick={addButton} style={{ marginTop: 6, padding: '4px 8px' }}>
            + добавить кнопку
          </button>
        </div>
      )}
    </div>
  );
}

function AuthEditor({ node, updateNodeData }) {
  const {
    promptText = '',
    contactButtonText = '',
    refusalEnabled = false,
    refusalButtonText = '',
  } = node.data;
  const set = (patch) => updateNodeData(node.id, patch);
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Авторизация</div>

      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Текст приглашения</label>
      <textarea
        value={promptText}
        onChange={(e) => set({ promptText: e.target.value })}
        style={{ width: '100%', minHeight: 60, padding: 6, fontFamily: 'inherit' }}
      />

      <label style={{ display: 'block', fontSize: 12, marginTop: 12, marginBottom: 4 }}>
        Текст кнопки контакта
      </label>
      <input
        value={contactButtonText}
        onChange={(e) => set({ contactButtonText: e.target.value })}
        placeholder="Поделиться контактом"
        style={{ width: '100%', padding: 6 }}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
        <input
          type="checkbox"
          checked={refusalEnabled}
          onChange={(e) => set({ refusalEnabled: e.target.checked })}
        />
        Показать кнопку отказа
      </label>

      {refusalEnabled && (
        <>
          <label style={{ display: 'block', fontSize: 12, marginTop: 8, marginBottom: 4 }}>
            Текст кнопки отказа
          </label>
          <input
            value={refusalButtonText}
            onChange={(e) => set({ refusalButtonText: e.target.value })}
            placeholder="Отказаться"
            style={{ width: '100%', padding: 6 }}
          />
        </>
      )}

      <div style={{
        marginTop: 16, padding: 8, fontSize: 12, lineHeight: 1.5,
        background: '#f4ecf7', borderLeft: '3px solid #8e44ad', color: '#4a235a',
      }}>
        Этот блок задаёт переменные: <code>{'{{first_name}}'}</code>, <code>{'{{last_name}}'}</code>, <code>{'{{phone}}'}</code>.
        Используйте их в тексте сообщений.
      </div>
    </div>
  );
}
