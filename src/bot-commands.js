const { executeTrade, fetchPrice, fetchBalance, getDefaultSymbol, getSymbols, formatPrice, getBaseCurrencyForSymbol, resolveSymbol, getTradeAmount } = require("./exchange");
const { getSignalStats, getRecentSignals, getTimeframe, setTimeframe, getValidTimeframes } = require("./signal");
const { uptimeFormatted } = require("./logger");
const { isEnabled: stripeEnabled, createCheckoutSession, isSubscribed, getSubscriberCount } = require("./subscription");

/**
 * Botプラットフォーム共通のコマンドハンドラ
 *
 * Discord/Telegramの重複ロジックを排除し、
 * プラットフォーム非依存なレスポンス生成を行う。
 */

async function handlePrices() {
  const symbols = getSymbols();
  const lines = await Promise.all(symbols.map(async (sym) => {
    try {
      const p = await fetchPrice(sym);
      const base = getBaseCurrencyForSymbol(sym);
      return `${base}: ${formatPrice(p.last, sym)} (H: ${formatPrice(p.high, sym)} / L: ${formatPrice(p.low, sym)})`;
    } catch {
      return `${sym}: Error`;
    }
  }));
  return lines.join("\n");
}

async function handlePrice(symbolArg) {
  const symbols = getSymbols();
  let sym = getDefaultSymbol();
  if (symbolArg) {
    const upper = symbolArg.toUpperCase();
    sym = symbols.find((s) => s === upper || s.startsWith(upper + "/")) || sym;
  }
  const p = await fetchPrice(sym);
  const base = getBaseCurrencyForSymbol(sym);
  return [
    sym,
    `価格: ${formatPrice(p.last, sym)}`,
    `高値: ${formatPrice(p.high, sym)}`,
    `安値: ${formatPrice(p.low, sym)}`,
    `出来高: ${(p.volume || 0).toFixed(2)} ${base}`,
  ].join("\n");
}

async function handleStatus() {
  const stats = await getSignalStats();
  const subscriberCount = await getSubscriberCount();
  const lastAt = stats.lastSignalAt
    ? new Date(stats.lastSignalAt).toLocaleString("ja-JP")
    : "なし";
  return [
    "Bot Status",
    `Uptime: ${uptimeFormatted()}`,
    `Exchange: ${process.env.EXCHANGE || "bitbank"} (Sandbox: ${process.env.SANDBOX || "true"})`,
    `シグナル: BUY ${stats.totalBuy} / SELL ${stats.totalSell}`,
    `最終シグナル: ${lastAt}`,
    `履歴件数: ${stats.historyCount}`,
    `サブスクライバー: ${subscriberCount}`,
  ].join("\n");
}

async function handleBalance() {
  const balances = await fetchBalance();
  if (balances.length === 0) {
    return "残高情報がありません";
  }
  const lines = balances.map((b) =>
    `${b.currency}: ${b.free} (利用可能) / ${b.used} (注文中) / ${b.total} (合計)`,
  );
  return ["資産状況", "", ...lines].join("\n");
}

async function handleHistory() {
  const recent = await getRecentSignals(5);
  if (recent.length === 0) {
    return "シグナル履歴なし";
  }
  const lines = recent.map((s) => {
    const t = new Date(s.timestamp).toLocaleString("ja-JP");
    const base = getBaseCurrencyForSymbol(s.symbol || getDefaultSymbol());
    return `[${base}] ${s.side} ${formatPrice(s.price, s.symbol)} (${t})`;
  });
  return [`直近シグナル (${recent.length}件)`, ...lines].join("\n");
}

function handleTimeframe(arg) {
  if (!arg) {
    return {
      text: `現在のタイムフレーム: ${getTimeframe()}\n有効: ${getValidTimeframes().join(", ")}\n使い方: /timeframe 5m`,
    };
  }
  const result = setTimeframe(arg);
  if (!result.ok) {
    return { text: result.error };
  }
  return { text: `タイムフレーム変更: ${result.prev} -> ${result.current}` };
}

async function handleSubscribe(platform, userId, username) {
  if (!stripeEnabled()) {
    return "サブスクリプション: $5/月\n\n決済連携は準備中です。";
  }
  if (await isSubscribed(platform, userId)) {
    return "✅ サブスク有効です。#BTCto70k";
  }
  const url = await createCheckoutSession(platform, userId, username);
  return `サブスクリプション: $5/月\n\n決済はこちら:\n${url}`;
}

function handleHelp() {
  const symbols = getSymbols();
  return [
    "crypto-signal-bot ヘルプ",
    "",
    "/price [通貨] - 価格 (例: /price ETH)",
    "/prices - 全通貨の価格一覧",
    "/trade buy|sell [通貨] [数量] - トレード実行",
    "  例: /trade buy ETH 0.5",
    "/balance - 資産状況",
    "/status - Bot ステータス",
    "/history - 直近シグナル",
    "/timeframe [tf] - タイムフレーム変更",
    "/subscribe - サブスク登録",
    "/help - このヘルプ",
    "",
    `監視中: ${symbols.map(s => s.split("/")[0]).join(", ")}`,
  ].join("\n");
}

/**
 * テキストからトレード意図を検出する
 * @param {string} content - メッセージ本文（小文字化済み）
 * @returns {{ side: string, symbol: string|null }|null}
 */
function detectTradeIntent(content) {
  let side;
  if (/(?:🚀|buy|long|入|買い)/.test(content)) {
    side = "buy";
  } else if (/(?:sell|short|出|売り)/.test(content)) {
    side = "sell";
  }

  if (!side) return null;

  const symbols = getSymbols();
  let symbol = null;
  for (const s of symbols) {
    const base = s.split("/")[0].toLowerCase();
    if (content.includes(base)) {
      symbol = s;
      break;
    }
  }

  return { side, symbol };
}

/**
 * トレードコマンドをパースする
 * @param {string} sideArg - "buy" or "sell"
 * @param {string|undefined} symbolArg - シンボル引数
 * @param {string|undefined} amountArg - 数量引数
 * @returns {{ side: string, symbol: string, amount: number }}
 */
function parseTradeArgs(sideArg, symbolArg, amountArg) {
  const side = sideArg.toLowerCase();
  if (side !== "buy" && side !== "sell") {
    throw new Error("使い方: /trade buy [通貨] [数量]\n例: /trade buy ETH 0.5");
  }

  const symbol = symbolArg ? resolveSymbol(symbolArg) : getDefaultSymbol();
  const amount = amountArg ? parseFloat(amountArg) : getTradeAmount(symbol);

  return { side, symbol, amount };
}

async function handleTrade(side, symbol, amount) {
  const result = await executeTrade(side, symbol, amount);
  return `✅ ${result.side.toUpperCase()} ${result.symbol} | ID: ${result.id} | qty: ${result.qty} filled: ${result.filled} @${formatPrice(result.average, result.symbol)} | ${result.status}`;
}

module.exports = {
  handlePrices,
  handlePrice,
  handleStatus,
  handleBalance,
  handleHistory,
  handleTimeframe,
  handleSubscribe,
  handleHelp,
  handleTrade,
  detectTradeIntent,
  parseTradeArgs,
};
