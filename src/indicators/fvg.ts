import type { Candle } from '../types/market';
export function fvg(c1: Candle, c2: Candle, c3: Candle) {
  if (c1.high < c3.low && c2.close > c2.open)
    return { direction: 'LONG' as const, lower: c1.high, upper: c3.low };
  if (c1.low > c3.high && c2.close < c2.open)
    return { direction: 'SHORT' as const, lower: c3.high, upper: c1.low };
}
