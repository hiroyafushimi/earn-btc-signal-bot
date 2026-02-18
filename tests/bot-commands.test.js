// bot-commands depends on exchange and signal modules, which we mock
jest.mock("../src/exchange", () => ({
  fetchPrice: jest.fn(),
  fetchBalance: jest.fn(),
  executeTrade: jest.fn(),
  getDefaultSymbol: jest.fn(() => "BTC/JPY"),
  getSymbols: jest.fn(() => ["BTC/JPY", "ETH/JPY"]),
  formatPrice: jest.fn((v, sym) => {
    if (v == null) return "--";
    return sym?.includes("JPY") ? `¥${Math.round(v)}` : `$${v}`;
  }),
  getBaseCurrencyForSymbol: jest.fn((sym) => sym.split("/")[0]),
  getQuoteCurrencyForSymbol: jest.fn((sym) => sym.split("/")[1]),
  resolveSymbol: jest.fn((input) => {
    if (!input) return "BTC/JPY";
    const upper = input.toUpperCase();
    if (upper === "ETH" || upper === "ETH/JPY") return "ETH/JPY";
    return "BTC/JPY";
  }),
  getTradeAmount: jest.fn(() => 0.001),
}));

jest.mock("../src/signal", () => ({
  getSignalStats: jest.fn(async () => ({
    totalBuy: 5,
    totalSell: 3,
    lastSignalAt: 1700000000000,
    historyCount: 8,
  })),
  getRecentSignals: jest.fn(async () => [
    { side: "BUY", symbol: "BTC/JPY", price: 5000000, timestamp: 1700000000000 },
  ]),
  getTimeframe: jest.fn(() => "5m"),
  setTimeframe: jest.fn((tf) => {
    if (tf === "invalid") return { ok: false, error: "Invalid" };
    return { ok: true, prev: "5m", current: tf };
  }),
  getValidTimeframes: jest.fn(() => ["1m", "5m", "15m", "1h"]),
}));

jest.mock("../src/subscription", () => ({
  isEnabled: jest.fn(() => false),
  createCheckoutSession: jest.fn(),
  isSubscribed: jest.fn(async () => false),
  getSubscriberCount: jest.fn(async () => 0),
}));

jest.mock("../src/logger", () => ({
  uptimeFormatted: jest.fn(() => "1h 23m 45s"),
}));

const {
  handlePrice,
  handlePrices,
  handleStatus,
  handleHistory,
  handleTimeframe,
  handleHelp,
  detectTradeIntent,
  parseTradeArgs,
} = require("../src/bot-commands");

const exchange = require("../src/exchange");

describe("handlePrice", () => {
  test("fetches price for default symbol when no arg given", async () => {
    exchange.fetchPrice.mockResolvedValue({
      last: 5000000, high: 5100000, low: 4900000, volume: 123.45,
    });

    const result = await handlePrice(undefined);
    expect(result).toContain("BTC/JPY");
    expect(result).toContain("¥5000000");
  });

  test("resolves symbol from short name", async () => {
    exchange.fetchPrice.mockResolvedValue({
      last: 300000, high: 310000, low: 290000, volume: 456.78,
    });

    const result = await handlePrice("ETH");
    expect(exchange.fetchPrice).toHaveBeenCalledWith("ETH/JPY");
    expect(result).toContain("ETH/JPY");
  });
});

describe("handlePrices", () => {
  test("returns prices for all symbols", async () => {
    exchange.fetchPrice.mockResolvedValue({
      last: 100, high: 110, low: 90, volume: 10,
    });

    const result = await handlePrices();
    expect(result).toContain("BTC");
    expect(result).toContain("ETH");
  });
});

describe("handleStatus", () => {
  test("returns formatted status string", async () => {
    const result = await handleStatus();
    expect(result).toContain("Bot Status");
    expect(result).toContain("Uptime:");
    expect(result).toContain("BUY 5");
    expect(result).toContain("SELL 3");
  });
});

describe("handleHistory", () => {
  test("returns formatted history", async () => {
    const result = await handleHistory();
    expect(result).toContain("直近シグナル");
    expect(result).toContain("BTC");
    expect(result).toContain("BUY");
  });
});

describe("handleTimeframe", () => {
  test("returns current timeframe when no arg", () => {
    const result = handleTimeframe(undefined);
    expect(result.text).toContain("5m");
    expect(result.text).toContain("1m");
  });

  test("sets timeframe successfully", () => {
    const result = handleTimeframe("15m");
    expect(result.text).toContain("15m");
  });

  test("returns error for invalid timeframe", () => {
    const result = handleTimeframe("invalid");
    expect(result.text).toContain("Invalid");
  });
});

describe("handleHelp", () => {
  test("returns help text with commands", () => {
    const result = handleHelp();
    expect(result).toContain("/price");
    expect(result).toContain("/trade");
    expect(result).toContain("/balance");
    expect(result).toContain("BTC, ETH");
  });
});

describe("detectTradeIntent", () => {
  test("detects buy keywords", () => {
    expect(detectTradeIntent("buy btc")).toEqual({ side: "buy", symbol: "BTC/JPY" });
    expect(detectTradeIntent("long eth")).toEqual({ side: "buy", symbol: "ETH/JPY" });
    expect(detectTradeIntent("btc 買い")).toEqual({ side: "buy", symbol: "BTC/JPY" });
  });

  test("detects sell keywords", () => {
    expect(detectTradeIntent("sell btc")).toEqual({ side: "sell", symbol: "BTC/JPY" });
    expect(detectTradeIntent("short eth")).toEqual({ side: "sell", symbol: "ETH/JPY" });
    expect(detectTradeIntent("eth 売り")).toEqual({ side: "sell", symbol: "ETH/JPY" });
  });

  test("returns null for non-trade messages", () => {
    expect(detectTradeIntent("hello world")).toBeNull();
    expect(detectTradeIntent("what is the price")).toBeNull();
  });

  test("returns null symbol when no coin name in message", () => {
    const result = detectTradeIntent("buy now");
    expect(result).toEqual({ side: "buy", symbol: null });
  });
});

describe("parseTradeArgs", () => {
  test("parses buy with symbol and amount", () => {
    const result = parseTradeArgs("buy", "ETH", "0.5");
    expect(result.side).toBe("buy");
    expect(result.symbol).toBe("ETH/JPY");
    expect(result.amount).toBe(0.5);
  });

  test("uses defaults when no symbol or amount given", () => {
    const result = parseTradeArgs("sell", undefined, undefined);
    expect(result.side).toBe("sell");
    expect(result.symbol).toBe("BTC/JPY");
    expect(result.amount).toBe(0.001);
  });

  test("throws for invalid side", () => {
    expect(() => parseTradeArgs("hold", undefined, undefined)).toThrow();
  });
});
