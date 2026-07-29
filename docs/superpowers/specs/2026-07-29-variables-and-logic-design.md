# Дизайн: переменные и блоки логики

**Дата:** 2026-07-29
**Статус:** утверждён к реализации
**Область:** конструктор ботов (Electron/React) + генератор Python (python-telegram-bot)

## Цель

Вынести из ограничений v1 и реализовать пользовательские переменные и условную логику:

1. **Задать переменную** (`setvar`) — записать значение в именованную переменную.
2. **Ввод пользователя** (`input`) — показать подсказку, дождаться текста, сохранить его в переменную.
3. **Условие** (`condition`) — ветвление сценария по значениям переменных (switch: несколько правил + «иначе»).
4. **Подстановка `{{имя}}`** в текст — уже поддержана рантаймом (`render`), расширяется на новые поля значений.

## Контекст: что уже есть

Рантайм (`src/generator/runtime.js`) уже содержит инфраструктуру переменных:

- `user_vars[chat_id]` — словарь переменных на чат.
- `render(text, chat_id)` — подстановка `{{имя}}` (`re.sub(r"\{\{(\w+)\}\}", ...)`), неизвестные имена → пустая строка.
- Блок `auth` пишет встроенные переменные `first_name`, `last_name`, `phone`.

Модель рантайма сегодня: «одно действие пользователя → продвинуться ровно на один узел и отправить его». Узлы `message` и `auth` — **ждущие** (шлют контент и ждут следующего действия).

## Ключевая идея: проходные и ждущие узлы

- **Ждущие** узлы (`message`, `auth`, `input`) — отправляют контент и останавливают исполнение до следующего действия пользователя.
- **Проходные** узлы (`setvar`, `condition`) — исполняются мгновенно, ничего не шлют и не ждут, сразу текут к следующему узлу.

Рантайм получает **цикл продвижения** `advance()`, который прогоняет проходные узлы, пока не упрётся в ждущий (тогда шлёт его и сохраняет состояние) либо в конец графа (сброс в `start`).

Рассмотренные и отклонённые альтернативы:

- **Разворачивание на этапе компиляции** — «запечь» цепочки set/condition в `TRANSITIONS`. Отклонено: условия зависят от значений переменных в рантайме, их нельзя вычислить при компиляции.
- **Кодогенерация Python-функции на узел** — генерировать явный код вместо таблиц. Отклонено: переписывание всей архитектуры генератора, уход от табличной интерпретаторной модели.

## Модель данных

Три новых типа узлов (по образцу существующих `message`/`auth`):

```
setvar   (проходной, 1 вход / 1 выход)
  data: { variable: "",   // имя переменной для записи
          value: "" }     // текст с подстановкой {{имя}}

input    (ждущий, 1 вход / 1 выход)
  data: { promptText: "",  // текст-подсказка, отправляется пользователю
          variable: "" }   // куда сохранить набранный пользователем текст

condition (проходной, 1 вход / N+1 выходов)
  data: { rules: [ { variable: "", op: "equals", value: "" }, ... ] }
```

**Операторы** (`op`):

| op | смысл | использует `value` |
|----|-------|:---:|
| `equals` / `not_equals` | текст равно / не равно (без учёта регистра, trim по краям) | да |
| `contains` / `not_contains` | подстрока входит / не входит | да |
| `empty` / `not_empty` | переменная пуста / заполнена | нет |
| `gt` / `lt` / `gte` / `lte` | числовое `> / < / ≥ / ≤` | да |

Числовые операторы приводят обе стороны к `float`; при неудаче приведения правило считается ложным. Поле `value` во всех правилах проходит через `render()` — то есть в сравнении можно ссылаться на другие переменные через `{{имя}}`. Арифметики нет.

**Порты Condition** (аналогично кнопкам Message): `sourceHandle` = `rule-0..N` для правил и `else` для ветки «иначе». Порядок правил определяет приоритет: берётся первое сошедшееся. Если ни одно правило не сошлось и `else` не подключён — сброс в `start`.

**Формат проекта (.json):** структурно без изменений (узлы/рёбра универсальны). `version` бампится до `"1.1"` как маркер; загрузчик версию не проверяет, старые `.json` открываются как есть.

## Traverse (`src/generator/traverse.js`)

Возвращаемый объект расширяется: `{ messages, authPrompts, setters, inputs, conditions, transitions, initialNext }`. В BFS добавляются три ветки; существующие `message`/`auth` не трогаются. Множество `seen` уже защищает построение таблиц от зацикливания на графах с циклами.

