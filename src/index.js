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

async function executeTrade(message, side, symbol, amount, orderType = 'market') {
  console.log(`Executing ${side} ${symbol} ${amount} ${orderType}`);
  if (!exchange) {
    return message.reply("Exchange not ready.");
  }
  try {
    let order;
    if (exchangeConfig.sandbox) {
      order = await exchange.createMarketOrder(symbol, side, amount);
      const filled = order.filled || 0;
      const avgPrice = order.average || 'market';
      message.reply(`✅ **TESTNET TRADE OK!**\\n**ID:** \\\`${order.id}\\\`\\n**Side:** ${side}\\n**Symbol:** ${symbol}\\n**Amount:** ${amount}\\n**Filled:** ${filled}\\n**Avg Price:** $${avgPrice}\\n**Status:** ${order.status}`);
    } else {
      order = { id: `dry-${Date.now()}`, side, symbol, amount, type: orderType, status: 'simulated', filled: amount };
      message.reply(`⚠️ **DRY-RUN** (SANDBOX=true for testnet)\\nMock: ${side} ${symbol} ${amount}\\nID: \\\`${order.id}\\\``);
    }
    console.log('Trade result:', order);
  } catch (e) {
    console.error('Trade error:', e);
    message.reply(`❌ **Failed:** ${e.message}\\nBalance/Permissions?`);
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  console.log(`Msg from ${message.author.username} (${message.author.id}): len=${message.content.length} | content: ${JSON.stringify(message.content)}`);

  if (message.content === "!ping") {
    return message.reply("pong! Ready for trades. 🖤");
  }

  // Auto parse
  let autoSide = null;
  let autoAmount = parseFloat(process.env.PROCESSING_AMOUNT || '0.001');
  const symbol = 'BTCUSDT';
  const autoRegex = /(?:🚀|buy|long|入|買い|ロング).*?(?:btc|bitcoin|btcusdt)/i;
  const autoRegexSell = /(?:sell|short|出|売り|ショート).*?(?:btc)/i;
  if (autoRegex.test(message.content)) {
    autoSide = 'buy';
  } else if (autoRegexSell.test(message.content)) {
    autoSide = 'sell';
  }
  if (autoSide) {
    console.log(`Auto: ${autoSide.toUpperCase()} ${symbol} ${autoAmount}`);
    return executeTrade(message, autoSide, symbol, autoAmount);
  }

  if (!message.content.startsWith("!trade ")) return;

  const match = message.content.match(/!trade\s+(BUY|SELL)\s+(BTCUSDT)\s+([\d.]+)\s*(market)?/i);
  console.log('Regex match:', JSON.stringify(match));
  if (!match) {
    return message.reply("**Format:** `!trade BUY BTCUSDT 0.001 [market]`");
  }

  const [, side, symbolCheck, amountStr] = match;
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    return message.reply("Invalid amount >0");
  }

  return executeTrade(message, side, 'BTCUSDT', amount);
});

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ No DISCORD_TOKEN!');
  process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);
console.log('Bot logging in...');