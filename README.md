# btc-signal-bot

Discord + Telegram BTC シグナル配信ボット (#BTCto70k) -- サブスク $5/月

## 概要

BTC (Bitcoin) の価格シグナルを **Discord** と **Telegram** で配信するボット。
Binance API でリアルタイム価格を監視し、売買シグナルを自動生成してサブスクライバーに配信する。

- **マルチプラットフォーム**: Discord + Telegram 両対応 (どちらか片方のみでも動作)
- **シグナル配信**: BTC 価格の変動分析に基づく BUY/SELL シグナル
- **トレード実行**: Discord/Telegram からコマンドで Binance 発注
- **サブスクリプション**: $5/月 の有料シグナルサービス
- **ハッシュタグ**: #BTCto70k

## 技術スタック

| 技術 | 用途 |
|------|------|
| Node.js | ランタイム |
| discord.js | Discord Bot |
| grammy | Telegram Bot |
| ccxt (Binance) | 価格データ取得・トレード実行 |
| Express | Webhook / 決済エンドポイント |
| dotenv | 環境変数管理 |

## ファイル構成

```
src/
  index.js          エントリポイント (両Bot起動)
  exchange.js       Binance 接続 (ccxt)
  signal.js         価格監視 + シグナル生成
  discord-bot.js    Discord Bot
  telegram-bot.js   Telegram Bot
config/
  .env.example      環境変数テンプレート
docs/
  GUIDE.md          開発ガイド・仕様書
  USAGE.md          利用ガイド
```

## セットアップ

### 1. クローン & インストール

```bash
git clone https://github.com/hiroyafushimi/earn-btc-signal-bot.git
cd earn-btc-signal-bot
npm i
```

### 2. Discord Bot (任意)

1. https://discord.com/developers/applications で Bot 作成
2. Bot tab で Message Content Intent ON
3. OAuth2 で bot scope + Send/Read 権限でサーバー招待
4. トークンを `.env` に設定

### 3. Telegram Bot (任意)

1. [@BotFather](https://t.me/BotFather) で `/newbot` → トークン取得
2. トークンを `.env` に設定

### 4. Binance API

1. [Binance Testnet](https://testnet.binance.vision) で API キー作成 (開発用)
2. 本番は [Binance](https://www.binance.com) で API キー作成
3. `.env` に設定

### 5. 環境変数 (.env)

```bash
cp config/.env.example .env
# .env を編集
```

```
# Discord (任意)
DISCORD_TOKEN=your_discord_bot_token
DISCORD_SIGNAL_CHANNEL_ID=your_channel_id

# Telegram (任意)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHANNEL_ID=your_channel_id

# Binance
EXCHANGE=binance
API_KEY=your_api_key
API_SECRET=your_api_secret
SANDBOX=true

# Trade
PROCESSING_AMOUNT=0.001
RISK_PCT=0.01

# Signal
SIGNAL_INTERVAL=60000
```

Discord / Telegram はどちらか一方のトークンのみ設定すれば、そのプラットフォームだけで動作する。

### 6. 起動

```bash
npm start
```

## 使い方

### Discord

| コマンド | 説明 |
|----------|------|
| `!ping` | 疎通確認 |
| `!price` | BTC/USDT 現在価格 |
| `!trade buy` | BTC 買い注文 |
| `!trade sell` | BTC 売り注文 |
| 🚀 / buy / 買い | 自動 BUY 検出 |
| sell / 売り | 自動 SELL 検出 |

### Telegram

| コマンド | 説明 |
|----------|------|
| `/start` | ウェルカムメッセージ |
| `/price` | BTC/USDT 現在価格 |
| `/status` | Bot ステータス |
| `/subscribe` | サブスク登録 ($5/月) |
| `/help` | ヘルプ |

## 収益モデル

| プラン | 価格 | 内容 |
|--------|------|------|
| Monthly | $5/月 | BTC シグナル全配信 (Discord + Telegram) |

## ドキュメント

- [開発ガイド・仕様書](docs/GUIDE.md)
- [利用ガイド](docs/USAGE.md)

## 警告

- 投資判断は自己責任
- シグナルは参考情報であり、利益を保証するものではない
- 金融関連法規を遵守すること
