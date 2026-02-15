# Earn BTC Signal Bot 🖤

DiscordからBTCシグナル（例: \"BUY BTC @ $60k\"）を受信し、取引所APIで自動実行するボット。

## Features (Planned)
- Discordメッセージ解析
- CCXT経由の取引所トレード (Binance/Bybitなど)
- リスク管理 (position size, stop loss)
- Telegram通知

## Quick Start
1. Discord Bot作成: https://discord.com/developers/applications
2. Botをサーバーに招待 (Message Content intent ON)
3. `npm install discord.js ccxt dotenv`
4. `.env`設定
5. `npm start`

## .env Example
```
DISCORD_TOKEN=your_discord_bot_token
EXCHANGE=binance  # or bybit
API_KEY=xxx
API_SECRET=xxx
```

## Signal Format
- BUY BTCUSDT 60000 (market)
- SELL BTC 0.01 55000 (limit)

TODO: Signal parser実装。

Review & mergeお願い！