# Bot Constructor → Telegram — Design Spec

**Дата:** 2026-07-28
**Статус:** Approved

---

## Обзор

Перевод визуального конструктора ботов с мессенджера **Max** на **Telegram**. Приложение (десктопный конструктор на граф-холсте) остаётся тем же; меняется только целевой мессенджер генерируемого бота. Поддержка Max убирается полностью — это не двойной таргет, а замена.

Граф-модель и алгоритм обхода сохраняются. Переписывается генератор кода: он выпускает Node.js-скрипт под **Telegram Bot API** вместо Max API.

---

## Что меняется, что остаётся

### Остаётся без изменений

Модель сценария не зависит от мессенджера:

- `src/store.js` — состояние графа (zustand), блоки и рёбра
- `src/nodeFactory.js` — фабрики блоков Start / Message / Auth
- Типы блоков и их данные: Start, Message (`text`, `buttonsEnabled`, `buttons[]`), Auth (`promptText`, `contactButtonText`, `refusalEnabled`, `refusalButtonText`)
- `tests/store.test.js`

### Переписывается

- `src/generator/polling.js` — генерирует Telegram long-polling бот
- `src/generator/webhook.js` — генерирует Telegram webhook бот
- `src/generator/traverse.js` — **одна правка**: для auth-блока refusal определяется по тексту кнопки, а не по callback-payload (см. ниже)
- `tests/generator/polling.test.js`, `tests/generator/webhook.test.js` — полностью под Telegram
- `tests/generator/traverse.test.js` — правки только в части auth-refusal
- Строки бренда «for Max» → «for Telegram», URL API
- Метаданные: `package.json` `name` → `bot-constructor-telegram`; строки в `CLAUDE.md`

---

## Маппинг Max → Telegram

| Аспект | Max (было) | Telegram (стало) |
|--------|-----------|------------------|
| API base | `https://platform-api.max.ru`, токен в заголовке `Authorization` | `https://api.telegram.org/bot<TOKEN>` |
| Отправка сообщения | `POST /messages?chat_id=`, тело с `attachments` | `POST /sendMessage`, тело `{ chat_id, text, reply_markup }` |
| Кнопки сообщения | `attachments: [{ type: 'inline_keyboard', payload: { buttons } }]` | `reply_markup: { inline_keyboard: [[{ text, callback_data }]] }` |
| Payload кнопки | `payload: "btn_0"` | `callback_data: "btn_0"` |
| Приём callback | `update.callback.payload` | `update.callback_query.data` |
| chatId сообщения | `u.chat_id` | `update.message.chat.id` |
| chatId callback | из `u.chat_id` | `update.callback_query.message.chat.id` |
| Поллинг | `GET /updates?timeout=30&marker=` | `GET /getUpdates?timeout=30&offset=` |
| Курсор поллинга | `marker` из ответа | `offset = max(update_id) + 1` |
| Подтверждение callback | нет | `POST /answerCallbackQuery` (убирает «крутилку») |

### Формат тела `sendMessage`

```js
const body = { chat_id: chatId, text };
if (buttons && buttons.length > 0) {
  body.reply_markup = { inline_keyboard: buttons.map(row => [row]) };
  // либо одна кнопка в ряд: [[b1],[b2]] — по кнопке на строку
}
```

Каждая кнопка сообщения: `{ text: b.text, callback_data: b.payload }` (payload = `btn_0`, `btn_1`, …).

### Разбор апдейта

```js
// message
const chatId = u.message?.chat?.id;
const text   = u.message?.text;
const contact = u.message?.contact; // { phone_number, first_name, last_name, user_id }

// callback_query
const chatId = u.callback_query?.message?.chat?.id;
const data   = u.callback_query?.data;
```

Обрабатываются апдейты, содержащие `message` или `callback_query`; остальные игнорируются.

---

## Блок Auth (запрос контакта)

Главное отличие Telegram: кнопка «поделиться контактом» — это **reply-клавиатура** (`ReplyKeyboardMarkup`), а не inline.

### Отправка auth-промпта

```js
reply_markup: {
  keyboard: [
    [{ text: contactButton.text, request_contact: true }],
    // если refusalEnabled:
    [{ text: refusalButton.text }]
  ],
  resize_keyboard: true,
  one_time_keyboard: true
}
```

- Кнопка контакта: `{ text, request_contact: true }`.
- Кнопка отказа: обычная текстовая кнопка reply-клавиатуры (у reply-кнопок нет callback, они шлют свой текст сообщением).

### Приём результата

