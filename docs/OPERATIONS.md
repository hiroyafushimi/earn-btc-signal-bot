# btc-signal-bot 運用マニュアル

## 運用全体フロー

```
1. 初期セットアップ
   ├── 環境変数設定
   ├── Binance API キー取得 (Testnet → 本番)
   ├── Discord Bot 作成 & サーバー招待
   ├── Telegram Bot 作成 (BotFather)
   └── Stripe アカウント設定 (任意)

2. デプロイ
   ├── テスト: ローカル npm start
   ├── ステージング: PM2 (VPS)
   └── 本番: Docker or PM2

3. 日常運用
   ├── ログ監視
   ├── ヘルスチェック監視
   ├── シグナル品質確認
   └── サブスクライバー管理

4. メンテナンス
   ├── コード更新 & 再起動
   ├── ログローテーション
   └── データバックアップ
```

---

## 1. 初期セットアップ

### 1-1. Binance API キー

1. https://testnet.binance.vision/ にアクセス (Testnet)
2. GitHub アカウントでログイン
3. API Key / Secret を生成
4. `.env` に設定:

```
API_KEY=生成したキー
API_SECRET=生成したシークレット
SANDBOX=true
```

**本番移行時:**

1. https://www.binance.com/ の API 管理ページ
2. API Key を作成 (IP 制限推奨)
3. 必要な権限: **読み取り** + **スポット取引**
4. `.env` の `SANDBOX=false` に変更

### 1-2. Discord Bot 作成

1. https://discord.com/developers/applications にアクセス
2. New Application → Bot を作成
3. Bot タブ:
   - **Token** をコピー → `.env` の `DISCORD_TOKEN` に設定
   - **Message Content Intent** を ON
   - **Server Members Intent** を ON (任意)
4. OAuth2 → URL Generator:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`, `Read Messages/View Channels`
5. 生成された URL でサーバーに招待
6. シグナル配信チャンネルの ID を取得:
   - Discord 設定 → 詳細設定 → 開発者モード ON
   - チャンネルを右クリック → ID をコピー
   - `.env` の `DISCORD_SIGNAL_CHANNEL_ID` に設定

### 1-3. Telegram Bot 作成

1. Telegram で `@BotFather` を検索
2. `/newbot` → Bot 名とユーザー名を設定
3. 表示されたトークンを `.env` の `TELEGRAM_BOT_TOKEN` に設定
4. シグナル配信チャンネルの ID を取得:
   - チャンネル作成 → Bot を管理者として追加
   - `https://api.telegram.org/bot<TOKEN>/getUpdates` でチャンネル ID 確認
   - `.env` の `TELEGRAM_CHANNEL_ID` に設定

### 1-4. Stripe 設定 (サブスクリプション有効化時)

1. https://dashboard.stripe.com/ でアカウント作成
2. 開発者 → API キー:
   - テストモード: `sk_test_xxx`
   - 本番モード: `sk_live_xxx`
3. `.env` に設定:

```
STRIPE_SECRET_KEY=sk_test_xxx
SUBSCRIPTION_PRICE=5
BASE_URL=https://your-domain.com
```

4. Webhook 設定:
   - 開発者 → Webhook → エンドポイント追加
   - URL: `https://your-domain.com/webhook/stripe`
   - イベント: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Signing secret → `.env` の `STRIPE_WEBHOOK_SECRET` に設定

### 1-5. 管理者 ID 設定

自分のユーザー ID を設定して、トレード実行を自分だけに制限:

```
# Discord: 開発者モード ON → ユーザーアイコン右クリック → ID をコピー
ADMIN_DISCORD_IDS=123456789012345678

# Telegram: @userinfobot に /start でメッセージを送り ID を確認
ADMIN_TELEGRAM_IDS=987654321

# 複数人
ADMIN_DISCORD_IDS=111111,222222,333333
```

---

## 2. デプロイ

### 2-1. ローカル実行

```bash
npm start
```

- 開発中のテスト用
- `Ctrl+C` で停止

### 2-2. PM2 デプロイ (推奨: VPS)

```bash
# PM2 インストール (初回のみ)
npm i -g pm2

# 起動
pm2 start ecosystem.config.js

# 状態確認
pm2 status
pm2 logs btc-signal-bot

# 停止
pm2 stop btc-signal-bot

# 再起動
pm2 restart btc-signal-bot

# 自動起動設定 (サーバー再起動後も自動復帰)
pm2 save
pm2 startup
```

**PM2 でのログ確認:**

