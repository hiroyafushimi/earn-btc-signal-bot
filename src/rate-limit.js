const { log } = require("./logger");

const MOD = "RateLimit";
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW || "60000", 10);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || "10", 10);

const buckets = new Map();

function cleanup() {
  const now = Date.now();
  for (const [key, data] of buckets) {
    if (now - data.windowStart > WINDOW_MS * 2) {
      buckets.delete(key);
    }
  }
}

const cleanupTimer = setInterval(cleanup, 5 * 60 * 1000);

function stopCleanup() {
  clearInterval(cleanupTimer);
}

/**
 * @param {string} platform - "discord" or "telegram"
 * @param {string} userId
 * @returns {boolean} true if allowed, false if rate limited
 */
function checkLimit(platform, userId) {
  const key = `${platform}:${userId}`;
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { windowStart: now, count: 0 };
    buckets.set(key, bucket);
  }

  bucket.count++;

  if (bucket.count > MAX_REQUESTS) {
    log(MOD, `Rate limited: ${key} (${bucket.count}/${MAX_REQUESTS})`);
    return false;
  }

  return true;
}

module.exports = { checkLimit, stopCleanup };
