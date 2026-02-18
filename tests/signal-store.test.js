const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "signals.json");

// Clean up test data before and after
beforeEach(async () => {
  try { await fsp.unlink(HISTORY_FILE); } catch {}
});

afterAll(async () => {
  try { await fsp.unlink(HISTORY_FILE); } catch {}
});

const { loadHistory, saveSignal, getRecentSignals, getSignalStats } = require("../src/signal-store");

describe("loadHistory", () => {
  test("returns empty array when no history file exists", async () => {
    const result = await loadHistory();
    expect(result).toEqual([]);
  });

  test("returns parsed history from file", async () => {
    const signals = [{ side: "BUY", price: 100, timestamp: 1000 }];
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(HISTORY_FILE, JSON.stringify(signals));

    const result = await loadHistory();
    expect(result).toEqual(signals);
  });
});

describe("saveSignal", () => {
  test("saves a signal to history file", async () => {
    const signal = { side: "BUY", symbol: "BTC/JPY", price: 5000000, timestamp: Date.now() };
    await saveSignal(signal);

    const data = JSON.parse(await fsp.readFile(HISTORY_FILE, "utf-8"));
    expect(data).toHaveLength(1);
    expect(data[0]).toEqual(signal);
  });

  test("appends to existing history", async () => {
    const s1 = { side: "BUY", price: 100, timestamp: 1000 };
    const s2 = { side: "SELL", price: 200, timestamp: 2000 };

    await saveSignal(s1);
    await saveSignal(s2);

    const data = JSON.parse(await fsp.readFile(HISTORY_FILE, "utf-8"));
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual(s1);
    expect(data[1]).toEqual(s2);
  });

  test("trims history to 500 entries", async () => {
    // Pre-populate with 500 entries
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const existing = Array.from({ length: 500 }, (_, i) => ({ id: i, timestamp: i }));
    await fsp.writeFile(HISTORY_FILE, JSON.stringify(existing));

    await saveSignal({ id: 500, timestamp: 500 });

    const data = JSON.parse(await fsp.readFile(HISTORY_FILE, "utf-8"));
    expect(data).toHaveLength(500);
    expect(data[0].id).toBe(1); // first entry trimmed
    expect(data[499].id).toBe(500); // new entry at end
  });
});

describe("getRecentSignals", () => {
  test("returns empty array when no history exists", async () => {
    const result = await getRecentSignals(5);
    expect(result).toEqual([]);
  });

  test("returns last N signals", async () => {
    for (let i = 0; i < 10; i++) {
      await saveSignal({ id: i, side: "BUY", symbol: "BTC/JPY", timestamp: i });
    }

    const result = await getRecentSignals(3);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe(7);
    expect(result[2].id).toBe(9);
  });

  test("filters by symbol when specified", async () => {
    await saveSignal({ side: "BUY", symbol: "BTC/JPY", timestamp: 1 });
    await saveSignal({ side: "SELL", symbol: "ETH/JPY", timestamp: 2 });
    await saveSignal({ side: "BUY", symbol: "BTC/JPY", timestamp: 3 });

    const result = await getRecentSignals(10, "ETH/JPY");
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("ETH/JPY");
  });
});

describe("getSignalStats", () => {
  test("returns zero counts for empty history", async () => {
    const stats = await getSignalStats();
    expect(stats.totalBuy).toBe(0);
    expect(stats.totalSell).toBe(0);
    expect(stats.historyCount).toBe(0);
    expect(stats.lastSignalAt).toBeNull();
  });

  test("counts buy and sell signals correctly", async () => {
    await saveSignal({ side: "BUY", symbol: "BTC/JPY", timestamp: 1 });
    await saveSignal({ side: "SELL", symbol: "BTC/JPY", timestamp: 2 });
    await saveSignal({ side: "BUY", symbol: "BTC/JPY", timestamp: 3 });

    const stats = await getSignalStats();
    expect(stats.totalBuy).toBe(2);
    expect(stats.totalSell).toBe(1);
    expect(stats.historyCount).toBe(3);
    expect(stats.lastSignalAt).toBe(3);
  });

  test("filters stats by symbol", async () => {
    await saveSignal({ side: "BUY", symbol: "BTC/JPY", timestamp: 1 });
    await saveSignal({ side: "SELL", symbol: "ETH/JPY", timestamp: 2 });

    const stats = await getSignalStats("ETH/JPY");
    expect(stats.totalBuy).toBe(0);
    expect(stats.totalSell).toBe(1);
    expect(stats.historyCount).toBe(1);
  });
});
