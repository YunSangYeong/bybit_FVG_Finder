export const price = (value?: number) =>
  value === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(
        value,
      );
export const turnover = (value: number) =>
  value >= 1e9
    ? `${(value / 1e9).toFixed(2)}B`
    : `${(value / 1e6).toFixed(1)}M`;
export const tradingView = (symbol: string) =>
  `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`BYBIT:${symbol}.P`)}&interval=15`;