```js
// setvar
if (node.type === 'setvar') {
  setters[id] = { variable: node.data.variable ?? '', value: node.data.value ?? '' };
  const edge = outs[0];
  const next = edge ? edge.target : null;
  transitions[id] = { default: next };
  if (next) queue.push(next);
  continue;
}

// input
if (node.type === 'input') {
  inputs[id] = { promptText: node.data.promptText ?? '', variable: node.data.variable ?? '' };
  const edge = outs[0];
  const next = edge ? edge.target : null;
  transitions[id] = { default: next };
  if (next) queue.push(next);
  continue;
}

// condition
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

Все ранние `return`-ветки `traverse` (нет Start-узла, нет исходящего ребра у Start) обновляются, чтобы возвращать новые пустые таблицы `setters/inputs/conditions`.

## Generator wiring

- `src/generator/index.js` — деструктурирует новые таблицы из `traverse()` и кладёт их в `args`.
- `src/generator/runtime.js` — `botRuntime` принимает `setters`, `inputs`, `conditions`; включает их в `_TABLES` и добавляет функции `set_var`, `check_rule`, `eval_condition`, `advance`.
- `polling.js` / `webhook.js` — без изменений (просто пробрасывают `args`).

## Рантайм (`src/generator/runtime.js`)

Новые таблицы и хелперы:

```python
SETTERS = _TABLES["SETTERS"]        # { node: {variable, value} }
INPUTS = _TABLES["INPUTS"]          # { node: {promptText, variable} }
CONDITIONS = _TABLES["CONDITIONS"]  # { node: {rules: [...]} }

def set_var(chat_id, name, value):
    prev = user_vars.get(chat_id, {})
    user_vars[chat_id] = {**prev, name: value}

def check_rule(chat_id, rule):
    left = str(user_vars.get(chat_id, {}).get(rule["variable"], ""))
    op = rule["op"]
    if op == "empty":     return left.strip() == ""
    if op == "not_empty": return left.strip() != ""
    right = render(rule["value"], chat_id)          # {{имя}} работает и здесь
    if op in ("gt", "lt", "gte", "lte"):
        try:
            l, r = float(left), float(right)
        except ValueError:
            return False
        return {"gt": l > r, "lt": l < r, "gte": l >= r, "lte": l <= r}[op]
    a, b = left.strip().lower(), right.strip().lower()
    if op == "equals":       return a == b
    if op == "not_equals":   return a != b
    if op == "contains":     return b in a
    if op == "not_contains": return b not in a
    return False

def eval_condition(chat_id, node):
    trans = TRANSITIONS.get(node, {})
    for i, rule in enumerate(CONDITIONS[node]["rules"]):
        if check_rule(chat_id, rule):
            return trans.get(f"rule_{i}")
    return trans.get("else")
```

Цикл продвижения — прогоняет проходные узлы, останавливается на ждущем и шлёт его:

```python
async def advance(context, chat_id, node):
    for _ in range(1000):                      # защита от бесконечного цикла
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
        # ждущие узлы: отправляем и запоминаем состояние
        if node in AUTH_PROMPTS:
            p = AUTH_PROMPTS[node]
            await send(context, chat_id, render(p["promptText"], chat_id), auth_markup(p))
        elif node in INPUTS:
            await send(context, chat_id, render(INPUTS[node]["promptText"], chat_id), ReplyKeyboardRemove())
        elif node in MESSAGES:
            m = MESSAGES[node]
            await send(context, chat_id, render(m["text"], chat_id), message_markup(m))
        else:
            break
        user_state[chat_id] = node
        return
    user_state[chat_id] = "start"
```

Фаза 1 в `handle()` — разрешение действия пользователя, затем один вызов `advance()`:

```python
if state == "start":
    nxt = INITIAL_NEXT
elif state in AUTH_PROMPTS:
    ...  # без изменений: contact / refused
elif state in INPUTS:
    if text is None:          # ждём именно текст; контакт/кнопки игнорируются
        return
    set_var(chat_id, INPUTS[state]["variable"], text)
    nxt = TRANSITIONS.get(state, {}).get("default")
elif state in MESSAGES:
    ...  # без изменений: data / default
else:
    return

