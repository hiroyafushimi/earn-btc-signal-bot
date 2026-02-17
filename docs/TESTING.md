# btc-signal-bot テスト手順書

## 前提条件

- Node.js 20+ インストール済み
- `npm i` 完了済み
- `.env` に取引所 (bitbank等) の設定が入っている
- `SANDBOX=true` (テストモード)

## Phase 0: 起動テスト

### 0-1. 基本起動

```bash
npm start
```

**期待ログ:**

```
[HH:MM:SS] [Main] btc-signal-bot starting...
[HH:MM:SS] [Exchange] bitbank loaded. Sandbox: true
[HH:MM:SS] [Subscription] STRIPE_SECRET_KEY not set, subscription disabled
[HH:MM:SS] [Discord] Bot ready: BotName#1234
[HH:MM:SS] [Telegram] TELEGRAM_BOT_TOKEN not set or invalid, skipping
[HH:MM:SS] [Signal] Monitor started: 5 symbols [BTC/JPY, ETH/JPY, XRP/JPY, SOL/JPY, DOGE/JPY] (interval: 60000ms, cooldown: 300000ms)
[HH:MM:SS] [Main] Server: http://localhost:3000 (health, webhook, subscribe)
[HH:MM:SS] [Main] btc-signal-bot ready!
[HH:MM:SS] [Signal] BTC/JPY: ¥X,XXX,XXX
```

**確認ポイント:**

- [ ] `Exchange` が `loaded` になっているか
- [ ] `Discord` Bot が `ready` になっているか
- [ ] `Telegram` は `skipping` でエラーなくスキップされているか
- [ ] `Signal` Monitor が started になり、1分後に価格ログが出るか
- [ ] Express サーバーが localhost:3000 で起動しているか

### 0-2. ヘルスチェック

別ターミナルで:

```bash
curl http://localhost:3000/health | jq .
```

**期待レスポンス:**

```json
{
  "status": "ok",
  "uptime": "0m XXs",
  "startedAt": "2026-02-17T...",
  "exchange": {
    "connected": true,
    "name": "bitbank",
    "sandbox": true
  },
  "signals": {
    "totalBuy": 0,
    "totalSell": 0,
    "lastSignalAt": null,
    "historyCount": 0
  },
  "subscribers": 0
}
```

**確認ポイント:**

- [ ] `status: "ok"` が返るか
- [ ] `exchange.connected: true` か
- [ ] `exchange.sandbox: true` か

### 0-3. グレースフルシャットダウン

Bot を起動した状態で `Ctrl+C` を押す。

**期待ログ:**

```
[HH:MM:SS] [Main] SIGINT received, shutting down...
[HH:MM:SS] [Signal] Monitor stopped
[HH:MM:SS] [Discord] Bot stopped
[HH:MM:SS] [Main] Shutdown complete
```

**確認ポイント:**

- [ ] エラーなくプロセスが終了するか
- [ ] Discord Bot が stopped になるか

---

## Phase 1: Discord コマンドテスト

Bot が起動している状態で Discord のサーバーチャンネルから送信する。

### 1-1. !ping

**入力:** `!ping`
**期待応答:** `pong #BTCto70k`

### 1-2. !price

**入力:** `!price`
**期待応答:** `BTC/JPY: ¥X,XXX,XXX | H: ¥X,XXX,XXX | L: ¥X,XXX,XXX` (TRADE_SYMBOL に応じて通貨が変わる)

**確認ポイント:**

- [ ] Binance Testnet から価格が取得できるか
- [ ] 数字がカンマ区切りでフォーマットされているか

### 1-3. !status

**入力:** `!status`
**期待応答:**

```
**Bot Status**
Uptime: Xm Xs
Exchange: binance (Sandbox: true)
シグナル: BUY 0 / SELL 0
最終シグナル: なし
履歴件数: 0
サブスクライバー: 0
```

### 1-4. !history

**入力:** `!history`
**期待応答:** `シグナル履歴なし` (起動直後の場合)

### 1-5. !subscribe (Stripe 未設定時)

**入力:** `!subscribe`
**期待応答:** `サブスクリプション: $5/月\n決済連携は準備中です。`

### 1-6. !trade buy (管理者)

**前提:** `.env` の `ADMIN_DISCORD_IDS` に自分の Discord ユーザー ID を設定。

**入力:** `!trade buy`
**期待応答:** `✅ BUY BTC/JPY | ID: XXXXX | qty: 0.001 filled: 0.001 @¥XXXXXXX | closed`

