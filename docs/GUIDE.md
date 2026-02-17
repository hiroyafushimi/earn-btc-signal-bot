# btc-signal-bot 開発ガイド・仕様書

## プロジェクト概要

| 項目 | 内容 |
|------|------|
| プロジェクト名 | btc-signal-bot |
| 目的 | Discord + Telegram で BTC シグナル配信 (#BTCto70k) |
| 収益 | サブスク $5/月 |
| スタック | Node.js / discord.js / grammy / ccxt / Express |

## アーキテクチャ

```
Binance API (価格データ)
    ↓
exchange.js (ccxt 接続 + リトライ)
    ↓
signal.js (分析・シグナル生成・クールダウン・履歴保存)
    ↓
┌───────────────┬────────────────┐
│ discord-bot.js │ telegram-bot.js │
│ (Discord 配信)  │ (Telegram 配信)  │
└───────────────┴────────────────┘
    ↓                 ↓
Discord チャンネル  Telegram チャンネル
    ↓                 ↓
サブスクライバー (有料ユーザー)

index.js (Express /health + graceful shutdown)
```

### モジュール構成

| ファイル | 役割 |
|----------|------|
| `src/index.js` | エントリポイント。Exchange/Stripe 初期化 → 両Bot起動 → シグナル監視 → Express (health, webhook, subscribe) → graceful shutdown |
| `src/logger.js` | タイムスタンプ付き統一ロガー + uptime 管理 |
| `src/exchange.js` | ccxt Binance 接続。価格取得・OHLCV取得・トレード実行 (最大3回リトライ + 指数バックオフ) |
| `src/indicators.js` | テクニカル分析指標 (SMA, RSI, SMAクロスオーバー, 総合スコア判定) |
| `src/signal.js` | BTC 価格定期監視 → 指標分析 → 複数時間足確認 → シグナル生成 → クールダウン → 履歴保存 → 日次サマリー |
| `src/discord-bot.js` | Discord Bot (!trade, !price, !status, !history, !subscribe) + シグナル/サマリー自動配信 |
| `src/telegram-bot.js` | Telegram Bot (/price, /status, /history, /subscribe) + シグナル/サマリー自動配信 |
| `src/subscription.js` | Stripe Checkout Session 生成 + Webhook 処理 + ユーザー管理 (JSON) |
| `src/rate-limit.js` | コマンドレート制限 (ユーザー単位、Window/Max 設定可) |

## 運用機能

### ロガー (logger.js)

- 全モジュール統一の `[HH:MM:SS] [Module] message` 形式
- `uptimeFormatted()` で Bot 稼働時間を表示

### API リトライ (exchange.js)

- `fetchPrice`, `executeTrade` 等の API 呼び出しが失敗した場合、最大3回リトライ
- 指数バックオフ (1s → 2s → 4s)

### シグナル制御 (signal.js)

- **クールダウン**: 同方向のシグナルは `SIGNAL_COOLDOWN` ms 間隔 (default: 5分)
- **履歴保存**: `data/signals.json` に直近500件を JSON 保存
- **日次サマリー**: 24時間ごとにシグナル数・価格レンジを全チャンネルに配信

### ヘルスチェック (index.js)

- `GET /health` で JSON レスポンス (uptime, exchange 接続状態, シグナル統計)
- ポート: `PORT` 環境変数 (default: 3000)

### グレースフルシャットダウン (index.js)

- SIGINT/SIGTERM でシグナル監視停止 → レート制限タイマー停止 → 両Bot切断 → Express サーバー停止 → プロセス終了

### トレード権限制限

- `ADMIN_DISCORD_IDS` / `ADMIN_TELEGRAM_IDS` にユーザー ID をカンマ区切りで設定
- 設定時: 指定ユーザーのみトレード実行可能
- 未設定 (空): 全ユーザーがトレード実行可能
- シグナル閲覧 (!price, /price 等) は全ユーザーに開放

### Telegram トークン検証

- `TELEGRAM_BOT_TOKEN` が未設定またはフォーマット不正の場合は自動スキップ (プロセスは落ちない)
- grammy のエラーハンドリングにより、Telegram API エラーでもプロセスは継続

## コマンド一覧

### Discord

| コマンド | 説明 |
|----------|------|
| `!ping` | 疎通確認 |
| `!price` | BTC 現在価格 (TRADE_SYMBOL に応じた通貨ペア) |
| `!status` | Bot ステータス (uptime, シグナル数, 最終シグナル) |
| `!history` | 直近シグナル一覧 (最大5件) |
| `!subscribe` | サブスク登録 ($5/月 Stripe) |
| `!trade buy/sell` | BTC トレード実行 (管理者のみ) |

### Telegram

| コマンド | 説明 |
|----------|------|
| `/start` | ウェルカムメッセージ |
| `/price` | BTC 現在価格 (TRADE_SYMBOL に応じた通貨ペア) |
| `/status` | Bot ステータス (uptime, シグナル数, 最終シグナル) |
| `/history` | 直近シグナル一覧 (最大5件) |
| `/subscribe` | サブスク登録 ($5/月) |
| `/help` | ヘルプ |

## シグナルロジック

### 配信フォーマット

```
#BTCto70k シグナル

方向: BUY
通貨: BTC/JPY
価格: ¥X,XXX,XXX
ターゲット: $XX,XXX
ストップロス: $XX,XXX
リスク: X%
強度: X/6

根拠:
  - RSI XX.X (売られすぎ)
  - SMA ゴールデンクロス
  - 1h足でも同方向

YYYY-MM-DDTHH:MM:SS.sssZ
```

### 判定基準 (テクニカル指標ベース)

データ21件以上で分析開始。以下のスコアリングで BUY/SELL を判定:

| 指標 | BUY 条件 | SELL 条件 | スコア |
|------|----------|-----------|--------|
| RSI (14) | < 30 (売られすぎ) | > 70 (買われすぎ) | +2 |
| RSI (14) | < 40 (低め) | > 60 (高め) | +1 |
| SMA クロス | ゴールデンクロス (SMA5 > SMA20) | デスクロス (SMA5 < SMA20) | +3 |
| トレンド位置 | 価格 > SMA5 > SMA20 | 価格 < SMA5 < SMA20 | +1 |
| 1h 足確認 | 1h 足でも同方向 | 1h 足でも同方向 | +1 |

- **合計スコア 2 以上**でシグナル発行
- 同方向シグナルはクールダウン期間中は抑制
- シグナルに根拠 (reasons) を付与して配信

### 拡張予定

- MACD (Moving Average Convergence Divergence)
- ボリューム分析
- バックテスト検証

## 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| DISCORD_TOKEN | No | Discord Bot トークン (設定時のみDiscord有効) |
| DISCORD_SIGNAL_CHANNEL_ID | No | Discord シグナル配信チャンネル ID |
| TELEGRAM_BOT_TOKEN | No | Telegram Bot トークン (設定時のみTelegram有効) |
| TELEGRAM_CHANNEL_ID | No | Telegram シグナル配信チャンネル ID |
| EXCHANGE | Yes | 取引所 (binance) |
| TRADE_SYMBOL | No | 取引通貨ペア (default: BTC/USDT、バイナンスジャパンは BTC/JPY) |
| API_KEY | Yes | Binance API キー |
| API_SECRET | Yes | Binance API シークレット |
| SANDBOX | No | true でテストネット (default: true) |
| PROCESSING_AMOUNT | No | 固定取引量 BTC (default: 0.001) |
| RISK_PCT | No | 残高に対するリスク割合 (default: 0.01) |
| SIGNAL_INTERVAL | No | シグナルチェック間隔 ms (default: 60000) |
| SIGNAL_COOLDOWN | No | 同方向シグナル最小間隔 ms (default: 300000) |
| ADMIN_DISCORD_IDS | No | トレード許可 Discord ユーザー ID (カンマ区切り、空=全員許可) |
| ADMIN_TELEGRAM_IDS | No | トレード許可 Telegram ユーザー ID (カンマ区切り、空=全員許可) |
| PORT | No | Express ヘルスチェックポート (default: 3000) |
| RATE_LIMIT_WINDOW | No | レート制限ウィンドウ ms (default: 60000) |
| RATE_LIMIT_MAX | No | ウィンドウ内最大リクエスト数 (default: 10) |
| STRIPE_SECRET_KEY | No | Stripe シークレットキー (未設定時は決済無効) |
| STRIPE_WEBHOOK_SECRET | No | Stripe Webhook 署名検証シークレット |
| SUBSCRIPTION_PRICE | No | 月額料金 USD (default: 5) |
| BASE_URL | No | Webhook/決済リダイレクト用 URL (default: http://localhost:3000) |

Discord / Telegram はどちらか一方のトークンだけ設定すれば、そのプラットフォームのみで動作する。両方設定すれば両方で動作する。

## データ

| パス | 内容 |
|------|------|
| `data/signals.json` | シグナル履歴 (直近500件、自動生成、gitignore 済み) |
| `data/subscribers.json` | サブスクライバー情報 (platform:userId → Stripe ID, status 等) |

## 開発ロードマップ

### Phase 1: 基盤 (完了)

- [x] モジュール分割 (exchange / signal / discord-bot / telegram-bot / logger)
- [x] Discord Bot (既存ロジック移行)
- [x] Telegram Bot (grammy) 新規作成
- [x] Binance API 接続 (ccxt 共通化)
- [x] BTC 価格定期監視 + シグナル生成
- [x] 両プラットフォームへのシグナル自動配信

### Phase 1.5: 運用基盤 (完了)

- [x] タイムスタンプ付きロガー
- [x] API リトライ (指数バックオフ)
- [x] シグナルクールダウン制御
- [x] シグナル履歴 JSON 保存
- [x] 日次サマリー自動配信
- [x] Express ヘルスチェック (/health)
- [x] グレースフルシャットダウン (SIGINT/SIGTERM)
- [x] !status, !history / /status, /history コマンド
- [x] トレード権限制限 (ADMIN_DISCORD_IDS / ADMIN_TELEGRAM_IDS)
- [x] Telegram トークン検証 + エラーハンドリング
- [x] discord.js v15 対応 (Events.ClientReady)
- [x] 未使用依存削除 (body-parser)

### Phase 2: シグナル強化 (完了)

- [x] テクニカル分析指標 (SMA, RSI, SMA クロスオーバー)
- [x] スコアリングベースの総合判定 (強度 + 根拠表示)
- [x] 複数時間足分析 (1h ローソク足で方向確認)
- [x] OHLCV データ取得 (exchange.js)
- [ ] MACD 追加
- [ ] バックテスト検証
- [ ] 複数通貨ペア対応

### Phase 3: サブスクリプション $5/月 (完了)

- [x] Stripe Checkout Session 生成 (subscription.js)
- [x] ユーザー管理 (data/subscribers.json)
- [x] Discord !subscribe / Telegram /subscribe で決済リンク生成
- [x] Stripe Webhook 処理 (POST /webhook/stripe)
- [x] 決済完了/キャンセルページ (/subscribe/success, /subscribe/cancel)
- [x] サブスクライバー数を !status / /status / /health に表示
- [ ] 有料チャンネルのアクセス制御 (サブスク有無でシグナル制限)

### Phase 4: 運用・スケール (完了)

- [x] PM2 デプロイ設定 (ecosystem.config.js)
- [x] Docker デプロイ (Dockerfile + .dockerignore)
- [x] コマンドレート制限 (rate-limit.js、ユーザー単位 Window/Max)
- [ ] 外部エラー通知 (Slack/Discord Webhook)

## デプロイ

### PM2

```bash
npm i -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Docker

```bash
docker build -t btc-signal-bot .
docker run -d --env-file .env -p 3000:3000 --name btc-signal-bot btc-signal-bot
```

## 開発フロー

1. ブランチ: main 直接管理
2. 手順: 編集 → commit → push origin main
3. レビュー: 確認後運用
