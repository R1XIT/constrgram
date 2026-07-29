# Переменные и блоки логики — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в конструктор ботов три новых блока — «Задать переменную» (`setvar`), «Ввод пользователя» (`input`) и «Условие» (`condition`) — и поддержать их в генераторе Python.

**Architecture:** Табличный интерпретатор без изменения общей модели. `traverse` эмитит новые таблицы (`setters`, `inputs`, `conditions`); рантайм получает цикл продвижения `advance()`, который прогоняет **проходные** узлы (`setvar`, `condition`) мгновенно, пока не упрётся в **ждущий** узел (`message`, `auth`, `input`) — тогда шлёт его и сохраняет состояние. UI-часть повторяет существующие паттерны нод `message`/`auth`.

**Tech Stack:** JS-генератор (ESM) + Vitest; React 18 + React Flow 11 + Zustand для UI; генерируемый бот — Python 3.10+ / python-telegram-bot v21+; поведенческие тесты — pytest.

## Global Constraints

- Генерируемый Python — только `python-telegram-bot` v21+ и стандартная библиотека; целевой рантайм Python 3.10+.
- `user_state` и `user_vars` живут в памяти процесса (без персистентности) — как сейчас.
- Все пользовательские тексты в UI — на русском (следовать существующим строкам).
- Подстановка переменных — синтаксис `{{имя}}` (`\w+`), неизвестное имя рендерится в пустую строку. Регулярку `render()` не менять.
- Сравнение текста в условиях — без учёта регистра, с `strip()` по краям; числовое — через `float()`, при ошибке приведения правило ложно.
- Проходные узлы: `setvar`, `condition`. Ждущие узлы: `message`, `auth`, `input`.
- Порты Condition: `sourceHandle` = `rule-0..N` (по правилу) и `else`. Порт setvar/input: единственный `default`.
- TDD: сначала падающий тест, затем минимальная реализация. Частые коммиты (один на задачу минимум).
- Ветка разработки: `feat/variables-and-logic` (уже создана, спек закоммичен).

---

## File Structure

**Создаются:**
- `src/variables.js` — util сбора известных имён переменных для автоподсказки.
- `src/components/SetVarNode.jsx` — кастомная нода React Flow (фиолетовая).
- `src/components/InputNode.jsx` — кастомная нода (оранжевая).
- `src/components/ConditionNode.jsx` — кастомная нода (жёлтая, порт на правило + `else`).
- `tests/variables.test.js` — юнит-тест `collectVariableNames`.
- `tests/nodeFactory.test.js` — юнит-тест новых фабрик узлов.
- `tests/py/test_logic.py` — поведенческие pytest для setvar/input/condition.

**Модифицируются:**
- `src/nodeFactory.js` — `makeSetNode`, `makeInputNode`, `makeConditionNode`.
- `src/generator/traverse.js` — ветки BFS для трёх новых типов + новые таблицы в возврате.
- `src/generator/index.js` — проброс новых таблиц в `args`.
- `src/generator/runtime.js` — `set_var`/`check_rule`/`eval_condition`/`advance` + рефактор `handle()` + расширение сигнатуры `botRuntime`.
- `src/store.js` — обрезка рёбер `condition` в `updateNodeData`; бамп `version` до `1.1`.
- `src/components/BlockPalette.jsx` — три новых элемента палитры.
- `src/components/PropertiesPanel.jsx` — редакторы setvar/input/condition + автоподсказка.
- `src/App.jsx` — регистрация `nodeTypes` и веток `onDrop`.
- `tests/generator/traverse.test.js` — тесты новых таблиц.
- `tests/store.test.js` — тест обрезки рёбер condition; правка версии на `1.1`.
- `tests/generator/polling.test.js` — проверка присутствия `SETTERS`/`CONDITIONS`/`advance` в выводе.
- `tests/blockPalette.test.jsx` — клики по новым элементам палитры.
- `CLAUDE.md` — снять три пункта из «Что НЕ входит в v1», описать новые блоки.

---

## Task 1: Фабрики узлов и util переменных

**Files:**
- Modify: `src/nodeFactory.js`
- Create: `src/variables.js`
- Test: `tests/nodeFactory.test.js`
- Test: `tests/variables.test.js`

**Interfaces:**
- Produces: `makeSetNode(position) -> node{type:'setvar', data:{variable:'', value:''}}`, `makeInputNode(position) -> node{type:'input', data:{promptText:'', variable:''}}`, `makeConditionNode(position) -> node{type:'condition', data:{rules:[{variable:'', op:'equals', value:''}]}}`.
- Produces: `BUILTIN_VARS: string[]`, `collectVariableNames(nodes) -> string[]`.

- [ ] **Step 1: Написать падающий тест фабрик**

Создать `tests/nodeFactory.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { makeSetNode, makeInputNode, makeConditionNode } from '../src/nodeFactory.js';

describe('node factories (variables & logic)', () => {
  it('makeSetNode has type setvar and empty variable/value', () => {
    const n = makeSetNode({ x: 0, y: 0 });
    expect(n.type).toBe('setvar');
    expect(n.data).toEqual({ variable: '', value: '' });
    expect(n.position).toEqual({ x: 0, y: 0 });
  });

  it('makeInputNode has type input with promptText and variable', () => {
    const n = makeInputNode({ x: 1, y: 2 });
    expect(n.type).toBe('input');
    expect(n.data).toEqual({ promptText: '', variable: '' });
  });

  it('makeConditionNode starts with one empty equals rule', () => {
    const n = makeConditionNode({ x: 0, y: 0 });
    expect(n.type).toBe('condition');
    expect(n.data.rules).toEqual([{ variable: '', op: 'equals', value: '' }]);
  });

  it('gives unique ids to successive nodes', () => {
    const a = makeSetNode({ x: 0, y: 0 });
    const b = makeSetNode({ x: 0, y: 0 });
    expect(a.id).not.toBe(b.id);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run tests/nodeFactory.test.js`
