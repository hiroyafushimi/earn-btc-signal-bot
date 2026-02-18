const { fetchPrice, fetchOHLCV, getDefaultSymbol, getSymbols, formatPrice, getBaseCurrencyForSymbol, executeTrade, getTradeAmount } = require("./exchange");
const { log, error } = require("./logger");
const { analyzeIndicators, sma, rsi } = require("./indicators");
const { saveSignal, getRecentSignals, getSignalStats, loadHistory } = require("./signal-store");

const MOD = "Signal";
const INTERVAL = parseInt(process.env.SIGNAL_INTERVAL || "60000", 10);
const COOLDOWN = parseInt(process.env.SIGNAL_COOLDOWN || "300000", 10);
const DAILY_INTERVAL = 24 * 60 * 60 * 1000;

const VALID_TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"];
let currentTimeframe = process.env.SIGNAL_TIMEFRAME || "5m";

const AUTO_TRADE = process.env.AUTO_TRADE === "true";
const AUTO_TRADE_MIN_STRENGTH = parseInt(process.env.AUTO_TRADE_MIN_STRENGTH || "4", 10);
const AUTO_TRADE_SYMBOLS = (() => {
  const raw = (process.env.AUTO_TRADE_SYMBOLS || "").trim();
  if (!raw) return null;
  return raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
})();

const HTF_MAP = { "1m": "5m", "3m": "15m", "5m": "15m", "15m": "1h", "30m": "1h", "1h": "4h", "4h": "1d", "1d": "1d" };

// Per-symbol state
let priceHistories = {};
let lastSignalTime = {};

let signalListeners = [];
let summaryListeners = [];
let timeframeListeners = [];
let timer = null;
let dailyTimer = null;

function onSignal(callback) {
  signalListeners.push(callback);
}

function onDailySummary(callback) {
  summaryListeners.push(callback);
}

function onTimeframeChange(callback) {
  timeframeListeners.push(callback);
}

function getTimeframe() {
  return currentTimeframe;
}

function getValidTimeframes() {
  return VALID_TIMEFRAMES;
}

function setTimeframe(tf) {
  const normalized = tf.toLowerCase().trim();
  if (!VALID_TIMEFRAMES.includes(normalized)) {
    return { ok: false, error: `無効なタイムフレーム: ${tf} (有効: ${VALID_TIMEFRAMES.join(", ")})` };
  }
  const prev = currentTimeframe;
  currentTimeframe = normalized;
  log(MOD, `Timeframe changed: ${prev} -> ${currentTimeframe}`);
  for (const cb of timeframeListeners) {
    try { cb(currentTimeframe, prev); } catch (e) { /* ignore */ }
  }
  return { ok: true, prev, current: currentTimeframe };
}

function getActiveSymbols() {
  return getSymbols();
}

function getPriceHistory(symbol) {
  if (symbol) {
    return priceHistories[symbol] || [];
  }
  return priceHistories[getDefaultSymbol()] || [];
}

function formatSignal(signal) {
  const price = formatPrice(signal.price, signal.symbol);
  const target = formatPrice(signal.target, signal.symbol);
  const sl = formatPrice(signal.stopLoss, signal.symbol);
  const base = getBaseCurrencyForSymbol(signal.symbol);
  const tag = `#${base}Signal`;

  const lines = [
    `${tag} シグナル`,
    ``,
    `方向: ${signal.side}`,
    `通貨: ${signal.symbol}`,
    `価格: ${price}`,
    `ターゲット: ${target}`,
    `ストップロス: ${sl}`,
    `リスク: ${signal.riskPct}%`,
    `強度: ${signal.strength || "-"}/6`,
  ];

  if (signal.reasons && signal.reasons.length > 0) {
    lines.push(``, `根拠:`);
    for (const r of signal.reasons) {
      lines.push(`  - ${r}`);
    }
  }

  if (signal.autoTraded && signal.tradeResult) {
    lines.push(``, `自動トレード: 約定 ${signal.tradeResult.filled} @${formatPrice(signal.tradeResult.average, signal.symbol)}`);
  } else if (signal.autoTraded === false && signal.tradeError) {
    lines.push(``, `自動トレード失敗: ${signal.tradeError}`);
  }

  lines.push(``, `${new Date(signal.timestamp).toISOString()}`);
  return lines.join("\n");
}

function analyze(priceObjs, symbol) {
  const prices = priceObjs.map((p) => p.last);
  if (prices.length < 21) return null;

  const result = analyzeIndicators(prices);
  if (!result) return null;

  const current = prices[prices.length - 1];
  const isBuy = result.side === "BUY";

  const roundPrice = (v) => {
    if (v >= 100) return Math.round(v);
    if (v >= 1) return Math.round(v * 100) / 100;
    return Math.round(v * 1000000) / 1000000;
  };

  return {
    side: result.side,
    symbol: symbol,
    price: current,
    target: roundPrice(current * (isBuy ? 1.03 : 0.97)),
    stopLoss: roundPrice(current * (isBuy ? 0.98 : 1.02)),
    riskPct: 1,
    strength: result.strength,
    reasons: result.reasons,
    timestamp: Date.now(),
  };
}

function isCooldownActive(symbol, side) {
  const key = `${symbol}:${side}`;
  const last = lastSignalTime[key];
  if (!last) return false;
  return Date.now() - last < COOLDOWN;
}

function isAutoTradeTarget(symbol) {
  if (!AUTO_TRADE_SYMBOLS) return true;
  const base = getBaseCurrencyForSymbol(symbol);
  return AUTO_TRADE_SYMBOLS.includes(base);
}

