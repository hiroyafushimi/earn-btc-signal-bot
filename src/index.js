require("dotenv").config();

const express = require("express");
const { log, error, uptimeFormatted, getStartedAt } = require("./logger");
const { initExchange, getExchange } = require("./exchange");
const { startMonitor, stopMonitor, getSignalStats } = require("./signal");
const { startDiscordBot, stopDiscordBot } = require("./discord-bot");
const { startTelegramBot, stopTelegramBot } = require("./telegram-bot");
const { initStripe, handleWebhook, getSubscriberCount } = require("./subscription");

const MOD = "Main";
const PORT = parseInt(process.env.PORT || "3000", 10);

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
  app.get("/health", (req, res) => {
    const ex = getExchange();
    const stats = getSignalStats();
    res.json({
      status: "ok",
      uptime: uptimeFormatted(),
      startedAt: new Date(getStartedAt()).toISOString(),
      exchange: {
        connected: !!ex,
        name: process.env.EXCHANGE || "binance",
        sandbox: process.env.SANDBOX === "true",
      },
      signals: stats,
      subscribers: getSubscriberCount(),
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

  app.listen(PORT, () => {
    log(MOD, `Server: http://localhost:${PORT} (health, webhook, subscribe)`);
  });

  log(MOD, "btc-signal-bot ready! #BTCto70k");
}

// Graceful shutdown
async function shutdown(signal) {
  log(MOD, `${signal} received, shutting down...`);

  stopMonitor();

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

  log(MOD, "Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((e) => {
  error(MOD, "Fatal:", e);
  process.exit(1);
});
