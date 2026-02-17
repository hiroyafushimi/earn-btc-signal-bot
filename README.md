# btc-signal-bot

仮想通貨シグナル配信ボット -- サブスク $5/月

## 概要

仮想通貨の価格シグナルを **Discord**・**Telegram**・**TUI (ターミナル)** で配信するボット。
ccxt 経由で取引所 API に接続し、テクニカル指標 (SMA, RSI) に基づく売買シグナルを自動生成してサブスクライバーに配信する。

- **マルチ取引所**: bitbank (推奨)、Binance 等 ccxt 対応取引所
- **マルチ通貨ペア**: BTC/JPY, ETH/JPY, XRP/JPY 等を同時監視
- **マルチプラットフォーム**: Discord + Telegram + TUI 対応 (任意の組み合わせ)
- **テクニカル分析**: SMA クロスオーバー + RSI + 複数時間足確認
- **シグナル配信**: スコアリングに基づく BUY/SELL シグナル (根拠付き)
- **トレード実行**: コマンドで取引所に発注 (管理者権限制限あり)
- **TUI ダッシュボード**: ターミナルでリアルタイムチャート・シグナル監視
- **サブスクリプション**: Stripe 連携で $5/月
- **運用機能**: ヘルスチェック、ログ、リトライ、レート制限、PM2/Docker 対応

## 技術スタック

| 技術 | 用途 |
|------|------|
| Node.js | ランタイム |
| discord.js | Discord Bot |
| grammy | Telegram Bot |
| ccxt | 取引所接続 (bitbank/Binance等) - 価格・OHLCV・トレード |
| blessed-contrib | TUI ダッシュボード (チャート・テーブル) |
| Express | ヘルスチェック / Stripe Webhook |
| Stripe | サブスクリプション決済 |

## ファイル構成

```
src/
  index.js          エントリポイント (Express + graceful shutdown)
  logger.js         タイムスタンプ付きロガー
  exchange.js       取引所接続 (ccxt + リトライ + マルチシンボル)
  indicators.js     テクニカル分析 (SMA, RSI, クロスオーバー)
  signal.js         価格監視 + シグナル生成 + 履歴保存
  tui.js            TUI ダッシュボード (チャート + シグナル + ステータス)
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

# 取引所
EXCHANGE=bitbank
TRADE_SYMBOL=BTC/JPY
TRADE_SYMBOLS=BTC/JPY,ETH/JPY,XRP/JPY,SOL/JPY,DOGE/JPY
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
# 通常起動
npm start

# TUI ダッシュボード付き
npm start -- --tui
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
| `!price` | BTC 現在価格 |
| `!status` | Bot ステータス |
| `!history` | 直近シグナル (5件) |
| `!subscribe` | サブスク登録 ($5/月) |
| `!trade buy/sell` | BTC トレード (管理者のみ) |

### Telegram

| コマンド | 説明 |
|----------|------|
| `/start` | ウェルカム |
| `/price` | BTC 現在価格 |
| `/status` | Bot ステータス |
| `/history` | 直近シグナル (5件) |
| `/subscribe` | サブスク登録 ($5/月) |
| `/help` | ヘルプ |

## TUI ダッシュボード

`npm start -- --tui` でターミナルダッシュボードを起動。

| キー | 操作 |
|------|------|
| `1`-`8` / `TAB` | タイムフレーム切替 (1m, 3m, 5m, 15m, 30m, 1h, 4h, 1d) |
| `S` | 監視銘柄切替 (TRADE_SYMBOLS 設定時) |
| `q` / `ESC` | 終了 |

表示内容: リアルタイムチャート (Price + SMA5 + SMA20)、RSI、シグナル履歴、ログ

## シグナル

テクニカル指標 (SMA5/20 クロスオーバー, RSI14) + 上位時間足確認のスコアリング判定。

```
#BTCSignal シグナル

方向: BUY
通貨: BTC/JPY
価格: ¥10,200,000
ターゲット: ¥10,506,000
ストップロス: ¥9,996,000
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
