import type { Candle } from './market';
export type Direction = 'LONG' | 'SHORT';
export type Status = 'WAIT' | 'TOUCH' | 'READY' | 'INVALID';
export interface Event {
  index: number;
  time: number;
  price: number;
}
export interface Structure {
  direction: Direction;
  sweep: Event;
  bos: Event;
  swing: Event;
}
export interface Score {
  trend: number;
  sweep: number;
  bos: number;
  gap: number;
  displacement: number;
  volume: number;
  freshness: number;
  retest: number;
}
export interface Trade {
  entry: number;
  confirmed: boolean;
  sl: number;
  tp: number;
  valid: boolean;
  outcome: 'OPEN' | 'SL' | 'TP' | 'AMBIGUOUS' | 'INVALID';
  exitTime?: number;
}
export interface Signal {
  id: string;
  symbol: string;
  direction: Direction;
  status: Status;
  lower: number;
  upper: number;
  mid: number;
  gapATR: number;
  bodyATR: number;
  volumeRatio: number;
  formed: Event;
  structure: Structure;
  touch?: Event;
  ready?: Event;
  invalid?: Event;
  reason?: string;
  trendPoints: number;
  score: Score;
  total: number;
  trade?: Trade;
}
export interface ScanResult {
  market: { symbol: string; turnover: number };
  candles: Candle[];
  signals: Signal[];
}
export interface Settings {
  turnover: number;
  includeETH: boolean;
  direction: 'ALL' | Direction;
  minScore: number;
  states: Status[];
  recent: number;
  trendFilter: boolean;
  gapATR: number;
  bodyATR: number;
  showEMA: boolean;
  riskPercent: number;
}
export const defaults: Settings = {
  turnover: 10_000_000,
  includeETH: true,
  direction: 'ALL',
  minScore: 75,
  states: ['READY'],
  recent: 10,
  trendFilter: true,
  gapATR: 0.2,
  bodyATR: 0.8,
  showEMA: false,
  riskPercent: 0.5,
};
