require("dotenv").config();

const express = require("express");
const { log, error, uptimeFormatted, getStartedAt } = require("./logger");
const { initExchange, getExchange } = require("./exchange");
const { startMonitor, stopMonitor, getSignalStats } = require("./signal");
const { startDiscordBot, stopDiscordBot } = require("./discord-bot");
const { startTelegramBot, stopTelegramBot } = require("./telegram-bot");

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

  // 2. Discord Bot
  try {
    await startDiscordBot();
  } catch (e) {
    error(MOD, "Discord bot failed:", e.message);
  }

  // 3. Telegram Bot
  try {
    await startTelegramBot();
  } catch (e) {
    error(MOD, "Telegram bot failed:", e.message);
  }

  // 4. Signal monitor
  startMonitor();

  // 5. Express health check
  const app = express();

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
    });
  });

  app.listen(PORT, () => {
    log(MOD, `Health check: http://localhost:${PORT}/health`);
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
