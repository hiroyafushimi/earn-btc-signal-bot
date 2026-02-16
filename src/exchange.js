const ccxt = require("ccxt");
const { log, error } = require("./logger");

const MOD = "Exchange";
const EXCHANGE = process.env.EXCHANGE || "binance";
const MAX_RETRIES = 3;

let exchange;

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

async function fetchPrice(symbol = "BTC/USDT") {
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

async function executeTrade(side, symbol = "BTC/USDT", amount) {
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
    const usdtFree = balance.free.USDT || 0;
    const ticker = await withRetry(
      () => exchange.fetchTicker(symbol),
      "fetchTicker",
    );
    qty = (usdtFree * riskPct) / ticker.last;
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

module.exports = { initExchange, getExchange, fetchPrice, executeTrade };
