/**
 * SMA (Simple Moving Average)
 * @param {number[]} prices - 価格配列
 * @param {number} period - 期間
 * @returns {number|null}
 */
function sma(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

/**
 * RSI (Relative Strength Index)
 * @param {number[]} prices - 価格配列
 * @param {number} period - 期間 (default: 14)
 * @returns {number|null} 0-100
 */
function rsi(prices, period = 14) {
  if (prices.length < period + 1) return null;

  const changes = [];
  const recent = prices.slice(-(period + 1));
  for (let i = 1; i < recent.length; i++) {
    changes.push(recent[i] - recent[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (const c of changes) {
    if (c > 0) avgGain += c;
    else avgLoss += Math.abs(c);
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * SMA クロスオーバー判定
 * @param {number[]} prices - 価格配列
 * @param {number} shortPeriod - 短期 SMA 期間
 * @param {number} longPeriod - 長期 SMA 期間
 * @returns {"golden_cross"|"death_cross"|null}
 */
function smaCrossover(prices, shortPeriod = 5, longPeriod = 20) {
  if (prices.length < longPeriod + 1) return null;

  const prevPrices = prices.slice(0, -1);
  const currShort = sma(prices, shortPeriod);
  const currLong = sma(prices, longPeriod);
  const prevShort = sma(prevPrices, shortPeriod);
  const prevLong = sma(prevPrices, longPeriod);

  if (!currShort || !currLong || !prevShort || !prevLong) return null;

  // Golden cross: 短期が長期を下から上に突き抜け
  if (prevShort <= prevLong && currShort > currLong) return "golden_cross";
  // Death cross: 短期が長期を上から下に突き抜け
  if (prevShort >= prevLong && currShort < currLong) return "death_cross";

  return null;
}

/**
 * 総合シグナル分析
 * @param {number[]} prices - 価格配列
 * @returns {{ side: string, strength: number, reasons: string[] }|null}
 */
function analyzeIndicators(prices) {
  if (prices.length < 21) return null;

  const currentPrice = prices[prices.length - 1];
  const currentRsi = rsi(prices, 14);
  const smaShort = sma(prices, 5);
  const smaLong = sma(prices, 20);
  const cross = smaCrossover(prices, 5, 20);

  let buyScore = 0;
  let sellScore = 0;
  const reasons = [];

  // RSI
  if (currentRsi !== null) {
    if (currentRsi < 30) {
      buyScore += 2;
      reasons.push(`RSI ${currentRsi.toFixed(1)} (売られすぎ)`);
    } else if (currentRsi < 40) {
      buyScore += 1;
      reasons.push(`RSI ${currentRsi.toFixed(1)} (低め)`);
    } else if (currentRsi > 70) {
      sellScore += 2;
      reasons.push(`RSI ${currentRsi.toFixed(1)} (買われすぎ)`);
    } else if (currentRsi > 60) {
      sellScore += 1;
      reasons.push(`RSI ${currentRsi.toFixed(1)} (高め)`);
    }
  }

  // SMA クロスオーバー
  if (cross === "golden_cross") {
    buyScore += 3;
    reasons.push("SMA ゴールデンクロス");
  } else if (cross === "death_cross") {
    sellScore += 3;
    reasons.push("SMA デスクロス");
  }

  // 価格と SMA の位置関係
  if (smaShort && smaLong) {
    if (currentPrice > smaShort && smaShort > smaLong) {
      buyScore += 1;
      reasons.push("上昇トレンド (価格 > SMA5 > SMA20)");
    } else if (currentPrice < smaShort && smaShort < smaLong) {
      sellScore += 1;
      reasons.push("下降トレンド (価格 < SMA5 < SMA20)");
    }
  }

  // 最低スコア2以上でシグナル発行
  if (buyScore >= 2 && buyScore > sellScore) {
    return { side: "BUY", strength: buyScore, reasons };
  }
  if (sellScore >= 2 && sellScore > buyScore) {
    return { side: "SELL", strength: sellScore, reasons };
  }

  return null;
}

module.exports = { sma, rsi, smaCrossover, analyzeIndicators };
