import { describe, it, expect } from 'vitest';
import { fvg } from '../src/indicators/fvg';
import { atr } from '../src/indicators/atr';
import { ema } from '../src/indicators/ema';
import { sweep } from '../src/indicators/sweep';
import { confirmedPivot, breaks } from '../src/indicators/bos';
import { analyze, trendAt } from '../src/strategy/signalEngine';
import { risk } from '../src/strategy/riskManagement';
import { scoreSignal, totalScore } from '../src/strategy/scoring';
import { defaults, type Signal } from '../src/types/signal';
import { M15, H4, type Candle } from '../src/types/market';
export const t = 1_800_000_000_000;
export function bar(i: number, patch: Partial<Candle> = {}): Candle {
  return {
    time: t + i * M15,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 100,
    ...patch,
  };
}
export function fixture() {
  const c = Array.from({ length: 25 }, (_, i) => bar(i));
  c[20].high = 105;
  c[22].low = 98;
  return [
    ...c,
    bar(25, { open: 99.5, low: 97 }),
    bar(26, { open: 100, close: 106, high: 107, low: 99.8, volume: 200 }),
    bar(27, { open: 106, close: 106.5, high: 107, low: 105.5 }),
  ];
}
const options = { ...defaults, trendFilter: false };
describe('indicators', () => {
  it('detects bullish, bearish FVG and rejects no-gap and wrong displacement direction', () => {
    expect(
      fvg(bar(0), bar(1, { close: 105 }), bar(2, { low: 102 })),
    ).toMatchObject({ direction: 'LONG', lower: 101, upper: 102 });
    expect(
      fvg(bar(0), bar(1, { close: 95 }), bar(2, { high: 98 })),
    ).toMatchObject({ direction: 'SHORT', lower: 98, upper: 99 });
    expect(fvg(bar(0), bar(1), bar(2))).toBeUndefined();
    expect(
      fvg(bar(0), bar(1, { close: 99 }), bar(2, { low: 102 })),
    ).toBeUndefined();
  });
  it('seeds Wilder ATR and EMA then applies their recurrence', () => {
    expect(atr(Array.from({ length: 16 }, (_, i) => bar(i)))[13]).toBe(2);
    const e = ema([1, 2, 3, 4], 3);
    expect(e[1]).toBeUndefined();
    expect(e[2]).toBe(2);
    expect(e[3]).toBe(3);
    const a = atr([
      ...Array.from({ length: 14 }, (_, i) => bar(i)),
      bar(14, { high: 103 }),
    ]);
    expect(a[14]).toBeCloseTo(30 / 14);
  });
  it('excludes the candidate from the prior 20-bar sweep range in both directions', () => {
    const c = Array.from({ length: 21 }, (_, i) => bar(i));
    c[20].low = 98;
    expect(sweep(c, 20)).toEqual(['LONG']);
    c[20] = bar(20, { high: 102 });
    expect(sweep(c, 20)).toEqual(['SHORT']);
    expect(sweep(c, 19)).toEqual([]);
  });
  it('only confirms pivot after two right candles and BOS uses close crossing', () => {
    const c = fixture();
    expect(confirmedPivot(c, 21, 'high')).toBeUndefined();
    expect(confirmedPivot(c, 22, 'high')?.index).toBe(20);
    expect(breaks(c, 26, 105, 'LONG')).toBe(true);
    expect(breaks(c, 25, 105, 'LONG')).toBe(false);
  });
});
describe('causal signal lifecycle', () => {
  it('requires sweep → BOS → FVG, and transitions WAIT → TOUCH → READY', () => {
    const c = fixture(),
      wait = analyze('TESTUSDT', c, [], options).find(
        (s) => s.formed.index === 27,
      )!;
    expect(wait.status).toBe('WAIT');
    expect(wait.structure.sweep.index).toBeLessThan(wait.structure.bos.index);
    expect(wait.structure.bos.index).toBe(26);
    expect(wait.formed.index).toBe(27);
    expect(wait.trade).toBeUndefined();
    const touch = [
      ...c,
      bar(28, { open: 104, high: 105, low: 102, close: 104 }),
    ];
    expect(
      analyze('TESTUSDT', touch, [], options).find((s) => s.id === wait.id)
        ?.status,
    ).toBe('TOUCH');
    touch.push(bar(29, { open: 103, high: 107, low: 102, close: 106 }));
    const ready = analyze('TESTUSDT', touch, [], options).find(
      (s) => s.id === wait.id,
    )!;
    expect(ready.status).toBe('READY');
    expect(ready.ready?.index).toBe(29);
    expect(ready.trade?.confirmed).toBe(false);
  });
  it('allows same-bar first touch and reversal but never formation-bar retest', () => {
    const c = fixture();
    c.push(bar(28, { open: 103, high: 107, low: 102, close: 106 }));
    const s = analyze('TESTUSDT', c, [], options).find(
      (s) => s.formed.index === 27,
    )!;
    expect(s.touch?.index).toBe(28);
    expect(s.ready?.index).toBe(28);
  });
  it('invalidates boundary closes and deadlines', () => {
    const c = fixture();
    const invalid = analyze(
      'TESTUSDT',
      [...c, bar(28, { close: 100 })],
      [],
      options,
    ).find((s) => s.formed.index === 27)!;
    expect(invalid.status).toBe('INVALID');
    const noTouch = [
      ...c,
      ...Array.from({ length: 11 }, (_, i) =>
        bar(28 + i, { open: 108, close: 108, low: 107, high: 109 }),
      ),
    ];
    expect(
      analyze('TESTUSDT', noTouch, [], options).find(
        (s) => s.formed.index === 27,
      )?.reason,
    ).toContain('10봉');
    const touched = [
      ...c,
      ...Array.from({ length: 5 }, (_, i) =>
        bar(28 + i, { open: 104, close: 104, low: 102, high: 105 }),
      ),
    ];
    expect(
      analyze('TESTUSDT', touched, [], options).find(
        (s) => s.formed.index === 27,
      )?.reason,
    ).toContain('3봉');
  });
  it('does not register gaps with no valid structure and never duplicates an FVG', () => {
    const c = fixture();
    const out = analyze('TESTUSDT', c, [], options);
    expect(new Set(out.map((s) => s.id)).size).toBe(out.length);
    expect(analyze('TESTUSDT', c.slice(25), [], options)).toEqual([]);
  });
  it('keeps historical READY events and scores identical with appended future data', () => {
    const c = [
      ...fixture(),
      bar(28, { open: 103, high: 107, low: 102, close: 106 }),
    ];
    const before = analyze('TESTUSDT', c, [], options).find(
      (s) => s.formed.index === 27,
    )!;
    const after = analyze(
      'TESTUSDT',
      [...c, bar(29, { open: 107, high: 130, low: 106, close: 125 })],
      [],
      options,
    ).find((s) => s.id === before.id)!;
    expect(after.ready).toEqual(before.ready);
    expect(after.score).toEqual(before.score);
    expect(after.status).toBe('READY');
    expect(after.trade?.entry).toBe(107);
    expect(after.trade?.outcome).toBe('TP');
    expect(before.trade?.confirmed).toBe(false);
  });
  it('uses live next open only and refuses future unstarted or nonadjacent bars', () => {
    const c = [
      ...fixture(),
      bar(28, { open: 103, high: 107, low: 102, close: 106 }),
    ];
    const s = analyze(
      'TESTUSDT',
      c,
      [],
      options,
      bar(29, { open: 107, high: 999, low: 1 }),
    ).find((s) => s.formed.index === 27)!;
    expect(s.trade?.entry).toBe(107);
    expect(s.trade?.outcome).toBe('OPEN');
    expect(
      analyze('TESTUSDT', c, [], options, bar(30)).find((x) => x.id === s.id)
        ?.trade?.confirmed,
    ).toBe(false);
  });
  it('handles short lifecycle symmetrically and ambiguous SL/TP conservatively', () => {
    const mirror = (c: Candle): Candle => ({
      ...c,
      open: 200 - c.open,
      close: 200 - c.close,
      high: 200 - c.low,
      low: 200 - c.high,
    });
    const c = [
      ...fixture(),
      bar(28, { open: 103, high: 107, low: 102, close: 106 }),
    ].map(mirror);
    const short = analyze('SHORTUSDT', c, [], options).find(
      (s) => s.formed.index === 27,
    )!;
    expect(short.direction).toBe('SHORT');
    expect(short.status).toBe('READY');
    const future = [...c, bar(29, { open: 94, high: 120, low: 60, close: 94 })];
    expect(
      analyze('SHORTUSDT', future, [], options).find((s) => s.id === short.id)
        ?.trade?.outcome,
    ).toBe('AMBIGUOUS');
  });
  it('uses only H4 candles closed at the historical signal time', () => {
    const h = Array.from({ length: 260 }, (_, i) => ({
      ...bar(i),
      time: t + (i - 260) * H4,
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 101 + i,
    }));
    expect(trendAt(h, t, 'LONG')).toBe(15);
    expect(trendAt(h, t, 'SHORT')).toBe(0);
    const future = [...h, { ...bar(0), time: t, close: 1 }];
    expect(trendAt(future, t, 'LONG')).toBe(15);
    expect(trendAt(h.slice(0, 200), t, 'LONG')).toBe(0);
  });
  it('preserves specified 100-point weights and computes long/short 1:2 risk', () => {
    const s = {
      trendPoints: 15,
      gapATR: 0.4,
      bodyATR: 1.2,
      volumeRatio: 1.5,
      status: 'READY',
      touch: {},
    } as Signal;
    expect(totalScore(scoreSignal(s))).toBe(98);
    expect(totalScore({ ...scoreSignal(s), freshness: 5 })).toBe(100);
    s.status = 'WAIT';
    delete s.touch;
    expect(totalScore(scoreSignal(s))).toBe(90); // Maximum reachable READY freshness is 3, not 5.
    const long = risk('LONG', 100, 95, 97, 94, 10, true);
    expect(long.sl).toBe(93);
    expect(long.tp).toBe(114);
    const short = risk('SHORT', 100, 103, 105, 106, 10, true);
    expect(short.sl).toBe(107);
    expect(short.tp).toBe(86);
    expect(risk('LONG', 90, 95, 97, 94, 10, true).valid).toBe(false);
  });
});

