require('dotenv').config();
const { Client, GatewayIntentBits } = require("discord.js");
const ccxt = require('ccxt');

const EXCHANGE = process.env.EXCHANGE || 'binance';
const exchangeConfig = {
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  sandbox: process.env.SANDBOX === 'true',
};

let exchange;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once("ready", async () => {
  console.log("Earn BTC Signal Bot v1 ready! 🖤");
  try {
    exchange = new ccxt[EXCHANGE](exchangeConfig);
    await exchange.loadMarkets();
    console.log(`${EXCHANGE} loaded OK. Sandbox: ${exchangeConfig.sandbox}`);
  } catch (e) {
    console.error('Exchange init failed:', e.message);
  }
});

async function executeTrade(message, side, symbol, amount, price = undefined) {
  const orderType = price ? 'limit' : 'market';
  console.log(`Trade: ${side} ${symbol} ${amount} ${orderType} ${price || 'mkt'}`);
  if (!exchange) return message.reply("Exchange not ready.");
  try {
    const order = await exchange.createOrder(symbol, orderType, side, amount, price);
    const filled = order.filled || 0;
    const avgPrice = order.average || price || 'market';
    message.reply(`✅ **TRADE OK!**\\nID: \\\`${order.id}\\\` | ${side} ${symbol} ${amount}\\nFilled: ${filled} @$${avgPrice} | ${order.status}`);
  } catch (e) {
    console.error(e);
    message.reply(`❌ Failed: ${e.message}`);
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  console.log(`Msg: ${message.author.username} | ${JSON.stringify(message.content)}`);

  if (message.content === "!ping") return message.reply("pong v1 🖤");

  // Auto parse
  let autoSide = null;
  let price = undefined;
  let amount = parseFloat(process.env.PROCESSING_AMOUNT || '0.001');
  const symbol = 'BTCUSDT';
  const riskPct = parseFloat(process.env.RISK_PCT || '0');
  if (riskPct > 0) {
    const balance = await exchange.fetchBalance();
    const usdtFree = balance.free.USDT || 0;
    const riskUsdt = usdtFree * riskPct;
    const ticker = await exchange.fetchTicker(symbol);
    const tickerPrice = ticker.last;
    amount = Math.min(riskUsdt / tickerPrice, amount);
  }
  const priceMatch = content.match(/(\\$|at\\s+|@)(\\d+(?:,\\d{3})*(?:\\.\\d+)?)(k?)/i);
  if (priceMatch) {
    let p = parseFloat(priceMatch[2].replace(/,/g, ''));
    if (priceMatch[3] === 'k') p *= 1000;
    price = p;
  }
  if (content.includes('buy') || content.includes('long') || content.includes('🚀') || content.includes('入') || content.includes('買い')) {
    autoSide = 'buy';
  } else if (content.includes('sell') || content.includes('short') || content.includes('出') || content.includes('売り')) {
    autoSide = 'sell';
  }
  if (autoSide) {
    return executeTrade(message, autoSide, symbol, amount, price);
  }

  // Command
  if (!message.content.startsWith("!trade ")) return;
  const match = message.content.match(/!trade\\s+(BUY|SELL)\\s+(BTCUSDT)\\s+([\\d.]+)(\\s+(market|limit))?(\\s+@?\\$?(\\d+(?:,\\d{3})*(?:\\.\\d+)?)(k?))?/i);
  if (!match) return message.reply("Format: !trade BUY BTCUSDT 0.001 [limit $70k]");
  const [, side, sym, amtStr, , type, , pStr, k] = match;
  let amountCmd = parseFloat(amtStr);
  let priceCmd = undefined;
  if (pStr) {
    let p = parseFloat(pStr.replace(/,/g, ''));
    if (k === 'k') p *= 1000;
    priceCmd = p;
  }
  return executeTrade(message, side, 'BTCUSDT', amountCmd, priceCmd);
});

if (!process.env.DISCORD_TOKEN) process.exit(1);
client.login(process.env.DISCORD_TOKEN);
console.log('v1 Bot login...');