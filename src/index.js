require('dotenv').config();
const { Client, GatewayIntentBits } = require(\"discord.js\");
const ccxt = require('ccxt');

const EXCHANGE = process.env.EXCHANGE || 'binance';
const exchangeConfig = {
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  sandbox: process.env.SANDBOX === 'true',
};

let exchange;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once(\"ready\", async () => {
  console.log(\"Earn BTC Signal Bot v1 ready! 🖤\");
  try {
    exchange = new ccxt[EXCHANGE](exchangeConfig);
    await exchange.loadMarkets();
    console.log(`${EXCHANGE} loaded. Sandbox: ${exchangeConfig.sandbox}`);
  } catch (e) {
    console.error('Exchange init failed:', e.message);
  }
});

client.on(\"messageCreate\", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  console.log(`Msg: ${message.author.username} | ${message.content}`);

  if (message.content === \"!ping\") return message.reply(\"pong v1 🖤\");

  let side, amount;
  const symbol = 'BTCUSDT';
  const riskPct = parseFloat(process.env.RISK_PCT || '0');
  const fixedAmount = parseFloat(process.env.PROCESSING_AMOUNT || '0.001');

  // Command
  const cmdMatch = content.match(/!trade\\s+(buy|sell)/i);
  if (cmdMatch) {
    side = cmdMatch[1];
    amount = fixedAmount;
  } else {
    // Auto
    if (/(?:🚀|buy|long|入|買い)/.test(content)) {
      side = 'buy';
    } else if (/(?:sell|short|出|売り)/.test(content)) {
      side = 'sell';
    }
    amount = fixedAmount;
  }

  if (!side) return;

  console.log(`Trade: ${side} ${symbol} ${amount}`);

  if (riskPct > 0) {
    const balance = await exchange.fetchBalance();
    const usdtFree = balance.free.USDT || 0;
    const ticker = await exchange.fetchTicker(symbol);
    amount = (usdtFree * riskPct) / ticker.last;
  }

  if (!exchange) return message.reply(\"Exchange not ready.\");

  try {
    const order = await exchange.createMarketOrder(symbol, side, amount);
    message.reply(`✅ TRADE OK ID: ${order.id} | ${side} ${symbol} ${amount} filled ${order.filled || 0} @$${order.average || 'mkt'} | ${order.status}`);
  } catch (e) {
    message.reply(`❌ ${e.message}`);
  }
});

client.login(process.env.DISCORD_TOKEN);