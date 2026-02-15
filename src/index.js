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
  console.log("Earn BTC Signal Bot ready! 🖤");
  try {
    exchange = new ccxt[EXCHANGE](exchangeConfig);
    await exchange.loadMarkets();
    console.log(`${EXCHANGE} loaded OK. Sandbox: ${exchangeConfig.sandbox}`);
  } catch (e) {
    console.error('Exchange init failed:', e.message);
    console.log('Continuing with dry-run mode.');
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    return message.reply("pong! Ready for trades. 🖤");
  }

  if (!message.content.startsWith("!trade ")) return;

  const match = message.content.match(/!trade\\s+(BUY|SELL)\\s+(BTCUSDT)\\s+([\\d.]+)\\s*(market)?/i);
  if (!match) {
    return message.reply("**Format:** `!trade BUY BTCUSDT 0.001 [market]`\nAmount is BTC qty.");
  }

  const [, side, symbol, amountStr] = match;
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    return message.reply("Invalid amount >0");
  }

  console.log(`Processing ${side} ${symbol} ${amount}BTC`);

  if (!exchange) {
    return message.reply("Exchange not ready. Check .env.");
  }

  try {
    let order;
    if (exchangeConfig.sandbox) {
      // REAL TESTNET TRADE
      order = await exchange.createMarketOrder(symbol, side, amount);
      const filled = order.filled || 0;
      const avgPrice = order.average || 'market';
      message.reply(`✅ **TESTNET TRADE OK!**\n**ID:** \`${order.id}\`\n**Side:** ${side}\n**Symbol:** ${symbol}\n**Amount:** ${amount}\n**Filled:** ${filled}\n**Avg Price:** $${avgPrice}\n**Status:** ${order.status}`);
    } else {
      // DRY-RUN (prod warning)
      order = {
        id: `dry-${Date.now()}`,
        side, symbol, amount, type: 'market', status: 'simulated', filled: amount
      };
      message.reply(`⚠️ **DRY-RUN MODE** (SANDBOX=true for testnet)\nMock: ${side} ${symbol} ${amount}BTC\nID: \`${order.id}\``);
    }
    console.log('Trade result:', order);
  } catch (e) {
    console.error('Trade error:', e);
    message.reply(`❌ **Failed:** ${e.message}\n- Balance low?\n- Permissions?\n- Markets loaded?`);
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ No DISCORD_TOKEN!');
  process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);
console.log('Bot logging in...');