Expected: FAIL — `makeSetNode` не экспортируется.

- [ ] **Step 3: Реализовать фабрики**

В `src/nodeFactory.js` добавить в конец файла (после `makeAuthNode`):

```js
export function makeSetNode(position) {
  return {
    id: nextNodeId('set'),
    type: 'setvar',
    position,
    data: { variable: '', value: '' },
  };
}

export function makeInputNode(position) {
  return {
    id: nextNodeId('input'),
    type: 'input',
    position,
    data: { promptText: '', variable: '' },
  };
}

export function makeConditionNode(position) {
  return {
    id: nextNodeId('cond'),
    type: 'condition',
    position,
    data: { rules: [{ variable: '', op: 'equals', value: '' }] },
  };
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run tests/nodeFactory.test.js`
Expected: PASS (4 теста).

- [ ] **Step 5: Написать падающий тест util переменных**

Создать `tests/variables.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { collectVariableNames, BUILTIN_VARS } from '../src/variables.js';

describe('collectVariableNames', () => {
  it('returns built-in auth vars for an empty graph', () => {
    expect(collectVariableNames([])).toEqual(BUILTIN_VARS);
  });

  it('adds variable names from setvar and input nodes, deduped', () => {
    const nodes = [
      { type: 'setvar', data: { variable: 'age' } },
      { type: 'input', data: { variable: 'city' } },
      { type: 'setvar', data: { variable: 'age' } },
      { type: 'message', data: { text: 'hi' } },
    ];
    const names = collectVariableNames(nodes);
    expect(names).toContain('age');
    expect(names).toContain('city');
    expect(names.filter((x) => x === 'age')).toHaveLength(1);
  });

  it('ignores setvar/input nodes whose variable is empty', () => {
    const names = collectVariableNames([{ type: 'setvar', data: { variable: '' } }]);
    expect(names).toEqual(BUILTIN_VARS);
  });
});
```

- [ ] **Step 6: Запустить тест — убедиться, что падает**

Run: `npx vitest run tests/variables.test.js`
Expected: FAIL — модуль `src/variables.js` не найден.

- [ ] **Step 7: Реализовать `src/variables.js`**

```js
export const BUILTIN_VARS = ['first_name', 'last_name', 'phone'];

export function collectVariableNames(nodes) {
  const names = new Set(BUILTIN_VARS);
  for (const n of nodes) {
    if ((n.type === 'setvar' || n.type === 'input') && n.data && n.data.variable) {
      names.add(n.data.variable);
    }
  }
  return [...names];
}
```

- [ ] **Step 8: Запустить оба теста — убедиться, что проходят**

Run: `npx vitest run tests/nodeFactory.test.js tests/variables.test.js`
Expected: PASS (все).

- [ ] **Step 9: Commit**

```bash
git add src/nodeFactory.js src/variables.js tests/nodeFactory.test.js tests/variables.test.js
git commit -m "feat: node factories and variable-name util for logic blocks"
```

---

## Task 2: Traverse — таблицы setvar / input / condition

**Files:**
- Modify: `src/generator/traverse.js`
- Test: `tests/generator/traverse.test.js`

**Interfaces:**
- Consumes: `project.nodes`, `project.edges` (React Flow формат; у ребра есть `source`, `target`, опционально `sourceHandle`).
- Produces: `traverse(project)` возвращает объект `{ messages, authPrompts, setters, inputs, conditions, transitions, initialNext }`, где:
  - `setters[nodeId] = { variable, value }`, `transitions[nodeId] = { default: <nextId|null> }`.
  - `inputs[nodeId] = { promptText, variable }`, `transitions[nodeId] = { default: <nextId|null> }`.
  - `conditions[nodeId] = { rules: [{ variable, op, value }] }`, `transitions[nodeId] = { rule_0: ..., rule_1: ..., else: ... }`.

- [ ] **Step 1: Написать падающий тест для setvar**

Добавить в `tests/generator/traverse.test.js` (внутри `describe('traverse', ...)`):

```js
it('emits a setter table and default transition for a setvar node', () => {
  const project = {
    nodes: [
      { id: 'start', type: 'start', data: {} },
      { id: 's1', type: 'setvar', data: { variable: 'age', value: '18' } },
      { id: 'm1', type: 'message', data: { text: 'ok', buttonsEnabled: false } },
    ],
    edges: [
      { id: 'e0', source: 'start', target: 's1' },
      { id: 'e1', source: 's1', target: 'm1' },
    ],
  };
  const { setters, transitions, initialNext } = traverse(project);
  expect(initialNext).toBe('s1');
  expect(setters.s1).toEqual({ variable: 'age', value: '18' });
  expect(transitions.s1).toEqual({ default: 'm1' });
});
```

- [ ] **Step 2: Написать падающий тест для input**

Добавить туда же:

```js
it('emits an input table and default transition for an input node', () => {
  const project = {
    nodes: [
      { id: 'start', type: 'start', data: {} },
      { id: 'i1', type: 'input', data: { promptText: 'Как вас зовут?', variable: 'name' } },
      { id: 'm1', type: 'message', data: { text: 'ok', buttonsEnabled: false } },
    ],
    edges: [
      { id: 'e0', source: 'start', target: 'i1' },
      { id: 'e1', source: 'i1', target: 'm1' },
    ],
  };
  const { inputs, transitions } = traverse(project);
  expect(inputs.i1).toEqual({ promptText: 'Как вас зовут?', variable: 'name' });
  expect(transitions.i1).toEqual({ default: 'm1' });
});
```

- [ ] **Step 3: Написать падающий тест для condition**

Добавить туда же:

