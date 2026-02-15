require('dotenv').config();
const { Client, GatewayIntentBits } = require("discord.js");
const ccxt = require('ccxt');

const EXCHANGE = process.env.EXCHANGE || 'binance'; // binance, bybit
const exchangeConfig = {
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  sandbox: process.env.SANDBOX === 'true', // testnet
};

let exchange;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once("ready", async () => {
  console.log("Earn BTC Signal Bot ready! 🖤");
  try {
    exchange = new ccxt[EXCHANGE](exchangeConfig);
    await exchange.loadMarkets();
    console.log(`${EXCHANGE} loaded.`);
  } catch (e) {
    console.error('Exchange init failed:', e.message);
  }
});

client.on("messageCreate", async (message) => {
  if (message.content === "!ping") {
    return message.reply("pong! 🖤");
  }

  if (!message.content.startsWith("!trade ")) return;

  const match = message.content.match(/!trade\s+(BUY|SELL)\s+(BTCUSDT)\s+([\d.]+)\s*(market|limit)?\s*(.*)?/i);
  if (!match) {
    return message.reply("Format: !trade BUY BTCUSDT 0.001 market");
  }

  const [, side, symbol, amountStr, orderType = 'market', extra] = match;
  const amount = parseFloat(amountStr);

  console.log(`Signal: ${side} ${symbol} ${amount} ${orderType}`);

  if (!exchange) {
    return message.reply("Exchange not ready.");
  }

  try {
    // Dry-run for now
    const mockOrder = {
      id: 'dry-' + Date.now(),
      side,
      symbol,
      type: orderType,
      amount,
      status: 'closed',
      filled: amount,
    };
    console.log('Mock order:', mockOrder);

    message.reply(`✅ Dry-run executed: **${side} ${symbol} ${amount} ${orderType}** (ID: ${mockOrder.id})\nReal trade when API keys set & sandbox=false.`);

    // TODO: Real order
    // const order = await exchange.createOrder(symbol, orderType, side, amount);

  } catch (e) {
    console.error(e);
    message.reply(`❌ Error: ${e.message}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