```bash
# リアルタイムログ
pm2 logs btc-signal-bot

# エラーログのみ
pm2 logs btc-signal-bot --err

# ログファイル直接確認
tail -f logs/out.log
tail -f logs/error.log
```

### 2-3. Docker デプロイ

```bash
# ビルド
docker build -t btc-signal-bot .

# 起動
docker run -d \
  --env-file .env \
  -p 3000:3000 \
  --name btc-signal-bot \
  --restart unless-stopped \
  btc-signal-bot

# ログ確認
docker logs -f btc-signal-bot

# 停止
docker stop btc-signal-bot

# 削除 & 再起動
docker rm btc-signal-bot
docker run -d --env-file .env -p 3000:3000 --name btc-signal-bot --restart unless-stopped btc-signal-bot
```

**Docker でのデータ永続化:**

```bash
docker run -d \
  --env-file .env \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  --name btc-signal-bot \
  --restart unless-stopped \
  btc-signal-bot
```

---

## 3. 日常運用

### 3-1. ログ監視

**正常時のログパターン:**

```
[HH:MM:SS] [Signal] BTC/USDT: $68302 RSI:45.2 SMA5:$68100 SMA20:$67900
```

1分ごとに出力される。RSI / SMA 値でシグナルの状態を確認できる。

**シグナル発火時:**

```
[HH:MM:SS] [Signal] Signal: BUY @$68302
```

**異常時のログパターン:**

```
[HH:MM:SS] [Exchange] ERROR fetchPrice(BTC/USDT) attempt 1 failed: XXXX, retry in 1000ms
[HH:MM:SS] [Signal] ERROR tick error: XXXX
```

3回リトライ後に失敗した場合、`tick error` としてログに残る。次の tick (1分後) で自動復帰を試みる。

### 3-2. ヘルスチェック監視

```bash
# 手動チェック
curl -s http://localhost:3000/health | jq .

# cron で定期チェック (5分ごと)
*/5 * * * * curl -sf http://localhost:3000/health > /dev/null || echo "Bot down" | mail -s "Alert" you@example.com
```

**ヘルスチェック応答の見方:**

| フィールド | 正常値 | 異常時 |
|-----------|--------|--------|
| `status` | `"ok"` | - |
| `exchange.connected` | `true` | `false` → API キー不正 or Binance 障害 |
| `signals.lastSignalAt` | 最近のタイムスタンプ | `null` (長時間) → 市場が安定している or 異常 |

### 3-3. シグナル品質確認

```bash
# 直近のシグナル履歴を確認
cat data/signals.json | jq '.[-5:]'

# シグナル数の推移
cat data/signals.json | jq 'group_by(.side) | map({side: .[0].side, count: length})'
```

**シグナルが出すぎる場合:**

```
SIGNAL_COOLDOWN=600000  # クールダウンを10分に延長
```

**シグナルが出なさすぎる場合:**

- RSI / SMA の閾値を調整 (src/indicators.js)
- `SIGNAL_INTERVAL` を短縮 (データ収集速度を上げる)

### 3-4. サブスクライバー管理

```bash
# サブスクライバー一覧
cat data/subscribers.json | jq .

# アクティブ数
cat data/subscribers.json | jq '[.[] | select(.status == "active")] | length'

# 特定ユーザーの情報
cat data/subscribers.json | jq '.["discord:123456789"]'
```

---

## 4. メンテナンス

### 4-1. コード更新

```bash
# 最新コードを取得
git pull origin main

# 依存パッケージ更新 (必要な場合)
npm i

# PM2 再起動
pm2 restart btc-signal-bot

# Docker 再起動
docker stop btc-signal-bot && docker rm btc-signal-bot
docker build -t btc-signal-bot .
docker run -d --env-file .env -p 3000:3000 -v $(pwd)/data:/app/data -v $(pwd)/logs:/app/logs --name btc-signal-bot --restart unless-stopped btc-signal-bot
```

### 4-2. ログローテーション

**PM2 の場合 (自動):**

```bash
# pm2-logrotate インストール (初回のみ)
pm2 install pm2-logrotate

# 設定
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

**手動ローテーション:**

```bash
# ログファイルを圧縮してアーカイブ
cd logs
gzip -k out.log && mv out.log.gz "out-$(date +%Y%m%d).log.gz"
> out.log
gzip -k error.log && mv error.log.gz "error-$(date +%Y%m%d).log.gz"
> error.log
```

### 4-3. データバックアップ

```bash
# シグナル履歴 & サブスクライバーをバックアップ
tar czf "backup-$(date +%Y%m%d).tar.gz" data/

