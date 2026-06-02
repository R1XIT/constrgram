# Auth Block & Variables — Design

**Дата:** 2026-06-02
**Статус:** Утверждён
**Зависит от:** `2026-06-02-bot-constructor-design.md`

## Цель

Добавить в конструктор блок «Авторизация», который запрашивает у пользователя контакт через системную кнопку Max API `request_contact` и сохраняет `first_name`, `last_name`, `phone` в переменные. Переменные можно подставлять в текст Message-блоков по шаблону `{{var}}`.

Заодно ввести в рантайм минимальный generic-механизм переменных, чтобы будущие блоки могли использовать тот же путь без рефакторинга.

## Объём v1

**Входит:**

- Новый тип ноды `auth` с настраиваемым текстом приглашения, текстом кнопки контакта, опциональной кнопкой отказа.
- Сохранение `first_name`, `last_name`, `phone` per chatId в памяти.
- Шаблонная подстановка `{{var_name}}` в тексте Message-блоков.
- Поддержка кнопки `request_contact` в функции отправки сообщений.
- Поддержка attachment'а контакта в цикле получения update'ов (polling + webhook).

**Не входит:**

- Кастомные имена переменных в Auth-ноде (всегда фиксированные).
- Подстановка переменных в текст кнопок.
- Сохранение переменных на диск (как и `userState`, теряются при рестарте).
- Ручная правка переменных (например, set-блок).
- Валидация формата телефона.
- Проверка `hash` из контакта на криптографическую подлинность.

## Внешние контракты Max API

Подтверждено по `https://dev.max.ru/docs-api`:

- Кнопка `{ "type": "request_contact", "text": "..." }` в `inline_keyboard` запрашивает у пользователя контакт.
- При нажатии в чат приходит сообщение с `attachments`, среди которых есть `{ "type": "contact", "max_info": {...}, "vcf_info": "...", "hash": "..." }`.
- `max_info` — структурированные поля профиля; `vcf_info` — vCard-строка с `TEL`, `N`, `FN`.

Точные имена полей в `max_info` подтверждаются на первом боевом update'е при имплементации. Логика извлечения устойчива к их отсутствию: см. раздел «Извлечение полей контакта».

## Модель данных

### Формат ноды в `.json` проекта

```js
{
  id: 'auth_1',
  type: 'auth',
  position: { x: ..., y: ... },
  data: {
    promptText: '',                          // текст приглашения
    contactButtonText: 'Поделиться контактом',
    refusalEnabled: false,
    refusalButtonText: 'Отказаться'
  }
}
```

### Порты

- 1 входной (top).
- Выход `contact` — всегда. Активируется, когда контакт получен.
- Выход `refused` — присутствует только при `refusalEnabled === true`. Активируется при нажатии кнопки отказа.

React Flow `sourceHandle`: `contact`, `refused`.

## UI

### Палитра блоков

К существующему «Сообщению» добавляется пункт «Авторизация». Перетаскивается на холст так же, как Message.

### `AuthNode.jsx` (новая кастомная нода)

Визуально отличается цветом от Message (предлагаемый цвет — фиолетовый, финально определяется при имплементации; не влияет на поведение). Показывает:

- Заголовок «Авторизация».
- Превью `promptText` (одна-две строки с многоточием).
- Хинт внизу: `→ {{first_name}}, {{last_name}}, {{phone}}`.
- Один или два output-handle (в зависимости от `refusalEnabled`).

### Панель свойств для auth-ноды

При выборе auth-ноды правая панель показывает:

- Textarea «Текст приглашения» → `data.promptText`.
- Input «Текст кнопки контакта» → `data.contactButtonText` (плейсхолдер «Поделиться контактом»).
- Тумблер «Показать кнопку отказа» → `data.refusalEnabled`.
- Input «Текст кнопки отказа» → `data.refusalButtonText` (виден только при включённом тумблере; плейсхолдер «Отказаться»).
- Информационная плашка: «Этот блок задаёт переменные: `{{first_name}}`, `{{last_name}}`, `{{phone}}` — используйте их в тексте сообщений».

### Pruning повисших рёбер