```js
it('routes condition rules by sourceHandle and keeps an else branch', () => {
  const project = {
    nodes: [
      { id: 'start', type: 'start', data: {} },
      { id: 'c1', type: 'condition', data: { rules: [
        { variable: 'age', op: 'gte', value: '18' },
        { variable: 'city', op: 'equals', value: 'Москва' },
      ] } },
      { id: 'a', type: 'message', data: { text: 'adult', buttonsEnabled: false } },
      { id: 'b', type: 'message', data: { text: 'msk', buttonsEnabled: false } },
      { id: 'c', type: 'message', data: { text: 'other', buttonsEnabled: false } },
    ],
    edges: [
      { id: 'e0', source: 'start', target: 'c1' },
      { id: 'e1', source: 'c1', sourceHandle: 'rule-0', target: 'a' },
      { id: 'e2', source: 'c1', sourceHandle: 'rule-1', target: 'b' },
      { id: 'e3', source: 'c1', sourceHandle: 'else', target: 'c' },
    ],
  };
  const { conditions, transitions } = traverse(project);
  expect(conditions.c1.rules).toEqual([
    { variable: 'age', op: 'gte', value: '18' },
    { variable: 'city', op: 'equals', value: 'Москва' },
  ]);
  expect(transitions.c1).toEqual({ rule_0: 'a', rule_1: 'b', else: 'c' });
});
```

- [ ] **Step 4: Запустить тесты — убедиться, что падают**

Run: `npx vitest run tests/generator/traverse.test.js`
Expected: FAIL — `setters`/`inputs`/`conditions` равны `undefined`.

- [ ] **Step 5: Обновить ранние return-ветки traverse**

В `src/generator/traverse.js` заменить обе строки раннего возврата (нет Start / нет исходящего ребра), добавив пустые таблицы:

```js
  const startNode = project.nodes.find((n) => n.type === 'start');
  if (!startNode) return { messages: {}, authPrompts: {}, setters: {}, inputs: {}, conditions: {}, transitions: {}, initialNext: null };

  const startEdges = outgoing.get(startNode.id) ?? [];
  if (startEdges.length === 0) return { messages: {}, authPrompts: {}, setters: {}, inputs: {}, conditions: {}, transitions: {}, initialNext: null };
```

- [ ] **Step 6: Объявить новые таблицы и добавить ветки BFS**

После `const authPrompts = {};` добавить:

```js
  const setters = {};
  const inputs = {};
  const conditions = {};
```

Внутри цикла `while`, перед закрывающей `}` цикла (после ветки `if (node.type === 'auth') { ... continue; }`), добавить три ветки:

```js
    if (node.type === 'setvar') {
      setters[id] = { variable: node.data.variable ?? '', value: node.data.value ?? '' };
      const edge = outs[0];
      const next = edge ? edge.target : null;
      transitions[id] = { default: next };
      if (next) queue.push(next);
      continue;
    }

    if (node.type === 'input') {
      inputs[id] = { promptText: node.data.promptText ?? '', variable: node.data.variable ?? '' };
      const edge = outs[0];
      const next = edge ? edge.target : null;
      transitions[id] = { default: next };
      if (next) queue.push(next);
      continue;
    }

    if (node.type === 'condition') {
      const rules = (node.data.rules ?? []).map((r) => ({
        variable: r.variable ?? '', op: r.op ?? 'equals', value: r.value ?? '',
      }));
      conditions[id] = { rules };
      const trans = {};
      rules.forEach((_, i) => {
        const edge = outs.find((e) => e.sourceHandle === `rule-${i}`);
        const next = edge ? edge.target : null;
        trans[`rule_${i}`] = next;
        if (next) queue.push(next);
      });
      const elseEdge = outs.find((e) => e.sourceHandle === 'else');
      trans.else = elseEdge ? elseEdge.target : null;
      if (trans.else) queue.push(trans.else);
      transitions[id] = trans;
      continue;
    }
```

- [ ] **Step 7: Обновить финальный return**

Заменить последнюю строку функции:

```js
  return { messages, authPrompts, setters, inputs, conditions, transitions, initialNext };
```

- [ ] **Step 8: Запустить тесты — убедиться, что проходят**

Run: `npx vitest run tests/generator/traverse.test.js`
Expected: PASS (существующие + 3 новых).

- [ ] **Step 9: Commit**

```bash
git add src/generator/traverse.js tests/generator/traverse.test.js
git commit -m "feat(generator): traverse tables for setvar, input, condition"
```

---

## Task 3: Рантайм — set_var / check_rule / eval_condition / advance

**Files:**
- Modify: `src/generator/runtime.js` (полная замена содержимого — см. ниже)
- Modify: `src/generator/index.js`
- Test: `tests/generator/polling.test.js`
- Test: `tests/py/test_logic.py`

**Interfaces:**
- Consumes: таблицы из Task 2 через `traverse()`.
- Produces (в сгенерированном Python): `set_var(chat_id, name, value)`, `check_rule(chat_id, rule) -> bool`, `eval_condition(chat_id, node) -> nextId|None`, `async advance(context, chat_id, node)`. `botRuntime(args)` принимает дополнительно `setters`, `inputs`, `conditions`.

> **Важно:** `advance()` при остановке на ждущем узле сохраняет семантику текущего рантайма — если у узла нет ни одного непустого перехода (терминальный), состояние сбрасывается в `"start"` (логика `has_any`). Иначе `user_state = node`. Это нужно, чтобы существующий тест `test_callback_advances_and_removes_keyboard` (терминальное сообщение ⇒ состояние `start`) продолжил проходить.

- [ ] **Step 1: Обновить проброс таблиц в `src/generator/index.js`**

Заменить тело `generate`:

```js
export function generate(project) {
  const { messages, authPrompts, setters, inputs, conditions, transitions, initialNext } = traverse(project);
  const args = {
    token: project.token ?? '',
    messages,
    authPrompts,
    setters,
    inputs,
    conditions,
    transitions,
    initialNext,
  };
  if (project.mode === 'webhook') return generateWebhook(args);
  return generatePolling(args);
}
```

- [ ] **Step 2: Добавить падающий JS-тест наличия рантайм-частей**

Добавить в `tests/generator/polling.test.js` новый тест (в существующий `describe` или отдельный):

