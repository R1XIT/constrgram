# Bot Constructor для Telegram — Project Context

## Что это

Десктопное EXE-приложение — визуальный блочный конструктор ботов для мессенджера Telegram (https://core.telegram.org/bots/api). Пользователь строит сценарий бота на граф-холсте и компилирует в готовый Python-скрипт на python-telegram-bot.

## Статус проекта

**Фаза:** Дизайн завершён, реализация не начата.

Полный дизайн-спек: `docs/superpowers/specs/2026-06-02-bot-constructor-design.md`

## Ключевые решения

| Решение | Выбор |
|---------|-------|
| Десктоп-оболочка | Electron |
| UI | React + Vite |
| Граф-редактор | React Flow |
| Сборка EXE | electron-builder |
| Генерируемый код | Python 3.10+ (python-telegram-bot v21+) |

## Структура приложения

```
electron (main.js)
├── Файловые диалоги (save/open .json проекта, save bot.js)
└── IPC с renderer

react renderer
├── Toolbar (токен, режим, кнопки)
├── Палитра блоков (левая панель)
├── Холст React Flow (центр)
└── Панель свойств блока (правая панель)
```

## Блоки

### Start (зелёный)
- Автосоздаётся при новом проекте, не удаляется
- Нет входных портов, 1 выходной порт
- Не редактируется

### Message (синий)
- Перетаскивается из палитры на холст
- 1 входной порт
- Свойства: `text`, `buttonsEnabled`, `buttons[]`
- Если `buttonsEnabled = false`: 1 выходной порт
- Если `buttonsEnabled = true`: по 1 выходному порту на каждую кнопку
- Payload кнопок автогенерируется: `btn_0`, `btn_1`, ...

## Формат проекта (.json)

```json
{
  "version": "1.0",
  "token": "токен_бота",
  "mode": "polling",
  "nodes": [ /* React Flow nodes */ ],
  "edges": [ /* React Flow edges */ ]
}
```

`mode`: `"polling"` | `"webhook"`

## Генерация bot.js

**Алгоритм:** BFS от Start-ноды → каждая нода = состояние → `handle(chatId, payload)` с if/else по состояниям → `userState: Map<chatId, state>`.

**Long Polling:** `Application.run_polling()` из python-telegram-bot

**Webhook:** `Application.run_webhook(port=3000, ...)`; публичный HTTPS-URL берётся из `WEBHOOK_URL`

Скрипт запускается как `python bot.py` (нужен `pip install python-telegram-bot`). Токен — из `BOT_TOKEN` или вшитый.

## Тулбар

- Поле токена (маскированное) — изменяется в любой момент
- Dropdown режима (Long Polling / Webhook) — изменяется в любой момент
- Кнопка «Сохранить» → `dialog.showSaveDialog` → `.json`
- Кнопка «Открыть» → `dialog.showOpenDialog` → загружает `.json`
- Кнопка «Компилировать» → генерирует `bot.js` → `dialog.showSaveDialog`

## Что НЕ входит в v1

- Запуск бота прямо из приложения
- Предпросмотр диалога
- Переменные и условная логика
- Блок «Ввод пользователя» (только кнопки)

## Следующий шаг

Запустить `/comet-build` или `writing-plans` для создания плана реализации по спеку `docs/superpowers/specs/2026-06-02-bot-constructor-design.md`.
