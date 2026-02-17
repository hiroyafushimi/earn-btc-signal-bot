const ccxt = require("ccxt");
const { log, error } = require("./logger");

const MOD = "Exchange";
const EXCHANGE = process.env.EXCHANGE || "bitbank";
const DEFAULT_SYMBOL = process.env.TRADE_SYMBOL || "BTC/JPY";
const MAX_RETRIES = 3;

// Multi-symbol support: TRADE_SYMBOLS (comma-separated) or fallback to TRADE_SYMBOL
const SYMBOLS = (() => {
  const multi = (process.env.TRADE_SYMBOLS || "").trim();
  if (multi) {
    return multi.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [DEFAULT_SYMBOL];
})();

let exchange;

function getSymbols() {
  return [...SYMBOLS];
}

function getDefaultSymbol() {
  return SYMBOLS[0];
}

function getQuoteCurrency() {
  return DEFAULT_SYMBOL.split("/")[1] || "USDT";
}

function getQuoteCurrencyForSymbol(symbol) {
  return symbol.split("/")[1] || "USDT";
}

function getBaseCurrencyForSymbol(symbol) {
  return symbol.split("/")[0] || symbol;
}

function formatPrice(value, symbol) {
  const quote = symbol ? getQuoteCurrencyForSymbol(symbol) : getQuoteCurrency();
  if (quote === "JPY") {
    return `¥${Math.round(value).toLocaleString()}`;
  }
  return `$${value.toLocaleString()}`;
}

async function withRetry(fn, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      const delay = 1000 * Math.pow(2, attempt - 1);
      error(MOD, `${label} attempt ${attempt} failed: ${e.message}, retry in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function initExchange() {
  try {
    exchange = new ccxt[EXCHANGE]({
      apiKey: process.env.API_KEY,
      secret: process.env.API_SECRET,
      sandbox: process.env.SANDBOX === "true",
    });
    await exchange.loadMarkets();
    log(MOD, `${EXCHANGE} loaded. Sandbox: ${exchange.sandbox}`);
    return exchange;
  } catch (e) {
    error(MOD, "init failed:", e.message);
    throw e;
  }
}

function getExchange() {
  return exchange;
}

async function fetchPrice(symbol = DEFAULT_SYMBOL) {
  if (!exchange) throw new Error("Exchange not ready");
  return withRetry(async () => {
    const ticker = await exchange.fetchTicker(symbol);
    return {
      symbol,
      last: ticker.last,
      high: ticker.high,
      low: ticker.low,
      volume: ticker.baseVolume,
      timestamp: ticker.timestamp,
    };
  }, `fetchPrice(${symbol})`);
}

async function executeTrade(side, symbol = DEFAULT_SYMBOL, amount) {
  if (!exchange) throw new Error("Exchange not ready");

  const riskPct = parseFloat(process.env.RISK_PCT || "0");
  const fixedAmount =
    amount || parseFloat(process.env.PROCESSING_AMOUNT || "0.001");

  let qty = fixedAmount;

  if (riskPct > 0 && !amount) {
    const balance = await withRetry(
      () => exchange.fetchBalance(),
      "fetchBalance",
    );
    const quoteCurrency = getQuoteCurrency();
    const quoteFree = balance.free[quoteCurrency] || 0;
    const ticker = await withRetry(
      () => exchange.fetchTicker(symbol),
      "fetchTicker",
    );
    qty = (quoteFree * riskPct) / ticker.last;
  }

  const order = await withRetry(
    () => exchange.createMarketOrder(symbol, side, qty),
    `createMarketOrder(${side})`,
  );

  log(MOD, `Trade OK: ${side} ${symbol} qty=${qty} filled=${order.filled}`);

  return {
    id: order.id,
    side,
    symbol,
    qty,
    filled: order.filled || 0,
    average: order.average || "mkt",
    status: order.status,
  };
}

async function fetchOHLCV(symbol = DEFAULT_SYMBOL, timeframe = "1h", limit = 50) {
  if (!exchange) throw new Error("Exchange not ready");
  return withRetry(async () => {
    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    return candles.map((c) => ({
      timestamp: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));
  }, `fetchOHLCV(${symbol},${timeframe})`);
}

module.exports = { initExchange, getExchange, fetchPrice, fetchOHLCV, executeTrade, getDefaultSymbol, getSymbols, getQuoteCurrency, getQuoteCurrencyForSymbol, getBaseCurrencyForSymbol, formatPrice };
