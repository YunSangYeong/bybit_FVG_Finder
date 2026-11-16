import type { Signal, Score } from '../types/signal';
export function scoreSignal(s: Signal): Score {
  return {
    trend: s.trendPoints,
    sweep: 20,
    bos: 20,
    gap: s.gapATR >= 0.4 ? 10 : s.gapATR >= 0.2 ? 5 : 0,
    displacement: s.bodyATR >= 1.2 ? 10 : s.bodyATR >= 0.8 ? 5 : 0,
    volume: s.volumeRatio >= 1.5 ? 10 : s.volumeRatio >= 1.2 ? 5 : 0,
    freshness: s.status === 'INVALID' ? 0 : s.touch ? 3 : 5,
    retest: s.status === 'READY' ? 10 : s.status === 'TOUCH' ? 3 : 0,
  };
}
export const totalScore = (s: Score) =>
  Object.values(s).reduce((a, b) => a + b, 0);
export const grade = (s: number) =>
  s >= 85 ? 'A' : s >= 75 ? 'B' : s >= 60 ? 'C' : 'D';
