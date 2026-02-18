const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { error } = require("./logger");

const MOD = "SignalStore";
const DATA_DIR = path.join(__dirname, "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "signals.json");
const MAX_HISTORY = 500;

let writeQueue = Promise.resolve();

async function ensureDataDir() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
}

async function loadHistory() {
  await ensureDataDir();
  try {
    const data = await fsp.readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    error(MOD, "Failed to load history:", e.message);
    return [];
  }
}

/**
 * シグナルを保存する。
 * 書き込みはキューで直列化し、同時書き込みによるデータ破損を防ぐ。
 */
function saveSignal(signal) {
  writeQueue = writeQueue.then(async () => {
    try {
      await ensureDataDir();
      const history = await loadHistory();
      history.push(signal);
      const trimmed = history.slice(-MAX_HISTORY);
      const tmpFile = HISTORY_FILE + ".tmp";
      await fsp.writeFile(tmpFile, JSON.stringify(trimmed, null, 2));
      await fsp.rename(tmpFile, HISTORY_FILE);
    } catch (e) {
      error(MOD, "Failed to save signal:", e.message);
    }
  });
  return writeQueue;
}

async function getRecentSignals(count = 5, symbol) {
  const history = await loadHistory();
  const filtered = symbol
    ? history.filter((s) => s.symbol === symbol)
    : history;
  return filtered.slice(-count);
}

async function getSignalStats(symbol) {
  const history = await loadHistory();
  if (symbol) {
    const filtered = history.filter((s) => s.symbol === symbol);
    return {
      totalBuy: filtered.filter((s) => s.side === "BUY").length,
      totalSell: filtered.filter((s) => s.side === "SELL").length,
      lastSignalAt: filtered.length > 0 ? filtered[filtered.length - 1].timestamp : null,
      historyCount: filtered.length,
    };
  }
  return {
    totalBuy: history.filter((s) => s.side === "BUY").length,
    totalSell: history.filter((s) => s.side === "SELL").length,
    lastSignalAt: history.length > 0 ? history[history.length - 1].timestamp : null,
    historyCount: history.length,
  };
}

module.exports = { loadHistory, saveSignal, getRecentSignals, getSignalStats };
