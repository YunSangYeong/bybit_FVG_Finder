import type { Candle } from '../types/market';
export function atr(c: Candle[], period = 14): (number | undefined)[] {
  const out: (number | undefined)[] = Array(c.length);
  let value = 0;
  for (let i = 0; i < c.length; i++) {
    const tr = Math.max(
      c[i].high - c[i].low,
      i ? Math.abs(c[i].high - c[i - 1].close) : 0,
      i ? Math.abs(c[i].low - c[i - 1].close) : 0,
    );
    if (i < period) {
      value += tr;
      if (i === period - 1) {
        value /= period;
        out[i] = value;
      }
    } else {
      value = (value * (period - 1) + tr) / period;
      out[i] = value;
    }
  }
  return out;
}
