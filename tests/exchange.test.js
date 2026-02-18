// Test the pure functions in exchange.js that don't require ccxt
// We need to test before initExchange is called, so we mock ccxt
jest.mock("ccxt", () => ({}));

const {
  getSymbols, getDefaultSymbol, getQuoteCurrency, getQuoteCurrencyForSymbol,
  getBaseCurrencyForSymbol, formatPrice, resolveSymbol, getTradeAmount,
} = require("../src/exchange");

describe("getSymbols", () => {
  test("returns a copy of the symbols array", () => {
    const symbols = getSymbols();
    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols.length).toBeGreaterThan(0);
    // Should be a copy, not a reference
    symbols.push("FAKE/SYM");
    expect(getSymbols()).not.toContain("FAKE/SYM");
  });
});

describe("getDefaultSymbol", () => {
  test("returns a valid symbol string", () => {
    const sym = getDefaultSymbol();
    expect(typeof sym).toBe("string");
    expect(sym).toMatch(/^[A-Z]+\/[A-Z]+$/);
  });
});

describe("getQuoteCurrency / getQuoteCurrencyForSymbol", () => {
  test("extracts quote currency from symbol", () => {
    expect(getQuoteCurrencyForSymbol("BTC/JPY")).toBe("JPY");
    expect(getQuoteCurrencyForSymbol("ETH/USDT")).toBe("USDT");
  });

  test("returns USDT as fallback when no slash", () => {
    expect(getQuoteCurrencyForSymbol("BTC")).toBe("USDT");
  });
});

describe("getBaseCurrencyForSymbol", () => {
  test("extracts base currency from symbol", () => {
    expect(getBaseCurrencyForSymbol("BTC/JPY")).toBe("BTC");
    expect(getBaseCurrencyForSymbol("ETH/USDT")).toBe("ETH");
  });

  test("returns the input when no slash", () => {
    expect(getBaseCurrencyForSymbol("BTC")).toBe("BTC");
  });
});

describe("formatPrice", () => {
  test("formats JPY prices with yen symbol", () => {
    expect(formatPrice(5000000, "BTC/JPY")).toBe("¥5,000,000");
  });

  test("formats USD prices with dollar sign", () => {
    const result = formatPrice(50000, "BTC/USDT");
    expect(result).toContain("$");
    expect(result).toContain("50");
  });

  test("formats low-price coins with decimal places", () => {
    expect(formatPrice(0.000123, "SHIB/USDT")).toBe("$0.000123");
  });

  test("formats mid-range prices with 4 decimal places", () => {
    expect(formatPrice(12.3456, "DOT/USDT")).toBe("$12.3456");
  });

  test("returns '--' for null or NaN values", () => {
    expect(formatPrice(null, "BTC/JPY")).toBe("--");
    expect(formatPrice(NaN, "BTC/JPY")).toBe("--");
    expect(formatPrice(undefined, "BTC/JPY")).toBe("--");
  });
});

describe("resolveSymbol", () => {
  test("returns default symbol for empty input", () => {
    expect(resolveSymbol(undefined)).toBe(getDefaultSymbol());
    expect(resolveSymbol("")).toBe(getDefaultSymbol());
  });

  test("returns full symbol if it matches a monitored symbol", () => {
    const symbols = getSymbols();
    if (symbols.length > 0) {
      expect(resolveSymbol(symbols[0])).toBe(symbols[0]);
    }
  });

  test("resolves short name to full symbol", () => {
    const symbols = getSymbols();
    if (symbols.length > 0) {
      const base = symbols[0].split("/")[0];
      expect(resolveSymbol(base)).toBe(symbols[0]);
    }
  });

  test("returns default for unrecognized input", () => {
    expect(resolveSymbol("UNKNOWNCOIN")).toBe(getDefaultSymbol());
  });
});

describe("getTradeAmount", () => {
  test("returns a positive number", () => {
    const amount = getTradeAmount("BTC/JPY");
    expect(typeof amount).toBe("number");
    expect(amount).toBeGreaterThan(0);
  });
});
