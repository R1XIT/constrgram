# Bot Constructor → Telegram (Python) — Design Spec

**Дата:** 2026-07-28
**Статус:** Approved

---

## Обзор

Перевод визуального конструктора ботов с мессенджера **Max** на **Telegram**, при этом генерируемый бот компилируется в **Python** на базе библиотеки **python-telegram-bot (PTB)** (а не в Node.js). Приложение-конструктор (граф-холст) остаётся тем же; меняется только целевой мессенджер и язык выходного скрипта.

Граф-модель и алгоритм обхода сохраняются. Переписывается генератор кода: он выпускает Python-скрипт `bot.py` под Telegram Bot API через PTB.

---

## Что меняется, что остаётся

### Остаётся без изменений

Модель сценария не зависит ни от мессенджера, ни от целевого языка:

- `src/store.js` — состояние графа (zustand), блоки и рёбра
- `src/nodeFactory.js` — фабрики блоков Start / Message / Auth
- Типы блоков и их данные: Start, Message (`text`, `buttonsEnabled`, `buttons[]`), Auth (`promptText`, `contactButtonText`, `refusalEnabled`, `refusalButtonText`)
- `tests/store.test.js`

### Переписывается

- `src/generator/runtime.js` (**новый**) — строит общий Python-пролог (таблицы, `render`, `handle`, разметка клавиатур)
- `src/generator/polling.js` — добавляет запуск PTB `run_polling`
- `src/generator/webhook.js` — добавляет запуск PTB `run_webhook`
- `src/generator/traverse.js` — **одна правка**: refusal-кнопка отдаётся как `{ text }` без `payload` (в Telegram reply-кнопка шлёт текст, не callback)
- Строки бренда, метаданные (`package.json`, `CLAUDE.md`)

### Добавляется

- `scripts/generate.mjs` — CLI-обёртка над `generate()` для pytest (project JSON → Python в stdout)
- `tests/py/conftest.py` + `tests/py/test_bot.py` — поведенческие pytest-тесты сгенерированного бота
- Структурные проверки генератора остаются на vitest (`tests/generator/*`)

---

## Целевая среда генерируемого бота

- **Python 3.10+**, **python-telegram-bot v21+**, **pytest** (для тестов).
- Пользователь ставит зависимость сам: в шапке `bot.py` — комментарий `# pip install python-telegram-bot`.
- Токен: `TOKEN = os.environ.get("BOT_TOKEN") or "<вшитый токен>"`.
- Состояние (`user_state`) и переменные (`user_vars`) — в памяти процесса (обычные `dict`), без PTB persistence. Теряются при перезапуске (паритет с текущим поведением).

---

## Архитектура генерируемого `bot.py`

Наш конечный автомат (состояние по `chat_id`) реализуется поверх PTB одним диспетчером `handle`, зарегистрированным на все нужные типы апдейтов:

```python
app.add_handler(CommandHandler("start", handle))
app.add_handler(MessageHandler(filters.CONTACT, handle))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle))
app.add_handler(CallbackQueryHandler(handle))
```

PTB останавливается на первом сработавшем хендлере в группе по умолчанию, поэтому каждый апдейт попадает ровно в один `handle`.

### Маппинг возможностей

| Аспект | Реализация |
|--------|-----------|
| Отправка | `await context.bot.send_message(chat_id=chat_id, text=text, reply_markup=markup)` |
| Inline-кнопки сообщения | `InlineKeyboardMarkup([[InlineKeyboardButton(b["text"], callback_data=b["payload"])], ...])` |
| Запрос контакта | `ReplyKeyboardMarkup([[KeyboardButton(text, request_contact=True)]], resize_keyboard=True, one_time_keyboard=True)` |
| Кнопка отказа | обычная `KeyboardButton(text)` во второй строке reply-клавиатуры |
| Скрыть reply-клавиатуру | `ReplyKeyboardRemove()` (когда у сообщения нет inline-кнопок) |
| Приём контакта | `update.message.contact` → `.first_name`, `.last_name`, `.phone_number` |
| Приём callback | `update.callback_query.data`; подтверждение `await update.callback_query.answer()` |
| chat_id | `update.effective_chat.id` |
| Long Polling | `app.run_polling()` |
| Webhook | `app.run_webhook(listen="0.0.0.0", port=3000, url_path=TOKEN, webhook_url=os.environ["WEBHOOK_URL"])` |

### Точка входа

Запуск бота — строго под `if __name__ == "__main__":`, чтобы импорт модуля в тестах не поднимал Application и не начинал polling.

### Встраивание таблиц данных

Таблицы (`MESSAGES`, `AUTH_PROMPTS`, `TRANSITIONS`, `INITIAL_NEXT`) встраиваются как одна JSON-строка и парсятся в рантайме:

```python
_TABLES = json.loads("""{...}""")
MESSAGES = _TABLES["MESSAGES"]
AUTH_PROMPTS = _TABLES["AUTH_PROMPTS"]
TRANSITIONS = _TABLES["TRANSITIONS"]
INITIAL_NEXT = _TABLES["INITIAL_NEXT"]
```

Это исключает проблемы `true/false/null` → `True/False/None` и экранирования. В генераторе строка получается двойным кодированием: `json.loads(${JSON.stringify(JSON.stringify(tables))})` — JSON-строка литерала валидна и как Python-строка.

---

## Логика `handle(update, context)`

Псевдокод (порядок сохраняет семантику текущего JS-обработчика):

