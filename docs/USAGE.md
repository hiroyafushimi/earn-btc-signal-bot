# btc-signal-bot 利用ガイド

## 対応プラットフォーム

| プラットフォーム | 対応状況 |
|------------------|----------|
| Discord | 対応 (コマンド + 自動検出 + シグナル配信) |
| Telegram | 対応 (コマンド + シグナル配信) |

どちらか一方のみ、または両方同時に利用可能。

## Discord での使い方

### Bot をサーバーに追加

1. Discord Developer Portal で Bot を作成
2. OAuth2 URL で bot scope + Send/Read 権限を設定
3. URL にアクセスしてサーバーに招待
4. Bot tab で Message Content Intent を ON にする

### コマンド

| コマンド | 説明 |
|----------|------|
| `!ping` | 疎通確認 |
| `!price` | BTC/USDT 現在価格を表示 |
| `!trade buy` | BTC 買い注文 (Binance) |
| `!trade sell` | BTC 売り注文 (Binance) |

### 自動検出キーワード

メッセージに以下が含まれると自動でトレードを実行:

| キーワード | 方向 |
|------------|------|
| 🚀 / buy / long / 入 / 買い | BUY |
| sell / short / 出 / 売り | SELL |

### シグナル配信

`DISCORD_SIGNAL_CHANNEL_ID` を設定すると、シグナルが自動でそのチャンネルに投稿される。

## Telegram での使い方

### Bot を追加

1. Telegram で Bot を検索して開く
2. `/start` を送信して登録

### コマンド

| コマンド | 説明 |
|----------|------|
| `/start` | ウェルカムメッセージ |
| `/price` | BTC/USDT 現在価格 |
| `/status` | Bot ステータス |
| `/subscribe` | サブスク登録 ($5/月) |
| `/help` | ヘルプ |

### テキストでのトレード

Discord と同様、メッセージ内の BUY/SELL キーワードを自動検出してトレードを実行。

### シグナル配信

`TELEGRAM_CHANNEL_ID` を設定すると、シグナルが自動でそのチャンネルに投稿される。

## シグナルの読み方

シグナルは以下のフォーマットで配信される:

```
#BTCto70k シグナル

方向: BUY
通貨: BTC/USDT
価格: $65,000
ターゲット: $70,000
ストップロス: $63,000
リスク: 1%
```

| 項目 | 説明 |
|------|------|
| 方向 | BUY (買い) / SELL (売り) |
| 価格 | シグナル発生時の BTC 価格 |
| ターゲット | 利確目標価格 |
| ストップロス | 損切り価格 |
| リスク | 推奨リスク割合 |

## サブスクリプション

### プラン

| プラン | 価格 | 内容 |
|--------|------|------|
| Monthly | $5/月 | BTC シグナル全配信 (Discord + Telegram) |

### 登録方法 (Telegram)

1. Bot で `/subscribe` を送信
2. 決済リンクが送られる (Stripe)
3. カード情報を入力して決済完了
4. シグナルチャンネルへのアクセスが有効化

## セットアップ (開発者向け)

```bash
git clone https://github.com/hiroyafushimi/earn-btc-signal-bot.git
cd earn-btc-signal-bot
npm i
cp config/.env.example .env
# .env を編集してトークン・APIキーを設定
npm start
```

詳細は [README.md](../README.md) および [開発ガイド](GUIDE.md) を参照。

## #BTCto70k について

BTC が $70,000 に到達することを目指すシグナル戦略。
価格分析に基づいた BUY/SELL シグナルを Discord と Telegram の両方で配信し、目標達成をサポートする。
