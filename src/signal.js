const fs = require("fs");
const path = require("path");
const { fetchPrice } = require("./exchange");
const { log, error } = require("./logger");

const MOD = "Signal";
const INTERVAL = parseInt(process.env.SIGNAL_INTERVAL || "60000", 10);
const COOLDOWN = parseInt(process.env.SIGNAL_COOLDOWN || "300000", 10);
const DATA_DIR = path.join(__dirname, "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "signals.json");
const DAILY_INTERVAL = 24 * 60 * 60 * 1000;

let priceHistory = [];
let signalListeners = [];
let summaryListeners = [];
let timer = null;
let dailyTimer = null;
let lastSignalTime = {};
let signalCount = { buy: 0, sell: 0 };
let lastSignalAt = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadHistory() {
  ensureDataDir();
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    }
  } catch (e) {
    error(MOD, "Failed to load history:", e.message);
  }
  return [];
}

function saveSignal(signal) {
  ensureDataDir();
  try {
    const history = loadHistory();
    history.push(signal);
    // Keep last 500 signals
    const trimmed = history.slice(-500);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2));
  } catch (e) {
    error(MOD, "Failed to save signal:", e.message);
  }
}

function getRecentSignals(count = 5) {
  const history = loadHistory();
  return history.slice(-count);
}

function getSignalStats() {
  return {
    totalBuy: signalCount.buy,
    totalSell: signalCount.sell,
    lastSignalAt,
    historyCount: loadHistory().length,
  };
}

function onSignal(callback) {
  signalListeners.push(callback);
}

function onDailySummary(callback) {
  summaryListeners.push(callback);
}

function formatSignal(signal) {
  const price = signal.price.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const target = signal.target.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const sl = signal.stopLoss.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return [
    `#BTCto70k シグナル`,
    ``,
    `方向: ${signal.side}`,
    `通貨: ${signal.symbol}`,
    `価格: ${price}`,
    `ターゲット: ${target}`,
    `ストップロス: ${sl}`,
    `リスク: ${signal.riskPct}%`,
    ``,
    `${new Date(signal.timestamp).toISOString()}`,
  ].join("\n");
}

function analyze(prices) {
  if (prices.length < 5) return null;

  const recent = prices.slice(-5);
  const avg = recent.reduce((s, p) => s + p.last, 0) / recent.length;
  const current = recent[recent.length - 1];

  if (current.last < avg * 0.99) {
    return {
      side: "BUY",
      symbol: "BTC/USDT",
      price: current.last,
      target: Math.round(current.last * 1.03),
      stopLoss: Math.round(current.last * 0.98),
      riskPct: 1,
      timestamp: Date.now(),
    };
  }

  if (current.last > avg * 1.01) {
    return {
      side: "SELL",
      symbol: "BTC/USDT",
      price: current.last,
      target: Math.round(current.last * 0.97),
      stopLoss: Math.round(current.last * 1.02),
      riskPct: 1,
      timestamp: Date.now(),
    };
  }

  return null;
}

function isCooldownActive(side) {
  const last = lastSignalTime[side];
  if (!last) return false;
  return Date.now() - last < COOLDOWN;
}

async function emitSignal(signal) {
  const message = formatSignal(signal);
  log(MOD, `Signal: ${signal.side} @$${signal.price}`);

  lastSignalTime[signal.side] = Date.now();
  lastSignalAt = Date.now();
  signalCount[signal.side.toLowerCase()] =
    (signalCount[signal.side.toLowerCase()] || 0) + 1;

  saveSignal(signal);

  for (const cb of signalListeners) {
    try {
      await cb(signal, message);
    } catch (e) {
      error(MOD, "listener error:", e.message);
    }
  }
}

async function tick() {
  try {
    const price = await fetchPrice("BTC/USDT");
    priceHistory.push(price);

    if (priceHistory.length > 100) {
      priceHistory = priceHistory.slice(-100);
    }

    log(MOD, `BTC/USDT: $${price.last}`);

    const signal = analyze(priceHistory);
    if (signal) {
      if (isCooldownActive(signal.side)) {
        log(MOD, `Cooldown active for ${signal.side}, skipped`);
        return;
      }
      await emitSignal(signal);
    }
  } catch (e) {
    error(MOD, "tick error:", e.message);
  }
}

async function emitDailySummary() {
  const history = loadHistory();
  const oneDayAgo = Date.now() - DAILY_INTERVAL;
  const todaySignals = history.filter((s) => s.timestamp > oneDayAgo);

  const prices = priceHistory.map((p) => p.last);
  const high = prices.length > 0 ? Math.max(...prices) : 0;
  const low = prices.length > 0 ? Math.min(...prices) : 0;
  const current = prices.length > 0 ? prices[prices.length - 1] : 0;

  const summary = [
    `#BTCto70k 日次サマリー`,
    ``,
    `BTC/USDT: $${current.toLocaleString()}`,
    `24h High: $${high.toLocaleString()}`,
    `24h Low: $${low.toLocaleString()}`,
    ``,
    `シグナル数: ${todaySignals.length}`,
    `  BUY: ${todaySignals.filter((s) => s.side === "BUY").length}`,
    `  SELL: ${todaySignals.filter((s) => s.side === "SELL").length}`,
    ``,
    `${new Date().toISOString()}`,
  ].join("\n");

  log(MOD, "Daily summary sent");

  for (const cb of summaryListeners) {
    try {
      await cb(summary);
    } catch (e) {
      error(MOD, "summary listener error:", e.message);
    }
  }
}

function startMonitor() {
  log(MOD, `Monitor started (interval: ${INTERVAL}ms, cooldown: ${COOLDOWN}ms)`);
  tick();
  timer = setInterval(tick, INTERVAL);

  dailyTimer = setInterval(emitDailySummary, DAILY_INTERVAL);
}

function stopMonitor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (dailyTimer) {
    clearInterval(dailyTimer);
    dailyTimer = null;
  }
  log(MOD, "Monitor stopped");
}

module.exports = {
  onSignal,
  onDailySummary,
  formatSignal,
  startMonitor,
  stopMonitor,
  getRecentSignals,
  getSignalStats,
};
