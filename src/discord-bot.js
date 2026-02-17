const { Client, Events, GatewayIntentBits } = require("discord.js");
const { executeTrade, fetchPrice, getDefaultSymbol, getSymbols, formatPrice, getBaseCurrencyForSymbol, resolveSymbol, getTradeAmount } = require("./exchange");
const { onSignal, onDailySummary, getSignalStats, getRecentSignals, getTimeframe, setTimeframe, getValidTimeframes, getActiveSymbols } = require("./signal");
const { log, error, uptimeFormatted } = require("./logger");
const { isEnabled: stripeEnabled, createCheckoutSession, isSubscribed, getSubscriberCount } = require("./subscription");
const { checkLimit } = require("./rate-limit");

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

    // !ping
    if (content === "!ping") {
      return message.reply("pong #BTCto70k");
    }

    // !price [symbol] or !prices
    if (content === "!prices") {
      try {
        const symbols = getSymbols();
        const lines = await Promise.all(symbols.map(async (sym) => {
          try {
            const p = await fetchPrice(sym);
            const base = getBaseCurrencyForSymbol(sym);
            return `${base}: ${formatPrice(p.last, sym)} | H: ${formatPrice(p.high, sym)} | L: ${formatPrice(p.low, sym)}`;
          } catch { return `${sym}: Error`; }
        }));
        return message.reply(lines.join("\n"));
      } catch (e) {
        return message.reply(`Error: ${e.message}`);
      }
    }

    if (content === "!price" || content.startsWith("!price ")) {
      try {
        const parts = message.content.split(/\s+/);
        const arg = parts[1];
        const symbols = getSymbols();
        let sym = getDefaultSymbol();
        if (arg) {
          const upper = arg.toUpperCase();
          sym = symbols.find((s) => s === upper || s.startsWith(upper + "/")) || sym;
        }
        const p = await fetchPrice(sym);
        return message.reply(
          `${sym}: ${formatPrice(p.last, sym)} | H: ${formatPrice(p.high, sym)} | L: ${formatPrice(p.low, sym)}`,
        );
      } catch (e) {
        return message.reply(`Error: ${e.message}`);
      }
    }

    // !status
    if (content === "!status") {
      const stats = getSignalStats();
      const lastAt = stats.lastSignalAt
        ? new Date(stats.lastSignalAt).toLocaleString("ja-JP")
        : "なし";
      return message.reply(
        [
          `**Bot Status**`,
          `Uptime: ${uptimeFormatted()}`,
          `Exchange: ${process.env.EXCHANGE || "bitbank"} (Sandbox: ${process.env.SANDBOX || "true"})`,
          `シグナル: BUY ${stats.totalBuy} / SELL ${stats.totalSell}`,
          `最終シグナル: ${lastAt}`,
          `履歴件数: ${stats.historyCount}`,
          `サブスクライバー: ${getSubscriberCount()}`,
        ].join("\n"),
      );
    }

    // !history
    if (content === "!history") {
      const recent = getRecentSignals(5);
      if (recent.length === 0) {
        return message.reply("シグナル履歴なし");
      }
      const lines = recent.map((s) => {
        const t = new Date(s.timestamp).toLocaleString("ja-JP");
        const base = getBaseCurrencyForSymbol(s.symbol || getDefaultSymbol());
        return `[${base}] ${s.side} ${formatPrice(s.price, s.symbol)} (${t})`;
      });
      return message.reply(
        [`**直近シグナル (${recent.length}件)**`, ...lines].join("\n"),
      );
    }

    // !timeframe
    if (content === "!timeframe" || content.startsWith("!timeframe ") || content === "!tf" || content.startsWith("!tf ")) {
      const parts = message.content.split(/\s+/);
      const arg = parts[1];
      if (!arg) {
        return message.reply(
          `現在のタイムフレーム: **${getTimeframe()}**\n有効: ${getValidTimeframes().join(", ")}\n使い方: \`!timeframe 5m\``,
        );
      }
      const result = setTimeframe(arg);
      if (!result.ok) {
        return message.reply(result.error);
      }
      return message.reply(`タイムフレーム変更: ${result.prev} -> **${result.current}**`);
    }

    // !subscribe
    if (content === "!subscribe") {
      if (!stripeEnabled()) {
        return message.reply("サブスクリプション: $5/月\n決済連携は準備中です。");
      }
      const sub = isSubscribed("discord", message.author.id);
      if (sub) {
        return message.reply("✅ サブスク有効です。#BTCto70k");
      }
      try {
        const url = await createCheckoutSession(
          "discord",
          message.author.id,
          message.author.username,
        );
        return message.reply(
          `サブスクリプション: $5/月\n決済はこちら: ${url}`,
        );
      } catch (e) {
        return message.reply(`Error: ${e.message}`);
      }
    }

    // Trade detection: !trade buy [symbol] [amount] or !trade sell ETH 0.5
    let side, tradeSymbol, amount;

    const cmdMatch = content.match(/!trade\s+(buy|sell)(?:\s+([a-z][a-z0-9/]*)\s*([\d.]+)?|\s+([\d.]+))?/i);
    if (cmdMatch) {
      side = cmdMatch[1].toLowerCase();
      if (cmdMatch[2]) tradeSymbol = resolveSymbol(cmdMatch[2]);
      if (cmdMatch[3]) amount = parseFloat(cmdMatch[3]);
      if (cmdMatch[4]) amount = parseFloat(cmdMatch[4]);
    } else {
      if (/(?:🚀|buy|long|入|買い)/.test(content)) {
        side = "buy";
      } else if (/(?:sell|short|出|売り)/.test(content)) {
        side = "sell";
      }
      // Try to detect coin name from message (e.g. "buy ETH", "ETH 買い")
      if (side) {
        const symbols = getSymbols();
        for (const s of symbols) {
          const base = s.split("/")[0].toLowerCase();
          if (content.includes(base)) {
            tradeSymbol = s;
            break;
          }
        }
      }
    }

    if (!side) return;

    if (!isAdmin(message.author.id)) {
      return message.reply("⛔ トレード権限がありません");
    }

    const sym = tradeSymbol || getDefaultSymbol();
    const qty = amount || getTradeAmount(sym);

    try {
      const result = await executeTrade(side, sym, qty);
      message.reply(
        `✅ ${result.side.toUpperCase()} ${result.symbol} | ID: ${result.id} | qty: ${result.qty} filled: ${result.filled} @${formatPrice(result.average, result.symbol)} | ${result.status}`,
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
