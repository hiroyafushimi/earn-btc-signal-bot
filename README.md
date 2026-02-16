# btc-signal-bot

Discord + Telegram BTC シグナル配信ボット (#BTCto70k) -- サブスク $5/月

## 概要

BTC の価格シグナルを **Discord** と **Telegram** で配信するボット。
Binance API でリアルタイム価格を監視し、テクニカル指標 (SMA, RSI) に基づく売買シグナルを自動生成してサブスクライバーに配信する。

- **マルチプラットフォーム**: Discord + Telegram 両対応 (片方のみでも動作)
- **テクニカル分析**: SMA クロスオーバー + RSI + 複数時間足確認
- **シグナル配信**: スコアリングに基づく BUY/SELL シグナル (根拠付き)
- **トレード実行**: コマンドで Binance 発注 (管理者権限制限あり)
- **サブスクリプション**: Stripe 連携で $5/月
- **運用機能**: ヘルスチェック、ログ、リトライ、レート制限、PM2/Docker 対応

## 技術スタック

| 技術 | 用途 |
|------|------|
| Node.js | ランタイム |
| discord.js | Discord Bot |
| grammy | Telegram Bot |
| ccxt (Binance) | 価格データ・OHLCV 取得・トレード実行 |
| Express | ヘルスチェック / Stripe Webhook |
| Stripe | サブスクリプション決済 |

## ファイル構成

```
src/
  index.js          エントリポイント (Express + graceful shutdown)
  logger.js         タイムスタンプ付きロガー
  exchange.js       Binance 接続 (ccxt + リトライ)
  indicators.js     テクニカル分析 (SMA, RSI, クロスオーバー)
  signal.js         価格監視 + シグナル生成 + 履歴保存
  discord-bot.js    Discord Bot
  telegram-bot.js   Telegram Bot
  subscription.js   Stripe 決済 + ユーザー管理
  rate-limit.js     コマンドレート制限
config/
  .env.example      環境変数テンプレート
data/               (自動生成, gitignore)
  signals.json      シグナル履歴
  subscribers.json  サブスクライバー情報
ecosystem.config.js PM2 設定
Dockerfile          Docker デプロイ用
```

## セットアップ

### 1. クローン & インストール

```bash
git clone https://github.com/hiroyafushimi/earn-btc-signal-bot.git
cd earn-btc-signal-bot
npm i
```

### 2. 環境変数

```bash
cp config/.env.example .env
```

`.env` を編集:

```
# Discord (任意)
DISCORD_TOKEN=your_token
DISCORD_SIGNAL_CHANNEL_ID=your_channel_id

# Telegram (任意)
TELEGRAM_BOT_TOKEN=123456:ABC-xxx
TELEGRAM_CHANNEL_ID=your_channel_id

# Binance
EXCHANGE=binance
API_KEY=your_key
API_SECRET=your_secret
SANDBOX=true

# Admin (カンマ区切り、空=全員トレード可能)
ADMIN_DISCORD_IDS=
ADMIN_TELEGRAM_IDS=

# Stripe (任意)
STRIPE_SECRET_KEY=sk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
SUBSCRIPTION_PRICE=5
BASE_URL=http://localhost:3000
```

### 3. 起動

```bash
npm start
```

### デプロイ (PM2)

```bash
npm i -g pm2
pm2 start ecosystem.config.js
pm2 save
```

### デプロイ (Docker)

```bash
docker build -t btc-signal-bot .
docker run -d --env-file .env -p 3000:3000 btc-signal-bot
```

## コマンド

### Discord

| コマンド | 説明 |
|----------|------|
| `!ping` | 疎通確認 |
| `!price` | BTC/USDT 現在価格 |
| `!status` | Bot ステータス |
| `!history` | 直近シグナル (5件) |
| `!subscribe` | サブスク登録 ($5/月) |
| `!trade buy/sell` | BTC トレード (管理者のみ) |

### Telegram

| コマンド | 説明 |
|----------|------|
| `/start` | ウェルカム |
| `/price` | BTC/USDT 現在価格 |
| `/status` | Bot ステータス |
| `/history` | 直近シグナル (5件) |
| `/subscribe` | サブスク登録 ($5/月) |
| `/help` | ヘルプ |

## シグナル

テクニカル指標 (SMA5/20 クロスオーバー, RSI14) + 1h 足確認のスコアリング判定。

```
#BTCto70k シグナル

方向: BUY
通貨: BTC/USDT
価格: $68,302
ターゲット: $70,351
ストップロス: $66,936
リスク: 1%
強度: 4/6

根拠:
  - RSI 28.5 (売られすぎ)
  - SMA ゴールデンクロス
  - 1h足でも同方向
```

## API

| エンドポイント | 説明 |
|----------------|------|
| `GET /health` | Bot ステータス JSON |
| `POST /webhook/stripe` | Stripe Webhook |

## ドキュメント

- [開発ガイド・仕様書](docs/GUIDE.md)
- [利用ガイド](docs/USAGE.md)
- [テスト手順書](docs/TESTING.md)
- [運用マニュアル](docs/OPERATIONS.md)

## 警告

- 投資判断は自己責任
- シグナルは参考情報であり、利益を保証するものではない
- 金融関連法規を遵守すること