async function emitSignal(signal) {
  const key = `${signal.symbol}:${signal.side}`;
  lastSignalTime[key] = Date.now();

  // Auto-trade execution (before save/format so results are included)
  if (AUTO_TRADE && signal.strength >= AUTO_TRADE_MIN_STRENGTH && isAutoTradeTarget(signal.symbol)) {
    try {
      const side = signal.side.toLowerCase();
      const amount = getTradeAmount(signal.symbol);
      log(MOD, `Auto-trade: ${side} ${signal.symbol} qty=${amount} (strength=${signal.strength})`);
      const result = await executeTrade(side, signal.symbol, amount);
      log(MOD, `Auto-trade OK: ${result.side} ${result.symbol} filled=${result.filled} @${result.average}`);
      signal.autoTraded = true;
      signal.tradeResult = { id: result.id, filled: result.filled, average: result.average };
    } catch (e) {
      error(MOD, `Auto-trade FAILED: ${signal.symbol} ${signal.side}: ${e.message}`);
      signal.autoTraded = false;
      signal.tradeError = e.message;
    }
  }

  await saveSignal(signal);

  const message = formatSignal(signal);
  log(MOD, `Signal: ${signal.symbol} ${signal.side} @${formatPrice(signal.price, signal.symbol)}`);

  for (const cb of signalListeners) {
    try {
      await cb(signal, message);
    } catch (e) {
      error(MOD, "listener error:", e.message);
    }
  }
}

async function tickSymbol(symbol) {
  try {
    const price = await fetchPrice(symbol);

    if (!priceHistories[symbol]) {
      priceHistories[symbol] = [];
    }
    priceHistories[symbol].push(price);

    if (priceHistories[symbol].length > 100) {
      priceHistories[symbol] = priceHistories[symbol].slice(-100);
    }

    const prices = priceHistories[symbol].map((p) => p.last);
    const currentRsi = prices.length >= 15 ? rsi(prices, 14) : null;
    const sma5 = sma(prices, 5);
    const sma20 = sma(prices, 20);
    const rsiStr = currentRsi !== null ? ` RSI:${currentRsi.toFixed(1)}` : "";
    const smaStr =
      sma5 && sma20
        ? ` SMA5:${formatPrice(sma5, symbol)} SMA20:${formatPrice(sma20, symbol)}`
        : "";
    log(MOD, `${symbol}: ${formatPrice(price.last, symbol)}${rsiStr}${smaStr}`);

    const signal = analyze(priceHistories[symbol], symbol);
    if (signal) {
      if (isCooldownActive(symbol, signal.side)) {
        log(MOD, `[${symbol}] Cooldown active for ${signal.side}, skipped`);
        return;
      }

      const htf = HTF_MAP[currentTimeframe] || "1h";
      try {
        const candlesHTF = await fetchOHLCV(symbol, htf, 30);
        if (candlesHTF.length >= 21) {
          const closesHTF = candlesHTF.map((c) => c.close);
          const htfResult = analyzeIndicators(closesHTF);
          if (htfResult && htfResult.side === signal.side) {
            signal.strength += 1;
            signal.reasons.push(`${htf}足でも同方向`);
          } else if (htfResult && htfResult.side !== signal.side) {
            log(MOD, `[${symbol}] ${htf}足と方向不一致 (${signal.side} vs ${htfResult.side}), 弱めシグナル`);
          }
        }
      } catch (e) {
        log(MOD, `[${symbol}] OHLCV fetch skipped: ${e.message}`);
      }

      await emitSignal(signal);
    }
  } catch (e) {
    error(MOD, `[${symbol}] tick error: ${e.message}`);
  }
}

async function tick() {
  const symbols = getSymbols();
  await Promise.allSettled(symbols.map((symbol) => tickSymbol(symbol)));
}

async function emitDailySummary() {
  const history = await loadHistory();
  const oneDayAgo = Date.now() - DAILY_INTERVAL;
  const todaySignals = history.filter((s) => s.timestamp > oneDayAgo);
  const symbols = getSymbols();

  const lines = [
    `#CryptoSignals 日次サマリー`,
    ``,
  ];

  for (const symbol of symbols) {
    const symPrices = (priceHistories[symbol] || []).map((p) => p.last);
    const high = symPrices.length > 0 ? Math.max(...symPrices) : 0;
    const low = symPrices.length > 0 ? Math.min(...symPrices) : 0;
    const current = symPrices.length > 0 ? symPrices[symPrices.length - 1] : 0;
    const symSignals = todaySignals.filter((s) => s.symbol === symbol);

    lines.push(
      `--- ${symbol} ---`,
      `価格: ${formatPrice(current, symbol)}`,
      `24h High: ${formatPrice(high, symbol)}`,
      `24h Low: ${formatPrice(low, symbol)}`,
      `シグナル: BUY ${symSignals.filter((s) => s.side === "BUY").length} / SELL ${symSignals.filter((s) => s.side === "SELL").length}`,
      ``,
    );
  }

  lines.push(
    `合計シグナル: ${todaySignals.length}`,
    `${new Date().toISOString()}`,
  );

  const summary = lines.join("\n");
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
  const symbols = getSymbols();
  log(MOD, `Monitor started: ${symbols.length} symbols [${symbols.join(", ")}] (interval: ${INTERVAL}ms, cooldown: ${COOLDOWN}ms)`);
  if (AUTO_TRADE) {
    const targets = AUTO_TRADE_SYMBOLS ? AUTO_TRADE_SYMBOLS.join(",") : "ALL";
    log(MOD, `Auto-trade ENABLED: min_strength=${AUTO_TRADE_MIN_STRENGTH}, targets=${targets}`);
  }
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
  onTimeframeChange,
  formatSignal,
  startMonitor,
  stopMonitor,
  getRecentSignals,
  getSignalStats,
  getTimeframe,
  setTimeframe,
  getValidTimeframes,
  getPriceHistory,
  getActiveSymbols,
};