При выключении `refusalEnabled` все рёбра с `sourceHandle === 'refused'` для этой ноды удаляются — тем же механизмом, что уже применён для кнопок Message в коммите `a39bf84`.

## Генератор

### `traverse.js`

При обходе графа auth-нода обрабатывается отдельным веткой: в результат добавляется новая таблица `authPrompts` и кладутся правильные переходы.

Возвращаемая структура расширяется:

```js
{
  messages,        // как сейчас
  authPrompts,     // новое: nodeId -> { promptText, contactButton, refusalButton }
  transitions,    // расширено: для auth-нод ключи 'contact' и (опц.) 'refused'
  initialNext
}
```

Форма `authPrompts[id]`:

```js
{
  promptText: '...',
  contactButton: { text: '...' },
  refusalButton: { text: '...', payload: 'auth_refuse_<nodeId>' }  // null, если выключено
}
```

Форма `transitions[id]` для auth-ноды: `{ contact: <nextId|null>, refused: <nextId|null> }`. Ключ `refused` отсутствует, если кнопка выключена.

BFS-очередь должна засовывать таргеты обоих выходов (contact и refused), если они есть.

### `polling.js` / `webhook.js` — шаблон рантайма

В сгенерированный `bot.js` добавляется:

```js
const AUTH_PROMPTS = { /* ... */ };
const userVars = new Map();        // chatId -> Record<string, string>

function render(text, chatId) {
  const vars = userVars.get(chatId) ?? {};
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => vars[name] ?? '');
}
```

Функция `send` расширяется: вместо массива `{ text, payload }` принимает массив элементов с явным `type`:

```js
buttons: [
  { type: 'request_contact', text: '...' },
  { type: 'callback', text: '...', payload: '...' }
]
```

Каждый элемент кладётся в `attachments[0].payload.buttons[0]` как есть (для `request_contact` поле `payload` отсутствует).

### Сигнатура `handle`

Меняется с `handle(chatId, payload)` на `handle(chatId, update)`. Разбор update'а (callback / контакт / текст) переезжает внутрь функции, где он привязан к текущему `state`.

Алгоритм:

