import { useStore } from '../store.js';
import { collectVariableNames } from '../variables.js';

export default function PropertiesPanel() {
  const selectedId = useStore((s) => s.selectedId);
  const node = useStore((s) => s.nodes.find((n) => n.id === selectedId));
  const updateNodeData = useStore((s) => s.updateNodeData);
  const knownNames = useStore((s) => collectVariableNames(s.nodes));

  const datalist = (
    <datalist id="known-vars">
      {knownNames.map((name) => <option key={name} value={name} />)}
    </datalist>
  );

  if (!node) {
    return <div style={{ color: '#888' }}>Выберите блок на холсте.</div>;
  }
  if (node.type === 'start') {
    return <div><b>Start</b><div style={{ color: '#888', marginTop: 8 }}>Этот блок не редактируется.</div></div>;
  }

  let editor;
  if (node.type === 'auth') editor = <AuthEditor node={node} updateNodeData={updateNodeData} />;
  else if (node.type === 'setvar') editor = <SetVarEditor node={node} updateNodeData={updateNodeData} knownNames={knownNames} />;
  else if (node.type === 'input') editor = <InputEditor node={node} updateNodeData={updateNodeData} knownNames={knownNames} />;
  else if (node.type === 'condition') editor = <ConditionEditor node={node} updateNodeData={updateNodeData} knownNames={knownNames} />;
  else editor = <MessageEditor node={node} updateNodeData={updateNodeData} />;

  return <>{datalist}{editor}</>;
}

function VarNameInput({ value, onChange, knownNames, placeholder }) {
  const unknown = value.trim() !== '' && !knownNames.includes(value.trim());
  return (
    <>
      <input
        list="known-vars"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: 6, border: unknown ? '1px solid #e67e22' : '1px solid #ccc' }}
      />
      {unknown && (
        <div style={{ fontSize: 11, color: '#e67e22', marginTop: 2 }}>
          Переменная нигде не задаётся
        </div>
      )}
    </>
  );
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

function SetVarEditor({ node, updateNodeData, knownNames }) {
  const { variable = '', value = '' } = node.data;
  const set = (patch) => updateNodeData(node.id, patch);
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Задать переменную</div>

      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Имя переменной</label>
      <VarNameInput
        value={variable}
        onChange={(v) => set({ variable: v })}
        knownNames={knownNames}
        placeholder="например, age"
      />

      <label style={{ display: 'block', fontSize: 12, marginTop: 12, marginBottom: 4 }}>Значение</label>
      <input
        value={value}
        onChange={(e) => set({ value: e.target.value })}
        placeholder="текст или {{другая_переменная}}"
        style={{ width: '100%', padding: 6 }}
      />
    </div>
  );
}

function InputEditor({ node, updateNodeData, knownNames }) {
  const { promptText = '', variable = '' } = node.data;
  const set = (patch) => updateNodeData(node.id, patch);
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Ввод пользователя</div>

      <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Текст-подсказка</label>
      <textarea
        value={promptText}
        onChange={(e) => set({ promptText: e.target.value })}
        style={{ width: '100%', minHeight: 60, padding: 6, fontFamily: 'inherit' }}
      />

      <label style={{ display: 'block', fontSize: 12, marginTop: 12, marginBottom: 4 }}>Сохранить в переменную</label>
      <VarNameInput
        value={variable}
        onChange={(v) => set({ variable: v })}
        knownNames={knownNames}
        placeholder="например, name"
      />
    </div>
  );
}

const OPERATORS = [
  { value: 'equals', label: 'равно' },
  { value: 'not_equals', label: 'не равно' },
  { value: 'contains', label: 'содержит' },
  { value: 'not_contains', label: 'не содержит' },
  { value: 'empty', label: 'пусто' },
  { value: 'not_empty', label: 'не пусто' },
  { value: 'gt', label: '> (больше)' },
  { value: 'lt', label: '< (меньше)' },
  { value: 'gte', label: '≥ (больше или равно)' },
  { value: 'lte', label: '≤ (меньше или равно)' },
];
const NO_VALUE_OPS = new Set(['empty', 'not_empty']);

function ConditionEditor({ node, updateNodeData, knownNames }) {
  const rules = node.data.rules ?? [];
  function setRule(i, patch) {
    const next = rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    updateNodeData(node.id, { rules: next });
  }
  function addRule() {
    updateNodeData(node.id, { rules: [...rules, { variable: '', op: 'equals', value: '' }] });
  }
  function removeRule(i) {
    updateNodeData(node.id, { rules: rules.filter((_, idx) => idx !== i) });
  }
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Условие</div>
      <div style={{ fontSize: 11, color: '#7f8c8d', marginBottom: 8 }}>
        Правила проверяются сверху вниз; берётся первое подходящее, иначе — ветка «иначе».
      </div>

      {rules.map((r, i) => (
        <div key={i} style={{
          border: '1px solid #eee', borderRadius: 4, padding: 8, marginBottom: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Правило {i + 1}</span>
            <button onClick={() => removeRule(i)} style={{ padding: '0 8px' }}>✕</button>
          </div>
          <VarNameInput
            value={r.variable}
            onChange={(v) => setRule(i, { variable: v })}
            knownNames={knownNames}
            placeholder="переменная"
          />
          <select
            value={r.op}
            onChange={(e) => setRule(i, { op: e.target.value })}
            style={{ width: '100%', padding: 6, marginTop: 4 }}
          >
            {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {!NO_VALUE_OPS.has(r.op) && (
            <input
              value={r.value}
              onChange={(e) => setRule(i, { value: e.target.value })}
              placeholder="значение или {{переменная}}"
              style={{ width: '100%', padding: 6, marginTop: 4 }}
            />
          )}
        </div>
      ))}

      <button onClick={addRule} style={{ padding: '4px 8px' }}>+ добавить правило</button>
    </div>
  );
}
