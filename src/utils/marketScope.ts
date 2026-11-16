import type { AssetClass } from '../types/market';
// Bybit V5 official enum: missing/empty is the regular crypto zone.
// Exclude commodities, forex, and future unknown types rather than labeling them coins.
export function classifyMarket(symbolType?: string): AssetClass | undefined {
  const type = (symbolType ?? '').trim().toLowerCase();
  if (type === '' || type === 'innovation') return 'COIN';
  if (type === 'stock' || type === 'etf') return 'STOCK';
}
