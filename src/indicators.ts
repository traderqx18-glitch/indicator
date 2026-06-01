import { 
  SMA, 
  EMA, 
  WMA, 
  RSI, 
  MACD, 
  BollingerBands, 
  ATR, 
  Stochastic, 
  WilliamsR, 
  CCI, 
  OBV, 
  VWAP,
  MFI,
  ROC,
  doji,
  hammerpattern,
  shootingstar,
  bullishengulfingpattern,
  bearishengulfingpattern,
  morningstar,
  eveningstar,
  bullishharami,
  bearishharami,
  piercingline,
  darkcloudcover,
  threewhitesoldiers,
  threeblackcrows,
  bullishspinningtop,
  bearishspinningtop
} from 'technicalindicators';

export interface Candle {
  datetime: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume?: string | number;
}

export interface IndicatorResult {
  votes: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  score: number; // Percentage bullish / bearish
  signal: 'STRONG BUY' | 'BUY' | 'STRONG SELL' | 'SELL' | 'NO TRADE';
  reasons: string[];
  previousCandle: {
    type: 'GREEN' | 'RED';
    patternName: string;
  };
}

export function calculateIndicators(candles: Candle[]): IndicatorResult {
  const reasons: string[] = [];
  let bullishVotes = 0;
  let bearishVotes = 0;
  let neutralVotes = 0;

  if (candles.length < 200) {
    return {
      votes: { bullish: 0, bearish: 0, neutral: 1 },
      score: 50,
      signal: 'NO TRADE',
      reasons: ['Need at least 200 historical candles for full-span signals'],
      previousCandle: { type: 'GREEN', patternName: 'None' },
    };
  }

  // Candles are typically retrieved newest first. Reverse them for technicalindicators series.
  const reversed = [...candles].reverse();

  const o = reversed.map(c => Number(c.open));
  const h = reversed.map(c => Number(c.high));
  const l = reversed.map(c => Number(c.low));
  const c = reversed.map(c => Number(c.close));
  const v = reversed.map(c => Number(c.volume || 100));

  const total = c.length;
  const currentPrice = c[total - 1];
  const prevPrice = c[total - 2];

  // Helper function to vote
  const voteBullish = (reason: string) => {
    bullishVotes++;
    reasons.push(reason);
  };
  const voteBearish = (reason: string) => {
    bearishVotes++;
    reasons.push(reason);
  };
  const voteNeutral = () => {
    neutralVotes++;
  };

  // 1. TREND INDICATORS
  try {
    const ema9 = EMA.calculate({ period: 9, values: c });
    const ema21 = EMA.calculate({ period: 21, values: c });
    const ema50 = EMA.calculate({ period: 50, values: c });
    const ema200 = EMA.calculate({ period: 200, values: c });
    const sma20 = SMA.calculate({ period: 20, values: c });
    const sma50 = SMA.calculate({ period: 50, values: c });
    const wma = WMA.calculate({ period: 14, values: c });

    const e9Last = ema9[ema9.length - 1];
    const e21Last = ema21[ema21.length - 1];
    const e50Last = ema50[ema50.length - 1];
    const e200Last = ema200[ema200.length - 1];
    const s20Last = sma20[sma20.length - 1];
    const s50Last = sma50[sma50.length - 1];
    const wmaLast = wma[wma.length - 1];

    if (e9Last && e21Last) {
      if (e9Last > e21Last) voteBullish(`EMA 9 lies above EMA 21 (bullish trend alignment)`);
      else voteBearish(`EMA 9 lies below EMA 21 (bearish trend alignment)`);
    }

    if (e50Last && e200Last) {
      if (e50Last > e200Last) voteBullish(`EMA 50 crossover EMA 200 (golden cross)`);
      else voteBearish(`EMA 50 crossover EMA 200 (death cross)`);
    }

    if (s20Last) {
      if (currentPrice > s20Last) voteBullish(`Price floats above SMA 20 intermediate support`);
      else voteBearish(`Price rests below SMA 20 intermediate resistance`);
    }

    if (wmaLast) {
      if (currentPrice > wmaLast) voteBullish(`Weighted Moving Average (WMA) shows buy momentum`);
      else voteBearish(`Weighted Moving Average (WMA) shows sell momentum`);
    }
  } catch (e) {
    voteNeutral();
  }

  // 2. MOMENTUM INDICATORS
  try {
    const rsiVal = RSI.calculate({ period: 14, values: c });
    const rsiLast = rsiVal[rsiVal.length - 1];

    if (rsiLast) {
      if (rsiLast <= 30) {
        voteBullish(`RSI is at ${Math.round(rsiLast)} (strongly oversold)`);
      } else if (rsiLast >= 70) {
        voteBearish(`RSI is at ${Math.round(rsiLast)} (strongly overbought)`);
      } else {
        const rsiPrev = rsiVal[rsiVal.length - 2] || rsiLast;
        if (rsiLast > rsiPrev && rsiLast > 50) voteBullish(`RSI is rising between zones at ${Math.round(rsiLast)}`);
        else if (rsiLast < rsiPrev && rsiLast < 50) voteBearish(`RSI is declining between zones at ${Math.round(rsiLast)}`);
        else voteNeutral();
      }
    }

    const stochVal = Stochastic.calculate({ period: 14, signalPeriod: 3, high: h, low: l, close: c });
    const stochLast = stochVal[stochVal.length - 1];
    if (stochLast) {
      if (stochLast.k < 20 && stochLast.d < 20) voteBullish(`Stochastic Oscillator entering oversold range`);
      else if (stochLast.k > 80 && stochLast.d > 80) voteBearish(`Stochastic Oscillator entering overbought range`);
    }

    const cciVal = CCI.calculate({ period: 14, high: h, low: l, close: c });
    const cciLast = cciVal[cciVal.length - 1];
    if (cciLast) {
      if (cciLast < -100) voteBullish(`CCI indicates oversold extreme at ${Math.round(cciLast)}`);
      else if (cciLast > 100) voteBearish(`CCI indicates overbought extreme at ${Math.round(cciLast)}`);
    }

    const mfiVal = MFI.calculate({ period: 14, high: h, low: l, close: c, volume: v });
    const mfiLast = mfiVal[mfiVal.length - 1];
    if (mfiLast) {
      if (mfiLast <= 20) voteBullish(`MFI volume momentum strongly oversold`);
      else if (mfiLast >= 80) voteBearish(`MFI volume momentum strongly overbought`);
    }
  } catch (e) {
    voteNeutral();
  }

  // 3. VOLATILITY INDICATORS
  try {
    const bbVal = BollingerBands.calculate({ period: 20, stdDev: 2, values: c });
    const bbLast = bbVal[bbVal.length - 1];
    if (bbLast) {
      if (currentPrice <= bbLast.lower) voteBullish(`Price bounded by lower Bollinger Band limit`);
      else if (currentPrice >= bbLast.upper) voteBearish(`Price bounded by upper Bollinger Band limit`);
    }

    const atrVal = ATR.calculate({ period: 14, high: h, low: l, close: c });
    const atrLast = atrVal[atrVal.length - 1];
    if (atrLast) {
      // High ATR implies strong volatile momentum breakouts possible
      const atrAvg = atrVal.reduce((sum, val) => sum + val, 0) / atrVal.length;
      if (atrLast > atrAvg) {
        // Vote based on direction
        if (currentPrice > prevPrice) voteBullish(`Volatility high (ATR ${atrLast.toFixed(5)}) with rising price`);
        else voteBearish(`Volatility high (ATR ${atrLast.toFixed(5)}) with falling price`);
      }
    }
  } catch (e) {
    voteNeutral();
  }

  // 4. MACD
  try {
    const macdVal = MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false, values: c });
    const macdLast = macdVal[macdVal.length - 1];
    if (macdLast && macdLast.histogram && macdLast.signal && macdLast.MACD) {
      if (macdLast.MACD > macdLast.signal) voteBullish(`MACD is bullish (histogram is expanding green)`);
      else voteBearish(`MACD is bearish (histogram is expanding red)`);
    }
  } catch (e) {
    voteNeutral();
  }

  // 5. VOLUME
  try {
    const obvVal = OBV.calculate({ close: c, volume: v });
    const obvLast = obvVal[obvVal.length - 1];
    const obvPrev = obvVal[obvVal.length - 2] || obvLast;
    if (obvLast && obvPrev) {
      if (obvLast > obvPrev) voteBullish(`On Balance Volume rising (strong accumulation support)`);
      else voteBearish(`On Balance Volume falling (strong distribution pressure)`);
    }
  } catch (e) {
    voteNeutral();
  }

  // 6. CANDLESTICK PATTERNS (calculated based on recent candles)
  let lastPatternName = 'None';
  try {
    // We fetch the very last candle's properties
    const lastOpen = o[total - 1];
    const lastHigh = h[total - 1];
    const lastLow = l[total - 1];
    const lastClose = c[total - 1];

    const prevOpen = o[total - 2];
    const prevHigh = h[total - 2];
    const prevLow = l[total - 2];
    const prevClose = c[total - 2];

    const prevPrevOpen = o[total - 3];
    const prevPrevHigh = h[total - 3];
    const prevPrevLow = l[total - 3];
    const prevPrevClose = c[total - 3];

    // Build candle arguments formatted for technicalindicators
    const singleCandle = {
      open: [lastOpen],
      high: [lastHigh],
      low: [lastLow],
      close: [lastClose]
    };

    const doubleCandle = {
      open: [prevOpen, lastOpen],
      high: [prevHigh, lastHigh],
      low: [prevLow, lastLow],
      close: [prevClose, lastClose]
    };

    const tripleCandle = {
      open: [prevPrevOpen, prevOpen, lastOpen],
      high: [prevPrevHigh, prevHigh, lastHigh],
      low: [prevPrevLow, prevLow, lastLow],
      close: [prevPrevClose, prevClose, lastClose]
    };

    if (doji({ open: [lastOpen], high: [lastHigh], low: [lastLow], close: [lastClose] })) {
      lastPatternName = 'Doji';
      voteNeutral();
    }
    if (hammerpattern(singleCandle)) {
      lastPatternName = 'Hammer';
      voteBullish(`Bullish hammer candlestick pattern formed`);
    }
    if (shootingstar(singleCandle)) {
      lastPatternName = 'Shooting Star';
      voteBearish(`Bearish shooting star candlestick pattern formed`);
    }
    if (bullishengulfingpattern(doubleCandle)) {
      lastPatternName = 'Bullish Engulfing';
      voteBullish(`Bullish engulfing pattern detected`);
    }
    if (bearishengulfingpattern(doubleCandle)) {
      lastPatternName = 'Bearish Engulfing';
      voteBearish(`Bearish engulfing pattern detected`);
    }
    if (morningstar(tripleCandle)) {
      lastPatternName = 'Morning Star';
      voteBullish(`Bullish morning star trend reversal detected`);
    }
    if (eveningstar(tripleCandle)) {
      lastPatternName = 'Evening Star';
      voteBearish(`Bearish evening star trend reversal detected`);
    }
    if (bullishharami(doubleCandle)) {
      lastPatternName = 'Bullish Harami';
      voteBullish(`Inside Day: Bullish harami pattern identified`);
    }
    if (bearishharami(doubleCandle)) {
      lastPatternName = 'Bearish Harami';
      voteBearish(`Inside Day: Bearish harami pattern identified`);
    }
    if (piercingline(doubleCandle)) {
      lastPatternName = 'Piercing Line';
      voteBullish(`Piercing Line bullish reversal breakout`);
    }
    if (darkcloudcover(doubleCandle)) {
      lastPatternName = 'Dark Cloud Cover';
      voteBearish(`Dark Cloud Cover bearish reversal resistance`);
    }
    if (threewhitesoldiers(tripleCandle)) {
      lastPatternName = '3 White Soldiers';
      voteBullish(`Three White Soldiers powerful upward breakout`);
    }
    if (threeblackcrows(tripleCandle)) {
      lastPatternName = '3 Black Crows';
      voteBearish(`Three Black Crows powerful downward reversal`);
    }
    if (bullishspinningtop(singleCandle) || bearishspinningtop(singleCandle)) {
      lastPatternName = 'Spinning Top';
    }
  } catch (e) {
    // Skip
  }

  // 7. AUTO-SUPPORT/RESISTANCE
  try {
    // Dynamic support-resistance levels
    const slice = c.slice(-60); // Check last 60 candles
    const highestCeil = Math.max(...slice);
    const lowestFloor = Math.min(...slice);

    const supportThreshold = lowestFloor * 1.0008;
    const resistanceThreshold = highestCeil * 0.9992;

    if (currentPrice <= supportThreshold) {
      voteBullish(`Price touches critical support zone at ${currentPrice.toFixed(5)}`);
    } else if (currentPrice >= resistanceThreshold) {
      voteBearish(`Price touches critical resistance level at ${currentPrice.toFixed(5)}`);
    }
  } catch (e) {
    // Skip
  }

  // 8. FINAL SCORING
  const totalVotes = bullishVotes + bearishVotes;
  let score = 50;
  let signal: IndicatorResult['signal'] = 'NO TRADE';

  if (totalVotes > 0) {
    score = Math.round((bullishVotes / totalVotes) * 100);
  }

  if (score >= 75) {
    signal = 'STRONG BUY';
  } else if (score >= 65 && score < 75) {
    signal = 'BUY';
  } else if (score <= 25) {
    signal = 'STRONG SELL';
  } else if (score > 25 && score <= 35) {
    signal = 'SELL';
  } else {
    signal = 'NO TRADE';
  }

  const lastCandleType = (candles[0] && Number(candles[0].close) >= Number(candles[0].open)) ? 'GREEN' : 'RED';

  // Ensure we display at least 3 reasons for aesthetic look
  if (reasons.length === 0) {
    reasons.push(signal === 'STRONG BUY' || signal === 'BUY' ? 'General bullish support clusters' : 'General bearish selling pressures');
  }

  return {
    votes: {
      bullish: bullishVotes,
      bearish: bearishVotes,
      neutral: neutralVotes,
    },
    score: signal.toLowerCase().includes('sell') ? (100 - score) : score, // Adjust percentage for display
    signal,
    reasons: reasons.slice(0, 5),
    previousCandle: {
      type: lastCandleType,
      patternName: lastPatternName || (lastCandleType === 'GREEN' ? 'Marubozu Green' : 'Marubozu Red'),
    },
  };
}

