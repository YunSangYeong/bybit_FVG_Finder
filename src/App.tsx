import { useState } from 'react';
import {
  defaults,
  type Settings,
  type ScanResult,
  type Signal,
} from './types/signal';
import { visibleSignals } from './strategy/signalEngine';
import { SearchPanel } from './components/SearchPanel';
import { ProgressBar } from './components/ProgressBar';
import { ResultCard } from './components/ResultCard';
import { useScanner } from './hooks/useScanner';
const STORAGE = 'fvg-precision-settings-v1';
function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE) ?? 'null');
    if (!s) return defaults;
    return {
      ...defaults,
      ...Object.fromEntries(
        Object.keys(defaults)
          .filter((k) => typeof s[k] === typeof defaults[k as keyof Settings])
          .map((k) => [k, s[k]]),
      ),
      turnover: [5e6, 1e7, 2e7, 5e7].includes(s.turnover)
        ? s.turnover
        : defaults.turnover,
      minScore: Math.max(50, Math.min(95, Number(s.minScore) || 75)),
      recent: [3, 5, 10, 20].includes(s.recent) ? s.recent : 10,
      direction: ['ALL', 'LONG', 'SHORT'].includes(s.direction)
        ? s.direction
        : 'ALL',
      states: Array.isArray(s.states)
        ? s.states.filter((x: string) =>
            ['WAIT', 'TOUCH', 'READY', 'INVALID'].includes(x),
          )
        : ['READY'],
      gapATR: Math.max(0.01, Math.min(5, Number(s.gapATR) || 0.2)),
      bodyATR: Math.max(0.1, Math.min(5, Number(s.bodyATR) || 0.8)),
      riskPercent: Math.max(0.1, Math.min(5, Number(s.riskPercent) || 0.5)),
    };
  } catch {
    return defaults;
  }
}
export default function App() {
  const [settings, set] = useState<Settings>(load),
    [sort, setSort] = useState('score'),
    [started, setStarted] = useState(false),
    [scanSettings, setScanSettings] = useState<Settings>(settings);
  const scanner = useScanner();
  const update = (s: Settings) => {
    set(s);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(s));
    } catch {
      /* Storage may be blocked; scanning still works. */
    }
  };
  const cards: { result: ScanResult; signal: Signal }[] =
    scanner.results.flatMap((result) =>
      visibleSignals(result.signals, settings, result.candles.length - 1).map(
        (signal) => ({ result, signal }),
      ),
    );
  cards.sort((a, b) =>
    sort === 'score'
      ? b.signal.total - a.signal.total
      : sort === 'recent'
        ? (b.signal.ready ?? b.signal.formed).time -
          (a.signal.ready ?? a.signal.formed).time
        : sort === 'turnover'
          ? b.result.market.turnover - a.result.market.turnover
          : a.signal.symbol.localeCompare(b.signal.symbol),
  );
  const p = scanner.progress;
  const success = scanner.results.length;
  return (
    <>
      <header className="masthead">
        <a className="brand" href="#">
          <span className="brand-icon">⌁</span> FVG<span>PRECISION</span>
          <sup>V1.0</sup>
        </a>
        <span className="market-label">
          <i /> BYBIT PERPETUAL
        </span>
      </header>
      <main>
        <section className="hero">
          <div className="eyebrow">MARKET INTELLIGENCE / USDT LINEAR</div>
          <h1>
            가격의 빈틈,
            <br />
            <em>구조로 읽는 기회.</em>
          </h1>
          <p>
            유동성 스윕부터 리테스트까지.
            <br className="mobile" /> 확정된 시장 구조로 FVG 매매 후보를
            탐색합니다.
          </p>
          <div className="hero-tags">
            <span>15m FVG</span>
            <span>4h TREND</span>
            <span>100pt QUALITY</span>
            <span>LONG & SHORT</span>
          </div>
        </section>
        <SearchPanel
          settings={settings}
          setSettings={update}
          disabled={p.running}
          onSearch={() => {
            setStarted(true);
            setScanSettings({ ...settings });
            void scanner.start({ ...settings });
          }}
        />
        {started && <ProgressBar progress={p} cancel={scanner.cancel} />}
        {p.error && (
          <div className="panel error" role="alert">
            <strong>시장 데이터 수집 실패</strong>
            <p>{p.error}</p>
            <small>
              가상 데이터로 대체하지 않습니다. 브라우저 네트워크와 Bybit 접근
              가능 지역을 확인하세요.
            </small>
          </div>
        )}
        {p.failures.length > 0 && (
          <details className="panel failures">
            <summary>
              분석 실패 {p.failures.length}종목 · 나머지 종목은 계속 분석됩니다
            </summary>
            <ul>
              {p.failures.map((f) => (
                <li key={f.symbol}>
                  <b>{f.symbol}</b> {f.message}
                </li>
              ))}
            </ul>
          </details>
        )}
        {started &&
          (scanSettings.gapATR !== settings.gapATR ||
            scanSettings.bodyATR !== settings.bodyATR ||
            scanSettings.trendFilter !== settings.trendFilter ||
            scanSettings.turnover !== settings.turnover ||
            scanSettings.includeETH !== settings.includeETH) && (
            <p className="notice">
              분석 조건이 변경되었습니다. 새 조건을 적용하려면 다시 검색하세요.
            </p>
          )}
        <section className="results">
          <div className="results-heading">
            <div>
              <span className="eyebrow">SIGNAL EXPLORER</span>
              <h2>
                검색 결과 <span>{cards.length}</span>
              </h2>
            </div>
            <label className="sort">
              <span className="sr-only">결과 정렬</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="score">점수 높은 순</option>
                <option value="recent">최근 신호 순</option>
                <option value="turnover">거래대금 높은 순</option>
                <option value="symbol">종목명 순</option>
              </select>
            </label>
          </div>
          {!cards.length && (
            <div className="empty panel">
              <div className="empty-icon">⌁</div>
              <h3>
                {!started
                  ? '다음 기회를 탐색할 준비가 되었습니다'
                  : p.running
                    ? '전체 시장에서 구조를 찾고 있습니다'
                    : p.error || (!success && p.failures.length)
                      ? '시장 데이터를 수집하지 못했습니다'
                      : p.cancelled
                        ? '검색이 취소되었습니다'
                        : '현재 검색 조건에 해당하는 FVG 신호가 없습니다.'}
              </h3>
              <p>
                {!started
                  ? '검색 조건을 설정하고 전체 시장 검색을 시작하세요.'
                  : p.failures.length
                    ? '실패한 종목은 결과에 포함되지 않았습니다. 오류 내역을 확인하세요.'
                    : '실제 Bybit 데이터에서 조건을 충족하는 신호만 표시합니다.'}
              </p>
            </div>
          )}
          <div className="result-grid">
            {cards.map(({ result, signal }) => (
              <ResultCard
                key={signal.id}
                result={result}
                signal={signal}
                showEMA={settings.showEMA}
                riskPercent={settings.riskPercent}
              />
            ))}
          </div>
        </section>
        <footer>
          <span>
            FVG PRECISION <b>V1.0</b>
          </span>
          <p>시장 분석 도구 · 자동 주문 없음 · 점수는 성공 확률이 아닙니다.</p>
          <p>
            시간 표시는 KST · 차트 제공{' '}
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noreferrer"
            >
              TradingView Lightweight Charts™
            </a>
          </p>
        </footer>
      </main>
    </>
  );
}
