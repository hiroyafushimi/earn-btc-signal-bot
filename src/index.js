require("dotenv").config();

const express = require("express");
const { log, error, uptimeFormatted, getStartedAt } = require("./logger");
const { initExchange, getExchange } = require("./exchange");
const { startMonitor, stopMonitor, getSignalStats, getTimeframe, setTimeframe, getValidTimeframes, getRecentSignals, getActiveSymbols } = require("./signal");
const { fetchOHLCV, fetchPrice, getSymbols, getDefaultSymbol } = require("./exchange");
const { startDiscordBot, stopDiscordBot } = require("./discord-bot");
const { startTelegramBot, stopTelegramBot } = require("./telegram-bot");
const { initStripe, handleWebhook, getSubscriberCount } = require("./subscription");
const { stopCleanup: stopRateLimitCleanup } = require("./rate-limit");

const MOD = "Main";
const PORT = parseInt(process.env.PORT || "3000", 10);
const TUI_MODE = process.argv.includes("--tui");
let server;

async function main() {
  log(MOD, "btc-signal-bot starting... #BTCto70k");

  // 1. Exchange
  try {
    await initExchange();
  } catch (e) {
    error(MOD, "Exchange init failed, continuing without trade:", e.message);
  }

  // 2. Stripe
  initStripe();

  // 3. Discord Bot
  try {
    await startDiscordBot();
  } catch (e) {
    error(MOD, "Discord bot failed:", e.message);
  }

  // 4. Telegram Bot
  try {
    await startTelegramBot();
  } catch (e) {
    error(MOD, "Telegram bot failed:", e.message);
  }

  // 5. Signal monitor
  startMonitor();

  // 6. Express server
  const app = express();

  // Health check
  app.get("/health", async (req, res) => {
    const ex = getExchange();
    const stats = await getSignalStats();
    const subscribers = await getSubscriberCount();
    res.json({
      status: "ok",
      uptime: uptimeFormatted(),
      startedAt: new Date(getStartedAt()).toISOString(),
      exchange: {
        connected: !!ex,
        name: process.env.EXCHANGE || "bitbank",
        sandbox: process.env.SANDBOX === "true",
      },
      signals: stats,
      subscribers,
    });
  });

  // Stripe webhook (raw body required for signature verification)
  app.post(
    "/webhook/stripe",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      try {
        const sig = req.headers["stripe-signature"];
        const result = await handleWebhook(req.body, sig);
        res.json(result);
      } catch (e) {
        error(MOD, "Stripe webhook error:", e.message);
        res.status(400).json({ error: e.message });
      }
    },
  );

  // Subscribe success/cancel pages
  app.get("/subscribe/success", (req, res) => {
    res.send(
      "<html><body><h1>登録完了</h1><p>BTC シグナル (#BTCto70k) のサブスクリプションが有効になりました。Bot に戻ってご利用ください。</p></body></html>",
    );
  });

  app.get("/subscribe/cancel", (req, res) => {
    res.send(
      "<html><body><h1>キャンセル</h1><p>登録がキャンセルされました。再度 /subscribe でお試しください。</p></body></html>",
    );
  });

  // API: timeframe
  app.get("/api/timeframe", (req, res) => {
    res.json({ current: getTimeframe(), valid: getValidTimeframes() });
  });

  app.post("/api/timeframe", express.json(), (req, res) => {
    const { timeframe } = req.body || {};
    if (!timeframe) return res.status(400).json({ error: "timeframe required" });
    const result = setTimeframe(timeframe);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  // API: symbols
  app.get("/api/symbols", (req, res) => {
    res.json({ symbols: getSymbols(), default: getDefaultSymbol() });
  });

  // API: chart data
  app.get("/api/chart", async (req, res) => {
    try {
      const symbol = req.query.symbol || getDefaultSymbol();
      const tf = req.query.timeframe || getTimeframe();
      const limit = Math.min(parseInt(req.query.limit || "60", 10), 200);
      const candles = await fetchOHLCV(symbol, tf, limit);
      const price = await fetchPrice(symbol);
      res.json({ candles, price, timeframe: tf, symbol });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: prices (all symbols)
  app.get("/api/prices", async (req, res) => {
    try {
      const symbols = getSymbols();
      const prices = await Promise.allSettled(
        symbols.map((s) => fetchPrice(s))
      );
      const result = {};
      symbols.forEach((s, i) => {
        if (prices[i].status === "fulfilled") {
          result[s] = prices[i].value;
        }
      });
      res.json({ prices: result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: signals
  app.get("/api/signals", async (req, res) => {
    const count = Math.min(parseInt(req.query.count || "20", 10), 100);
    const symbol = req.query.symbol || undefined;
    const [signals, stats] = await Promise.all([
      getRecentSignals(count, symbol),
      getSignalStats(symbol),
    ]);
    res.json({ signals, stats });
  });

  // Web dashboard
  const dashboardPath = require("path").join(__dirname, "dashboard.html");
  app.get("/dashboard", (req, res) => {
    res.sendFile(dashboardPath);
  });

  server = app.listen(PORT, () => {
    log(MOD, `Server: http://localhost:${PORT} (health, webhook, subscribe, dashboard)`);
  });

  log(MOD, "btc-signal-bot ready! #BTCto70k");

  // TUI mode
  if (TUI_MODE) {
    const { startTUI } = require("./tui");
    startTUI();
    log(MOD, "TUI dashboard started");
  }
}

// Graceful shutdown
async function shutdown(signal) {
  log(MOD, `${signal} received, shutting down...`);

  stopMonitor();
  stopRateLimitCleanup();

  try {
    stopDiscordBot();
  } catch (e) {
    error(MOD, "Discord shutdown error:", e.message);
  }

  try {
    stopTelegramBot();
  } catch (e) {
    error(MOD, "Telegram shutdown error:", e.message);
  }

  if (TUI_MODE) {
    try {
      const { stopTUI } = require("./tui");
      stopTUI();
    } catch (e) { /* ignore */ }
  }

  if (server) {
    server.close(() => {
      log(MOD, "Express server closed");
    });
  }

  log(MOD, "Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((e) => {
  error(MOD, "Fatal:", e);
  process.exit(1);
});