1. `state = userState.get(chatId) ?? 'start'`.
2. Определить `next` по состоянию:
   - Если `state === 'start'` → `next = INITIAL_NEXT`.
   - Если `state in AUTH_PROMPTS` (мы стоим на auth-ноде, ждём ответ пользователя):
     - Если в `update.message?.body?.attachments` (точное поле — `body.attachments` или `attachments` — уточняется на боевых update'ах при имплементации) есть элемент `{ type: 'contact' }`:
       - Извлечь `{first_name, last_name, phone}` (см. «Извлечение полей контакта»).
       - Записать в `userVars.get(chatId)` (создать объект, если нет).
       - `next = TRANSITIONS[state].contact`.
     - Иначе если update — callback с `payload === 'auth_refuse_' + state`:
       - `next = TRANSITIONS[state].refused ?? null`.
     - Иначе (текст, geo, что угодно) — `return` без изменения состояния.
   - Иначе (`state in MESSAGES`, обычная message-нода):
     - `payload = update.callback?.payload ?? update.message_callback?.payload`.
     - `next = TRANSITIONS[state][payload] ?? TRANSITIONS[state].default ?? null`.
3. Если `next === null` → `userState.set(chatId, 'start')`, `return`.
4. Отправить следующее сообщение:
   - Если `next in AUTH_PROMPTS`: собрать кнопки (см. «Старт auth-ноды»), отправить `prompt.promptText` через `send`.
   - Иначе (`next in MESSAGES`): отправить `render(MESSAGES[next].text, chatId)` с кнопками сообщения.
5. Обновить `userState`: если у `next` есть исходящие переходы (auth — `contact` или `refused`; message — любой ключ) — сохранить `next`, иначе сбросить в `'start'`.

### Старт auth-ноды

При переходе в состояние, указывающее на auth-ноду, бот отправляет `promptText` с массивом кнопок:

```js
const buttons = [
  { type: 'request_contact', text: prompt.contactButton.text }
];
if (prompt.refusalButton) {
  buttons.push({ type: 'callback', text: prompt.refusalButton.text, payload: prompt.refusalButton.payload });
}
```

`userState.set(chatId, authNodeId)` — как и для Message-нод.

### Извлечение полей контакта

Извлекатель в сгенерированном `bot.js`:

```js
function extractContact(att) {
  const m = att.max_info ?? {};
  const vcf = parseVcf(att.vcf_info ?? '');
  return {
    first_name: m.first_name ?? vcf.first ?? vcf.fn ?? '',
    last_name:  m.last_name  ?? vcf.last  ?? '',
    phone:      m.phone      ?? vcf.tel   ?? ''
  };
}
```

`parseVcf` — построчный парсер: для каждой строки вида `KEY:VALUE` (с возможными параметрами после `;`) сохраняем значение. Из `N:Last;First;...` достаём `last`/`first`, из `FN:...` — `fn`, из `TEL:...` (с любыми параметрами) — `tel`.

### Цикл получения update'ов

В `polling.js` и `webhook.js` сейчас:

```js
const payload = u.callback?.payload ?? u.message_callback?.payload;
await handle(chatId, payload);
```

Меняется на:

```js
await handle(chatId, u);
```

Разбор того, что пришло (callback, контакт, текст), переезжает внутрь `handle` — там он уже привязан к текущему состоянию.

Фильтр `update_type` остаётся: `message_created` и `message_callback`.

## Граничные случаи

| Сценарий | Поведение |
|----------|-----------|
| Текст вместо контакта в auth-state | Бот молчит, состояние не меняется. |
| Контакт пришёл не в auth-state | Игнорируется. |
| Шаблон `{{unknown}}` | Подставляется пустая строка. |
| Повторный заход в Auth-блок | Переменные перезаписываются. |
| Несколько Auth-блоков | Пишут в общий `userVars`, ключи одинаковые → перезапись. |
| Перезапуск bot.js | `userVars` и `userState` теряются. Комментарий в шапке `bot.js`. |
| Auth-нода без исходящих рёбер из `contact` | После контакта `userState` сбрасывается в `start` (как сейчас у Message). |
| `refusalEnabled = false` | Кнопки нет → callback не приходит → ветка `refused` отсутствует в `TRANSITIONS`. |
| Выключение тумблера при наличии ребра `refused` | Ребро удаляется при изменении data (pruning, как для buttons). |

## Тестирование

### `tests/traverse.test.js`

- Auth-нода → запись в `authPrompts` с правильным текстом, кнопкой контакта, кнопкой отказа (включена/выключена).
- `transitions[authId]` содержит ключи `contact` (всегда) и `refused` (только при включённом тумблере).
- BFS обходит таргеты обоих выходов.

### `tests/generator.test.js`

- Сгенерированный `bot.js` содержит таблицу `AUTH_PROMPTS`, `userVars`, `render`, `extractContact`, `parseVcf`.
- Кнопка `request_contact` корректно сериализуется (`payload` отсутствует).

### `tests/runtime.test.js` (новый)

Импортируется сгенерированный `bot.js` под `globalThis.__SKIP_POLL__ = true`, `fetch` подменяется на сборщик вызовов. Сценарии:

1. **Старт → Auth**: бот отправляет `promptText` с одной (или двумя) кнопками.
2. **Контакт получен**: подаём update с attachment'ом контакта → `userVars.get(chatId)` содержит три поля → следующее сообщение содержит подставленные значения вместо `{{first_name}}`.
3. **Отказ**: подаём callback с `auth_refuse_*` → бот идёт в ветку `refused`.
4. **Текст вместо контакта**: подаём update с текстом → `fetch` не вызывается, состояние не меняется.
5. **Подстановка неизвестной переменной**: `{{nothing}}` → пустая строка в отправленном тексте.

## Открытые вопросы (фиксируются при имплементации)

- Точное имя поля для attachments в Max update'е: `message.body.attachments` vs `message.attachments`. Решается чтением одного боевого update'а.
- Точные имена полей в `max_info`: `first_name`/`last_name`/`phone` или иные. Если иные — обновляется `extractContact`.

Обе детали не блокируют дизайн: устойчивая реализация работает через цепочку fallback'ов (`max_info → vcf → ''`).

## Следующий шаг

Запустить `writing-plans` skill для создания пошагового плана реализации по этому спеку.