```js
it('generates SETTERS/CONDITIONS/INPUTS tables and advance()', () => {
  const project = {
    token: 'T', mode: 'polling',
    nodes: [
      { id: 'start', type: 'start', data: {} },
      { id: 's1', type: 'setvar', data: { variable: 'x', value: 'hi' } },
      { id: 'm1', type: 'message', data: { text: '{{x}}', buttonsEnabled: false } },
    ],
    edges: [
      { id: 'e0', source: 'start', target: 's1' },
      { id: 'e1', source: 's1', target: 'm1' },
    ],
  };
  const code = generate(project);
  expect(code).toContain('SETTERS = _TABLES["SETTERS"]');
  expect(code).toContain('CONDITIONS = _TABLES["CONDITIONS"]');
  expect(code).toContain('INPUTS = _TABLES["INPUTS"]');
  expect(code).toContain('async def advance(');
});
```

> Примечание: `generate` уже импортируется в этом файле существующими тестами. Если нет — добавить `import { generate } from '../../src/generator/index.js';` в начало.

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `npx vitest run tests/generator/polling.test.js`
Expected: FAIL — в выводе нет `SETTERS`/`advance`.

- [ ] **Step 4: Заменить содержимое `src/generator/runtime.js` целиком**

```js
export function botRuntime({
  token,
  messages,
  authPrompts = {},
  setters = {},
  inputs = {},
  conditions = {},
  transitions,
  initialNext,
}) {
  const tables = {
    MESSAGES: messages,
    AUTH_PROMPTS: authPrompts,
    SETTERS: setters,
    INPUTS: inputs,
    CONDITIONS: conditions,
    TRANSITIONS: transitions,
    INITIAL_NEXT: initialNext,
  };
  const tablesLiteral = JSON.stringify(JSON.stringify(tables));

  return `# Generated by Bot Constructor for Telegram
# pip install python-telegram-bot
# Состояние (user_state) и переменные (user_vars) хранятся в памяти процесса и теряются при перезапуске.
import os
import re
import json

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
)

TOKEN = os.environ.get("BOT_TOKEN") or ${JSON.stringify(token)}

_TABLES = json.loads(${tablesLiteral})
MESSAGES = _TABLES["MESSAGES"]
AUTH_PROMPTS = _TABLES["AUTH_PROMPTS"]
SETTERS = _TABLES["SETTERS"]
INPUTS = _TABLES["INPUTS"]
CONDITIONS = _TABLES["CONDITIONS"]
TRANSITIONS = _TABLES["TRANSITIONS"]
INITIAL_NEXT = _TABLES["INITIAL_NEXT"]

user_state = {}
user_vars = {}


def render(text, chat_id):
    vars_ = user_vars.get(chat_id, {})
    return re.sub(r"\\{\\{(\\w+)\\}\\}", lambda m: str(vars_.get(m.group(1), "")), str(text))


def set_var(chat_id, name, value):
    prev = user_vars.get(chat_id, {})
    user_vars[chat_id] = {**prev, name: value}


def check_rule(chat_id, rule):
    left = str(user_vars.get(chat_id, {}).get(rule["variable"], ""))
    op = rule["op"]
    if op == "empty":
        return left.strip() == ""
    if op == "not_empty":
        return left.strip() != ""
    right = render(rule["value"], chat_id)
    if op in ("gt", "lt", "gte", "lte"):
        try:
            lf, rf = float(left), float(right)
        except ValueError:
            return False
        return {"gt": lf > rf, "lt": lf < rf, "gte": lf >= rf, "lte": lf <= rf}[op]
    a, b = left.strip().lower(), right.strip().lower()
    if op == "equals":
        return a == b
    if op == "not_equals":
        return a != b
    if op == "contains":
        return b in a
    if op == "not_contains":
        return b not in a
    return False


def eval_condition(chat_id, node):
    trans = TRANSITIONS.get(node, {})
    for i, rule in enumerate(CONDITIONS[node]["rules"]):
        if check_rule(chat_id, rule):
            return trans.get(f"rule_{i}")
    return trans.get("else")


def message_markup(msg):
    buttons = msg.get("buttons")
    if not buttons:
        return ReplyKeyboardRemove()
    rows = [[InlineKeyboardButton(b["text"], callback_data=b["payload"])] for b in buttons]
    return InlineKeyboardMarkup(rows)


def auth_markup(prompt):
    rows = [[KeyboardButton(prompt["contactButton"]["text"], request_contact=True)]]
    if prompt.get("refusalButton"):
        rows.append([KeyboardButton(prompt["refusalButton"]["text"])])
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, one_time_keyboard=True)


async def send(context, chat_id, text, reply_markup):
    await context.bot.send_message(chat_id=chat_id, text=text, reply_markup=reply_markup)


async def advance(context, chat_id, node):
    for _ in range(1000):
        if not node:
            break
        if node in SETTERS:
            s = SETTERS[node]
            set_var(chat_id, s["variable"], render(s["value"], chat_id))
            node = TRANSITIONS.get(node, {}).get("default")
            continue
        if node in CONDITIONS:
            node = eval_condition(chat_id, node)
            continue
        if node in AUTH_PROMPTS:
            prompt = AUTH_PROMPTS[node]
            await send(context, chat_id, render(prompt["promptText"], chat_id), auth_markup(prompt))
        elif node in INPUTS:
            await send(context, chat_id, render(INPUTS[node]["promptText"], chat_id), ReplyKeyboardRemove())
        elif node in MESSAGES:
            m = MESSAGES[node]
            await send(context, chat_id, render(m["text"], chat_id), message_markup(m))
        else:
            break
        next_trans = TRANSITIONS.get(node)
        has_any = bool(next_trans) and any(next_trans.values())
        user_state[chat_id] = node if has_any else "start"
        return
    user_state[chat_id] = "start"


