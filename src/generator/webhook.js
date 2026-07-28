import { botRuntime } from './runtime.js';

export function generateWebhook(args) {
  return `${botRuntime(args)}

def main():
    app = build_app()
    # Установите публичный HTTPS-URL вебхука в переменной окружения WEBHOOK_URL.
    webhook_url = os.environ.get("WEBHOOK_URL", "")
    print("Бот запущен (Telegram, webhook) на порту 3000...")
    app.run_webhook(
        listen="0.0.0.0",
        port=3000,
        url_path=TOKEN,
        webhook_url=webhook_url,
    )


if __name__ == "__main__":
    main()
`;
}
