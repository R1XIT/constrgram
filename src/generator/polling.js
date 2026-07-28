import { botRuntime } from './runtime.js';

export function generatePolling(args) {
  return `${botRuntime(args)}

def main():
    app = build_app()
    print("Бот запущен (Telegram, long polling). Ожидание сообщений...")
    app.run_polling()


if __name__ == "__main__":
    main()
`;
}
