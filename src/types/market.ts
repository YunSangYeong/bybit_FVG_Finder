export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface Instrument {
  symbol: string;
  quoteCoin: string;
  settleCoin: string;
  contractType: string;
  status: string;
}
export interface Market {
  symbol: string;
  turnover: number;
}
export const M15 = 900_000,
  H4 = 14_400_000;
