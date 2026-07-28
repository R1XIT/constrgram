import { botRuntime } from './runtime.js';

export function generateWebhook(args) {
  return `${botRuntime(args)}

def main():
    app = build_app()
    # WEBHOOK_URL — публичный HTTPS-адрес вашего сервера (напр. https://example.com).
    # Токен добавляется в путь автоматически, чтобы совпасть с url_path.
    base_url = os.environ.get("WEBHOOK_URL", "").rstrip("/")
    print("Бот запущен (Telegram, webhook) на порту 3000...")
    app.run_webhook(
        listen="0.0.0.0",
        port=3000,
        url_path=TOKEN,
        webhook_url=f"{base_url}/{TOKEN}",
    )


if __name__ == "__main__":
    main()
`;
}
