# Auth Block & Variables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить блок «Авторизация» (запрашивает контакт через системную кнопку Max API), generic-хранилище переменных в рантайме и шаблонную подстановку `{{var}}` в текст Message-блоков.

**Architecture:** Auth-нода — новый тип, аналогичный Message по структуре, но со специальной обработкой attachment'а контакта в рантайме. Переменные живут в `Map<chatId, Record<string, string>>` рядом с `userState`. Сигнатура `handle` меняется на `(chatId, update)` — теперь разбор content'а делается внутри.

**Tech Stack:** React, Zustand, React Flow, Vite, vitest. Сгенерированный bot.js — чистый Node.js 18+ без зависимостей.

**Spec:** `docs/superpowers/specs/2026-06-02-auth-block-design.md`

---

## Файловая структура

**Создаются:**
- `src/components/AuthNode.jsx` — кастомная React Flow нода.

**Модифицируются:**
- `src/nodeFactory.js` — фабрика `makeAuthNode`.
- `src/store.js` — pruning для handle `refused`.
- `src/components/BlockPalette.jsx` — добавляется кнопка «Авторизация».
- `src/App.jsx` — drop handler для `kind === 'auth'`, регистрация в `nodeTypes`.
- `src/components/PropertiesPanel.jsx` — ветка для `node.type === 'auth'`.
- `src/generator/traverse.js` — добавляется `authPrompts`, auth-транзишены.
- `src/generator/index.js` — пропуск `authPrompts` в шаблоны.
- `src/generator/polling.js` — `AUTH_PROMPTS`, `userVars`, `render`, `extractContact`, `parseVcf`, новый `send`, новый `handle(update)`.
- `src/generator/webhook.js` — то же, что polling.js.
- `tests/store.test.js`, `tests/generator/traverse.test.js`, `tests/generator/polling.test.js`, `tests/generator/webhook.test.js` — новые сценарии.

---

## Task 1: Фабрика `makeAuthNode`

**Files:**
- Modify: `src/nodeFactory.js`
- Test: `tests/store.test.js` (через store, удобнее)

- [ ] **Step 1: Написать падающий тест**

В `tests/store.test.js` после блока про pruning добавить:

```js
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
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

```bash
npm test -- -t "makeAuthNode default data"
```
Ожидание: FAIL — `makeAuthNode is not a function`.

- [ ] **Step 3: Реализовать `makeAuthNode`**

В `src/nodeFactory.js` добавить в конец файла:

```js
export function makeAuthNode(position) {
  return {
    id: nextNodeId('auth'),
    type: 'auth',
    position,
    data: {
      promptText: '',
      contactButtonText: 'Поделиться контактом',
      refusalEnabled: false,
      refusalButtonText: 'Отказаться',
    },
  };
}
```

- [ ] **Step 4: Запустить тест, убедиться что проходит**

```bash
npm test -- -t "makeAuthNode default data"
```
Ожидание: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nodeFactory.js tests/store.test.js
git commit -m "feat(nodeFactory): add makeAuthNode with default data"
```

---

## Task 2: Pruning ребра `refused` при выключении тумблера

**Files:**
- Modify: `src/store.js` (метод `updateNodeData`, строки ~36–56)
- Test: `tests/store.test.js`

- [ ] **Step 1: Написать падающий тест**

В `tests/store.test.js` добавить:

```js
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
```

- [ ] **Step 2: Запустить тесты, убедиться что падают**

```bash
npm test -- tests/store.test.js
```
Ожидание: оба новых теста FAIL — ребро `refused` остаётся.

- [ ] **Step 3: Расширить `updateNodeData` в `src/store.js`**

После существующего блока `if (node && node.type === 'message') { ... }` добавить параллельный блок:

```js
    if (node && node.type === 'auth') {
      const validHandles = new Set(['contact']);
      if (node.data.refusalEnabled) validHandles.add('refused');
      edges = edges.filter((e) =>
        e.source !== id || validHandles.has(e.sourceHandle)
      );
    }
```

(Вставить непосредственно перед `set({ nodes, edges });`)

- [ ] **Step 4: Запустить тесты, убедиться что проходят**

```bash
npm test -- tests/store.test.js
```
Ожидание: PASS, остальные тесты не сломались.

- [ ] **Step 5: Commit**

```bash
git add src/store.js tests/store.test.js
git commit -m "feat(store): prune refused edges on auth node"
```

---

## Task 3: Компонент `AuthNode.jsx`

**Files:**
- Create: `src/components/AuthNode.jsx`

UI-задача без автотестов (как `MessageNode.jsx`). Проверяется визуальным smoke-тестом в Task 5.

- [ ] **Step 1: Создать `src/components/AuthNode.jsx`**

