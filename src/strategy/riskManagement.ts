import type { Direction, Trade } from '../types/signal';
export function risk(
  direction: Direction,
  entry: number,
  lower: number,
  upper: number,
  swing: number,
  atr: number,
  confirmed: boolean,
): Trade {
  const sl =
    direction === 'LONG'
      ? Math.min(lower, swing) - atr * 0.1
      : Math.max(upper, swing) + atr * 0.1;
  const distance = direction === 'LONG' ? entry - sl : sl - entry;
  const tp = direction === 'LONG' ? entry + distance * 2 : entry - distance * 2;
  return {
    entry,
    sl,
    tp,
    confirmed,
    valid: distance > 0 && sl > 0 && tp > 0 && Number.isFinite(tp),
    outcome: 'OPEN',
  };
}
