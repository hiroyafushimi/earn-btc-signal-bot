const blessed = require("blessed");
const contrib = require("blessed-contrib");
const { fetchPrice, fetchOHLCV, getDefaultSymbol, getSymbols, formatPrice, getBaseCurrencyForSymbol } = require("./exchange");
const { getRecentSignals, getSignalStats, getTimeframe, setTimeframe, getValidTimeframes, onSignal, onTimeframeChange, getPriceHistory, getActiveSymbols } = require("./signal");
const { uptimeFormatted } = require("./logger");
const { sma, rsi } = require("./indicators");

const MOD = "TUI";
let screen, grid;
let chart, signalTable, statusBox, logBox, timeframeBar;
let chartData = { x: [], y: [] };
let logLines = [];
let refreshTimer = null;
let currentSymbolIdx = 0;

function addLog(msg) {
  const ts = new Date().toLocaleTimeString("ja-JP", { hour12: false });
  logLines.push(`[${ts}] ${msg}`);
  if (logLines.length > 100) logLines = logLines.slice(-100);
  if (logBox) {
    logBox.setContent(logLines.slice(-logBox.height + 2).join("\n"));
    screen.render();
  }
}

function startTUI() {
  screen = blessed.screen({
    smartCSR: true,
    title: "BTC Signal Bot #BTCto70k",
    fullUnicode: true,
  });

  grid = new contrib.grid({ rows: 12, cols: 12, screen });

  const symbols = getSymbols();

  // Price chart (top-left, large)
  chart = grid.set(0, 0, 7, 9, contrib.line, {
    label: ` ${symbols[currentSymbolIdx]} Chart [${getTimeframe()}] `,
    style: {
      line: "yellow",
      text: "green",
      baseline: "white",
    },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: false,
    abbreviate: true,
  });

  // Status info (top-right)
  statusBox = grid.set(0, 9, 4, 3, blessed.box, {
    label: " Status ",
    tags: true,
    border: { type: "line" },
    style: {
      border: { fg: "cyan" },
      fg: "white",
    },
    content: "Loading...",
  });

  // Timeframe selector (mid-right)
  timeframeBar = grid.set(4, 9, 3, 3, blessed.list, {
    label: " Timeframe (1-8) ",
    tags: true,
    border: { type: "line" },
    style: {
      border: { fg: "magenta" },
      fg: "white",
      selected: { bg: "magenta", fg: "white" },
    },
    items: getValidTimeframes().map((tf) => tf === getTimeframe() ? `> ${tf} <` : `  ${tf}  `),
    keys: true,
    mouse: true,
    interactive: true,
  });

  // Signal history (bottom-left)
  signalTable = grid.set(7, 0, 5, 6, contrib.table, {
    label: " Signal History ",
    columnSpacing: 2,
    columnWidth: [6, 6, 14, 6, 18],
    fg: "white",
    selectedFg: "white",
    selectedBg: "blue",
    interactive: false,
    keys: false,
  });

  // Log (bottom-right)
  logBox = grid.set(7, 6, 5, 6, blessed.box, {
    label: " Log ",
    tags: true,
    border: { type: "line" },
    style: {
      border: { fg: "green" },
      fg: "white",
    },
    scrollable: true,
    alwaysScroll: true,
    content: "",
  });

  // Key bindings
  screen.key(["escape", "q", "C-c"], () => {
    stopTUI();
    process.exit(0);
  });

  // Number keys for timeframe switching
  const tfs = getValidTimeframes();
  for (let i = 0; i < tfs.length; i++) {
    const idx = i;
    screen.key([String(i + 1)], () => {
      const result = setTimeframe(tfs[idx]);
      if (result.ok) {
        addLog(`Timeframe: ${result.prev} -> ${result.current}`);
      } else {
        addLog(result.error);
      }
    });
  }

  // Tab key cycles through timeframes
  screen.key(["tab"], () => {
    const current = getTimeframe();
    const idx = tfs.indexOf(current);
    const next = tfs[(idx + 1) % tfs.length];
    const result = setTimeframe(next);
    if (result.ok) {
      addLog(`Timeframe: ${result.prev} -> ${result.current}`);
    }
  });

  // S key cycles through symbols
  screen.key(["s"], () => {
    currentSymbolIdx = (currentSymbolIdx + 1) % symbols.length;
    const sym = symbols[currentSymbolIdx];
    chart.setLabel(` ${sym} Chart [${getTimeframe()}] `);
    addLog(`Symbol: ${sym}`);
    refreshChart();
  });

  // Listen for timeframe changes
  onTimeframeChange((tf) => {
    chart.setLabel(` ${symbols[currentSymbolIdx]} Chart [${tf}] `);
    timeframeBar.setItems(
      getValidTimeframes().map((t) => t === tf ? `> ${t} <` : `  ${t}  `)
    );
    // Reload chart data on timeframe change
    refreshChart();
  });

  // Listen for new signals
  onSignal((signal) => {
    addLog(`Signal: ${signal.side} @${formatPrice(signal.price)} (strength: ${signal.strength})`);
  });

  addLog("TUI started. q/ESC=quit, 1-8/TAB=timeframe, S=symbol");

  // Initial data load and start refresh
  refreshAll();
  refreshTimer = setInterval(refreshAll, 10000);

  screen.render();
}