```jsx
import { Handle, Position } from 'reactflow';

export default function AuthNode({ data }) {
  const text = data.promptText || '(пусто)';
  const preview = text.length > 40 ? text.slice(0, 40) + '…' : text;

  return (
    <div style={{
      background: '#8e44ad', color: '#fff', padding: '10px 14px',
      borderRadius: 6, minWidth: 200, position: 'relative',
    }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Авторизация</div>
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{preview}</div>
      <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
        → {'{{first_name}}'}, {'{{last_name}}'}, {'{{phone}}'}
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{
          position: 'relative', background: '#6c3483',
          padding: '4px 8px', borderRadius: 4, marginTop: 4, fontSize: 12,
        }}>
          📱 {data.contactButtonText || 'Поделиться контактом'}
          <Handle type="source" position={Position.Right} id="contact" style={{ top: '50%' }} />
        </div>
        {data.refusalEnabled && (
          <div style={{
            position: 'relative', background: '#6c3483',
            padding: '4px 8px', borderRadius: 4, marginTop: 4, fontSize: 12,
          }}>
            ✖ {data.refusalButtonText || 'Отказаться'}
            <Handle type="source" position={Position.Right} id="refused" style={{ top: '50%' }} />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit (smoke в Task 5)**

```bash
git add src/components/AuthNode.jsx
git commit -m "feat: AuthNode custom react flow node"
```

---

## Task 4: Палитра и drop-handler

**Files:**
- Modify: `src/components/BlockPalette.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: В `src/components/BlockPalette.jsx` сделать обработчик параметризованным и добавить пункт «Авторизация»**

Заменить содержимое файла полностью:

```jsx
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
```

- [ ] **Step 2: В `src/App.jsx` зарегистрировать `AuthNode` и расширить onDrop**

В импортах после `MessageNode` добавить:

```jsx
import AuthNode from './components/AuthNode.jsx';
```

Изменить:

```jsx
const nodeTypes = { start: StartNode, message: MessageNode };
```
на:
```jsx
const nodeTypes = { start: StartNode, message: MessageNode, auth: AuthNode };
```

В импортах из nodeFactory:
```jsx
import { makeMessageNode } from './nodeFactory.js';
```
изменить на:
```jsx
import { makeMessageNode, makeAuthNode } from './nodeFactory.js';
```

В `onDrop` заменить тело callback'а на:

```jsx
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('application/x-bot-block');
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (kind === 'message') addNode(makeMessageNode(position));
    else if (kind === 'auth') addNode(makeAuthNode(position));
  }, [addNode, screenToFlowPosition]);
```

- [ ] **Step 3: Smoke-тест в dev**

```bash
npm run dev:vite
```
Открыть `http://localhost:5173`. Убедиться:
- В палитре виден пункт «🔐 Авторизация» фиолетового цвета.
- Перетаскивание на холст создаёт фиолетовую ноду «Авторизация» с одним входом, одним выходом «Поделиться контактом» и хинтом с переменными.

(После проверки — Ctrl+C закрыть dev server.)

- [ ] **Step 4: Commit**

```bash
git add src/components/BlockPalette.jsx src/App.jsx
git commit -m "feat: drag Auth block from palette to canvas"
```

---

## Task 5: Панель свойств для auth-ноды

**Files:**
- Modify: `src/components/PropertiesPanel.jsx`

- [ ] **Step 1: Добавить ветку для `node.type === 'auth'`**

Целиком заменить содержимое `src/components/PropertiesPanel.jsx`:

```jsx
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
```

- [ ] **Step 2: Smoke-тест**

```bash
npm run dev:vite
```
Перетащить Auth-блок на холст, кликнуть. Убедиться:
- В правой панели заголовок «Авторизация», textarea, поле кнопки, тумблер.
- При включении тумблера появляется поле «Текст кнопки отказа» и второй выход у ноды.
- При выключении — пропадает и поле, и выход. Если было ребро от `refused` — оно удалено.
- Внизу плашка с переменными.

- [ ] **Step 3: Commit**

```bash
git add src/components/PropertiesPanel.jsx
git commit -m "feat: properties panel edits auth node"
```

---

## Task 6: traverse — `authPrompts` и auth-транзишены

**Files:**
- Modify: `src/generator/traverse.js`
- Test: `tests/generator/traverse.test.js`

- [ ] **Step 1: Написать падающие тесты**

В `tests/generator/traverse.test.js` добавить:

```js
  it('emits authPrompts entry with contact button only when refusal disabled', () => {
    const project = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'a1', type: 'auth', data: {
          promptText: 'Авторизуйтесь',
          contactButtonText: 'Контакт',
          refusalEnabled: false,
          refusalButtonText: 'Нет',
        } },
        { id: 'm1', type: 'message', data: { text: 'Готово', buttonsEnabled: false } },
      ],
      edges: [
        { id: 'e0', source: 'start', target: 'a1' },
        { id: 'e1', source: 'a1', sourceHandle: 'contact', target: 'm1' },
      ],
    };
    const { authPrompts, transitions, initialNext, messages } = traverse(project);
    expect(initialNext).toBe('a1');
    expect(authPrompts.a1).toEqual({
      promptText: 'Авторизуйтесь',
      contactButton: { text: 'Контакт' },
      refusalButton: null,
    });
    expect(transitions.a1).toEqual({ contact: 'm1' });
    expect(messages.m1).toEqual({ text: 'Готово', buttons: null });
  });

  it('emits refusal button and refused transition when enabled', () => {
    const project = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'a1', type: 'auth', data: {
          promptText: 'P',
          contactButtonText: 'C',
          refusalEnabled: true,
          refusalButtonText: 'R',
        } },
        { id: 'm1', type: 'message', data: { text: 'ok', buttonsEnabled: false } },
        { id: 'm2', type: 'message', data: { text: 'reject', buttonsEnabled: false } },
      ],
      edges: [
        { id: 'e0', source: 'start', target: 'a1' },
        { id: 'e1', source: 'a1', sourceHandle: 'contact', target: 'm1' },
        { id: 'e2', source: 'a1', sourceHandle: 'refused', target: 'm2' },
      ],
    };
    const { authPrompts, transitions, messages } = traverse(project);
    expect(authPrompts.a1).toEqual({
      promptText: 'P',
      contactButton: { text: 'C' },
      refusalButton: { text: 'R', payload: 'auth_refuse_a1' },
    });
    expect(transitions.a1).toEqual({ contact: 'm1', refused: 'm2' });
    expect(messages.m1.text).toBe('ok');
    expect(messages.m2.text).toBe('reject');
  });

  it('uses default button text when fields are blank', () => {
    const project = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'a1', type: 'auth', data: {
          promptText: '', contactButtonText: '',
          refusalEnabled: true, refusalButtonText: '',
        } },
      ],
      edges: [{ id: 'e0', source: 'start', target: 'a1' }],
    };
    const { authPrompts } = traverse(project);
    expect(authPrompts.a1.contactButton.text).toBe('Поделиться контактом');
    expect(authPrompts.a1.refusalButton.text).toBe('Отказаться');
  });
```

