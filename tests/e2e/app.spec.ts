import { test, expect } from '@playwright/test';
const M = 900_000,
  now = Math.floor(Date.now() / M) * M;
const make = (i: number) => ({
  time: now - (320 - i) * M,
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  volume: 100,
});
function rows() {
  const c = Array.from({ length: 320 }, (_, i) => make(i));
  c[310].high = 105;
  c[312].low = 98;
  c[315] = { ...make(315), open: 99.5, low: 97 };
  c[316] = {
    ...make(316),
    open: 100,
    close: 106,
    high: 107,
    low: 99.8,
    volume: 200,
  };
  c[317] = { ...make(317), open: 106, close: 106.5, high: 107, low: 105.5 };
  c[318] = { ...make(318), open: 103, high: 107, low: 102, close: 106 };
  c[319] = { ...make(319), open: 106, high: 108, low: 105, close: 107 };
  return c
    .map((x) =>
      [x.time, x.open, x.high, x.low, x.close, x.volume, 1000].map(String),
    )
    .reverse();
}
test('mobile search renders actual API-shaped candles, overlays, filters and persists settings', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://api.bybit.com/**', async (route) => {
    const url = new URL(route.request().url());
    let result: unknown;
    if (url.pathname.endsWith('instruments-info'))
      result = {
        list: [
          {
            symbol: 'TESTUSDT',
            quoteCoin: 'USDT',
            settleCoin: 'USDT',
            contractType: 'LinearPerpetual',
            status: 'Trading',
          },
        ],
      };
    else if (url.pathname.endsWith('tickers'))
      result = { list: [{ symbol: 'TESTUSDT', turnover24h: '25000000' }] };
    else
      result = {
        list:
          url.searchParams.get('interval') === '15'
            ? rows()
            : Array.from({ length: 400 }, (_, i) =>
                [
                  Math.floor(now / 14_400_000) * 14_400_000 -
                    (i + 1) * 14_400_000,
                  100,
                  101,
                  99,
                  100,
                  100,
                ].map(String),
              ),
      };
    await route.fulfill({
      json: { retCode: 0, retMsg: 'OK', time: now + 1000, result },
    });
  });
  await page.goto('/');
  await page.getByLabel('4h 추세 필터').uncheck();
  await page.getByRole('button', { name: '전체 시장 검색' }).click();
  await expect(page.locator('.result-card')).toHaveCount(1);
  await expect(page.locator('.result-card .status')).toHaveText('READY');
  await page.locator('.result-card').scrollIntoViewIfNeeded();
  await expect(page.locator('.chart canvas').first()).toBeVisible();
  await expect(page.locator('.trade-state')).toContainText('현재 진입 후보');
  await expect(page.locator('.tv-link')).toHaveAttribute(
    'href',
    /BYBIT%3ATESTUSDT.P/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel('차트 EMA 50·200').check();
  await page
    .locator('.chart')
    .screenshot({ path: 'test-results/mobile-chart.png' });
  await page.locator('.chart').hover();
  await page.mouse.wheel(0, -180);
  await page.waitForTimeout(150);
  await expect(page.locator('.chart canvas').first()).toBeVisible();
  await page.getByRole('button', { name: '차트 및 분석 접기' }).click();
  await expect(page.locator('.chart')).toHaveCount(0);
  await page.getByRole('button', { name: '차트 및 분석 펼치기' }).click();
  await expect(page.locator('.chart canvas').first()).toBeVisible();
  await page.screenshot({
    path: 'test-results/mobile-results.png',
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByLabel('4h 추세 필터')).not.toBeChecked();
  expect(errors).toEqual([]);
});
test('transport failure is shown instead of an empty successful scan', async ({
  page,
}) => {
  await page.route('https://api.bybit.com/**', (r) =>
    r.fulfill({ status: 403, body: 'Forbidden' }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '전체 시장 검색' }).click();
  await expect(page.getByRole('alert')).toContainText('403');
  await expect(page.locator('.result-card')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: '시장 데이터를 수집하지 못했습니다' }),
  ).toBeVisible();
});
test('desktop initial layout has no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /가격의 빈틈/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
});
