const { log, error, uptimeSeconds, uptimeFormatted, getStartedAt } = require("../src/logger");

describe("logger", () => {
  test("getStartedAt returns a timestamp", () => {
    const started = getStartedAt();
    expect(typeof started).toBe("number");
    expect(started).toBeLessThanOrEqual(Date.now());
  });

  test("uptimeSeconds returns a non-negative integer", () => {
    const s = uptimeSeconds();
    expect(typeof s).toBe("number");
    expect(s).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(s)).toBe(true);
  });

  test("uptimeFormatted returns a human-readable string", () => {
    const formatted = uptimeFormatted();
    expect(typeof formatted).toBe("string");
    // Should contain time units like "m", "s", "h"
    expect(formatted).toMatch(/\d+[mshd]/);
  });

  test("log writes to stdout", () => {
    const spy = jest.spyOn(console, "log").mockImplementation();
    log("TestMod", "hello");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatch(/\[.*\] \[TestMod\]/);
    spy.mockRestore();
  });

  test("error writes to stderr", () => {
    const spy = jest.spyOn(console, "error").mockImplementation();
    error("TestMod", "something broke");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatch(/\[.*\] \[TestMod\] ERROR/);
    spy.mockRestore();
  });
});