- [ ] **Step 2: Запустить тесты, убедиться что падают**

```bash
npm test -- tests/generator/traverse.test.js
```
Ожидание: три новых теста FAIL (`authPrompts is undefined`).

- [ ] **Step 3: Расширить `traverse.js`**

Полностью заменить `src/generator/traverse.js`:

```js
export function traverse(project) {
  const nodes = new Map(project.nodes.map((n) => [n.id, n]));
  const outgoing = new Map();
  for (const e of project.edges) {
    const list = outgoing.get(e.source) ?? [];
    list.push(e);
    outgoing.set(e.source, list);
  }

  const startNode = project.nodes.find((n) => n.type === 'start');
  if (!startNode) return { messages: {}, authPrompts: {}, transitions: {}, initialNext: null };

  const startEdges = outgoing.get(startNode.id) ?? [];
  if (startEdges.length === 0) return { messages: {}, authPrompts: {}, transitions: {}, initialNext: null };

  const initialNext = startEdges[0].target;

  const messages = {};
  const authPrompts = {};
  const transitions = {};
  const queue = [initialNext];
  const seen = new Set();

  while (queue.length > 0) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);

    const node = nodes.get(id);
    if (!node) continue;

    const outs = outgoing.get(id) ?? [];

    if (node.type === 'message') {
      const buttons = node.data.buttonsEnabled
        ? (node.data.buttons ?? []).map((b, i) => ({ text: b.text, payload: `btn_${i}` }))
        : null;
      messages[id] = { text: node.data.text ?? '', buttons };
      const trans = {};
      if (buttons) {
        for (let i = 0; i < buttons.length; i++) {
          const handle = `btn-${i}`;
          const edge = outs.find((e) => e.sourceHandle === handle);
          const next = edge ? edge.target : null;
          trans[`btn_${i}`] = next;
          if (next) queue.push(next);
        }
      } else {
        const edge = outs[0];
        const next = edge ? edge.target : null;
        trans.default = next;
        if (next) queue.push(next);
      }
      transitions[id] = trans;
      continue;
    }

    if (node.type === 'auth') {
      const contactText = (node.data.contactButtonText || '').trim() || 'Поделиться контактом';
      const refusalText = (node.data.refusalButtonText || '').trim() || 'Отказаться';
      const refusalButton = node.data.refusalEnabled
        ? { text: refusalText, payload: `auth_refuse_${id}` }
        : null;
      authPrompts[id] = {
        promptText: node.data.promptText ?? '',
        contactButton: { text: contactText },
        refusalButton,
      };
      const trans = {};
      const contactEdge = outs.find((e) => e.sourceHandle === 'contact');
      trans.contact = contactEdge ? contactEdge.target : null;
      if (trans.contact) queue.push(trans.contact);
      if (node.data.refusalEnabled) {
        const refusedEdge = outs.find((e) => e.sourceHandle === 'refused');
        trans.refused = refusedEdge ? refusedEdge.target : null;
        if (trans.refused) queue.push(trans.refused);
      }
      transitions[id] = trans;
      continue;
    }
  }

  return { messages, authPrompts, transitions, initialNext };
}
```

- [ ] **Step 4: Запустить все traverse-тесты**

```bash
npm test -- tests/generator/traverse.test.js
```
Ожидание: PASS, старые тесты не сломались.

- [ ] **Step 5: Commit**

```bash
git add src/generator/traverse.js tests/generator/traverse.test.js
git commit -m "feat(traverse): emit authPrompts and auth transitions"
```

---

## Task 7: `generate()` — пропуск `authPrompts` в шаблоны

**Files:**
- Modify: `src/generator/index.js`

- [ ] **Step 1: Обновить `src/generator/index.js`**

Заменить полностью:

```js
import { traverse } from './traverse.js';
import { generatePolling } from './polling.js';
import { generateWebhook } from './webhook.js';

export function generate(project) {
  const { messages, authPrompts, transitions, initialNext } = traverse(project);
  const args = {
    token: project.token ?? '',
    messages,
    authPrompts,
    transitions,
    initialNext,
  };
  if (project.mode === 'webhook') return generateWebhook(args);
  return generatePolling(args);
}
```