it('freezes the BOS pivot at sweep time even after a newer higher pivot is confirmed', () => {
  const c = fixture().slice(0, 26);
  c.push(
    bar(26, { open: 100, close: 104, high: 107, low: 99.8 }),
    bar(27, { open: 104, close: 104, high: 106.8, low: 103 }),
    bar(28, { open: 104, close: 104, high: 106.7, low: 103 }),
    bar(29, { open: 104, close: 106, high: 108, low: 104 }),
    bar(30, { open: 108, close: 108, high: 109, low: 107 }),
  );
  const s = analyze('TESTUSDT', c, [], {
    ...options,
    gapATR: 0.01,
    bodyATR: 0.1,
  }).find((s) => s.formed.index === 30)!;
  expect(s).toBeDefined();
  expect(s.structure.bos.price).toBe(105);
  expect(s.structure.swing.index).toBe(20);
});
it('invalidates a live gap after an opposite sweep-backed BOS', () => {
  const c = [
    ...fixture(),
    bar(28, { open: 106, close: 106, high: 108, low: 105 }),
    bar(29, { open: 105, close: 96, high: 106, low: 95 }),
  ];
  const s = analyze('TESTUSDT', c, [], options).find(
    (s) => s.formed.index === 27,
  )!;
  expect(s.status).toBe('INVALID');
  expect(s.reason).toBe('반대 방향 유효 BOS');
});
it('rejects BOS after the ten-bar sweep deadline', () => {
  const c = fixture().slice(0, 26);
  for (let i = 26; i < 37; i++) c.push(bar(i));
  c.push(
    bar(37, { open: 100, close: 106, high: 107, low: 100 }),
    bar(38, { open: 106, close: 107, high: 108, low: 106 }),
  );
  expect(analyze('TESTUSDT', c, [], options)).toEqual([]);
});

it('never treats a second distinct visit as the first tradable retest', () => {
  const c = [
    ...fixture(),
    bar(28, { open: 104, close: 104, low: 102, high: 105 }),
    bar(29, { open: 108, close: 107, low: 106, high: 109 }),
    bar(30, { open: 103, close: 106, low: 102, high: 107 }),
  ];
  const s = analyze('TESTUSDT', c, [], options).find(
    (s) => s.formed.index === 27,
  )!;
  expect(s.status).toBe('INVALID');
  expect(s.reason).toContain('반복 방문');
  expect(s.score.freshness).toBe(0);
});