# cron で日次バックアップ
0 0 * * * cd /path/to/earn-btc-signal-bot && tar czf "backups/backup-$(date +\%Y\%m\%d).tar.gz" data/
```

### 4-4. 環境変数の変更

`.env` を編集した後:

```bash
# PM2
pm2 restart btc-signal-bot

# Docker (再ビルド不要、.env だけ変更ならコンテナ再作成)
docker stop btc-signal-bot && docker rm btc-signal-bot
docker run -d --env-file .env -p 3000:3000 --name btc-signal-bot --restart unless-stopped btc-signal-bot
```

---

## 5. Testnet → 本番移行

### 移行チェックリスト

| # | 確認項目 | 状態 |
|---|---------|------|
| 1 | Binance 本番 API キー作成 (IP 制限付き) | |
| 2 | `SANDBOX=false` に変更 | |
| 3 | `PROCESSING_AMOUNT` を本番用の金額に調整 | |
| 4 | `ADMIN_DISCORD_IDS` / `ADMIN_TELEGRAM_IDS` に自分の ID を設定 | |
| 5 | Testnet でのトレードテスト完了 | |
| 6 | Stripe を本番モードに切り替え (`sk_live_xxx`) | |
| 7 | `BASE_URL` を本番ドメインに変更 | |
| 8 | Stripe Webhook エンドポイントを本番 URL に設定 | |
| 9 | `SIGNAL_INTERVAL` / `SIGNAL_COOLDOWN` を本番用に調整 | |
| 10 | Discord シグナルチャンネル ID を本番チャンネルに変更 | |

### 移行手順

```bash
# 1. .env を編集
SANDBOX=false
API_KEY=本番キー
API_SECRET=本番シークレット
STRIPE_SECRET_KEY=sk_live_xxx
BASE_URL=https://your-domain.com

# 2. 少額でトレードテスト
PROCESSING_AMOUNT=0.0001  # 最小単位で

# 3. 再起動
pm2 restart btc-signal-bot
```

### 本番移行後の注意

- **最初の24時間**はログを頻繁に確認する
- **PROCESSING_AMOUNT は最小値から**始めて、問題なければ徐々に増やす
- **Binance API の IP 制限**を必ず設定する (VPS の IP のみ許可)
- **ADMIN_IDS を必ず設定**して、不正トレードを防ぐ

---

## 6. トラブルシューティング

### Bot が起動しない

```
[Main] Fatal: Cannot find module 'xxx'
```

→ `npm i` を再実行

### Exchange 接続エラー

```
[Exchange] ERROR init failed: binance requires "apiKey"
```

→ `.env` の `API_KEY` / `API_SECRET` を確認

### Discord Bot がオフライン

```
[Discord] Discord bot failed: An invalid token was provided.
```

→ Discord Developer Portal でトークンを再生成し `.env` を更新

### Telegram Bot が起動しない

```
[Telegram] Bot start failed: 404: Not Found
```

→ `TELEGRAM_BOT_TOKEN` が正しいか確認 (BotFather で再確認)

### シグナルが出ない

1. 起動後 21分以上経過しているか確認
2. ログに `BTC/USDT: $XXXXX RSI:XX.X` が出ているか確認
3. `SIGNAL_COOLDOWN` の間隔内でないか確認
4. テクニカル条件 (RSI < 40 or > 60, SMA クロス等) が揃っていない場合は正常

### Stripe 決済エラー

```
[Main] Stripe webhook error: No signatures found matching the expected signature
```

→ `STRIPE_WEBHOOK_SECRET` が正しいか確認 (Stripe ダッシュボードと一致しているか)

### メモリ使用量が増え続ける

```bash
# PM2 でメモリ確認
pm2 monit

# 256MB で自動再起動 (ecosystem.config.js で設定済み)
max_memory_restart: "256M"
```

---

## 7. 運用スケジュール例

### 日次

| 時間 | 作業 |
|------|------|
| 朝 | `/health` でヘルスチェック確認 |
| 朝 | ログにエラーがないか確認 |
| 夕 | 日次サマリーの確認 (自動配信) |

### 週次

| 作業 |
|------|
| シグナル履歴の品質レビュー |
| サブスクライバー数の推移確認 |
| ログファイルのサイズ確認 |
| データバックアップの確認 |

### 月次

| 作業 |
|------|
| 依存パッケージのセキュリティアップデート (`npm audit`) |
| Binance API キーのローテーション (任意) |
| Stripe ダッシュボードで売上確認 |
| テクニカル指標のパラメータレビュー |