- [ ] **Step 2: Запустить все тесты**

```bash
npm test
```
Ожидание: PASS — старые тесты не используют `authPrompts`, новые шаблоны будут готовы в следующих задачах. Тесты `polling.test.js` / `webhook.test.js` не передают `authPrompts` — это нормально, в шаблонах будет дефолт `{}`.

- [ ] **Step 3: Commit**

```bash
git add src/generator/index.js
git commit -m "feat(generator): thread authPrompts through generate()"
```

---

## Task 8: Рантайм polling — типизированные кнопки, `render`, `userVars`, `handle(update)`

**Files:**
- Modify: `src/generator/polling.js`
- Test: `tests/generator/polling.test.js`

Эта задача — самая большая. Делим на под-шаги, каждый — со своим тестом.

### 8a. Дефолт для `authPrompts` параметра

- [ ] **Step 1: Заменить сигнатуру в `polling.js`**

В `src/generator/polling.js` поменять первую строку функции:
```js
export function generatePolling({ token, messages, transitions, initialNext }) {
```
на:
```js
export function generatePolling({ token, messages, authPrompts = {}, transitions, initialNext }) {
```

Расширить блок `tables`:

```js
  const tables = `
const MESSAGES = ${JSON.stringify(messages, null, 2)};
const AUTH_PROMPTS = ${JSON.stringify(authPrompts, null, 2)};
const TRANSITIONS = ${JSON.stringify(transitions, null, 2)};
const INITIAL_NEXT = ${JSON.stringify(initialNext)};
`.trim();
```

### 8b. `userVars` + `render`

- [ ] **Step 2: Написать падающий тест на render**

В `tests/generator/polling.test.js` после блока про handle добавить новый блок:

```js
describe('generatePolling — variables & auth', () => {
  function build(args) {
    const code = generatePolling(args);
    globalThis.__SKIP_POLL__ = true;
    const factory = new Function('fetch', `${code}\nreturn { handle, userState, userVars };`);
    const sent = [];
    const fakeFetch = async (url, opts) => {
      if (opts?.method === 'POST') {
        sent.push({ url, body: JSON.parse(opts.body) });
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      }
      return { ok: true, status: 200, json: async () => ({ updates: [] }), text: async () => '' };
    };
    return { ...factory(fakeFetch), sent };
  }

  it('substitutes {{var}} in Message text from userVars', async () => {
    const { handle, userVars, sent } = build({
      token: 'T',
      messages: { m1: { text: 'Hi {{first_name}} {{last_name}}!', buttons: null } },
      authPrompts: {},
      transitions: { m1: { default: null } },
      initialNext: 'm1',
    });
    userVars.set(42, { first_name: 'Иван', last_name: 'Петров' });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    expect(sent[0].body.text).toBe('Hi Иван Петров!');
    delete globalThis.__SKIP_POLL__;
  });

  it('renders unknown variable as empty string', async () => {
    const { handle, sent } = build({
      token: 'T',
      messages: { m1: { text: 'X{{missing}}Y', buttons: null } },
      authPrompts: {},
      transitions: { m1: { default: null } },
      initialNext: 'm1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    expect(sent[0].body.text).toBe('XY');
    delete globalThis.__SKIP_POLL__;
  });
});
```

- [ ] **Step 3: Запустить — должны упасть**

```bash
npm test -- tests/generator/polling.test.js
```
Ожидание: новые тесты FAIL (`userVars` нет в экспортируемом объекте, у `handle` старая сигнатура с payload).

### 8c. Новый шаблон рантайма (`send`, `render`, `handle(update)`)

- [ ] **Step 4: Переписать тело шаблона в `polling.js`**

После `const userState = new Map();` добавить:
```js
const userVars = new Map();
```

Затем заменить тело между `${tables}` и циклом polling на следующее (по сути всё, что между tables и `let marker = 0;`):

