const { Bot } = require("grammy");
const { onSignal, onDailySummary } = require("./signal");
const { log, error } = require("./logger");
const { checkLimit } = require("./rate-limit");
const { getDefaultSymbol, getTradeAmount } = require("./exchange");
const {
  handlePrices, handlePrice, handleStatus, handleBalance,
  handleHistory, handleTimeframe, handleSubscribe, handleHelp,
  handleTrade, detectTradeIntent, parseTradeArgs,
} = require("./bot-commands");

const MOD = "Telegram";
let bot;
let adminIds;

function isAdmin(userId) {
  if (!adminIds) return true;
  return adminIds.includes(String(userId));
}

async function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !/^\d+:[\w-]+$/.test(token)) {
    log(MOD, "TELEGRAM_BOT_TOKEN not set or invalid, skipping");
    return null;
  }

  const rawChannelId = (process.env.TELEGRAM_CHANNEL_ID || "").trim();
  const channelId = rawChannelId && !/^your_/.test(rawChannelId) ? rawChannelId : null;
  if (!channelId) {
    log(MOD, "TELEGRAM_CHANNEL_ID not set, signal broadcast disabled");
  }
  const parsedAdminIds = (process.env.ADMIN_TELEGRAM_IDS || "").trim()
    .split(",").map((id) => id.trim()).filter(Boolean);
  adminIds = parsedAdminIds.length > 0 ? parsedAdminIds : null;

  bot = new Bot(token);

  // Rate limit middleware
  bot.use(async (ctx, next) => {
    if (ctx.from && !checkLimit("telegram", ctx.from.id)) {
      return ctx.reply("⏳ レート制限中です。しばらくお待ちください。");
    }
    await next();
  });

  // /start
  bot.command("start", async (ctx) => {
    await ctx.reply(handleHelp());
  });

  // /prices
  bot.command("prices", async (ctx) => {
    try {
      await ctx.reply(await handlePrices());
    } catch (e) {
      await ctx.reply(`Error: ${e.message}`);
    }
  });

  // /price [symbol]
  bot.command("price", async (ctx) => {
    try {
      const arg = (ctx.message.text || "").split(/\s+/)[1];
      await ctx.reply(await handlePrice(arg));
    } catch (e) {
      await ctx.reply(`Error: ${e.message}`);
    }
  });

  // /status
  bot.command("status", async (ctx) => {
    await ctx.reply(handleStatus());
  });

  // /history
  bot.command("history", async (ctx) => {
    await ctx.reply(handleHistory());
  });

  // /balance
  bot.command("balance", async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply("⛔ 残高確認の権限がありません");
    }
    try {
      await ctx.reply(await handleBalance());
    } catch (e) {
      await ctx.reply(`Error: ${e.message}`);
    }
  });

  // /subscribe
  bot.command("subscribe", async (ctx) => {
    try {
      await ctx.reply(
        await handleSubscribe("telegram", ctx.from.id, ctx.from.username || ctx.from.first_name),
      );
    } catch (e) {
      await ctx.reply(`Error: ${e.message}`);
    }
  });

  // /timeframe or /tf
  const handleTf = async (ctx) => {
    const arg = (ctx.message.text || "").split(/\s+/)[1];
    await ctx.reply(handleTimeframe(arg).text);
  };
  bot.command("timeframe", handleTf);
  bot.command("tf", handleTf);

  // /trade buy [symbol] [amount]
  bot.command("trade", async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply("⛔ トレード権限がありません");
    }
    try {
      const parts = (ctx.message.text || "").split(/\s+/);
      const { side, symbol, amount } = parseTradeArgs(parts[1], parts[2], parts[3]);
      await ctx.reply(await handleTrade(side, symbol, amount));
    } catch (e) {
      await ctx.reply(`❌ ${e.message}`);
    }
  });

  // /help
  bot.command("help", async (ctx) => {
    await ctx.reply(handleHelp());
  });

  // Text-based trade detection
  bot.on("message:text", async (ctx) => {
    const content = ctx.message.text.toLowerCase();
    const intent = detectTradeIntent(content);
    if (!intent) return;

    if (!isAdmin(ctx.from.id)) {
      return ctx.reply("⛔ トレード権限がありません");
    }

    try {
      const sym = intent.symbol || getDefaultSymbol();
      await ctx.reply(await handleTrade(intent.side, sym, getTradeAmount(sym)));
    } catch (e) {
      await ctx.reply(`❌ ${e.message}`);
    }
  });

  // Signal listener
  onSignal(async (signal, msg) => {
    if (!channelId) return;
    try {
      await bot.api.sendMessage(channelId, msg);
    } catch (e) {
      error(MOD, "signal send error:", e.message);
    }
  });

  // Daily summary listener
  onDailySummary(async (summary) => {
    if (!channelId) return;
    try {
      await bot.api.sendMessage(channelId, summary);
    } catch (e) {
      error(MOD, "summary send error:", e.message);
    }
  });

  bot.catch((err) => {
    error(MOD, "Bot error:", err.message);
  });

  bot.start().catch((err) => {
    error(MOD, "Bot start failed:", err.message);
    bot = null;
  });

  log(MOD, "Bot started");
  return bot;
}

function stopTelegramBot() {
  if (bot) {
    bot.stop();
    log(MOD, "Bot stopped");
  }
}

module.exports = { startTelegramBot, stopTelegramBot };
