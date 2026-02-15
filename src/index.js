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
    console.log(`${EXCHANGE} loaded. Sandbox: ${exchangeConfig.sandbox}`);
  } catch (e) {
    console.error('Exchange init failed:', e.message);
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content;
  console.log(`Msg: ${message.author.username} | ${content}`);

  if (content === "!ping") return message.reply("pong v1 🖤");

  const riskPct = parseFloat(process.env.RISK_PCT || '0');
  const fixedAmount = parseFloat(process.env.PROCESSING_AMOUNT || '0.001');
  const symbol = 'BTCUSDT';

  let side, amount;

  // Command
  const cmdMatch = content.match(/!trade\s+(buy|sell)\s+(?:btcusdt)?\s*([\d.]+)?/i);
  if (cmdMatch) {
    side = cmdMatch[1].toLowerCase();
    amount = parseFloat(cmdMatch[2] || fixedAmount);
  } else {
    // Auto
    if (/(?:🚀|buy|long|入|買い)/i.test(content) ) {
      side = 'buy';
    } else if (/(?:sell|short|出|売り)/i.test(content) ) {
      side = 'sell';
    }
    amount = fixedAmount;
  }

  if (!side || isNaN(amount) || amount <= 0) return;

  console.log(`Trade: ${side} ${symbol} ${amount}`);

  if (riskPct > 0) {
    const balance = await exchange.fetchBalance();
    const usdtFree = balance.free.USDT || 0;
    const ticker = await exchange.fetchTicker(symbol);
    const price = ticker.last;
    amount = (usdtFree * riskPct) / price;
  }

  if (!exchange) return message.reply("Exchange not ready.");

  try {
    const order = await exchange.createMarketOrder(symbol, side, amount);
    message.reply(`✅ **TRADE OK** ID: ${order.id} | ${side} ${symbol} ${amount} filled ${order.filled || 0} @$${order.average || 'mkt'} | ${order.status}`);
  } catch (e) {
    message.reply(`❌ ${e.message}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
