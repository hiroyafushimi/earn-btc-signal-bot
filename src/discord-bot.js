const { Client, GatewayIntentBits } = require("discord.js");
const { executeTrade, fetchPrice } = require("./exchange");
const { onSignal, onDailySummary, getSignalStats, getRecentSignals } = require("./signal");
const { log, error, uptimeFormatted } = require("./logger");

const MOD = "Discord";
let client;
let signalChannelId;

async function startDiscordBot() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    log(MOD, "DISCORD_TOKEN not set, skipping");
    return null;
  }

  signalChannelId = process.env.DISCORD_SIGNAL_CHANNEL_ID;

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("ready", () => {
    log(MOD, `Bot ready: ${client.user.tag}`);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();
    log(MOD, `${message.author.username}: ${message.content}`);

    // !ping
    if (message.content === "!ping") {
      return message.reply("pong #BTCto70k");
    }

    // !price
    if (message.content === "!price") {
      try {
        const p = await fetchPrice("BTC/USDT");
        return message.reply(
          `BTC/USDT: $${p.last.toLocaleString()} | H: $${p.high.toLocaleString()} | L: $${p.low.toLocaleString()}`,
        );
      } catch (e) {
        return message.reply(`Error: ${e.message}`);
      }
    }

    // !status
    if (message.content === "!status") {
      const stats = getSignalStats();
      const lastAt = stats.lastSignalAt
        ? new Date(stats.lastSignalAt).toLocaleString("ja-JP")
        : "なし";
      return message.reply(
        [
          `**Bot Status**`,
          `Uptime: ${uptimeFormatted()}`,
          `Exchange: ${process.env.EXCHANGE || "binance"} (Sandbox: ${process.env.SANDBOX || "true"})`,
          `シグナル: BUY ${stats.totalBuy} / SELL ${stats.totalSell}`,
          `最終シグナル: ${lastAt}`,
          `履歴件数: ${stats.historyCount}`,
        ].join("\n"),
      );
    }

    // !history
    if (message.content === "!history") {
      const recent = getRecentSignals(5);
      if (recent.length === 0) {
        return message.reply("シグナル履歴なし");
      }
      const lines = recent.map((s) => {
        const t = new Date(s.timestamp).toLocaleString("ja-JP");
        return `${s.side} $${s.price.toLocaleString()} (${t})`;
      });
      return message.reply(
        [`**直近シグナル (${recent.length}件)**`, ...lines].join("\n"),
      );
    }

    // Trade detection
    let side, amount;
    const fixedAmount = parseFloat(process.env.PROCESSING_AMOUNT || "0.001");

    const cmdMatch = content.match(/!trade\s+(buy|sell)/i);
    if (cmdMatch) {
      side = cmdMatch[1].toLowerCase();
      amount = fixedAmount;
    } else {
      if (/(?:🚀|buy|long|入|買い)/.test(content)) {
        side = "buy";
      } else if (/(?:sell|short|出|売り)/.test(content)) {
        side = "sell";
      }
      if (side) amount = fixedAmount;
    }

    if (!side) return;

    try {
      const result = await executeTrade(side, "BTC/USDT", amount);
      message.reply(
        `✅ ${result.side.toUpperCase()} ${result.symbol} | ID: ${result.id} | qty: ${result.qty} filled: ${result.filled} @$${result.average} | ${result.status}`,
      );
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