```js
${tables}

function render(text, chatId) {
  const vars = userVars.get(chatId) ?? {};
  return String(text).replace(/\\{\\{(\\w+)\\}\\}/g, (_, name) => vars[name] ?? '');
}

function parseVcf(vcf) {
  const out = { fn: '', last: '', first: '', tel: '' };
  for (const raw of String(vcf).split(/\\r?\\n/)) {
    const idx = raw.indexOf(':');
    if (idx < 0) continue;
    const left = raw.slice(0, idx);
    const value = raw.slice(idx + 1);
    const key = left.split(';')[0].toUpperCase();
    if (key === 'FN') out.fn = value.trim();
    else if (key === 'N') {
      const parts = value.split(';');
      out.last = (parts[0] ?? '').trim();
      out.first = (parts[1] ?? '').trim();
    } else if (key === 'TEL') {
      if (!out.tel) out.tel = value.trim();
    }
  }
  return out;
}

function extractContact(att) {
  const m = att?.max_info ?? {};
  const vcf = parseVcf(att?.vcf_info ?? '');
  return {
    first_name: m.first_name ?? vcf.first ?? vcf.fn ?? '',
    last_name:  m.last_name  ?? vcf.last  ?? '',
    phone:      String(m.phone ?? vcf.tel ?? ''),
  };
}

function findContact(update) {
  const lists = [
    update?.message?.body?.attachments,
    update?.message?.attachments,
  ];
  for (const list of lists) {
    if (Array.isArray(list)) {
      const c = list.find((a) => a && a.type === 'contact');
      if (c) return c;
    }
  }
  return null;
}

async function send(chatId, text, buttons) {
  const body = { text };
  if (buttons && buttons.length > 0) {
    body.attachments = [{
      type: 'inline_keyboard',
      payload: { buttons: [buttons] },
    }];
  }
  const r = await fetch(\`\${API}/messages?chat_id=\${chatId}\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': TOKEN },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error('send failed:', r.status, await r.text());
}

function authButtons(prompt) {
  const arr = [{ type: 'request_contact', text: prompt.contactButton.text }];
  if (prompt.refusalButton) {
    arr.push({ type: 'callback', text: prompt.refusalButton.text, payload: prompt.refusalButton.payload });
  }
  return arr;
}

function messageButtons(msg) {
  if (!msg.buttons) return null;
  return msg.buttons.map((b) => ({ type: 'callback', text: b.text, payload: b.payload }));
}

async function handle(chatId, update) {
  const state = userState.get(chatId) ?? 'start';
  let next = null;

  if (state === 'start') {
    next = INITIAL_NEXT;
  } else if (state in AUTH_PROMPTS) {
    const contact = findContact(update);
    const callbackPayload = update?.callback?.payload ?? update?.message_callback?.payload;
    if (contact) {
      const fields = extractContact(contact);
      const prev = userVars.get(chatId) ?? {};
      userVars.set(chatId, { ...prev, ...fields });
      next = TRANSITIONS[state]?.contact ?? null;
    } else if (callbackPayload === \`auth_refuse_\${state}\`) {
      next = TRANSITIONS[state]?.refused ?? null;
    } else {
      return;
    }
  } else if (state in MESSAGES) {
    const payload = update?.callback?.payload ?? update?.message_callback?.payload;
    const trans = TRANSITIONS[state];
    if (!trans) return;
    next = trans[payload] ?? trans.default ?? null;
  } else {
    return;
  }

  if (!next) { userState.set(chatId, 'start'); return; }

  if (next in AUTH_PROMPTS) {
    const prompt = AUTH_PROMPTS[next];
    await send(chatId, render(prompt.promptText, chatId), authButtons(prompt));
  } else if (next in MESSAGES) {
    const m = MESSAGES[next];
    await send(chatId, render(m.text, chatId), messageButtons(m));
  } else {
    userState.set(chatId, 'start');
    return;
  }

  const nextTrans = TRANSITIONS[next];
  const hasAnyTarget = nextTrans && Object.values(nextTrans).some((v) => v);
  userState.set(chatId, hasAnyTarget ? next : 'start');
}
`;
```

Затем заменить цикл polling — обновить разбор update'а:

```js
let marker = 0;
if (!globalThis.__SKIP_POLL__) {
  (async () => {
    console.log(\`Бот запущен в режиме Long Polling. API: \${API}. Ожидание сообщений...\`);
    while (true) {
      try {
        const r = await fetch(\`\${API}/updates?timeout=30&marker=\${marker}\`, {
          headers: { 'Authorization': TOKEN },
        });
        if (!r.ok) {
          console.error('updates failed:', r.status, await r.text());
          await new Promise(res => setTimeout(res, 2000));
          continue;
        }
        const json = await r.json();
        if (json.marker) marker = json.marker;
        for (const u of json.updates ?? []) {
          if (u.update_type !== 'message_created' && u.update_type !== 'message_callback') continue;
          const chatId = u.chat_id
            ?? u.message?.recipient?.chat_id
            ?? u.message?.recipient?.chatId;
          if (!chatId) {
            console.error('no chat_id in update:', JSON.stringify(u));
            continue;
          }
          await handle(chatId, u);
        }
      } catch (e) {
        console.error('polling error:', e);
        await new Promise(res => setTimeout(res, 2000));
      }
    }
  })().catch((e) => { console.error('fatal:', e); process.exit(1); });
}
`;
}
```

> **Важно про экранирование:** регулярка `/\{\{(\w+)\}\}/g` внутри template literal в исходнике polling.js пишется как `/\\{\\{(\\w+)\\}\\}/g`. Аналогично `/\\r?\\n/` для парсера vCard.

### 8d. Обновить старый тест `handle()` под новую сигнатуру

- [ ] **Step 5: Поправить старый тест в `polling.test.js`**

Старый тест передаёт `await handle(42, undefined)` и `await handle(42, 'btn_0')`. Заменить:

```js
    await handle(42, undefined);
```
на:
```js
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
```

и:
```js
    await handle(42, 'btn_0');
```
на:
```js
    await handle(42, { update_type: 'message_callback', chat_id: 42, callback: { payload: 'btn_0' } });
```

### 8e. Добавить тесты auth-сценариев

- [ ] **Step 6: Добавить в блок `describe('generatePolling — variables & auth')` новые тесты:**

```js
  it('sends auth prompt with request_contact button on initial transition', async () => {
    const { handle, sent } = build({
      token: 'T',
      messages: {},
      authPrompts: {
        a1: {
          promptText: 'Поделитесь',
          contactButton: { text: 'Контакт' },
          refusalButton: null,
        },
      },
      transitions: { a1: { contact: null } },
      initialNext: 'a1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    expect(sent[0].body.text).toBe('Поделитесь');
    expect(sent[0].body.attachments[0].payload.buttons[0]).toEqual([
      { type: 'request_contact', text: 'Контакт' },
    ]);
    delete globalThis.__SKIP_POLL__;
  });

  it('includes refusal callback button when refusalButton present', async () => {
    const { handle, sent } = build({
      token: 'T',
      messages: {},
      authPrompts: {
        a1: {
          promptText: 'P',
          contactButton: { text: 'C' },
          refusalButton: { text: 'R', payload: 'auth_refuse_a1' },
        },
      },
      transitions: { a1: { contact: null, refused: null } },
      initialNext: 'a1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    const btns = sent[0].body.attachments[0].payload.buttons[0];
    expect(btns).toHaveLength(2);
    expect(btns[1]).toEqual({ type: 'callback', text: 'R', payload: 'auth_refuse_a1' });
    delete globalThis.__SKIP_POLL__;
  });

  it('on contact attachment: stores vars and advances on contact transition', async () => {
    const { handle, userVars, userState, sent } = build({
      token: 'T',
      messages: { m1: { text: 'Привет, {{first_name}}!', buttons: null } },
      authPrompts: {
        a1: { promptText: 'P', contactButton: { text: 'C' }, refusalButton: null },
      },
      transitions: { a1: { contact: 'm1' }, m1: { default: null } },
      initialNext: 'a1',
    });
    // step 1: trigger initial → auth
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    expect(userState.get(42)).toBe('a1');

    // step 2: contact arrives
    await handle(42, {
      update_type: 'message_created',
      chat_id: 42,
      message: { body: { attachments: [{
        type: 'contact',
        max_info: { first_name: 'Иван', last_name: 'Петров', phone: '+71234567890' },
        vcf_info: '',
      }] } },
    });
    expect(userVars.get(42)).toEqual({
      first_name: 'Иван', last_name: 'Петров', phone: '+71234567890',
    });
    expect(sent[1].body.text).toBe('Привет, Иван!');
    delete globalThis.__SKIP_POLL__;
  });

  it('falls back to vcf_info when max_info is missing fields', async () => {
    const { handle, userVars } = build({
      token: 'T',
      messages: { m1: { text: 'ok', buttons: null } },
      authPrompts: {
        a1: { promptText: 'P', contactButton: { text: 'C' }, refusalButton: null },
      },
      transitions: { a1: { contact: 'm1' }, m1: { default: null } },
      initialNext: 'a1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    await handle(42, {
      update_type: 'message_created',
      chat_id: 42,
      message: { body: { attachments: [{
        type: 'contact',
        max_info: {},
        vcf_info: 'BEGIN:VCARD\\nN:Иванов;Иван;;;\\nFN:Иван Иванов\\nTEL;TYPE=CELL:+79991234567\\nEND:VCARD',
      }] } },
    });
    expect(userVars.get(42)).toEqual({
      first_name: 'Иван', last_name: 'Иванов', phone: '+79991234567',
    });
    delete globalThis.__SKIP_POLL__;
  });

  it('on refusal callback: advances on refused transition', async () => {
    const { handle, sent, userState } = build({
      token: 'T',
      messages: { m1: { text: 'reject', buttons: null } },
      authPrompts: {
        a1: { promptText: 'P', contactButton: { text: 'C' },
              refusalButton: { text: 'R', payload: 'auth_refuse_a1' } },
      },
      transitions: { a1: { contact: null, refused: 'm1' }, m1: { default: null } },
      initialNext: 'a1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    await handle(42, {
      update_type: 'message_callback', chat_id: 42,
      callback: { payload: 'auth_refuse_a1' },
    });
    expect(sent[1].body.text).toBe('reject');
    expect(userState.get(42)).toBe('start');
    delete globalThis.__SKIP_POLL__;
  });

  it('ignores arbitrary text while waiting for contact', async () => {
    const { handle, sent, userState } = build({
      token: 'T',
      messages: { m1: { text: 'reject', buttons: null } },
      authPrompts: {
        a1: { promptText: 'P', contactButton: { text: 'C' }, refusalButton: null },
      },
      transitions: { a1: { contact: 'm1' }, m1: { default: null } },
      initialNext: 'a1',
    });
    await handle(42, { update_type: 'message_created', chat_id: 42, message: {} });
    expect(userState.get(42)).toBe('a1');
    const beforeLen = sent.length;
    await handle(42, {
      update_type: 'message_created', chat_id: 42,
      message: { body: { text: 'привет' } },
    });
    expect(sent.length).toBe(beforeLen);
    expect(userState.get(42)).toBe('a1');
    delete globalThis.__SKIP_POLL__;
  });
```

- [ ] **Step 7: Запустить все polling-тесты**

```bash
npm test -- tests/generator/polling.test.js
```
Ожидание: все PASS.

- [ ] **Step 8: Запустить все тесты целиком**

```bash
npm test
```
Ожидание: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/generator/polling.js tests/generator/polling.test.js
git commit -m "feat(polling): auth prompts, variables, contact attachment handling"
```

---

## Task 9: Рантайм webhook — те же изменения

**Files:**
- Modify: `src/generator/webhook.js`
- Test: `tests/generator/webhook.test.js`

- [ ] **Step 1: Написать падающие тесты в `webhook.test.js`**

Полностью заменить файл:

```js
import { describe, it, expect } from 'vitest';
import { generateWebhook } from '../../src/generator/webhook.js';

describe('generateWebhook', () => {
  it('produces parseable JS that uses http.createServer on port 3000', () => {
    const code = generateWebhook({
      token: 'T',
      messages: { m1: { text: 'hi', buttons: null } },
      authPrompts: {},
      transitions: { m1: { default: null } },
      initialNext: 'm1',
    });
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain("require('http')");
    expect(code).toContain('3000');
  });

  it('contains AUTH_PROMPTS, userVars and render', () => {
    const code = generateWebhook({
      token: 'T',
      messages: {},
      authPrompts: { a1: { promptText: 'p', contactButton: { text: 'c' }, refusalButton: null } },
      transitions: { a1: { contact: null } },
      initialNext: 'a1',
    });
    expect(code).toContain('AUTH_PROMPTS');
    expect(code).toContain('userVars');
    expect(code).toContain('function render');
    expect(code).toContain('request_contact');
  });
});
```

- [ ] **Step 2: Запустить — должно падать**

```bash
npm test -- tests/generator/webhook.test.js
```
Ожидание: тесты FAIL (`AUTH_PROMPTS` отсутствует, старый тест ломается из-за нового параметра — но он опциональный с дефолтом, поэтому только новый тест должен упасть).

- [ ] **Step 3: Переписать `src/generator/webhook.js`**

Заменить файл целиком:

```js
export function generateWebhook({ token, messages, authPrompts = {}, transitions, initialNext }) {
  const tables = `
const MESSAGES = ${JSON.stringify(messages, null, 2)};
const AUTH_PROMPTS = ${JSON.stringify(authPrompts, null, 2)};
const TRANSITIONS = ${JSON.stringify(transitions, null, 2)};
const INITIAL_NEXT = ${JSON.stringify(initialNext)};
`.trim();

  return `// Generated by Bot Constructor for Max
const http = require('http');
const TOKEN = ${JSON.stringify(token)};
const API = 'https://platform-api.max.ru';
const userState = new Map();
const userVars = new Map();

${tables}

function render(text, chatId) {
  const vars = userVars.get(chatId) ?? {};
  return String(text).replace(/\\{\\{(\\w+)\\}\\}/g, (_, name) => vars[name] ?? '');
}

function parseVcf(vcf) {
  const out = { fn: '', last: '', first: '', tel: '' };
  for (const raw of String(vcf).split(/\\r?\\n/)) {
    const idx = raw.indexOf(':');
    if (idx < 0) continue;
    const left = raw.slice(0, idx);
    const value = raw.slice(idx + 1);
    const key = left.split(';')[0].toUpperCase();
    if (key === 'FN') out.fn = value.trim();
    else if (key === 'N') {
      const parts = value.split(';');
      out.last = (parts[0] ?? '').trim();
      out.first = (parts[1] ?? '').trim();
    } else if (key === 'TEL') {
      if (!out.tel) out.tel = value.trim();
    }
  }
  return out;
}

function extractContact(att) {
  const m = att?.max_info ?? {};
  const vcf = parseVcf(att?.vcf_info ?? '');
  return {
    first_name: m.first_name ?? vcf.first ?? vcf.fn ?? '',
    last_name:  m.last_name  ?? vcf.last  ?? '',
    phone:      String(m.phone ?? vcf.tel ?? ''),
  };
}

function findContact(update) {
  const lists = [
    update?.message?.body?.attachments,
    update?.message?.attachments,
  ];
  for (const list of lists) {
    if (Array.isArray(list)) {
      const c = list.find((a) => a && a.type === 'contact');
      if (c) return c;
    }
  }
  return null;
}

async function send(chatId, text, buttons) {
  const body = { text };
  if (buttons && buttons.length > 0) {
    body.attachments = [{
      type: 'inline_keyboard',
      payload: { buttons: [buttons] },
    }];
  }
  const r = await fetch(\`\${API}/messages?chat_id=\${chatId}\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': TOKEN },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error('send failed:', r.status, await r.text());
}

function authButtons(prompt) {
  const arr = [{ type: 'request_contact', text: prompt.contactButton.text }];
  if (prompt.refusalButton) {
    arr.push({ type: 'callback', text: prompt.refusalButton.text, payload: prompt.refusalButton.payload });
  }
  return arr;
}

function messageButtons(msg) {
  if (!msg.buttons) return null;
  return msg.buttons.map((b) => ({ type: 'callback', text: b.text, payload: b.payload }));
}

async function handle(chatId, update) {
  const state = userState.get(chatId) ?? 'start';
  let next = null;

  if (state === 'start') {
    next = INITIAL_NEXT;
  } else if (state in AUTH_PROMPTS) {
    const contact = findContact(update);
    const callbackPayload = update?.callback?.payload ?? update?.message_callback?.payload;
    if (contact) {
      const fields = extractContact(contact);
      const prev = userVars.get(chatId) ?? {};
      userVars.set(chatId, { ...prev, ...fields });
      next = TRANSITIONS[state]?.contact ?? null;
    } else if (callbackPayload === \`auth_refuse_\${state}\`) {
      next = TRANSITIONS[state]?.refused ?? null;
    } else {
      return;
    }
  } else if (state in MESSAGES) {
    const payload = update?.callback?.payload ?? update?.message_callback?.payload;
    const trans = TRANSITIONS[state];
    if (!trans) return;
    next = trans[payload] ?? trans.default ?? null;
  } else {
    return;
  }

  if (!next) { userState.set(chatId, 'start'); return; }

  if (next in AUTH_PROMPTS) {
    const prompt = AUTH_PROMPTS[next];
    await send(chatId, render(prompt.promptText, chatId), authButtons(prompt));
  } else if (next in MESSAGES) {
    const m = MESSAGES[next];
    await send(chatId, render(m.text, chatId), messageButtons(m));
  } else {
    userState.set(chatId, 'start');
    return;
  }

  const nextTrans = TRANSITIONS[next];
  const hasAnyTarget = nextTrans && Object.values(nextTrans).some((v) => v);
  userState.set(chatId, hasAnyTarget ? next : 'start');
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    try {
      const u = JSON.parse(body);
      if (u.update_type !== 'message_created' && u.update_type !== 'message_callback') {
        res.writeHead(200); res.end('ignored');
        return;
      }
      const chatId = u.chat_id
        ?? u.message?.recipient?.chat_id
        ?? u.message?.recipient?.chatId;
      if (!chatId) {
        console.error('no chat_id in update:', JSON.stringify(u));
        res.writeHead(200); res.end('ignored');
        return;
      }
      await handle(chatId, u);
      res.writeHead(200); res.end('ok');
    } catch (e) {
      console.error('webhook error:', e);
      res.writeHead(500); res.end();
    }
  });
});

server.listen(3000, () => console.log('Webhook server on :3000'));
`;
}
```

- [ ] **Step 4: Запустить тесты**

```bash
npm test -- tests/generator/webhook.test.js
```
Ожидание: PASS.

- [ ] **Step 5: Полный прогон**

```bash
npm test
```
Ожидание: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/generator/webhook.js tests/generator/webhook.test.js
git commit -m "feat(webhook): auth prompts, variables, contact attachment handling"
```

---

## Task 10: End-to-end дым в Electron

**Files:** —

Финальный мануальный прогон, чтобы убедиться, что фронт + генератор работают вместе.

- [ ] **Step 1: Запустить приложение целиком**

```bash
npm run dev
```

- [ ] **Step 2: Собрать минимальный сценарий на холсте**
  1. Перетащить «🔐 Авторизация» на холст.
  2. Соединить Start → Auth по умолчанию.
  3. В свойствах Auth ввести промпт «Авторизуйтесь:», включить тумблер «Показать кнопку отказа».
  4. Перетащить «📩 Сообщение» — два штуки. В первом текст `Привет, {{first_name}} {{last_name}}!`, во втором `Жаль.`.
  5. Соединить Auth выход «contact» → первое сообщение, выход «refused» → второе.

- [ ] **Step 3: Компиляция**

Нажать «Компилировать», сохранить как `test-bot.js`. Открыть файл и убедиться:
  - Есть `const AUTH_PROMPTS = {...}` с заполненной нодой.
  - Есть `const userVars = new Map()`.
  - Есть `function render(`, `function extractContact(`.
  - Шаблон `{{first_name}}` не подставлен в файле — он живёт в `MESSAGES[...].text`.

- [ ] **Step 4: Сохранение/открытие проекта**

Через тулбар сохранить проект как `auth.json`, выбрать «Открыть», загрузить — нода Auth и её настройки сохранились и восстановились.

- [ ] **Step 5: Commit (если в проекте остались артефакты — пропустить; иначе ничего)**

End-of-feature. Изменений в репо на этом шаге нет — только мануальная верификация.

---

## Self-Review

**Spec coverage:**
- Auth-нода и её формат → Task 1 (фабрика), Task 6 (traverse).
- UI (палитра, нода, drop, свойства) → Tasks 3–5.
- Pruning рёбер при выключении тумблера → Task 2.
- `authPrompts` в traverse → Task 6.
- Generic переменные + `render` + типизированный `send` + новый `handle(update)` → Task 8 (polling) и Task 9 (webhook).
- Извлечение контакта из `max_info`/`vcf_info` → Task 8 (тесты включают fallback на vCard).
- Граничные случаи: текст вместо контакта (Task 8), `{{unknown}}` (Task 8), кнопка отказа выкл./вкл. (Tasks 2, 6, 8).
- Тесты: traverse, polling, webhook, store — покрыты.
- Smoke в Electron (компиляция, сохранение/открытие) → Task 10.

**Placeholders:** Нет TBD/TODO/«similar to» — каждая правка с кодом полностью.

**Type consistency:**
- `authPrompts[id].contactButton.text`, `refusalButton.text`/`.payload` — единообразно во всех задачах.
- `TRANSITIONS[id].contact` / `.refused` — одинаково в traverse и в шаблоне `handle`.
- `userVars` ключи `first_name`, `last_name`, `phone` — одинаково в `extractContact` и шаблоне `{{var}}`.
- Имена функций (`render`, `parseVcf`, `extractContact`, `findContact`, `authButtons`, `messageButtons`, `send`, `handle`) — единые в polling и webhook.
