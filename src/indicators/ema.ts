export function ema(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = Array(values.length);
  if (values.length < period) return out;
  let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = value;
  for (let i = period; i < values.length; i++) {
    value += ((values[i] - value) * 2) / (period + 1);
    out[i] = value;
  }
  return out;
}
