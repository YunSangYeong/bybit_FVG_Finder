import { afterEach, describe, it, expect, vi } from 'vitest';
import { instruments, request, parseCandles, markets } from '../src/api/bybit';
import { M15 } from '../src/types/market';
const response = (result: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      retCode: 0,
      retMsg: 'OK',
      time: 1_800_000_000_000,
      result,
    }),
    { status },
  );
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('Bybit transport', () => {
  it('paginates every instruments page and deduplicates', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({ list: [{ symbol: 'A' }], nextPageCursor: 'next' }),
      )
      .mockResolvedValueOnce(
        response({ list: [{ symbol: 'B' }, { symbol: 'A' }] }),
      );
    vi.stubGlobal('fetch', fetch);
    expect((await instruments()).map((x) => x.symbol)).toEqual(['A', 'B']);
    expect(fetch.mock.calls[1][0]).toContain('cursor=next');
  });
  it('recovers from 429 and transient failures with retry, never retries 403', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(response({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const result = request('/test', {});
    await vi.runAllTimersAsync();
    expect((await result).result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
    fetch.mockReset().mockResolvedValue(new Response('', { status: 403 }));
    await expect(request('/test', {})).rejects.toThrow('지역 제한');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('supports cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      request('/test', {}, controller.signal),
    ).rejects.toHaveProperty('name', 'AbortError');
  });
  it('filters eligible perpetual markets without arbitrary top-N cutoff', async () => {
    const list = Array.from({ length: 12 }, (_, i) => ({
      symbol: `ALT${i}USDT`,
      quoteCoin: 'USDT',
      settleCoin: 'USDT',
      contractType: 'LinearPerpetual',
      status: 'Trading',
    }));
    list.push(
      { ...list[0], symbol: 'BTCUSDT' },
      { ...list[0], symbol: 'ETHUSDT' },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          response(
            url.includes('instruments')
              ? { list }
              : {
                  list: list.map((x) => ({
                    symbol: x.symbol,
                    turnover24h: '20000000',
                  })),
                },
          ),
        ),
      ),
    );
    expect(await markets(1e7, false)).toHaveLength(12);
  });
  it('normalizes ordering, removes duplicates and unclosed bars, excludes bad OHLCV', () => {
    const now = M15 * 5;
    const row = (i: number) => [i * M15, '10', '12', '9', '11', '100'];
    const parsed = parseCandles(
      [row(4), row(3), row(3), row(5), ['broken']],
      M15,
      now,
    );
    expect(parsed.closed.map((x) => x.time)).toEqual([M15 * 3, M15 * 4]);
    expect(parsed.next?.time).toBe(now);
    expect(parsed.rejected).toBe(1);
    expect(() => parseCandles([row(1), row(3)], M15, now)).toThrow('캔들 누락');
  });
  it('rejects contradictory duplicate OHLCV', () => {
    expect(() =>
      parseCandles(
        [
          [0, 10, 12, 9, 11, 100],
          [0, 10, 13, 9, 11, 100],
        ],
        M15,
        M15,
      ),
    ).toThrow('상충');
  });
});

it('never runs more than five simultaneous HTTP requests across symbol jobs', async () => {
  let active = 0,
    max = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return response({ ok: true });
    }),
  );
  await Promise.all(Array.from({ length: 17 }, () => request('/test', {})));
  expect(max).toBe(5);
  expect(active).toBe(0);
});
it('rejects repeated pagination cursors instead of silently omitting remaining instruments', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      response({ list: [{ symbol: 'A' }], nextPageCursor: 'same' }),
    ),
  );
  await expect(instruments()).rejects.toThrow('커서 반복');
});