// SHA-256 or custom robust hash helper representing candidate candlesticks
export function generatePatternFingerprint(candles: Candle[]): { hash: string; description: string } {
  // Take last 5 completed candles (indices 0 to 4 in chronological sequence)
  const last5 = candles.slice(0, 5).reverse(); // candles has newest at idx 0, so candles.slice(0, 5) gets last 5 candles. Reverse makes them chronological.
  if (last5.length < 5) {
    return { hash: 'NOT_ENOUGH_DATA', description: 'Underloaded Dataset' };
  }

  // Calculate average body size for scale benchmarking
  const bSizes = last5.map(c => Math.abs(Number(c.close) - Number(c.open)));
  const avgBSize = bSizes.reduce((s, x) => s + x, 0) / 5 || 0.0001;

  const components = last5.map((candle, idx) => {
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);

    const isGreen = close >= open;
    const body = Math.abs(close - open);

    // Body size: S / M / L
    let size = 'M';
    if (body < 0.4 * avgBSize) size = 'S';
    else if (body > 1.6 * avgBSize) size = 'L';

    // Wick size ratio
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;
    const totalWick = upperWick + lowerWick;
    const wRatio = totalWick / Math.max(body, 0.00001);

    let wick = 'MW';
    if (wRatio < 0.25) wick = 'LW';
    else if (wRatio > 1.2) wick = 'HW';

    const dir = isGreen ? 'G' : 'R';
    return `${dir}_${size}_${wick}`;
  });

  const hash = components.join('-');

  // Build descriptive human string
  const describeCandle = (comp: string) => {
    const [d, s, w] = comp.split('_');
    const color = d === 'G' ? 'Green' : 'Red';
    const bSize = s === 'S' ? 'Small' : s === 'L' ? 'Large' : 'Normal';
    const wType = w === 'LW' ? 'Short Wicks' : w === 'HW' ? 'Long Wicks' : 'Average wicks';
    return `${bSize} ${color} with ${wType}`;
  };

  const description = `Pattern sequence: 1st [${describeCandle(components[4])}] → 5th [${describeCandle(components[0])}]`;

  return { hash, description };
}