async def handle(update, context):
    if update.callback_query:
        await update.callback_query.answer()
    chat_id = update.effective_chat.id
    message = update.message
    text = message.text if message else None
    contact = message.contact if message else None
    data = update.callback_query.data if update.callback_query else None

    if text == "/start":
        user_state[chat_id] = "start"
    state = user_state.get(chat_id, "start")
    nxt = None

    if state == "start":
        nxt = INITIAL_NEXT
    elif state in AUTH_PROMPTS:
        prompt = AUTH_PROMPTS[state]
        if contact:
            prev = user_vars.get(chat_id, {})
            user_vars[chat_id] = {
                **prev,
                "first_name": contact.first_name or "",
                "last_name": contact.last_name or "",
                "phone": str(contact.phone_number or ""),
            }
            nxt = TRANSITIONS.get(state, {}).get("contact")
        elif prompt.get("refusalButton") and text == prompt["refusalButton"]["text"]:
            nxt = TRANSITIONS.get(state, {}).get("refused")
        else:
            return
    elif state in INPUTS:
        if text is None:
            return
        set_var(chat_id, INPUTS[state]["variable"], text)
        nxt = TRANSITIONS.get(state, {}).get("default")
    elif state in MESSAGES:
        if contact:
            return
        trans = TRANSITIONS.get(state)
        if not trans:
            return
        nxt = trans.get(data)
        if nxt is None:
            nxt = trans.get("default")
    else:
        return

    await advance(context, chat_id, nxt)


def build_app():
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", handle))
    app.add_handler(MessageHandler(filters.CONTACT, handle))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle))
    app.add_handler(CallbackQueryHandler(handle))
    return app
`;
}
```

- [ ] **Step 5: Запустить JS-тесты генератора — убедиться, что зелёные**

Run: `npx vitest run tests/generator/`
Expected: PASS (включая новый тест из Step 2 и существующие polling/webhook/traverse).

- [ ] **Step 6: Написать поведенческие pytest**

Создать `tests/py/test_logic.py`:

```python
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock


def run(coro):
    return asyncio.run(coro)


def make_context():
    return SimpleNamespace(bot=SimpleNamespace(send_message=AsyncMock()))


def make_update(chat_id, text=None, callback_data=None):
    message = SimpleNamespace(text=text, contact=None) if text is not None else None
    callback_query = None
    if callback_data is not None:
        callback_query = SimpleNamespace(data=callback_data, answer=AsyncMock())
    return SimpleNamespace(
        message=message,
        callback_query=callback_query,
        effective_chat=SimpleNamespace(id=chat_id),
    )


def sent(ctx):
    return [c.kwargs for c in ctx.bot.send_message.call_args_list]


def test_setvar_runs_through_and_substitutes(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "s1", "type": "setvar", "data": {"variable": "x", "value": "мир"}},
            {"id": "m1", "type": "message", "data": {"text": "Привет, {{x}}!", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "s1"},
            {"id": "e1", "source": "s1", "target": "m1"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    assert sent(ctx)[0]["text"] == "Привет, мир!"
    assert bot.user_vars[42]["x"] == "мир"


def test_input_captures_text_into_variable(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "i1", "type": "input", "data": {"promptText": "Как вас зовут?", "variable": "name"}},
            {"id": "m1", "type": "message", "data": {"text": "Привет, {{name}}!", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "i1"},
            {"id": "e1", "source": "i1", "target": "m1"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    assert sent(ctx)[0]["text"] == "Как вас зовут?"
    assert bot.user_state[42] == "i1"          # ждёт ввод
    run(bot.handle(make_update(42, text="Иван"), ctx))
    assert bot.user_vars[42]["name"] == "Иван"
    assert sent(ctx)[1]["text"] == "Привет, Иван!"


def test_condition_true_branch_and_else(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "s1", "type": "setvar", "data": {"variable": "age", "value": "20"}},
            {"id": "c1", "type": "condition", "data": {"rules": [
                {"variable": "age", "op": "gte", "value": "18"}]}},
            {"id": "adult", "type": "message", "data": {"text": "совершеннолетний", "buttonsEnabled": False}},
            {"id": "minor", "type": "message", "data": {"text": "нет", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "s1"},
            {"id": "e1", "source": "s1", "target": "c1"},
            {"id": "e2", "source": "c1", "sourceHandle": "rule-0", "target": "adult"},
            {"id": "e3", "source": "c1", "sourceHandle": "else", "target": "minor"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    assert sent(ctx)[0]["text"] == "совершеннолетний"


def test_condition_else_when_no_rule_matches(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "s1", "type": "setvar", "data": {"variable": "age", "value": "10"}},
            {"id": "c1", "type": "condition", "data": {"rules": [
                {"variable": "age", "op": "gte", "value": "18"}]}},
            {"id": "adult", "type": "message", "data": {"text": "да", "buttonsEnabled": False}},
            {"id": "minor", "type": "message", "data": {"text": "несовершеннолетний", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "s1"},
            {"id": "e1", "source": "s1", "target": "c1"},
            {"id": "e2", "source": "c1", "sourceHandle": "rule-0", "target": "adult"},
            {"id": "e3", "source": "c1", "sourceHandle": "else", "target": "minor"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    assert sent(ctx)[0]["text"] == "несовершеннолетний"


def test_condition_contains_operator(make_bot):
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "i1", "type": "input", "data": {"promptText": "Город?", "variable": "city"}},
            {"id": "c1", "type": "condition", "data": {"rules": [
                {"variable": "city", "op": "contains", "value": "москв"}]}},
            {"id": "yes", "type": "message", "data": {"text": "Москва!", "buttonsEnabled": False}},
            {"id": "no", "type": "message", "data": {"text": "другой", "buttonsEnabled": False}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "i1"},
            {"id": "e1", "source": "i1", "target": "c1"},
            {"id": "e2", "source": "c1", "sourceHandle": "rule-0", "target": "yes"},
            {"id": "e3", "source": "c1", "sourceHandle": "else", "target": "no"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))
    run(bot.handle(make_update(42, text="Москва"), ctx))   # case-insensitive
    assert sent(ctx)[1]["text"] == "Москва!"


def test_infinite_passthrough_loop_resets_to_start(make_bot):
    # Условие, ветка которого ведёт в себя, а переменная не меняется -> защита сработает.
    project = {
        "token": "T", "mode": "polling",
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "c1", "type": "condition", "data": {"rules": [
                {"variable": "missing", "op": "empty", "value": ""}]}},
        ],
        "edges": [
            {"id": "e0", "source": "start", "target": "c1"},
            {"id": "e1", "source": "c1", "sourceHandle": "rule-0", "target": "c1"},
        ],
    }
    bot = make_bot(project)
    ctx = make_context()
    run(bot.handle(make_update(42, text="/start"), ctx))   # не должно зависнуть
    assert bot.user_state[42] == "start"
    assert sent(ctx) == []
```

