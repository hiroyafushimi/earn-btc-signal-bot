# Earn BTC Signal Bot v1 🖤

## 概要
Discordシグナル自動Bitcoinトレードボット (Binance)。

## セットアップ (5分)

1. clone
```
git clone https://github.com/hiroyafushimi/earn-btc-signal-bot.git
cd earn-btc-signal-bot
npm i
```

2. Discord Bot
- https://discord.com/developers/applications → New → Bot → Token .env
- OAuth2 → bot scope → perms Send/Read → URLでguild招待
- Bot tab → Message Content Intent ON

3. Binance Testnet API
- https://testnet.binance.vision → GitHub login → API Management → Create → TRADE ON → .env

4. .env
```
DISCORD_TOKEN=xxx
EXCHANGE=binance
API_KEY=xxx
API_SECRET=xxx
SANDBOX=true
RISK_PCT=0.01
PROCESSING_AMOUNT=0.001
```

5. run
```
npm start
```

## 使用法
- `!trade BUY BTCUSDT 0.001` → BUY
- `🚀 BUY BTC` → auto BUY 0.001 (or RISK_PCT %)

## 本番
- SANDBOX=false mainnet key (HIGH RISK!)
- pm2 start ecosystem.config.js (VPS)

## カスタム
- RISK_PCT=0.05 (5%)
- PROCESSING_AMOUNT=0.01 fixed
- symbol変更

## 警告
- 損失リスク自己責任
- 金融法注意

v1.1 SL/TP soon🖤