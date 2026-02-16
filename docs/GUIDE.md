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
| `src/index.js` | エントリポイント。Exchange初期化 → 両Bot起動 → シグナル監視 → Express ヘルスチェック → graceful shutdown |
| `src/logger.js` | タイムスタンプ付き統一ロガー + uptime 管理 |
| `src/exchange.js` | ccxt Binance 接続。価格取得・トレード実行 (最大3回リトライ + 指数バックオフ) |
| `src/signal.js` | BTC 価格定期監視 → シグナル生成 → クールダウン制御 → 履歴 JSON 保存 → 日次サマリー |
| `src/discord-bot.js` | Discord Bot (!trade, !price, !status, !history) + シグナル/サマリー自動配信 |
| `src/telegram-bot.js` | Telegram Bot (/price, /status, /history, /subscribe) + シグナル/サマリー自動配信 |

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

- SIGINT/SIGTERM でシグナル監視停止 → 両Bot切断 → プロセス終了

## コマンド一覧

### Discord

| コマンド | 説明 |
|----------|------|
| `!ping` | 疎通確認 |
| `!price` | BTC/USDT 現在価格 |
| `!status` | Bot ステータス (uptime, シグナル数, 最終シグナル) |
| `!history` | 直近シグナル一覧 (最大5件) |
| `!trade buy/sell` | BTC トレード実行 |

### Telegram

| コマンド | 説明 |
|----------|------|
| `/start` | ウェルカムメッセージ |
| `/price` | BTC/USDT 現在価格 |
| `/status` | Bot ステータス (uptime, シグナル数, 最終シグナル) |
| `/history` | 直近シグナル一覧 (最大5件) |
| `/subscribe` | サブスク登録 ($5/月) |
| `/help` | ヘルプ |

## シグナルロジック

### 配信フォーマット

```
#BTCto70k シグナル

方向: BUY
通貨: BTC/USDT
価格: $XX,XXX
ターゲット: $XX,XXX
ストップロス: $XX,XXX
リスク: X%
```

### 現在の判定基準

- 直近5件の平均価格と現在価格を比較
- 1% 以上下落 → BUY シグナル (反発期待)
- 1% 以上上昇 → SELL シグナル (利確推奨)
- 同方向シグナルはクールダウン期間中は抑制

### 拡張予定

- 移動平均 (MA) クロスオーバー
- RSI (相対力指数) ベースのシグナル
- ボリューム分析
- 複数時間足の分析

## 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| DISCORD_TOKEN | No | Discord Bot トークン (設定時のみDiscord有効) |
| DISCORD_SIGNAL_CHANNEL_ID | No | Discord シグナル配信チャンネル ID |
| TELEGRAM_BOT_TOKEN | No | Telegram Bot トークン (設定時のみTelegram有効) |
| TELEGRAM_CHANNEL_ID | No | Telegram シグナル配信チャンネル ID |
| EXCHANGE | Yes | 取引所 (binance) |
| API_KEY | Yes | Binance API キー |
| API_SECRET | Yes | Binance API シークレット |
| SANDBOX | No | true でテストネット (default: true) |
| PROCESSING_AMOUNT | No | 固定取引量 BTC (default: 0.001) |
| RISK_PCT | No | 残高に対するリスク割合 (default: 0.01) |
| SIGNAL_INTERVAL | No | シグナルチェック間隔 ms (default: 60000) |
| SIGNAL_COOLDOWN | No | 同方向シグナル最小間隔 ms (default: 300000) |
| PORT | No | Express ヘルスチェックポート (default: 3000) |
| STRIPE_SECRET_KEY | No | Stripe シークレットキー (Phase 3) |
| SUBSCRIPTION_PRICE | No | 月額料金 USD (default: 5) |

Discord / Telegram はどちらか一方のトークンだけ設定すれば、そのプラットフォームのみで動作する。両方設定すれば両方で動作する。

## データ

| パス | 内容 |
|------|------|
| `data/signals.json` | シグナル履歴 (直近500件、自動生成、gitignore 済み) |

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

### Phase 2: シグナル強化

- [ ] テクニカル分析指標 (MA, RSI, MACD)
- [ ] シグナル精度の検証・バックテスト
- [ ] シグナル履歴・パフォーマンス記録
- [ ] 複数通貨ペア対応

### Phase 3: サブスクリプション ($5/月)

- [ ] Stripe 連携
- [ ] ユーザー登録・認証フロー
- [ ] 有料チャンネルのアクセス制御
- [ ] 決済 Webhook 処理

### Phase 4: 運用・スケール

- [ ] デプロイ (VPS + PM2 / Docker)
- [ ] エラー通知 (外部通知)
- [ ] レート制限・abuse 対策

## 開発フロー

1. ブランチ: main 直接管理
2. 手順: 編集 → commit → push origin main
3. レビュー: 確認後運用