```python
async def handle(update, context):
    if update.callback_query:
        await update.callback_query.answer()
    chat_id = update.effective_chat.id
    message = update.message
    text = message.text if message else None
    contact = message.contact if message else None
    data = update.callback_query.data if update.callback_query else None

    if text == "/start":
        user_state[chat_id] = "start"          # глобальный сброс
    state = user_state.get(chat_id, "start")
    nxt = None

    if state == "start":
        nxt = INITIAL_NEXT
    elif state in AUTH_PROMPTS:
        prompt = AUTH_PROMPTS[state]
        if contact:
            prev = user_vars.get(chat_id, {})
            user_vars[chat_id] = {**prev,
                "first_name": contact.first_name or "",
                "last_name": contact.last_name or "",
                "phone": str(contact.phone_number or "")}
            nxt = TRANSITIONS.get(state, {}).get("contact")
        elif prompt.get("refusalButton") and text == prompt["refusalButton"]["text"]:
            nxt = TRANSITIONS.get(state, {}).get("refused")
        else:
            return
    elif state in MESSAGES:
        if contact:
            return
        trans = TRANSITIONS.get(state)
        if not trans:
            return
        nxt = trans.get(data)                  # None → default (эквивалент JS ??)
        if nxt is None:
            nxt = trans.get("default")
    else:
        return

    if not nxt:
        user_state[chat_id] = "start"
        return

    if nxt in AUTH_PROMPTS:
        prompt = AUTH_PROMPTS[nxt]
        await send(context, chat_id, render(prompt["promptText"], chat_id), auth_markup(prompt))
    elif nxt in MESSAGES:
        m = MESSAGES[nxt]
        await send(context, chat_id, render(m["text"], chat_id), message_markup(m))
    else:
        user_state[chat_id] = "start"
        return

    next_trans = TRANSITIONS.get(nxt)
    has_any = bool(next_trans) and any(next_trans.values())
    user_state[chat_id] = nxt if has_any else "start"
```

Вспомогательные:
- `render(text, chat_id)` — подстановка `{{var}}` из `user_vars` через `re.sub`; неизвестная переменная → `""`.
- `message_markup(msg)` → `InlineKeyboardMarkup` или `ReplyKeyboardRemove()` если кнопок нет.
- `auth_markup(prompt)` → `ReplyKeyboardMarkup` с `request_contact` (+ строка отказа).
- `send(context, chat_id, text, markup)` → `await context.bot.send_message(...)`.

---

## Правка в `traverse.js`

Сейчас auth отдаёт `refusalButton: { text, payload: "auth_refuse_<id>" }`. Для Telegram payload не нужен: отдаём `refusalButton: { text }`. Переход `refused` матчится по тексту кнопки в `handle`. Остальная логика traverse (BFS, `transitions.contact`/`transitions.refused`, кнопки сообщений `btn_i`) не меняется.

---

## Поведение старта и токен

- В состоянии `start` любое сообщение (включая `/start`) ведёт к `INITIAL_NEXT`.
- Глобально: `/start` в любом состоянии сбрасывает `user_state[chat_id] = "start"` в начале `handle`, после чего сценарий стартует заново.
- Токен: `os.environ.get("BOT_TOKEN")` с fallback на вшитый — работает и из env, и «из коробки».

---

## Тестирование

### Поведенческие (pytest) — логика бота

- `scripts/generate.mjs`: CLI над `generate()` — читает путь к project JSON из argv, печатает Python-код в stdout.
- `tests/py/conftest.py`: фикстура `make_bot(project: dict)` — пишет project во временный JSON, запускает `node scripts/generate.mjs <json>` через `subprocess`, сохраняет вывод во временный `.py`, импортирует его `importlib`, возвращает модуль (с `handle`, `user_state`, `user_vars`).
- Фейки: `update`/`context` собираются на `types.SimpleNamespace` + `unittest.mock.AsyncMock` (`context.bot.send_message`, `callback_query.answer`). Проверяются kwargs `send_message` и структура `reply_markup` (через атрибуты `inline_keyboard`/`keyboard`, `isinstance(..., ReplyKeyboardRemove)`).
- Покрытие: routing start→message, inline-кнопки, `{{var}}` и пустая переменная, auth (reply-клавиатура с `request_contact`, строка отказа), приём контакта → `user_vars` + переход, отказ по тексту, игнор постороннего текста в auth, игнор контакта в message-состоянии, `/start` как глобальный сброс, скрытие клавиатуры `ReplyKeyboardRemove`.
- Требуется в окружении: Python 3.10+, python-telegram-bot v21+, pytest, Node.js (для генерации).

### Структурные (vitest) — генератор и граф

- `tests/generator/traverse.test.js` — правки только в auth-refusal (`refusalButton.text` без payload).
- `tests/generator/*` для polling/webhook сводятся к структурным проверкам: `generate()` для `mode:"polling"` содержит `run_polling`, для `mode:"webhook"` — `run_webhook`; наличие `import`-строк PTB, `json.loads`, `if __name__`.
- `tests/store.test.js` — не трогается.

---

## Ограничения (вне рамок)

- Нет запуска бота из приложения
- Нет предпросмотра диалога
- Нет новой переменной/условной логики сверх `{{var}}`
- Нет работы с медиа/файлами
- Нет двойного таргета (Max/Node) — только Telegram/Python
- Не используется `ConversationHandler`/persistence PTB — состояние в памяти
