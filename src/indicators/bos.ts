import type { Candle } from '../types/market';
import type { Direction } from '../types/signal';
// Called at confirmationIndex: the pivot at i-2 only becomes available now.
export function confirmedPivot(
  c: Candle[],
  confirmationIndex: number,
  kind: 'high' | 'low',
) {
  const p = confirmationIndex - 2;
  if (p < 2) return;
  const value = c[p][kind];
  if (
    [p - 2, p - 1, p + 1, p + 2].every((j) =>
      kind === 'high' ? c[j].high < value : c[j].low > value,
    )
  )
    return { index: p, time: c[p].time, price: value };
}
export function breaks(
  c: Candle[],
  i: number,
  price: number,
  direction: Direction,
) {
  return (
    i > 0 &&
    (direction === 'LONG'
      ? c[i].close > price && c[i - 1].close <= price
      : c[i].close < price && c[i - 1].close >= price)
  );
}
