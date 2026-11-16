export type AssetClass = 'COIN' | 'STOCK';
export type MarketScope = AssetClass | 'ALL';
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
  symbolType?: string;
}
export interface Market {
  assetClass: AssetClass;
  symbol: string;
  turnover: number;
}
export const M15 = 900_000,
  H4 = 14_400_000;
