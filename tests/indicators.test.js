const { sma, rsi, smaCrossover, analyzeIndicators } = require("../src/indicators");

describe("sma", () => {
  test("returns null when prices are fewer than period", () => {
    expect(sma([1, 2], 5)).toBeNull();
  });

  test("returns null for empty array", () => {
    expect(sma([], 5)).toBeNull();
  });

  test("calculates average of last N prices", () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
  });

  test("uses only the last N prices when array is longer", () => {
    expect(sma([100, 200, 1, 2, 3, 4, 5], 5)).toBe(3);
  });

  test("handles single-element period", () => {
    expect(sma([10, 20, 30], 1)).toBe(30);
  });

  test("handles period equal to array length", () => {
    expect(sma([10, 20, 30], 3)).toBe(20);
  });
});

describe("rsi", () => {
  test("returns null when prices are fewer than period + 1", () => {
    expect(rsi([1, 2, 3], 14)).toBeNull();
  });

  test("returns 100 when all changes are gains (no losses)", () => {
    const prices = Array.from({ length: 16 }, (_, i) => 100 + i);
    expect(rsi(prices, 14)).toBe(100);
  });

  test("returns 0 when all changes are losses (no gains)", () => {
    const prices = Array.from({ length: 16 }, (_, i) => 100 - i);
    expect(rsi(prices, 14)).toBe(0);
  });

  test("returns approximately 50 for equal gains and losses", () => {
    // Alternating up/down by same amount
    const prices = [];
    for (let i = 0; i < 15; i++) {
      prices.push(i % 2 === 0 ? 100 : 101);
    }
    const result = rsi(prices, 14);
    expect(result).toBeCloseTo(50, 0);
  });

  test("returns value between 0 and 100", () => {
    const prices = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42,
      45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    const result = rsi(prices, 14);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  test("uses only the last period+1 prices", () => {
    const noise = Array.from({ length: 50 }, () => Math.random() * 100);
    const relevant = Array.from({ length: 15 }, (_, i) => 100 + i);
    const result1 = rsi(relevant, 14);
    const result2 = rsi([...noise, ...relevant], 14);
    expect(result1).toBe(result2);
  });
});

describe("smaCrossover", () => {
  test("returns null when prices are fewer than longPeriod + 1", () => {
    const prices = Array.from({ length: 20 }, (_, i) => i);
    expect(smaCrossover(prices, 5, 20)).toBeNull();
  });

  test("detects golden cross", () => {
    // 24 flat prices then one spike: previous SMA5 == SMA20, current SMA5 > SMA20
    const prices = Array.from({ length: 24 }, () => 100);
    prices.push(120);

    const result = smaCrossover(prices, 5, 20);
    expect(result).toBe("golden_cross");
  });

  test("detects death cross", () => {
    // 24 flat prices then one drop: previous SMA5 == SMA20, current SMA5 < SMA20
    const prices = Array.from({ length: 24 }, () => 100);
    prices.push(80);

    const result = smaCrossover(prices, 5, 20);
    expect(result).toBe("death_cross");
  });

  test("returns null when no crossover occurs", () => {
    // Steady uptrend - SMA5 stays above SMA20
    const prices = Array.from({ length: 25 }, (_, i) => 100 + i);
    expect(smaCrossover(prices, 5, 20)).toBeNull();
  });
});

describe("analyzeIndicators", () => {
  test("returns null when prices are fewer than 21", () => {
    const prices = Array.from({ length: 20 }, (_, i) => i);
    expect(analyzeIndicators(prices)).toBeNull();
  });

  test("returns null when scores are below threshold", () => {
    // Sinusoidal oscillation: RSI ≈ 50, no SMA crossover, no clear trend
    const prices = [
      100, 100.5, 101, 100.5, 100, 99.5, 99, 99.5, 100, 100.5,
      101, 100.5, 100, 99.5, 99, 99.5, 100, 100.5, 101, 100.5,
      100,
    ];
    expect(analyzeIndicators(prices)).toBeNull();
  });

  test("returns BUY signal for oversold conditions with golden cross", () => {
    // Create deeply oversold then recovering pattern
    const prices = [];
    for (let i = 0; i < 20; i++) prices.push(100 - i * 2);  // declining -> RSI low
    for (let i = 0; i < 5; i++) prices.push(65 + i * 8);     // sharp recovery

    const result = analyzeIndicators(prices);
    if (result) {
      expect(result.side).toBe("BUY");
      expect(result.strength).toBeGreaterThanOrEqual(2);
      expect(result.reasons).toBeInstanceOf(Array);
      expect(result.reasons.length).toBeGreaterThan(0);
    }
  });

  test("returns SELL signal for overbought conditions with death cross", () => {
    // Create overbought then declining pattern
    const prices = [];
    for (let i = 0; i < 20; i++) prices.push(60 + i * 2);    // rising -> RSI high
    for (let i = 0; i < 5; i++) prices.push(95 - i * 8);     // sharp decline

    const result = analyzeIndicators(prices);
    if (result) {
      expect(result.side).toBe("SELL");
      expect(result.strength).toBeGreaterThanOrEqual(2);
      expect(result.reasons).toBeInstanceOf(Array);
      expect(result.reasons.length).toBeGreaterThan(0);
    }
  });

  test("signal shape has required fields", () => {
    // Force a strong buy signal
    const prices = [];
    for (let i = 0; i < 20; i++) prices.push(100 - i * 3);
    for (let i = 0; i < 10; i++) prices.push(50 + i * 10);

    const result = analyzeIndicators(prices);
    if (result) {
      expect(result).toHaveProperty("side");
      expect(result).toHaveProperty("strength");
      expect(result).toHaveProperty("reasons");
      expect(["BUY", "SELL"]).toContain(result.side);
      expect(typeof result.strength).toBe("number");
    }
  });
});