**確認ポイント:**

- [ ] Testnet で注文が実行されるか
- [ ] qty が `PROCESSING_AMOUNT` (0.001) と一致するか

### 1-7. !trade sell (管理者)

**入力:** `!trade sell`
**期待応答:** `✅ SELL BTC/JPY | ID: XXXXX | ...`

### 1-8. トレード権限制限

**前提:** `ADMIN_DISCORD_IDS` に自分の ID を設定した状態で、**別のユーザー**からトレードコマンドを送信。

**入力 (別ユーザー):** `!trade buy`
**期待応答:** `⛔ トレード権限がありません`

### 1-9. 大文字コマンド

**入力:** `!Price`, `!STATUS`
**期待応答:** 小文字と同じ応答が返ること (lowercase 統一の確認)

### 1-10. レート制限

1分以内に 11 回以上コマンドを連続送信する。

**期待応答 (11回目):** `⏳ レート制限中です。しばらくお待ちください。`

---

## Phase 2: Telegram コマンドテスト (任意)

### 前提

1. BotFather で Telegram Bot を作成
2. `.env` に `TELEGRAM_BOT_TOKEN=123456:ABC-xxx` を設定
3. Bot を再起動

### 2-1. /start

**入力:** `/start`
**期待応答:** ウェルカムメッセージ + コマンド一覧

### 2-2. /price

**入力:** `/price`
**期待応答:** BTC/JPY の価格 + 高値/安値/出来高 (TRADE_SYMBOL に応じて通貨が変わる)

### 2-3. /status

**入力:** `/status`
**期待応答:** Bot Status (Discord と同様の情報)

### 2-4. /history

**入力:** `/history`
**期待応答:** `シグナル履歴なし` または直近シグナル一覧

### 2-5. /subscribe

**入力:** `/subscribe`
**期待応答:** `サブスクリプション: $5/月` + 決済準備中メッセージ (Stripe 未設定時)

### 2-6. /help

**入力:** `/help`
**期待応答:** コマンドヘルプ一覧

---

## Phase 3: シグナル生成テスト

### 3-1. シグナル発火待ち

**手順:**

1. Bot を起動して **21分以上** 放置する (21 tick で分析開始)
2. ターミナルログを監視する

**確認ポイント:**

- [ ] 1分ごとに `[Signal] BTC/JPY: ¥X,XXX,XXX RSI:XX.X SMA5:¥X,XXX,XXX SMA20:¥X,XXX,XXX` がログに出るか
- [ ] 21 tick 以降、条件を満たすとシグナルが発行されるか

### 3-2. シグナル発火の加速テスト (任意)

`.env` で `SIGNAL_INTERVAL=5000` (5秒) に変更して再起動すると、約105秒 (5s x 21 tick) で分析が始まる。

```
SIGNAL_INTERVAL=5000
SIGNAL_COOLDOWN=30000
```

**注意:** テスト後は必ず元に戻すこと。

### 3-3. シグナル配信テスト

**前提:** `DISCORD_SIGNAL_CHANNEL_ID` に実際のチャンネル ID を設定。

**確認ポイント:**

- [ ] シグナルが指定チャンネルに自動投稿されるか
- [ ] フォーマットに「方向」「価格」「強度」「根拠」が含まれるか

### 3-4. 履歴保存テスト

シグナルが1件以上発火した後:

- [ ] `!history` / `/history` で直近シグナルが表示されるか
- [ ] `data/signals.json` にシグナルが保存されているか

```bash
cat data/signals.json | jq '.[0]'
```

---

## Phase 4: Stripe サブスクリプションテスト (任意)

### 前提

1. Stripe ダッシュボードで **テストモード** のキーを取得
2. `.env` に設定:

```
STRIPE_SECRET_KEY=sk_test_XXXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXXX
BASE_URL=http://localhost:3000
```

### 4-1. Checkout URL 生成

**入力:** `!subscribe` (Discord) または `/subscribe` (Telegram)
**期待応答:** Stripe Checkout の URL が返ること

**確認ポイント:**

- [ ] URL にアクセスすると Stripe の決済画面が表示されるか
- [ ] 商品名が「BTC Signal Bot #BTCto70k」になっているか

### 4-2. テスト決済

Stripe テストカード: `4242 4242 4242 4242` (有効期限: 任意の未来、CVC: 任意)

**確認ポイント:**

