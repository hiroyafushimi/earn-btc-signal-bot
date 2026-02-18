const { checkLimit, stopCleanup } = require("../src/rate-limit");

afterAll(() => {
  stopCleanup();
});

describe("checkLimit", () => {
  test("allows requests within the limit", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkLimit("test", "user-within")).toBe(true);
    }
  });

  test("blocks requests exceeding the limit", () => {
    for (let i = 0; i < 10; i++) {
      checkLimit("test", "user-exceed");
    }
    expect(checkLimit("test", "user-exceed")).toBe(false);
  });

  test("tracks limits per platform and user independently", () => {
    for (let i = 0; i < 10; i++) {
      checkLimit("discord", "user-platform");
    }
    // Same user on different platform should still be allowed
    expect(checkLimit("telegram", "user-platform")).toBe(true);
  });

  test("tracks limits per user independently", () => {
    for (let i = 0; i < 10; i++) {
      checkLimit("test", "user-a");
    }
    // Different user on same platform should still be allowed
    expect(checkLimit("test", "user-b")).toBe(true);
  });
});
