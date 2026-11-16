import type { Candle } from '../types/market';
export function sweep(c: Candle[], i: number) {
  if (i < 20) return [];
  const previous = c.slice(i - 20, i);
  const low = Math.min(...previous.map((x) => x.low)),
    high = Math.max(...previous.map((x) => x.high));
  const out: ('LONG' | 'SHORT')[] = [];
  if (c[i].low < low && c[i].close > low) out.push('LONG');
  if (c[i].high > high && c[i].close < high) out.push('SHORT');
  return out;
}