- **Контакт получен:** `update.message.contact` — уже структурирован. Никакого VCF-парсинга. Мапим в `userVars`:
  ```js
  { first_name: contact.first_name ?? '', last_name: contact.last_name ?? '', phone: String(contact.phone_number ?? '') }
  ```
  → переход `transitions[state].contact`.
- **Отказ:** `update.message.text === refusalButton.text` → переход `transitions[state].refused`.
- Иначе (любое другое сообщение в состоянии auth): игнор.

### Скрытие reply-клавиатуры

При отправке следующего **не-auth** сообщения после auth-состояния клавиатуру нужно убрать, иначе она «залипнет». Если у сообщения нет своих inline-кнопок, добавляем `reply_markup: { remove_keyboard: true }`. Реализация: функция `send` всегда шлёт либо inline-клавиатуру сообщения, либо `remove_keyboard: true` при её отсутствии — это чисто и не залипает.

### Правка в `traverse.js`

Сейчас auth отдаёт `refusalButton: { text, payload: 'auth_refuse_<id>' }`. Для Telegram payload не нужен — отдаём `refusalButton: { text }`. Переход `refused` матчится по тексту. Остальная логика traverse (BFS, `transitions.contact` / `transitions.refused`, очередь) не меняется.

---

## Поведение старта и токен

### Токен

В шапке генерируемого `bot.js`:

```js
const TOKEN = process.env.BOT_TOKEN || '<вшитый токен из проекта>';
```

Работает и через переменную окружения, и «из коробки» (`node bot.js`).

### /start

- В состоянии `start` любое сообщение (включая `/start`) ведёт к `INITIAL_NEXT` — как сейчас.
- Дополнительно, **глобально**: если пришёл текст `/start` в любом состоянии, `handle` сбрасывает пользователя в начало (`userState → start`) и заново запускает сценарий с `INITIAL_NEXT`. Проверка выполняется в начале `handle`, до разбора текущего состояния.

---

## Генерация кода

Алгоритм компилятора не меняется: `traverse` строит таблицы `messages` / `authPrompts` / `transitions` / `initialNext`, а `polling.js` / `webhook.js` встраивают их в шаблон Telegram-бота. Общая функция `handle(chatId, update)` идентична для обоих режимов; отличается только транспорт (цикл getUpdates vs http-сервер).

### Long Polling (`mode: "polling"`)

```js
// Generated by Bot Constructor for Telegram
const TOKEN = process.env.BOT_TOKEN || '...';
const API = `https://api.telegram.org/bot${TOKEN}`;

let offset = 0;
while (true) {
  const r = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
  if (!r.ok) { /* лог + retry 2s */ continue; }
  const { result } = await r.json();
  for (const u of result ?? []) {
    offset = u.update_id + 1;
    const chatId = u.message?.chat?.id ?? u.callback_query?.message?.chat?.id;
    if (chatId) await handle(chatId, u);
    if (u.callback_query) await answerCallback(u.callback_query.id);
  }
}
```

### Webhook (`mode: "webhook"`)

`http.createServer` на порту 3000, принимает POST от Telegram с одним `Update` в теле, отвечает 200. Та же `handle`. В шапке — комментарий: пользователь регистрирует URL через `setWebhook` и настраивает HTTPS-туннель самостоятельно.

---

## Обработка ошибок

- `sendMessage`, `getUpdates`, `answerCallbackQuery` проверяют `r.ok`; при ошибке логируют `r.status` и тело ответа.
- Поллинг: `try/catch` вокруг итерации, ретрай через 2 сек (как сейчас).
- `answerCallbackQuery` — best-effort, ошибка не роняет обработку.

---

## Тестирование

- `tests/generator/polling.test.js`, `tests/generator/webhook.test.js` — переписываются: прогоняют `generate()` на модельном проекте, `eval`/импорт сгенерированного кода в песочнице (как сейчас через `__SKIP_POLL__`), проверяют:
  - тело `sendMessage`: `chat_id`, `reply_markup.inline_keyboard`, `callback_data`
  - разбор `callback_query.data` и `message.chat.id`
  - auth: reply-клавиатура с `request_contact: true`, приём `message.contact`, отказ по тексту
  - `/start` как глобальный сброс
  - offset-курсор в polling
- `tests/generator/traverse.test.js` — правки только в auth-refusal (проверка `refusalButton.text` без payload).
- `tests/store.test.js` — не трогается.
- Механизм подавления сетевого цикла в тестах (`globalThis.__SKIP_POLL__`) сохраняется.

---

## Ограничения (вне рамок)

- Нет запуска бота из приложения
- Нет предпросмотра диалога
- Нет новых переменных/условной логики сверх существующего рендеринга `{{var}}`
- Нет работы с медиа/файлами
- Двойной таргет (Max + Telegram) не поддерживается — только Telegram
