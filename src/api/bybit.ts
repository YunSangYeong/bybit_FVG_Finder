import {
  M15,
  type Candle,
  type Instrument,
  type Market,
} from '../types/market';
const BASE = 'https://api.bybit.com';
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
const aborted = () => new DOMException('검색이 취소되었습니다.', 'AbortError');
export function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    const done = () => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    };
    const t = setTimeout(done, ms);
    const cancel = () => {
      clearTimeout(t);
      reject(aborted());
    };
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
// Shared semaphore caps HTTP requests (including retries), not merely symbol jobs.
class Semaphore {
  active = 0;
  queue: (() => void)[] = [];
  async run<T>(task: () => Promise<T>, signal?: AbortSignal) {
    if (this.active >= 5) await new Promise<void>((r) => this.queue.push(r));
    else this.active++;
    try {
      if (signal?.aborted) throw aborted();
      return await task();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
}
const gate = new Semaphore();
interface Envelope<T> {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
}
export async function request<T>(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<Envelope<T>> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (signal?.aborted) throw aborted();
    try {
      return await gate.run(async () => {
        const timeout = AbortSignal.timeout(12_000);
        const response = await fetch(
          `${BASE}${path}?${new URLSearchParams(params)}`,
          { signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
        );
        if (!response.ok)
          throw new ApiError(
            response.status === 403
              ? 'HTTP 403: 지역 제한 또는 네트워크 접근 정책을 확인하세요.'
              : `HTTP ${response.status}: Bybit 요청 실패`,
            response.status,
          );
        const data: Envelope<T> = await response.json();
        if (
          !Number.isFinite(data.retCode) ||
          !Number.isFinite(data.time) ||
          !data.result
        )
          throw new ApiError('잘못된 API 응답 형식');
        if (data.retCode !== 0)
          throw new ApiError(
            `Bybit ${data.retCode}: ${data.retMsg}`,
            data.retCode === 10006 ? 429 : 400,
          );
        return data;
      }, signal);
    } catch (e) {
      if (signal?.aborted) throw aborted();
      const error = e instanceof Error ? e : new Error(String(e));
      const retry =
        !(e instanceof ApiError) ||
        e.status === 429 ||
        (e.status !== undefined && e.status >= 500);
      if (attempt === 3 || !retry)
        throw e instanceof ApiError
          ? e
          : new ApiError(
              `연결 실패: CORS·지역 제한·네트워크 또는 시간 초과를 확인하세요. (${error.message})`,
            );
      await wait(500 * 2 ** attempt, signal);
    }
  }
  throw new ApiError('요청 실패');
}
export async function instruments(signal?: AbortSignal): Promise<Instrument[]> {
  let cursor = '';
  const out: Instrument[] = [];
  const seen = new Set<string>();
  do {
    const { result } = await request<{
      list: Instrument[];
      nextPageCursor?: string;
    }>(
      '/v5/market/instruments-info',
      { category: 'linear', limit: '1000', ...(cursor ? { cursor } : {}) },
      signal,
    );
    if (!Array.isArray(result.list)) throw new ApiError('종목 목록 형식 오류');
    out.push(...result.list);
    cursor = result.nextPageCursor ?? '';
    if (cursor && seen.has(cursor)) throw new ApiError('종목 페이지 커서 반복');
    seen.add(cursor);
  } while (cursor);
  return [...new Map(out.map((x) => [x.symbol, x])).values()];
}
export async function markets(
  turnover: number,
  includeETH: boolean,
  signal?: AbortSignal,
): Promise<Market[]> {
  const [all, tickers] = await Promise.all([
    instruments(signal),
    request<{ list: { symbol: string; turnover24h: string }[] }>(
      '/v5/market/tickers',
      { category: 'linear' },
      signal,
    ),
  ]);
  if (!Array.isArray(tickers.result.list))
    throw new ApiError('거래대금 목록 형식 오류');
  const eligible = new Set(
    all
      .filter(
        (x) =>
          x.quoteCoin === 'USDT' &&
          x.settleCoin === 'USDT' &&
          x.contractType === 'LinearPerpetual' &&
          x.status === 'Trading' &&
          x.symbol !== 'BTCUSDT' &&
          (includeETH || x.symbol !== 'ETHUSDT'),
      )
      .map((x) => x.symbol),
  );
  return tickers.result.list
    .map((x) => ({ symbol: x.symbol, turnover: Number(x.turnover24h) }))
    .filter(
      (x) =>
        eligible.has(x.symbol) &&
        Number.isFinite(x.turnover) &&
        x.turnover >= turnover,
    )
    .sort((a, b) => b.turnover - a.turnover);
}
export function parseCandles(rows: unknown, interval: number, now: number) {
  if (!Array.isArray(rows)) throw new ApiError('캔들 목록 형식 오류');
  const map = new Map<number, Candle>();
  let rejected = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) {
      rejected++;
      continue;
    }
    const [time, open, high, low, close, volume] = row.map(Number);
    if (
      ![time, open, high, low, close, volume].every(Number.isFinite) ||
      time < 0 ||
      time % interval !== 0 ||
      low <= 0 ||
      open < low ||
      close < low ||
      open > high ||
      close > high ||
      volume < 0 ||
      time > now
    ) {
      rejected++;
      continue;
    }
    const value = { time, open, high, low, close, volume };
    if (
      map.has(time) &&
      JSON.stringify(map.get(time)) !== JSON.stringify(value)
    )
      throw new ApiError('동일 시간의 상충하는 캔들');
    map.set(time, value);
  }
  const all = [...map.values()].sort((a, b) => a.time - b.time),
    closed = all.filter((c) => c.time + interval <= now);
  if (closed.some((c, i) => i > 0 && c.time - closed[i - 1].time !== interval))
    throw new ApiError('캔들 누락 또는 잘못된 OHLCV 데이터로 연속성 부족');
  return { closed, next: all.find((c) => c.time + interval > now), rejected };
}
export async function candles(
  symbol: string,
  interval: '15' | '240',
  signal?: AbortSignal,
) {
  const response = await request<{ list: unknown }>(
    '/v5/market/kline',
    { category: 'linear', symbol, interval, limit: '400' },
    signal,
  );
  const parsed = parseCandles(
    response.result.list,
    interval === '15' ? M15 : 14_400_000,
    response.time,
  );
  const minimum = interval === '15' ? 300 : 250;
  if (parsed.closed.length < minimum)
    throw new ApiError(
      `분석 불가: 확정 ${interval}분봉 ${parsed.closed.length}개 (최소 ${minimum}개 필요, 제외 ${parsed.rejected}개)`,
    );
  return parsed;
}
