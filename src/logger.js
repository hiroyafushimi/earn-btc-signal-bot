const startedAt = Date.now();

function ts() {
  return new Date().toLocaleTimeString("ja-JP", { hour12: false });
}

function log(module, ...args) {
  console.log(`[${ts()}] [${module}]`, ...args);
}

function error(module, ...args) {
  console.error(`[${ts()}] [${module}] ERROR`, ...args);
}

function uptimeSeconds() {
  return Math.floor((Date.now() - startedAt) / 1000);
}

function uptimeFormatted() {
  const s = uptimeSeconds();
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function getStartedAt() {
  return startedAt;
}

module.exports = { log, error, uptimeSeconds, uptimeFormatted, getStartedAt };
