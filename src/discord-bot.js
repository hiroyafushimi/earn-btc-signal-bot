const { Client, Events, GatewayIntentBits } = require("discord.js");
const { onSignal, onDailySummary } = require("./signal");
const { log, error } = require("./logger");
const { checkLimit } = require("./rate-limit");
const { getDefaultSymbol, getTradeAmount } = require("./exchange");
const {
  handlePrices, handlePrice, handleStatus, handleBalance,
  handleHistory, handleTimeframe, handleSubscribe, handleTrade,
  detectTradeIntent, parseTradeArgs,
} = require("./bot-commands");

const MOD = "Discord";
let client;
let signalChannelId;
let adminIds;

function isAdmin(userId) {
  if (!adminIds) return true;
  return adminIds.includes(userId);
}

async function startDiscordBot() {
  const token = (process.env.DISCORD_TOKEN || "").trim();
  if (!token || /^your_/.test(token)) {
    log(MOD, "DISCORD_TOKEN not set or placeholder, skipping");
    return null;
  }

  const rawChannelId = (process.env.DISCORD_SIGNAL_CHANNEL_ID || "").trim();
  signalChannelId = rawChannelId && !/^your_/.test(rawChannelId) ? rawChannelId : null;
  if (!signalChannelId) {
    log(MOD, "DISCORD_SIGNAL_CHANNEL_ID not set, signal broadcast disabled");
  }
  const parsedAdminIds = (process.env.ADMIN_DISCORD_IDS || "").trim()
    .split(",").map((id) => id.trim()).filter(Boolean);
  adminIds = parsedAdminIds.length > 0 ? parsedAdminIds : null;

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, () => {
    log(MOD, `Bot ready: ${client.user.tag}`);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();
    log(MOD, `${message.author.username}: ${message.content}`);

    if (!checkLimit("discord", message.author.id)) {
      return message.reply("⏳ レート制限中です。しばらくお待ちください。");
    }

    try {
      // !ping
      if (content === "!ping") {
        return message.reply("pong #BTCto70k");
      }

      // !prices
      if (content === "!prices") {
        return message.reply(await handlePrices());
      }

      // !price [symbol]
      if (content === "!price" || content.startsWith("!price ")) {
        const arg = message.content.split(/\s+/)[1];
        return message.reply(await handlePrice(arg));
      }

      // !status
      if (content === "!status") {
        return message.reply(handleStatus());
      }

      // !balance
      if (content === "!balance") {
        if (!isAdmin(message.author.id)) {
          return message.reply("⛔ 残高確認の権限がありません");
        }
        return message.reply(await handleBalance());
      }

      // !history
      if (content === "!history") {
        return message.reply(handleHistory());
      }

      // !timeframe / !tf
      if (/^!(?:timeframe|tf)(?:\s|$)/.test(content)) {
        const arg = message.content.split(/\s+/)[1];
        return message.reply(handleTimeframe(arg).text);
      }

      // !subscribe
      if (content === "!subscribe") {
        return message.reply(
          await handleSubscribe("discord", message.author.id, message.author.username),
        );
      }

      // !trade buy [symbol] [amount]
      if (content.startsWith("!trade ")) {
        if (!isAdmin(message.author.id)) {
          return message.reply("⛔ トレード権限がありません");
        }
        const parts = message.content.split(/\s+/);
        const { side, symbol, amount } = parseTradeArgs(parts[1], parts[2], parts[3]);
        return message.reply(await handleTrade(side, symbol, amount));
      }

      // Text-based trade detection
      const intent = detectTradeIntent(content);
      if (intent) {
        if (!isAdmin(message.author.id)) {
          return message.reply("⛔ トレード権限がありません");
        }
        const { side, symbol } = intent;
        const sym = symbol || getDefaultSymbol();
        return message.reply(await handleTrade(side, sym, getTradeAmount(sym)));
      }
    } catch (e) {
      message.reply(`❌ ${e.message}`);
    }
  });

  // Signal listener
  onSignal(async (signal, msg) => {
    if (!signalChannelId || !client.isReady()) return;
    try {
      const channel = await client.channels.fetch(signalChannelId);
      if (channel) await channel.send(msg);
    } catch (e) {
      error(MOD, "signal send error:", e.message);
    }
  });

  // Daily summary listener
  onDailySummary(async (summary) => {
    if (!signalChannelId || !client.isReady()) return;
    try {
      const channel = await client.channels.fetch(signalChannelId);
      if (channel) await channel.send(summary);
    } catch (e) {
      error(MOD, "summary send error:", e.message);
    }
  });

  await client.login(token);
  return client;
}

function stopDiscordBot() {
  if (client) {
    client.destroy();
    log(MOD, "Bot stopped");
  }
}

module.exports = { startDiscordBot, stopDiscordBot };
