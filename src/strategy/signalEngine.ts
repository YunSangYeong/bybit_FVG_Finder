import { H4, M15, type Candle } from '../types/market';
import type {
  Direction,
  Event,
  Settings,
  Signal,
  Structure,
} from '../types/signal';
import { ema } from '../indicators/ema';
import { atr } from '../indicators/atr';
import { fvg } from '../indicators/fvg';
import { sweep } from '../indicators/sweep';
import { breaks, confirmedPivot } from '../indicators/bos';
import { scoreSignal, totalScore } from './scoring';
import { risk } from './riskManagement';
export function trendAt(h4: Candle[], at: number, direction: Direction) {
  const closed = h4.filter((c) => c.time + H4 <= at),
    values = closed.map((c) => c.close),
    fast = ema(values, 50),
    slow = ema(values, 200),
    j = closed.length - 1;
  if (
    fast[j] === undefined ||
    slow[j] === undefined ||
    slow[j - 5] === undefined
  )
    return 0;
  const aligned =
    direction === 'LONG' ? fast[j]! > slow[j]! : fast[j]! < slow[j]!;
  const slope =
    direction === 'LONG' ? slow[j]! > slow[j - 5]! : slow[j]! < slow[j - 5]!;
  return aligned ? (slope ? 15 : 8) : 0;
}
interface SweepCandidate {
  direction: Direction;
  event: Event;
  pivot: Event;
}
export function analyze(
  symbol: string,
  c: Candle[],
  h4: Candle[],
  settings: Settings,
  next?: Candle,
): Signal[] {
  const a = atr(c);
  const signals: Signal[] = [];
  const leftFirstRetest = new Set<string>();
  let high: Event | undefined, low: Event | undefined;
  let candidates: SweepCandidate[] = [];
  let structures: Structure[] = [];
  const event = (i: number, price: number): Event => ({
    index: i,
    time: c[i].time,
    price,
  });
  for (let i = 0; i < c.length; i++) {
    high = confirmedPivot(c, i, 'high') ?? high;
    low = confirmedPivot(c, i, 'low') ?? low;
    // Pivots are frozen at sweep time; only strictly later bars can break them.
    const newStructures: Structure[] = [];
    candidates = candidates.filter((s) => i - s.event.index <= 10);
    candidates = candidates.filter((s) => {
      if (i > s.event.index && breaks(c, i, s.pivot.price, s.direction)) {
        newStructures.push({
          direction: s.direction,
          sweep: s.event,
          bos: event(i, s.pivot.price),
          swing: s.pivot,
        });
        return false;
      }
      return true;
    });
    structures = structures.filter(
      (prior) =>
        !newStructures.some((next) => next.direction !== prior.direction),
    );
    structures.push(...newStructures);
    structures = structures.filter((s) => i - s.bos.index <= 5);
    for (const direction of sweep(c, i)) {
      const pivot = direction === 'LONG' ? high : low;
      if (pivot)
        candidates.push({
          direction,
          event: event(i, direction === 'LONG' ? c[i].low : c[i].high),
          pivot: { ...pivot },
        });
    }
    for (const s of signals) {
      if (s.status === 'READY') {
        if (s.trade && !s.trade.confirmed && i === s.ready!.index + 1)
          s.trade = risk(
            s.direction,
            c[i].open,
            s.lower,
            s.upper,
            s.trade.sl +
              (s.direction === 'LONG' ? 1 : -1) *
                (a[s.ready!.index] ?? 0) *
                0.1,
            a[s.ready!.index] ?? 0,
            true,
          );
        if (
          s.trade?.confirmed &&
          s.trade.valid &&
          s.trade.outcome === 'OPEN' &&
          i > s.ready!.index
        ) {
          const stop =
            s.direction === 'LONG'
              ? c[i].low <= s.trade.sl
              : c[i].high >= s.trade.sl;
          const target =
            s.direction === 'LONG'
              ? c[i].high >= s.trade.tp
              : c[i].low <= s.trade.tp;
          if (stop || target) {
            s.trade.outcome = stop && target ? 'AMBIGUOUS' : stop ? 'SL' : 'TP';
            s.trade.exitTime = c[i].time;
          }
        }
        if (
          s.trade?.outcome === 'OPEN' &&
          (newStructures.some((b) => b.direction !== s.direction) ||
            (s.direction === 'LONG'
              ? c[i].close < s.lower
              : c[i].close > s.upper))
        ) {
          s.trade.outcome = 'INVALID';
          s.trade.exitTime = c[i].time;
          s.reason = 'READY 이후 경계 이탈 또는 반대 방향 BOS';
        }
        continue;
      }
      if (s.status === 'INVALID') continue;
      let reason = '';
      const overlaps = c[i].low <= s.upper && c[i].high >= s.lower;
      if (s.touch && leftFirstRetest.has(s.id) && overlaps)
        reason = '첫 리테스트 이후 반복 방문';
      if (s.touch && !overlaps) leftFirstRetest.add(s.id);
      if (s.direction === 'LONG' ? c[i].close < s.lower : c[i].close > s.upper)
        reason = 'FVG 경계 종가 이탈';
      if (newStructures.some((b) => b.direction !== s.direction))
        reason = '반대 방향 유효 BOS';
      if (!s.touch && i - s.formed.index > 10)
        reason = '10봉 내 첫 리테스트 없음';
      if (s.touch && i - s.touch.index > 3)
        reason = '리테스트 후 3봉 내 반전 실패';
      if (reason) {
        s.status = 'INVALID';
        s.invalid = event(i, c[i].close);
        s.reason = reason;
      } else {
        if (!s.touch && c[i].low <= s.upper && c[i].high >= s.lower) {
          s.touch = event(
            i,
            s.direction === 'LONG'
              ? Math.max(c[i].low, s.lower)
              : Math.min(c[i].high, s.upper),
          );
          s.status = 'TOUCH';
        }
        const range = c[i].high - c[i].low,
          body = Math.abs(c[i].close - c[i].open);
        const reversal =
          s.direction === 'LONG'
            ? c[i].close > s.mid && c[i].close > c[i].open
            : c[i].close < s.mid && c[i].close < c[i].open;
        if (s.touch && range > 0 && body / range >= 0.5 && reversal) {
          s.trendPoints = trendAt(h4, c[i].time + M15, s.direction);
          if (!settings.trendFilter || s.trendPoints === 15) {
            s.status = 'READY';
            s.ready = event(i, c[i].close);
            const swing =
              s.direction === 'LONG'
                ? (low?.price ?? s.structure.sweep.price)
                : (high?.price ?? s.structure.sweep.price);
            s.trade = risk(
              s.direction,
              c[i].close,
              s.lower,
              s.upper,
              swing,
              a[i] ?? 0,
              false,
            );
          }
        }
      }
      s.score = scoreSignal(s);
      s.total = totalScore(s.score);
    }
    if (i < 2 || !a[i] || !a[i - 1]) continue;
    const gap = fvg(c[i - 2], c[i - 1], c[i]);
    if (!gap) continue;
    const gapATR = (gap.upper - gap.lower) / a[i]!,
      bodyATR = Math.abs(c[i - 1].close - c[i - 1].open) / a[i - 1]!;
    if (gapATR < settings.gapATR || bodyATR < settings.bodyATR) continue;
    const structure = [...structures]
      .reverse()
      .find(
        (b) =>
          b.direction === gap.direction &&
          b.bos.index < i &&
          i - b.bos.index <= 5,
      );
    if (!structure) continue;
    const trendPoints = trendAt(h4, c[i].time + M15, gap.direction);
    if (settings.trendFilter && trendPoints !== 15) continue;
    const volumes = c.slice(Math.max(0, i - 21), i - 1);
    const mean = volumes.reduce((v, x) => v + x.volume, 0) / volumes.length;
    const s: Signal = {
      id: `${symbol}:${gap.direction}:${c[i].time}`,
      symbol,
      ...gap,
      mid: (gap.upper + gap.lower) / 2,
      status: 'WAIT',
      gapATR,
      bodyATR,
      volumeRatio: mean > 0 ? c[i - 1].volume / mean : 0,
      formed: event(i, (gap.upper + gap.lower) / 2),
      structure,
      trendPoints,
      score: {} as Signal['score'],
      total: 0,
    };
    s.score = scoreSignal(s);
    s.total = totalScore(s.score);
    signals.push(s);
  }
  // An unclosed next bar may confirm entry OPEN only; its high/low/close never changes a signal.
  for (const s of signals)
    if (
      s.ready &&
      s.ready.index === c.length - 1 &&
      next?.time === c[s.ready.index].time + M15 &&
      s.trade &&
      !s.trade.confirmed
    ) {
      const old = s.trade;
      s.trade = {
        ...old,
        ...risk(
          s.direction,
          next.open,
          s.lower,
          s.upper,
          old.sl +
            (s.direction === 'LONG' ? 1 : -1) * (a[s.ready.index] ?? 0) * 0.1,
          a[s.ready.index] ?? 0,
          true,
        ),
      };
    }
  return signals;
}
export function visibleSignals(
  signals: Signal[],
  settings: Settings,
  lastIndex: number,
) {
  return signals.filter(
    (s) =>
      settings.states.includes(s.status) &&
      (settings.direction === 'ALL' || settings.direction === s.direction) &&
      s.total >= settings.minScore &&
      (s.status === 'READY'
        ? lastIndex - s.ready!.index < settings.recent
        : s.status === 'INVALID'
          ? lastIndex - s.invalid!.index < settings.recent
          : true),
  );
}