- [ ] **Step 7: Запустить pytest — убедиться, что проходят**

Run: `python -m pytest tests/py/test_logic.py -v`
Expected: PASS (6 тестов).

> Если `python` не найден — использовать `py -m pytest ...`. Требуется установленный `python-telegram-bot`.

- [ ] **Step 8: Прогнать существующие pytest — регрессия рантайма**

Run: `python -m pytest tests/py/ -v`
Expected: PASS — включая `test_bot.py` (особенно `test_callback_advances_and_removes_keyboard`, зависящий от сброса терминального состояния в `start`).

- [ ] **Step 9: Commit**

```bash
git add src/generator/runtime.js src/generator/index.js tests/generator/polling.test.js tests/py/test_logic.py
git commit -m "feat(runtime): set_var, conditions and advance() loop for pass-through nodes"
```

---

## Task 4: Store — обрезка рёбер condition и бамп версии

**Files:**
- Modify: `src/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: `updateNodeData(id, patch)` — существующий метод; узлы `condition` имеют `data.rules[]`.
- Produces: рёбра с `sourceHandle`, которого больше нет среди `rule-0..N`/`else`, удаляются; `toProjectJSON().version === '1.1'`.

- [ ] **Step 1: Обновить существующий тест версии**

В `tests/store.test.js`, в тесте `toProjectJSON includes version...`, заменить строку:

```js
    expect(project.version).toBe('1.1');
