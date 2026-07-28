# Bot Constructor для Telegram

Десктопное приложение — визуальный блочный конструктор ботов для **Telegram**. Сценарий бота собирается на граф-холсте перетаскиванием/кликом блоков, а затем компилируется в готовый Python-скрипт на [python-telegram-bot](https://docs.python-telegram-bot.org/).

## Возможности

- Граф-редактор сценария на [React Flow](https://reactflow.dev/)
- Блоки:
  - **Start** — точка входа
  - **Message** — сообщение с необязательными inline-кнопками (ветвление по кнопкам)
  - **Auth** — запрос контакта (reply-кнопка `request_contact`) с необязательной кнопкой отказа
- Переменные в тексте: `{{first_name}}`, `{{last_name}}`, `{{phone}}` — подставляются из полученного контакта
- Команда `/start` сбрасывает диалог в начало
- Два режима запуска бота: **Long Polling** и **Webhook**
- Сохранение/загрузка проекта в `.json`, компиляция в `bot.py`

## Как это работает

Граф обходится в ширину от Start-ноды, каждая нода становится состоянием конечного автомата (`user_state` по `chat_id`). Генератор собирает Python-скрипт на PTB: `Application` + один диспетчер `handle`, регистрируемый на команды, сообщения, контакты и callback-кнопки.

## Запуск приложения (разработка)

Нужен Node.js 18+.

```bash
npm install
npm run dev        # Vite + Electron с hot-reload
```

Сборка установщика (Windows, NSIS):

```bash
npm run build:exe  # результат в release/
```

## Запуск сгенерированного бота

1. Установите Python 3.10+ и зависимость:
   ```bash
   pip install python-telegram-bot
   ```
2. Получите токен у [@BotFather](https://t.me/BotFather).
3. Запустите:
   ```bash
   # токен можно вписать в приложении перед компиляцией — тогда он уже зашит в bot.py
   BOT_TOKEN="123456789:AAE..." python bot.py
   ```
   В режиме **Webhook** дополнительно задайте `WEBHOOK_URL` (публичный HTTPS-адрес), бот слушает порт `3000`.

## Тесты

```bash
npm test                     # vitest: граф, traverse, генератор, палитра
python -m pytest tests/py    # поведенческие тесты сгенерированного бота (нужен python-telegram-bot)
```

## Стек

| Слой | Технология |
|------|-----------|
| Десктоп-оболочка | Electron |
| UI | React + Vite |
| Граф-редактор | React Flow |
| Состояние | Zustand |
| Сборка EXE | electron-builder |
| Генерируемый код | Python 3.10+ / python-telegram-bot v20+ |