- [ ] 決済完了後、`/subscribe/success` ページにリダイレクトされるか
- [ ] ログに `Subscription activated:` が出るか

### 4-3. Webhook テスト (ローカル)

```bash
# Stripe CLI をインストール (初回のみ)
brew install stripe/stripe-cli/stripe

# ログイン
stripe login

# ローカルに転送
stripe listen --forward-to localhost:3000/webhook/stripe
```

表示される `whsec_` を `.env` の `STRIPE_WEBHOOK_SECRET` に設定して再起動。

**確認ポイント:**

- [ ] 決済後に webhook イベントがログに出るか
- [ ] `data/subscribers.json` にユーザーが追加されるか
- [ ] `!status` のサブスクライバー数が 1 になるか

### 4-4. サブスク済みユーザーの !subscribe

**入力:** `!subscribe`
**期待応答:** `✅ サブスク有効です。#BTCto70k`

---

## Phase 4.5: TUI テスト

### 4.5-1. TUI 起動

```bash
npm start -- --tui
```

**確認ポイント:**

- [ ] チャート (左上) に価格ライン + SMA5 + SMA20 が表示されるか
- [ ] ステータス (右上) に現在価格・RSI・タイムフレームが表示されるか
- [ ] シグナル履歴 (左下) にテーブルが表示されるか
- [ ] ログ (右下) に「TUI started」が表示されるか

### 4.5-2. タイムフレーム切替

`1`〜`8` キーまたは `TAB` を押す。

**確認ポイント:**

- [ ] チャートラベルのタイムフレーム表示が切り替わるか
- [ ] ログに最新のタイムフレームのみ表示されるか (上書き)
- [ ] チャートデータがリロードされるか

### 4.5-3. シンボル切替

**前提:** `.env` に `TRADE_SYMBOLS=BTC/JPY,ETH/JPY,XRP/JPY` を設定。

`S` キーを押す。

**確認ポイント:**

- [ ] チャートラベルのシンボルが切り替わるか
- [ ] ステータスの価格が切り替わるか
- [ ] ログに「Symbol: ETH/JPY (2/3)」のように表示されるか

---

## Phase 5: Edge Case テスト

### 5-1. Exchange 接続失敗

`.env` の `API_KEY` を不正値にして起動。

**確認ポイント:**

- [ ] `Exchange init failed, continuing without trade:` がログに出るか
- [ ] Bot 自体は起動するか (Exchange 以外は動作)
- [ ] `!price` で `Error: Exchange not ready` が返るか

### 5-2. Discord トークン無し

`.env` の `DISCORD_TOKEN` をコメントアウトして起動。

**確認ポイント:**

- [ ] `DISCORD_TOKEN not set or placeholder, skipping` がログに出るか
- [ ] Signal monitor と Express は動作するか

### 5-3. 両プラットフォーム無効

Discord / Telegram の両方のトークンを未設定にして起動。

**確認ポイント:**

- [ ] エラーなく起動するか
- [ ] Exchange + Signal monitor + Express は動作するか
- [ ] `/health` にアクセスできるか

### 5-4. ADMIN_IDS 空文字テスト

`.env` で `ADMIN_DISCORD_IDS=` (空) にして起動。

**入力:** `!trade buy`
**期待応答:** `✅ BUY BTC/JPY | ...` (空 = 全員許可)

---

## テスト完了チェックリスト

| # | テスト項目 | 結果 |
|---|-----------|------|
| 0-1 | 基本起動 | |
| 0-2 | ヘルスチェック | |
| 0-3 | グレースフルシャットダウン | |
| 1-1 | !ping | |
| 1-2 | !price | |
| 1-3 | !status | |
| 1-4 | !history | |
| 1-5 | !subscribe | |
| 1-6 | !trade buy | |
| 1-7 | !trade sell | |
| 1-8 | トレード権限制限 | |
| 1-9 | 大文字コマンド | |
| 1-10 | レート制限 | |
| 3-1 | シグナル生成 | |
| 3-3 | シグナル配信 | |
| 3-4 | 履歴保存 | |
| 4.5-1 | TUI 起動 | |
| 4.5-2 | タイムフレーム切替 | |
| 4.5-3 | シンボル切替 | |
| 5-1 | Exchange 接続失敗 | |
| 5-2 | Discord トークン無し | |
| 5-3 | 両プラットフォーム無効 | |
| 5-4 | ADMIN_IDS 空文字 | |