```

- [ ] **Step 2: Написать падающий тест обрезки рёбер condition**

Добавить в `tests/store.test.js` (внутри `describe('store', ...)`):

```js
it('prunes condition edges whose rule handle no longer exists', () => {
  useStore.getState().addNode({
    id: 'cond_1', type: 'condition',
    position: { x: 0, y: 0 },
    data: { rules: [{ variable: 'a', op: 'equals', value: '1' }, { variable: 'b', op: 'equals', value: '2' }] },
  });
  useStore.getState().addNode({
    id: 'msg_1', type: 'message',
    position: { x: 200, y: 0 },
    data: { text: '', buttonsEnabled: false, buttons: [] },
  });
  useStore.setState({
    edges: [
      { id: 'e0', source: 'cond_1', sourceHandle: 'rule-0', target: 'msg_1' },
      { id: 'e1', source: 'cond_1', sourceHandle: 'rule-1', target: 'msg_1' },
      { id: 'e2', source: 'cond_1', sourceHandle: 'else', target: 'msg_1' },
    ],
  });
  useStore.getState().updateNodeData('cond_1', { rules: [{ variable: 'a', op: 'equals', value: '1' }] });
  const handles = useStore.getState().edges.map((e) => e.sourceHandle).sort();
  expect(handles).toEqual(['else', 'rule-0']);
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `npx vitest run tests/store.test.js`
Expected: FAIL — ребро `rule-1` не обрезается; тест версии тоже красный до правки кода.

- [ ] **Step 4: Добавить ветку обрезки для condition**

В `src/store.js`, внутри `updateNodeData`, после блока `if (node && node.type === 'auth') { ... }` добавить:

```js
    if (node && node.type === 'condition') {
      const validHandles = new Set(['else']);
      (node.data.rules ?? []).forEach((_, i) => validHandles.add(`rule-${i}`));
      edges = edges.filter((e) =>
        e.source !== id || validHandles.has(e.sourceHandle)
      );
    }
```

- [ ] **Step 5: Бампнуть версию проекта**

В `src/store.js`, в `toProjectJSON`, заменить:

```js
    return { version: '1.1', token, mode, nodes, edges };
```

- [ ] **Step 6: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/store.test.js`
Expected: PASS (все, включая новый тест и обновлённый тест версии).

- [ ] **Step 7: Commit**

```bash
git add src/store.js tests/store.test.js
git commit -m "feat(store): prune condition edges on rule change; bump project version to 1.1"
```

---

## Task 5: Кастомные ноды, палитра и регистрация на холсте

**Files:**
- Create: `src/components/SetVarNode.jsx`
- Create: `src/components/InputNode.jsx`
- Create: `src/components/ConditionNode.jsx`
- Modify: `src/components/BlockPalette.jsx`
- Modify: `src/App.jsx`
- Test: `tests/blockPalette.test.jsx`

**Interfaces:**
- Consumes: `makeSetNode`, `makeInputNode`, `makeConditionNode` (Task 1); `data` узлов из модели.
- Produces: типы React Flow `setvar`/`input`/`condition` отрисовываются; клик по элементу палитры добавляет соответствующий узел; drop на холст — тоже.
- Метки операторов для подписи портов условия: `equals→=`, `not_equals→≠`, `contains→⊂`, `not_contains→⊄`, `empty→пусто`, `not_empty→не пусто`, `gt→>`, `lt→<`, `gte→≥`, `lte→≤`.

- [ ] **Step 1: Создать `src/components/SetVarNode.jsx`**

```jsx
import { Handle, Position } from 'reactflow';

export default function SetVarNode({ data }) {
  const name = data.variable || '(имя)';
  const value = data.value || '(пусто)';
  return (
    <div style={{
      background: '#6c3483', color: '#fff', padding: '10px 14px',
      borderRadius: 6, minWidth: 160, position: 'relative',
    }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Задать переменную</div>
      <div style={{ fontSize: 13 }}>
        <code>{name}</code> = {value.length > 24 ? value.slice(0, 24) + '…' : value}
      </div>
      <Handle type="source" position={Position.Right} id="default" />
    </div>
  );
}
```

- [ ] **Step 2: Создать `src/components/InputNode.jsx`**

```jsx
import { Handle, Position } from 'reactflow';

export default function InputNode({ data }) {
  const text = data.promptText || '(пусто)';
  const preview = text.length > 40 ? text.slice(0, 40) + '…' : text;
  return (
    <div style={{
      background: '#d35400', color: '#fff', padding: '10px 14px',
      borderRadius: 6, minWidth: 180, position: 'relative',
    }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Ввод пользователя</div>
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{preview}</div>
      <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
        → {'{{'}{data.variable || 'имя'}{'}}'}
      </div>
      <Handle type="source" position={Position.Right} id="default" />
    </div>
  );
}
```

- [ ] **Step 3: Создать `src/components/ConditionNode.jsx`**

```jsx
import { Handle, Position } from 'reactflow';

const OP_LABELS = {
  equals: '=', not_equals: '≠', contains: '⊂', not_contains: '⊄',
  empty: 'пусто', not_empty: 'не пусто', gt: '>', lt: '<', gte: '≥', lte: '≤',
};

function ruleLabel(rule) {
  const name = rule.variable || '?';
  const op = OP_LABELS[rule.op] ?? rule.op;
  if (rule.op === 'empty' || rule.op === 'not_empty') return `${name} ${op}`;
  return `${name} ${op} ${rule.value || ''}`.trim();
}

export default function ConditionNode({ data }) {
  const rules = data.rules ?? [];
  return (
    <div style={{
      background: '#b7950b', color: '#fff', padding: '10px 14px',
      borderRadius: 6, minWidth: 200, position: 'relative',
    }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Условие</div>
      <div style={{ marginTop: 4 }}>
        {rules.map((r, i) => (
          <div key={i} style={{
            position: 'relative', background: '#9a7d0a',
            padding: '4px 8px', borderRadius: 4, marginTop: 4, fontSize: 12,
          }}>
            {ruleLabel(r)}
            <Handle type="source" position={Position.Right} id={`rule-${i}`} style={{ top: '50%' }} />
          </div>
        ))}
        <div style={{
          position: 'relative', background: '#7d6608',
          padding: '4px 8px', borderRadius: 4, marginTop: 4, fontSize: 12, fontStyle: 'italic',
        }}>
          иначе
          <Handle type="source" position={Position.Right} id="else" style={{ top: '50%' }} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Написать падающие тесты палитры**

Добавить в `tests/blockPalette.test.jsx` (внутри `describe`):

```js
it('adds a setvar node when the «Переменная» block is clicked', () => {
  render(<BlockPalette />);
  fireEvent.click(screen.getByText(/Переменная/));
  expect(useStore.getState().nodes.some((n) => n.type === 'setvar')).toBe(true);
});

it('adds an input node when the «Ввод» block is clicked', () => {
  render(<BlockPalette />);
  fireEvent.click(screen.getByText(/Ввод/));
  expect(useStore.getState().nodes.some((n) => n.type === 'input')).toBe(true);
});

it('adds a condition node when the «Условие» block is clicked', () => {
  render(<BlockPalette />);
  fireEvent.click(screen.getByText(/Условие/));
  expect(useStore.getState().nodes.some((n) => n.type === 'condition')).toBe(true);
});
```

- [ ] **Step 5: Запустить — убедиться, что падают**

Run: `npx vitest run tests/blockPalette.test.jsx`
Expected: FAIL — элементов «Переменная»/«Ввод»/«Условие» в палитре нет.

- [ ] **Step 6: Расширить `src/components/BlockPalette.jsx`**

Обновить импорт:

```js
import { makeMessageNode, makeAuthNode, makeSetNode, makeInputNode, makeConditionNode } from '../nodeFactory.js';
```

Дополнить `addBlock`:

```js
  function addBlock(kind) {
    const n = useStore.getState().nodes.length;
    const position = { x: 320 + (n % 6) * 40, y: 80 + (n % 6) * 40 };
    if (kind === 'message') addNode(makeMessageNode(position));
    else if (kind === 'auth') addNode(makeAuthNode(position));
    else if (kind === 'setvar') addNode(makeSetNode(position));
    else if (kind === 'input') addNode(makeInputNode(position));
    else if (kind === 'condition') addNode(makeConditionNode(position));
  }
```

Добавить три элемента в JSX после блока «Авторизация» (перед закрывающим `</>`):

```jsx
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
```

- [ ] **Step 7: Зарегистрировать типы и drop в `src/App.jsx`**

Обновить импорты:

```js
import { makeMessageNode, makeAuthNode, makeSetNode, makeInputNode, makeConditionNode } from './nodeFactory.js';
import StartNode from './components/StartNode.jsx';
import MessageNode from './components/MessageNode.jsx';
import AuthNode from './components/AuthNode.jsx';
import SetVarNode from './components/SetVarNode.jsx';
import InputNode from './components/InputNode.jsx';
import ConditionNode from './components/ConditionNode.jsx';
```

Обновить `nodeTypes`:

```js
const nodeTypes = {
  start: StartNode, message: MessageNode, auth: AuthNode,
  setvar: SetVarNode, input: InputNode, condition: ConditionNode,
};
```

Дополнить `onDrop`:

```js
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('application/x-bot-block');
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (kind === 'message') addNode(makeMessageNode(position));
    else if (kind === 'auth') addNode(makeAuthNode(position));
    else if (kind === 'setvar') addNode(makeSetNode(position));
    else if (kind === 'input') addNode(makeInputNode(position));
    else if (kind === 'condition') addNode(makeConditionNode(position));
  }, [addNode, screenToFlowPosition]);
```

- [ ] **Step 8: Запустить тесты палитры — убедиться, что зелёные**

Run: `npx vitest run tests/blockPalette.test.jsx`
Expected: PASS (существующие + 3 новых).

- [ ] **Step 9: Commit**

```bash
git add src/components/SetVarNode.jsx src/components/InputNode.jsx src/components/ConditionNode.jsx src/components/BlockPalette.jsx src/App.jsx tests/blockPalette.test.jsx
git commit -m "feat(ui): setvar/input/condition nodes, palette items and canvas registration"
```

---

## Task 6: Панель свойств — редакторы и автоподсказка

**Files:**
- Modify: `src/components/PropertiesPanel.jsx`

**Interfaces:**
- Consumes: `updateNodeData(id, patch)`; `collectVariableNames(nodes)` и `BUILTIN_VARS` из `src/variables.js`; узлы `setvar`/`input`/`condition`.
- Produces: редакторы для трёх типов; поля имён переменных — с `<datalist>`-автоподсказкой и подсветкой неизвестного имени.

- [ ] **Step 1: Добавить импорты и общий helper поля имени**

В начало `src/components/PropertiesPanel.jsx` добавить:

```js
import { collectVariableNames } from '../variables.js';
```

Добавить в файл общий компонент поля имени переменной (после `PropertiesPanel`, до `MessageEditor`):

```js
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
```

- [ ] **Step 2: Диспетчеризация новых типов + общий datalist**

В `PropertiesPanel` заменить хвост функции (после ветки `auth`) так, чтобы:
1. вычислялся список известных имён;
2. рендерился общий `<datalist id="known-vars">`;
3. выбирался нужный редактор.

```js
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
```

- [ ] **Step 3: Добавить `SetVarEditor`**

В конец `src/components/PropertiesPanel.jsx`:

```js
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
```

- [ ] **Step 4: Добавить `InputEditor`**

```js
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
```

- [ ] **Step 5: Добавить `ConditionEditor`**

```js
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
```

- [ ] **Step 6: Прогнать весь JS-набор — убедиться в отсутствии регрессий**

Run: `npx vitest run`
Expected: PASS (все файлы).

- [ ] **Step 7: Ручная проверка в Electron**

Run: `npm run dev`
Проверить:
1. Палитра показывает «Переменная», «Ввод пользователя», «Условие».
2. Клик добавляет соответствующий цветной блок на холст.
3. Клик по блоку открывает его редактор в правой панели.
4. У блока «Переменная»: ввод имени в поле показывает автоподсказку из уже использованных имён; несуществующее имя подсвечивается оранжевым.
5. У «Условие»: добавление правила добавляет выходной порт на ноде; смена оператора на «пусто» скрывает поле значения; удаление правила убирает соответствующее ребро.

- [ ] **Step 8: Commit**

```bash
git add src/components/PropertiesPanel.jsx
git commit -m "feat(ui): properties editors for setvar/input/condition with variable autocomplete"
```

---

## Task 7: Документация и финальная сквозная проверка

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Обновить `CLAUDE.md` — раздел «Блоки»**

Добавить после описания блока Message краткие описания трёх новых блоков:

```markdown
### Задать переменную (фиолетовый)
- Проходной блок: 1 вход / 1 выход
- Свойства: `variable` (имя), `value` (текст, поддерживает `{{имя}}`)
- Мгновенно записывает значение в переменную и продолжает

### Ввод пользователя (оранжевый)
- Ждущий блок: 1 вход / 1 выход
- Свойства: `promptText` (подсказка), `variable` (куда сохранить ответ)
- Отправляет подсказку, ждёт текст, кладёт его в переменную

### Условие (жёлтый)
- Проходной блок: 1 вход / N+1 выходов (порт на правило + «иначе»)
- Свойства: `rules[]` — `{ variable, op, value }`
- Операторы: равно/не равно, содержит/не содержит, пусто/не пусто, `> < ≥ ≤`
- Берётся первое сошедшееся правило, иначе — ветка «иначе»
```

- [ ] **Step 2: Обновить `CLAUDE.md` — раздел «Что НЕ входит в v1»**

Удалить пункты, которые теперь реализованы:
- удалить «Переменные и условная логика»;
- удалить «Блок «Ввод пользователя» (только кнопки)».

Оставить: «Запуск бота прямо из приложения», «Предпросмотр диалога».

- [ ] **Step 3: Полный прогон JS-тестов**

Run: `npx vitest run`
Expected: PASS — все файлы (traverse, store, blockPalette, polling, webhook, variables, nodeFactory).

- [ ] **Step 4: Полный прогон pytest**

Run: `python -m pytest tests/py/ -v`
Expected: PASS — `test_bot.py` (регрессия) и `test_logic.py` (новые блоки).

- [ ] **Step 5: Сквозная ручная проверка в Electron**

Run: `npm run dev`
Собрать сценарий: `Start → Ввод(«Ваш возраст?» → age) → Условие(age ≥ 18 → «Доступно», иначе → «Слишком рано»)`. Соединить порты. Компилировать (кнопка «Компилировать»), сохранить `bot.py`, проверить: `python -c "import ast; ast.parse(open('bot.py', encoding='utf-8').read())"` — без ошибок.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document variables and logic blocks; update v1 scope"
```

---

## Готово

После Task 7 фича завершена:
- три новых блока (setvar / input / condition) в UI и генераторе;
- переменные задаются вручную, из ввода пользователя и из Auth; подстановка `{{имя}}` в тексте и полях значений;
- условная логика с 10 операторами и веткой «иначе»;
- покрытие: JS-юнит-тесты (traverse/store/palette/generator/variables/nodeFactory) + поведенческие pytest на реально сгенерированном Python.

Вне области (перенесено в будущее): арифметика в значениях, валидация ввода по типу, реестр переменных, персистентность состояния между перезапусками.
