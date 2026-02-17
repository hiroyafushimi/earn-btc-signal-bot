const { Bot } = require("grammy");
const { fetchPrice, executeTrade, getDefaultSymbol, getSymbols, formatPrice, getBaseCurrencyForSymbol } = require("./exchange");
const { onSignal, onDailySummary, getSignalStats, getRecentSignals, getTimeframe, setTimeframe, getValidTimeframes, getActiveSymbols } = require("./signal");
const { log, error, uptimeFormatted } = require("./logger");
const { isEnabled: stripeEnabled, createCheckoutSession, isSubscribed, getSubscriberCount } = require("./subscription");
const { checkLimit } = require("./rate-limit");

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
    const symbols = getSymbols();
    await ctx.reply(
      [
        "crypto-signal-bot #MultiPair",
        "",
        `マルチペアシグナル配信ボット (${symbols.length}ペア)`,
        `監視中: ${symbols.map(s => s.split("/")[0]).join(", ")}`,
        "",
        "コマンド:",
        "/price [通貨] - 現在価格 (例: /price ETH)",
        "/prices - 全通貨の価格一覧",
        "/status - Bot ステータス",
        "/history - 直近シグナル",
        "/timeframe [tf] - タイムフレーム変更",
        "/subscribe - サブスク登録 ($5/月)",
        "/help - ヘルプ",
      ].join("\n"),
    );
  });

  // /prices (all symbols)
  bot.command("prices", async (ctx) => {
    try {
      const symbols = getSymbols();
      const lines = await Promise.all(symbols.map(async (sym) => {
        try {
          const p = await fetchPrice(sym);
          const base = getBaseCurrencyForSymbol(sym);
          return `${base}: ${formatPrice(p.last, sym)} (H: ${formatPrice(p.high, sym)} / L: ${formatPrice(p.low, sym)})`;
        } catch { return `${sym}: Error`; }
      }));
      await ctx.reply(["全通貨価格", "", ...lines].join("\n"));
    } catch (e) {
      await ctx.reply(`Error: ${e.message}`);
    }
  });

  // /price [symbol]
  bot.command("price", async (ctx) => {
    try {
      const parts = (ctx.message.text || "").split(/\s+/);
      const arg = parts[1];
      const symbols = getSymbols();
      let sym = getDefaultSymbol();
      if (arg) {
        const upper = arg.toUpperCase();
        sym = symbols.find((s) => s === upper || s.startsWith(upper + "/")) || sym;
      }
      const p = await fetchPrice(sym);
      const base = getBaseCurrencyForSymbol(sym);
      await ctx.reply(
        [
          sym,
          `価格: ${formatPrice(p.last, sym)}`,
          `高値: ${formatPrice(p.high, sym)}`,
          `安値: ${formatPrice(p.low, sym)}`,
          `出来高: ${(p.volume || 0).toFixed(2)} ${base}`,
        ].join("\n"),
      );
    } catch (e) {
      await ctx.reply(`Error: ${e.message}`);
    }
  });

  // /status
  bot.command("status", async (ctx) => {
    const stats = getSignalStats();
    const lastAt = stats.lastSignalAt
      ? new Date(stats.lastSignalAt).toLocaleString("ja-JP")
      : "なし";
    await ctx.reply(
      [
        "Bot Status",
        `Uptime: ${uptimeFormatted()}`,
        `Exchange: ${process.env.EXCHANGE || "bitbank"} (Sandbox: ${process.env.SANDBOX || "true"})`,
        `シグナル: BUY ${stats.totalBuy} / SELL ${stats.totalSell}`,
        `最終シグナル: ${lastAt}`,
        `履歴件数: ${stats.historyCount}`,
        `サブスクライバー: ${getSubscriberCount()}`,
      ].join("\n"),
    );
  });

  // /history
  bot.command("history", async (ctx) => {
    const recent = getRecentSignals(5);
    if (recent.length === 0) {
      return ctx.reply("シグナル履歴なし");
    }
    const lines = recent.map((s) => {
      const t = new Date(s.timestamp).toLocaleString("ja-JP");
      const base = getBaseCurrencyForSymbol(s.symbol || getDefaultSymbol());
      return `[${base}] ${s.side} ${formatPrice(s.price, s.symbol)} (${t})`;
    });
    await ctx.reply(
      [`直近シグナル (${recent.length}件)`, ...lines].join("\n"),
    );
  });

  // /subscribe
  bot.command("subscribe", async (ctx) => {
    if (!stripeEnabled()) {
      return ctx.reply(
        "サブスクリプション: $5/月\n\n決済連携は準備中です。",
      );
    }
    const sub = isSubscribed("telegram", ctx.from.id);
    if (sub) {
      return ctx.reply("✅ サブスク有効です。#BTCto70k");
    }
    try {
      const url = await createCheckoutSession(
        "telegram",
        ctx.from.id,
        ctx.from.username || ctx.from.first_name,
      );
      await ctx.reply(
        `サブスクリプション: $5/月\n\n決済はこちら:\n${url}`,
      );
    } catch (e) {
      await ctx.reply(`Error: ${e.message}`);
    }
  });

  // /timeframe or /tf
  bot.command("timeframe", handleTimeframe);
  bot.command("tf", handleTimeframe);

  async function handleTimeframe(ctx) {
    const parts = (ctx.message.text || "").split(/\s+/);
    const arg = parts[1];
    if (!arg) {
      return ctx.reply(
        `現在のタイムフレーム: ${getTimeframe()}\n有効: ${getValidTimeframes().join(", ")}\n使い方: /timeframe 5m`,
      );
    }
    const result = setTimeframe(arg);
    if (!result.ok) {
      return ctx.reply(result.error);
    }
    return ctx.reply(`タイムフレーム変更: ${result.prev} -> ${result.current}`);
  }

  // /help
  bot.command("help", async (ctx) => {
    const symbols = getSymbols();
    await ctx.reply(
      [
        "crypto-signal-bot ヘルプ",
        "",
        `/price [通貨] - 価格 (例: /price ETH)`,
        "/prices - 全通貨の価格一覧",
        "/status - Bot ステータス",
        "/history - 直近シグナル",
        "/timeframe [tf] - タイムフレーム変更",
        "/subscribe - サブスク登録",
        "/help - このヘルプ",
        "",
        `監視中: ${symbols.map(s => s.split("/")[0]).join(", ")}`,
      ].join("\n"),
    );
  });

  // Text trade detection
  bot.on("message:text", async (ctx) => {
    const content = ctx.message.text.toLowerCase();

    let side;
    if (/(?:🚀|buy|long|入|買い)/.test(content)) {
      side = "buy";
    } else if (/(?:sell|short|出|売り)/.test(content)) {
      side = "sell";
    }

    if (!side) return;

    if (!isAdmin(ctx.from.id)) {
      return ctx.reply("⛔ トレード権限がありません");
    }

    const amount = parseFloat(process.env.PROCESSING_AMOUNT || "0.001");

    try {
      const result = await executeTrade(side, undefined, amount);
      await ctx.reply(
        `✅ ${result.side.toUpperCase()} ${result.symbol} | ID: ${result.id} | qty: ${result.qty} filled: ${result.filled} @${formatPrice(result.average, result.symbol)} | ${result.status}`,
      );
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
