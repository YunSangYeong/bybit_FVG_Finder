import { useEffect, useRef, useState } from 'react';
import { markets, candles } from '../api/bybit';
import { analyze } from '../strategy/signalEngine';
import type { ScanResult, Settings } from '../types/signal';
export interface Progress {
  running: boolean;
  total: number;
  done: number;
  current: string[];
  failures: { symbol: string; message: string }[];
  error?: string;
  cancelled: boolean;
  finished: boolean;
}
const initial: Progress = {
  running: false,
  total: 0,
  done: 0,
  current: [],
  failures: [],
  cancelled: false,
  finished: false,
};
export function useScanner() {
  const [results, setResults] = useState<ScanResult[]>([]),
    [progress, setProgress] = useState<Progress>(initial);
  const control = useRef<AbortController | null>(null);
  useEffect(() => () => control.current?.abort(), []);
  async function start(settings: Settings) {
    if (control.current) return;
    const controller = new AbortController();
    control.current = controller;
    setResults([]);
    setProgress({ ...initial, running: true });
    try {
      const targets = await markets(
        settings.turnover,
        settings.includeETH,
        controller.signal,
        settings.marketScope,
      );
      setProgress((p) => ({ ...p, total: targets.length }));
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(3, targets.length) }, async () => {
          while (cursor < targets.length && !controller.signal.aborted) {
            const market = targets[cursor++];
            setProgress((p) => ({
              ...p,
              current: [...p.current, market.symbol],
            }));
            try {
              const [m15, h4] = await Promise.all([
                candles(market.symbol, '15', controller.signal),
                candles(market.symbol, '240', controller.signal),
              ]);
              const signals = analyze(
                market.symbol,
                m15.closed,
                h4.closed,
                settings,
                m15.next,
              );
              setResults((r) => [
                ...r,
                { market, candles: m15.closed, signals },
              ]);
            } catch (e) {
              if (!controller.signal.aborted)
                setProgress((p) => ({
                  ...p,
                  failures: [
                    ...p.failures,
                    {
                      symbol: market.symbol,
                      message: e instanceof Error ? e.message : String(e),
                    },
                  ],
                }));
            } finally {
              setProgress((p) => ({
                ...p,
                done: p.done + 1,
                current: p.current.filter((s) => s !== market.symbol),
              }));
            }
          }
        }),
      );
      setProgress((p) => ({
        ...p,
        running: false,
        cancelled: controller.signal.aborted,
        finished: !controller.signal.aborted,
      }));
    } catch (e) {
      setProgress((p) => ({
        ...p,
        running: false,
        cancelled: controller.signal.aborted,
        error: controller.signal.aborted
          ? undefined
          : e instanceof Error
            ? e.message
            : String(e),
      }));
    } finally {
      control.current = null;
    }
  }
  return { results, progress, start, cancel: () => control.current?.abort() };
}
