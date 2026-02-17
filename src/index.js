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
  app.get("/health", (req, res) => {
    const ex = getExchange();
    const stats = getSignalStats();
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
  app.get("/api/signals", (req, res) => {
    const count = Math.min(parseInt(req.query.count || "20", 10), 100);
    const symbol = req.query.symbol || undefined;
    res.json({ signals: getRecentSignals(count, symbol), stats: getSignalStats(symbol) });
  });

  // Web dashboard
  app.get("/dashboard", (req, res) => {
    res.send(getDashboardHTML());
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

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Crypto Signal Bot</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#e0e0e0;font-family:'Courier New',monospace;font-size:14px}
.header{background:#111;border-bottom:1px solid #333;padding:10px 20px;display:flex;justify-content:space-between;align-items:center}
.header h1{color:#f7931a;font-size:18px}
.header .tag{color:#4caf50;font-size:12px}
.container{display:grid;grid-template-columns:1fr 320px;grid-template-rows:auto 1fr;gap:10px;padding:10px;height:calc(100vh - 50px)}
.chart-area{grid-row:1/3;background:#111;border:1px solid #333;border-radius:4px;padding:10px;position:relative;min-height:400px}
.bar-row{display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap;align-items:center}
.bar-label{color:#888;font-size:11px;margin-right:4px}
.tf-btn,.sym-btn{background:#222;color:#888;border:1px solid #444;padding:4px 12px;cursor:pointer;border-radius:3px;font-family:inherit;font-size:12px}
.tf-btn.active{background:#f7931a;color:#000;border-color:#f7931a;font-weight:bold}
.sym-btn.active{background:#00bcd4;color:#000;border-color:#00bcd4;font-weight:bold}
.tf-btn:hover{border-color:#f7931a}
.sym-btn:hover{border-color:#00bcd4}
.sidebar{display:flex;flex-direction:column;gap:10px}
.panel{background:#111;border:1px solid #333;border-radius:4px;padding:12px}
.panel h3{color:#f7931a;font-size:13px;margin-bottom:8px;border-bottom:1px solid #222;padding-bottom:4px}
.price-big{font-size:28px;color:#4caf50;font-weight:bold}
.price-big.down{color:#f44336}
.stat-row{display:flex;justify-content:space-between;padding:2px 0;font-size:12px}
.stat-label{color:#888}
.stat-value{color:#e0e0e0}
.stat-value.green{color:#4caf50}
.stat-value.red{color:#f44336}
.signal-list{max-height:300px;overflow-y:auto}
.signal-item{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1a1a1a;font-size:11px;gap:6px}
.signal-item .side{font-weight:bold;width:40px}
.signal-item .sym{color:#00bcd4;width:70px;font-size:10px}
.side.BUY{color:#4caf50}
.side.SELL{color:#f44336}
.prices-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.price-card{background:#1a1a1a;border:1px solid #333;border-radius:3px;padding:6px 8px;cursor:pointer}
.price-card.active{border-color:#00bcd4}
.price-card .sym-name{font-size:10px;color:#888}
.price-card .sym-price{font-size:14px;color:#4caf50;font-weight:bold}
canvas{width:100%!important;height:calc(100% - 70px)!important}
</style>
</head>
<body>
<div class="header">
  <h1>Crypto Signal Bot</h1>
  <span class="tag">#MultiPair</span>
</div>
<div class="container">
  <div class="chart-area">
    <div class="bar-row" id="symBar"><span class="bar-label">Symbol:</span></div>
    <div class="bar-row" id="tfBar"><span class="bar-label">TF:</span></div>
    <canvas id="chart"></canvas>
  </div>
  <div class="sidebar">
    <div class="panel">
      <h3>Prices</h3>
      <div class="prices-grid" id="pricesGrid">Loading...</div>
    </div>
    <div class="panel">
      <h3>Selected: <span id="selectedSym">--</span></h3>
      <div class="price-big" id="price">--</div>
      <div class="stat-row"><span class="stat-label">High</span><span class="stat-value green" id="high">--</span></div>
      <div class="stat-row"><span class="stat-label">Low</span><span class="stat-value red" id="low">--</span></div>
      <div class="stat-row"><span class="stat-label">Volume</span><span class="stat-value" id="vol">--</span></div>
      <div class="stat-row"><span class="stat-label">Timeframe</span><span class="stat-value" id="tfDisplay">--</span></div>
    </div>
    <div class="panel">
      <h3>Signals</h3>
      <div class="stat-row"><span class="stat-label">BUY</span><span class="stat-value green" id="buyCount">0</span></div>
      <div class="stat-row"><span class="stat-label">SELL</span><span class="stat-value red" id="sellCount">0</span></div>
    </div>
    <div class="panel">
      <h3>Signal History</h3>
      <div class="signal-list" id="signalList">Loading...</div>
    </div>
  </div>
</div>
<script>
let currentTF = '';
let currentSymbol = '';
let allSymbols = [];

async function loadSymbols() {
  const res = await fetch('/api/symbols');
  const data = await res.json();
  allSymbols = data.symbols;
  currentSymbol = data.default;
  const bar = document.getElementById('symBar');
  bar.innerHTML = '<span class="bar-label">Symbol:</span>';
  allSymbols.forEach(sym => {
    const btn = document.createElement('button');
    btn.className = 'sym-btn' + (sym === currentSymbol ? ' active' : '');
    btn.textContent = sym.split('/')[0];
    btn.onclick = () => switchSymbol(sym);
    bar.appendChild(btn);
  });
  document.getElementById('selectedSym').textContent = currentSymbol;
}

function switchSymbol(sym) {
  currentSymbol = sym;
  document.querySelectorAll('.sym-btn').forEach((b, i) => {
    b.className = 'sym-btn' + (allSymbols[i] === sym ? ' active' : '');
  });
  document.getElementById('selectedSym').textContent = sym;
  loadChart();
  loadSignals();
  highlightPriceCard();
}

function highlightPriceCard() {
  document.querySelectorAll('.price-card').forEach(c => {
    c.className = 'price-card' + (c.dataset.symbol === currentSymbol ? ' active' : '');
  });
}

async function loadTimeframes() {
  const res = await fetch('/api/timeframe');
  const data = await res.json();
  currentTF = data.current;
  const bar = document.getElementById('tfBar');
  bar.innerHTML = '<span class="bar-label">TF:</span>';
  data.valid.forEach(tf => {
    const btn = document.createElement('button');
    btn.className = 'tf-btn' + (tf === currentTF ? ' active' : '');
    btn.textContent = tf;
    btn.onclick = () => switchTF(tf);
    bar.appendChild(btn);
  });
}

async function switchTF(tf) {
  await fetch('/api/timeframe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeframe: tf })
  });
  currentTF = tf;
  document.querySelectorAll('.tf-btn').forEach(b => {
    b.className = 'tf-btn' + (b.textContent === tf ? ' active' : '');
  });
  document.getElementById('tfDisplay').textContent = tf;
  loadChart();
}

const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');

function drawChart(candles) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width - 20;
  const h = rect.height - 90;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  if (!candles || candles.length === 0) return;

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const allPrices = [...highs, ...lows];
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const range = maxP - minP || 1;
  const pad = 50;

  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    const y = pad + (h - 2 * pad) * i / 4;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - 10, y); ctx.stroke();
    const price = maxP - range * i / 4;
    ctx.fillStyle = '#555';
    ctx.font = '10px monospace';
    ctx.fillText(fmtPriceForSym(price, currentSymbol), 2, y + 3);
  }

  const barW = Math.max(1, (w - pad - 10) / candles.length - 1);

  candles.forEach((c, i) => {
    const x = pad + i * (barW + 1);
    const isUp = c.close >= c.open;
    const color = isUp ? '#4caf50' : '#f44336';
    const bodyTop = Math.min(c.open, c.close);
    const bodyBot = Math.max(c.open, c.close);
    const yHigh = pad + (h - 2 * pad) * (1 - (c.high - minP) / range);
    const yLow = pad + (h - 2 * pad) * (1 - (c.low - minP) / range);
    const yTop = pad + (h - 2 * pad) * (1 - (bodyBot - minP) / range);
    const yBot = pad + (h - 2 * pad) * (1 - (bodyTop - minP) / range);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + barW / 2, yHigh);
    ctx.lineTo(x + barW / 2, yLow);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(x, yTop, barW, Math.max(1, yBot - yTop));
  });

  // SMA5
  ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 1.5; ctx.beginPath();
  let started = false;
  for (let i = 4; i < closes.length; i++) {
    const avg = closes.slice(i - 4, i + 1).reduce((a, b) => a + b, 0) / 5;
    const x = pad + i * (barW + 1) + barW / 2;
    const y = pad + (h - 2 * pad) * (1 - (avg - minP) / range);
    if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
  }
  ctx.stroke();

  // SMA20
  if (closes.length >= 20) {
    ctx.strokeStyle = '#e040fb'; ctx.lineWidth = 1.5; ctx.beginPath();
    started = false;
    for (let i = 19; i < closes.length; i++) {
      const avg = closes.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
      const x = pad + i * (barW + 1) + barW / 2;
      const y = pad + (h - 2 * pad) * (1 - (avg - minP) / range);
      if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
    }
    ctx.stroke();
  }

  // Symbol label
  ctx.fillStyle = '#00bcd4'; ctx.font = 'bold 14px monospace';
  ctx.fillText(currentSymbol + ' [' + currentTF + ']', pad + 5, 15);

  ctx.fillStyle = '#555'; ctx.font = '9px monospace';
  const step = Math.max(1, Math.floor(candles.length / 8));
  for (let i = 0; i < candles.length; i += step) {
    const d = new Date(candles[i].timestamp);
    ctx.fillText(d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'), pad + i * (barW + 1), h - 5);
  }
}

function fmtPriceForSym(v, sym) {
  if (v == null || isNaN(v)) return '--';
  const quote = (sym || '').split('/')[1] || 'USDT';
  if (quote === 'JPY') return '\\u00a5' + Math.round(v).toLocaleString();
  if (v < 1) return '$' + v.toFixed(6);
  if (v < 100) return '$' + v.toFixed(4);
  return '$' + v.toLocaleString();
}

function fmtPrice(v) {
  return fmtPriceForSym(v, currentSymbol);
}

async function loadChart() {
  try {
    const res = await fetch('/api/chart?symbol=' + encodeURIComponent(currentSymbol) + '&timeframe=' + currentTF + '&limit=60');
    const data = await res.json();
    drawChart(data.candles);
    if (data.price) {
      document.getElementById('price').textContent = fmtPrice(data.price.last);
      document.getElementById('high').textContent = fmtPrice(data.price.high);
      document.getElementById('low').textContent = fmtPrice(data.price.low);
      const base = currentSymbol.split('/')[0];
      document.getElementById('vol').textContent = (data.price.volume || 0).toFixed(2) + ' ' + base;
    }
  } catch (e) { console.error(e); }
}

async function loadPrices() {
  try {
    const res = await fetch('/api/prices');
    const data = await res.json();
    const grid = document.getElementById('pricesGrid');
    grid.innerHTML = '';
    for (const sym of allSymbols) {
      const p = data.prices[sym];
      const card = document.createElement('div');
      card.className = 'price-card' + (sym === currentSymbol ? ' active' : '');
      card.dataset.symbol = sym;
      card.onclick = () => switchSymbol(sym);
      const base = sym.split('/')[0];
      const priceStr = p ? fmtPriceForSym(p.last, sym) : '--';
      card.innerHTML = '<div class="sym-name">' + base + '</div><div class="sym-price">' + priceStr + '</div>';
      grid.appendChild(card);
    }
  } catch (e) { console.error(e); }
}

async function loadSignals() {
  try {
    const res = await fetch('/api/signals?count=15');
    const data = await res.json();
    document.getElementById('buyCount').textContent = data.stats.totalBuy;
    document.getElementById('sellCount').textContent = data.stats.totalSell;
    const list = document.getElementById('signalList');
    if (data.signals.length === 0) {
      list.innerHTML = '<div style="color:#555">No signals yet</div>';
      return;
    }
    list.innerHTML = data.signals.reverse().map(s => {
      const t = new Date(s.timestamp).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
      const base = (s.symbol || 'BTC').split('/')[0];
      const priceStr = fmtPriceForSym(s.price, s.symbol || 'BTC/JPY');
      return '<div class="signal-item"><span class="side ' + s.side + '">' + s.side + '</span><span class="sym">' + base + '</span><span>' + priceStr + '</span><span>' + (s.strength||'-') + '/6</span><span>' + t + '</span></div>';
    }).join('');
  } catch (e) { console.error(e); }
}

async function init() {
  await loadSymbols();
  await loadTimeframes();
  await loadChart();
  await loadPrices();
  await loadSignals();
  setInterval(loadChart, 10000);
  setInterval(loadPrices, 10000);
  setInterval(loadSignals, 30000);
  window.addEventListener('resize', () => loadChart());
}

init();
</script>
</body>
</html>`;
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