await advance(context, chat_id, nxt)   # заменяет старый блок «if nxt in ... send»
```

Следствия:

- На `/start` `advance()` сразу прогонит любые `setvar`/`condition`, стоящие сразу за Start, и отправит первый *ждущий* узел.
- Auth продолжает писать `first_name`/`last_name`/`phone`; эти встроенные переменные доступны в условиях и подстановке.
- **Ограничение:** цикл из проходных узлов без изменения переменных упрётся в лимит 1000 итераций и сбросит состояние в `start`. На практике не встречается; защита от зависания есть.

## UI (React)

**Новые кастомные ноды React Flow** (`nodeTypes` в `App.jsx` пополняется):

- `src/components/SetVarNode.jsx` — фиолетовый; показывает `имя = значение`; `target` слева, один `source` справа (`id="default"`).
- `src/components/InputNode.jsx` — оранжевый; превью подсказки и `→ {{variable}}`; `target` слева, один `source` справа.
- `src/components/ConditionNode.jsx` — жёлтый; по образцу `MessageNode`: `target` слева, по одному `source`-порту на правило (`id="rule-0..N"`, подпись вида `age ≥ 18`), плюс порт `else` внизу.

**Палитра** (`src/components/BlockPalette.jsx`) — три новых элемента, click-to-add по существующему паттерну (нативный HTML5-drag в Electron ненадёжен, см. коммит `3b49af1`).

**Фабрика узлов** (`src/nodeFactory.js`) — `makeSetNode`, `makeInputNode`, `makeConditionNode` (условие создаётся с одним пустым правилом).

**Панель свойств** (`src/components/PropertiesPanel.jsx`) — редакторы под каждый тип:

- *setvar*: «Имя переменной» (автоподсказка) + «Значение».
- *input*: «Текст-подсказка» (textarea) + «Имя переменной» (автоподсказка).
- *condition*: редактируемый список правил (переменная / `<select>` оператора / значение), кнопки «+ правило» и «✕»; поле значения скрывается для `empty`/`not_empty`. Выход «Иначе» подразумевается всегда.

**Автоподсказка имён** — новый util `src/variables.js`:

```js
export const BUILTIN_VARS = ['first_name', 'last_name', 'phone'];

export function collectVariableNames(nodes) {
  const names = new Set(BUILTIN_VARS);
  for (const n of nodes) {
    if ((n.type === 'setvar' || n.type === 'input') && n.data.variable) {
      names.add(n.data.variable);
    }
  }
  return [...names];
}
```

Поля имён переменных используют общий `<datalist>` из этого списка. Имя, отсутствующее среди известных, подсвечивается как мягкое предупреждение (компиляцию не блокирует).

**Store** (`src/store.js`) — в `updateNodeData` добавляется ветка обрезки рёбер для `condition` (по образцу кнопок Message): валидные хендлы = `rule-0..N` + `else`; у `setvar`/`input` один выход — обрезка не нужна.

## Тестирование

**JS-юнит-тесты (Vitest):**

- `tests/generator/traverse.test.js` — таблица `setters` для setvar; `conditions` с правилами и корректными `rule_i`/`else` в `transitions`; `inputs` для input-узла.
- `tests/store.test.js` — обрезка рёбер condition при удалении правила.
- `tests/generator/polling.test.js` — сгенерированный Python содержит `SETTERS`/`CONDITIONS`/`INPUTS` и функцию `advance`.
- `tests/variables.test.js` (новый) — `collectVariableNames`: встроенные + из setvar/input, дедупликация.

**Поведенческие pytest** (`tests/py/test_bot.py`, где исполняется сгенерированный Python — главный уровень доверия):

- setvar: `Start → setvar(x="hi") → message("{{x}}")` ⇒ отправлено `"hi"`; переменная в `user_vars`.
- input: подсказка ждёт текст → пользователь пишет → текст в переменной → продвижение дальше; до ввода состояние = input-узел.
- condition: ветки `rule_0` / `else` (обе); числовой оператор (`age ≥ 18` → да/нет); текстовый `contains`.
- цепочка проходных: `Start → setvar → condition → message` за один `/start` (проверяет `advance()` насквозь).
- защита: условие с веткой в себя без изменения переменной ⇒ сброс в `start`, без зависания.

Стиль — существующий: `make_bot`, `make_update`, `sent`, `run`.

## Вне области

- Арифметика в значениях (`{{count}}+1`).
- Валидация ввода по типу (число/email/телефон) с повторным запросом.
- Реестр переменных (явное объявление) — используется свободный ввод с автоподсказкой.
- Персистентность `user_vars`/`user_state` между перезапусками (остаются в памяти процесса, как и сейчас).
