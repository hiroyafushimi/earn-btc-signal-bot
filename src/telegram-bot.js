const { Bot } = require("grammy");
const { fetchPrice, executeTrade } = require("./exchange");
const { onSignal, onDailySummary, getSignalStats, getRecentSignals } = require("./signal");
const { log, error, uptimeFormatted } = require("./logger");

const MOD = "Telegram";
let bot;

async function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    log(MOD, "TELEGRAM_BOT_TOKEN not set, skipping");
    return null;
  }

  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  bot = new Bot(token);

  // /start
  bot.command("start", async (ctx) => {
    await ctx.reply(
      [
        "btc-signal-bot #BTCto70k",
        "",
        "BTC シグナル配信ボット",
        "",
        "コマンド:",
        "/price - BTC 現在価格",
        "/status - Bot ステータス",
        "/history - 直近シグナル",
        "/subscribe - サブスク登録 ($5/月)",
        "/help - ヘルプ",
      ].join("\n"),
    );
  });

  // /price
  bot.command("price", async (ctx) => {
    try {
      const p = await fetchPrice("BTC/USDT");
      await ctx.reply(
        [
          `BTC/USDT`,
          `価格: $${p.last.toLocaleString()}`,
          `高値: $${p.high.toLocaleString()}`,
          `安値: $${p.low.toLocaleString()}`,
          `出来高: ${p.volume.toFixed(2)} BTC`,
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
        `Exchange: ${process.env.EXCHANGE || "binance"} (Sandbox: ${process.env.SANDBOX || "true"})`,
        `シグナル: BUY ${stats.totalBuy} / SELL ${stats.totalSell}`,
        `最終シグナル: ${lastAt}`,
        `履歴件数: ${stats.historyCount}`,
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
      return `${s.side} $${s.price.toLocaleString()} (${t})`;
    });
    await ctx.reply(
      [`直近シグナル (${recent.length}件)`, ...lines].join("\n"),
    );
  });

  // /subscribe
  bot.command("subscribe", async (ctx) => {
    await ctx.reply(
      [
        "サブスクリプション: $5/月",
        "",
        "BTC シグナル (#BTCto70k) の全配信を受け取れます。",
        "",
        "決済連携は準備中です。",
      ].join("\n"),
    );
  });

  // /help
  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "btc-signal-bot ヘルプ",
        "",
        "/start - ウェルカムメッセージ",
        "/price - BTC/USDT 現在価格",
        "/status - Bot ステータス",
        "/history - 直近シグナル",
        "/subscribe - サブスク登録",
        "/help - このヘルプ",
        "",
        "#BTCto70k",
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

    const amount = parseFloat(process.env.PROCESSING_AMOUNT || "0.001");

    try {
      const result = await executeTrade(side, "BTC/USDT", amount);
      await ctx.reply(
        `✅ ${result.side.toUpperCase()} ${result.symbol} | ID: ${result.id} | qty: ${result.qty} filled: ${result.filled} @$${result.average} | ${result.status}`,
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

  bot.start();
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