async function refreshChart() {
  try {
    const symbols = getSymbols();
    const sym = symbols[currentSymbolIdx] || getDefaultSymbol();
    const tf = getTimeframe();
    const candles = await fetchOHLCV(sym, tf, 60);
    if (candles.length === 0) return;

    const labels = candles.map((c) => {
      const d = new Date(c.timestamp);
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    });
    const closes = candles.map((c) => c.close);

    // SMA overlay
    const sma5Data = [];
    const sma20Data = [];
    for (let i = 0; i < closes.length; i++) {
      const slice = closes.slice(0, i + 1);
      sma5Data.push(sma(slice, 5) || closes[i]);
      sma20Data.push(sma(slice, 20) || closes[i]);
    }

    chart.setData([
      { title: "Price", x: labels, y: closes, style: { line: "yellow" } },
      { title: "SMA5", x: labels, y: sma5Data, style: { line: "cyan" } },
      { title: "SMA20", x: labels, y: sma20Data, style: { line: "magenta" } },
    ]);
  } catch (e) {
    addLog(`Chart error: ${e.message}`);
  }
}

async function refreshStatus() {
  try {
    const symbols = getSymbols();
    const sym = symbols[currentSymbolIdx] || getDefaultSymbol();
    const base = getBaseCurrencyForSymbol(sym);
    const price = await fetchPrice(sym);
    const stats = getSignalStats();
    const currentRsi = (() => {
      const hist = getPriceHistory(sym);
      if (hist.length < 15) return null;
      return rsi(hist.map((p) => p.last), 14);
    })();
    const rsiStr = currentRsi !== null ? currentRsi.toFixed(1) : "--";

    const lines = [
      `{bold}${sym}{/bold} [S:switch]`,
      `Symbols: ${symbols.map(s => s.split("/")[0]).join(",")}`,
      ``,
      `Price: {yellow-fg}${formatPrice(price.last, sym)}{/}`,
      `High:  {green-fg}${formatPrice(price.high, sym)}{/}`,
      `Low:   {red-fg}${formatPrice(price.low, sym)}{/}`,
      `Vol:   ${price.volume ? price.volume.toFixed(2) : "--"} ${base}`,
      ``,
      `RSI:   {bold}${rsiStr}{/}`,
      `TF:    {magenta-fg}${getTimeframe()}{/}`,
      ``,
      `Signals: BUY ${stats.totalBuy} / SELL ${stats.totalSell}`,
      `Uptime: ${uptimeFormatted()}`,
    ];
    statusBox.setContent(lines.join("\n"));
  } catch (e) {
    statusBox.setContent(`Error: ${e.message}`);
  }
}

function refreshSignals() {
  const recent = getRecentSignals(10);
  if (recent.length === 0) {
    signalTable.setData({
      headers: ["Side", "Price", "Strength", "Time", "Reasons"],
      data: [["--", "--", "--", "--", "No signals yet"]],
    });
    return;
  }

  const data = recent.reverse().map((s) => {
    const t = new Date(s.timestamp).toLocaleString("ja-JP", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const base = getBaseCurrencyForSymbol(s.symbol || getDefaultSymbol());
    const reasons = (s.reasons || []).slice(0, 2).join(", ");
    return [base, s.side, formatPrice(s.price, s.symbol), `${s.strength || "-"}/6`, t];
  });

  signalTable.setData({
    headers: ["Sym", "Side", "Price", "Str", "Time"],
    data,
  });
}

async function refreshAll() {
  await Promise.all([refreshChart(), refreshStatus()]);
  refreshSignals();
  if (screen) screen.render();
}

function stopTUI() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (screen) {
    screen.destroy();
    screen = null;
  }
}

module.exports = { startTUI, stopTUI };
