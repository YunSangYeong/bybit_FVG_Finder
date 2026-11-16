import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  ColorType,
  type Time,
  type AutoscaleInfo,
  type SeriesMarker,
} from 'lightweight-charts';
import type { Candle } from '../types/market';
import type { Signal } from '../types/signal';
import { ema } from '../indicators/ema';
import { FvgPrimitive } from './FvgPrimitive';
import { kst } from '../utils/time';
export const chartTime = (ms: number) => (ms / 1000) as Time;
export function signalMarkers(s: Signal): SeriesMarker<Time>[] {
  const events: [Signal['formed'], string, string][] = [
    [s.structure.sweep, 'SWEEP', '#e5ac4c'],
    [s.structure.bos, 'BOS', '#86b4ed'],
    [s.formed, 'FVG', s.direction === 'LONG' ? '#29bc91' : '#ef7787'],
  ];
  if (s.touch) events.push([s.touch, 'RETEST', '#c5b5ed']);
  if (s.ready) events.push([s.ready, `${s.direction} READY`, '#ffffff']);
  const out: SeriesMarker<Time>[] = events.map(([event, text, color]) => ({
    time: chartTime(event.time),
    position: 'atPriceMiddle',
    price: event.price,
    shape: 'circle',
    color,
    text,
    size: 0.7,
  }));
  if (s.ready && s.trade?.confirmed)
    out.push({
      time: chartTime(s.ready.time + 900_000),
      position: 'atPriceMiddle',
      price: s.trade.entry,
      shape: s.direction === 'LONG' ? 'arrowUp' : 'arrowDown',
      color: '#d8f38e',
      text: 'ENTRY',
    });
  return out.sort((a, b) => (a.time as number) - (b.time as number));
}
export function MiniCandleChart({
  candles,
  signal: s,
  showEMA,
}: {
  candles: Candle[];
  signal: Signal;
  showEMA: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const node = container.current;
    const chart = createChart(node, {
      autoSize: true,
      height: 250,
      layout: {
        background: { type: ColorType.Solid, color: '#111f29' },
        textColor: '#91a6b5',
        fontSize: 10,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: '#20313b' },
        horzLines: { color: '#20313b' },
      },
      rightPriceScale: { borderColor: '#2a3c46' },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#2a3c46',
      },
      localization: {
        timeFormatter: (time: Time) => kst((time as number) * 1000),
      },
      handleScroll: { vertTouchDrag: false },
    });
    const precision = Math.max(
      2,
      Math.min(8, 4 - Math.floor(Math.log10(candles.at(-1)!.close))),
    );
    const series = chart.addSeries(CandlestickSeries, {
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const info = original();
        if (info?.priceRange && s.status === 'READY' && s.trade?.valid) {
          info.priceRange.minValue = Math.min(
            info.priceRange.minValue,
            s.trade.sl,
            s.trade.tp,
          );
          info.priceRange.maxValue = Math.max(
            info.priceRange.maxValue,
            s.trade.sl,
            s.trade.tp,
          );
        }
        return info;
      },
      upColor: '#2abd94',
      downColor: '#f16c7d',
      wickUpColor: '#2abd94',
      wickDownColor: '#f16c7d',
      borderVisible: false,
      priceFormat: { type: 'price', precision, minMove: 10 ** -precision },
    });
    const data = candles.map((c) => ({ ...c, time: chartTime(c.time) }));
    series.setData(data);
    // Whitespace makes a known live next-open entry marker addressable without inventing OHLCV.
    if (s.ready?.index === candles.length - 1 && s.trade?.confirmed)
      series.update({ time: chartTime(s.ready.time + 900_000) });
    const primitive = new FvgPrimitive(
      chartTime(s.formed.time),
      chartTime(s.invalid?.time ?? candles.at(-1)!.time),
      s.lower,
      s.upper,
      s.direction === 'LONG',
    );
    series.attachPrimitive(primitive);
    const markers = createSeriesMarkers(series, signalMarkers(s), {
      autoScale: true,
    });
    if (s.status === 'READY' && s.trade?.valid) {
      for (const [title, value, color] of [
        ['ENTRY', s.trade.entry, '#d8f38e'],
        ['SL', s.trade.sl, '#f16c7d'],
        ['TP', s.trade.tp, '#2abd94'],
      ] as const)
        series.createPriceLine({
          price: value,
          color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: s.trade.confirmed ? title : `예정 ${title}`,
        });
    }
    if (showEMA)
      for (const [period, color] of [
        [50, '#dfb76a'],
        [200, '#9f99d6'],
      ] as const) {
        const line = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        line.setData(
          ema(
            candles.map((c) => c.close),
            period,
          ).flatMap((value, i) =>
            value === undefined
              ? []
              : [{ time: chartTime(candles[i].time), value }],
          ),
        );
      }
    const focus = s.ready?.index ?? s.formed.index;
    const to = Math.max(focus + 12, candles.length + 8);
    const from = Math.max(0, Math.min(to - 80, s.structure.sweep.index - 4));
    chart.timeScale().setVisibleLogicalRange({ from, to });
    return () => {
      markers.detach();
      series.detachPrimitive(primitive);
      chart.remove();
    };
  }, [candles, s, showEMA]);
  return (
    <div
      className="chart"
      ref={container}
      role="img"
      aria-label={`${s.symbol} 실제 15분 캔들, FVG 및 매매 신호 차트`}
    />
  );
}
