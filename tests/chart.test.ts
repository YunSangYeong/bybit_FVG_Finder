import { it, expect } from 'vitest';
import { boxCoordinates } from '../src/components/FvgPrimitive';
import { signalMarkers } from '../src/components/MiniCandleChart';
import { tradingView } from '../src/utils/formatting';
import type { Signal } from '../src/types/signal';
it('maps FVG prices and timestamps through chart coordinate converters under pan/zoom', () => {
  expect(
    boxCoordinates(
      (t) => t * 2,
      (p) => 100 - p,
      10,
      20,
      30,
      40,
    ),
  ).toEqual({ left: 20, right: 40, top: 60, bottom: 70 });
  expect(
    boxCoordinates(
      (t) => t * 4 - 50,
      (p) => 200 - p * 2,
      10,
      20,
      30,
      40,
    ),
  ).toEqual({ left: -10, right: 30, top: 120, bottom: 140 });
  expect(
    boxCoordinates(
      () => null,
      (p) => p,
      0,
      1,
      2,
      3,
    ),
  ).toBeNull();
});
it('anchors markers at exact event price and UTC seconds and links Bybit perpetual', () => {
  const event = { index: 0, time: 900_000, price: 123 };
  const s = {
    formed: event,
    structure: { sweep: event, bos: event },
    direction: 'LONG',
  } as Signal;
  const m = signalMarkers(s);
  expect(m).toHaveLength(3);
  expect(m[0]).toMatchObject({
    time: 900,
    price: 123,
    position: 'atPriceMiddle',
  });
  expect(tradingView('ETHUSDT')).toContain('BYBIT%3AETHUSDT.P');
});
