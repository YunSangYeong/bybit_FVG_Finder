import { useEffect, useRef, useState } from 'react';
import type { ScanResult, Signal } from '../types/signal';
import { grade } from '../strategy/scoring';
import { kst } from '../utils/time';
import { price, turnover, tradingView } from '../utils/formatting';
import { MiniCandleChart } from './MiniCandleChart';
import { ScoreDetails } from './ScoreDetails';
const outcomes = {
  INVALID: '과거 신호 · 구조 무효화',
  OPEN: '현재 진입 후보',
  SL: '과거 신호 · 손절 도달',
  TP: '과거 신호 · 익절 도달',
  AMBIGUOUS: '과거 신호 · 동일 봉 SL/TP 도달 (순서 불명)',
};
export function ResultCard({
  result,
  signal: s,
  showEMA,
  riskPercent,
}: {
  result: ScanResult;
  signal: Signal;
  showEMA: boolean;
  riskPercent: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false),
    [expanded, setExpanded] = useState(true);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '180px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const event = s.ready ?? s.invalid ?? s.formed;
  const age = result.candles.length - 1 - event.index;
  return (
    <article
      ref={ref}
      className={`panel result-card ${s.direction.toLowerCase()}`}
    >
      <header className="card-header">
        <div>
          <div className="row badges">
            <strong className="symbol">
              {s.symbol.replace(/USDT$/, '')}
              <small> / USDT</small>
            </strong>
            <span className={`direction ${s.direction.toLowerCase()}`}>
              {s.direction}
            </span>
            <span className={`status ${s.status.toLowerCase()}`}>
              {s.status}
            </span>
          </div>
          <p className="small muted">
            {kst(event.time + 900_000)} KST · {age}봉 전 · 15분봉
          </p>
        </div>
        <div className="score">
          <b>{s.total}</b>
          <span>/ 100 · {grade(s.total)}</span>
        </div>
      </header>
      <button
        className="collapse"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? '차트 및 분석 접기 −' : '차트 및 분석 펼치기 +'}
      </button>
      {expanded && (
        <>
          <div className="chart-wrap">
            {visible ? (
              <MiniCandleChart
                candles={result.candles}
                signal={s}
                showEMA={showEMA}
              />
            ) : (
              <div className="chart-placeholder">실제 캔들 차트 로딩 대기</div>
            )}
          </div>
          <div className="card-body">
            {s.trade && (
              <p
                className={`trade-state ${s.trade.outcome !== 'OPEN' ? 'historical' : ''}`}
              >
                {!s.trade.valid
                  ? '진입 불가 · 가격 구조 오류'
                  : s.trade.confirmed
                    ? outcomes[s.trade.outcome]
                    : '다음 봉 시가 대기 · 아래 가격은 예정값'}
              </p>
            )}
            {s.reason && <p className="error small">{s.reason}</p>}
            <div className="levels">
              {[
                ['FVG 상단', s.upper],
                ['FVG 하단', s.lower],
                ['FVG 중간', s.mid],
                [
                  '진입' + (s.trade?.confirmed ? ' (확인)' : ' (예정)'),
                  s.trade?.entry,
                ],
                ['손절 · SL', s.trade?.sl],
                ['익절 · TP', s.trade?.tp],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <b>{price(value as number | undefined)}</b>
                </div>
              ))}
            </div>
            <div className="row card-meta">
              <span>
                24h <b>{turnover(result.market.turnover)} USDT</b>
              </span>
              <span>R:R 1:2 · 위험 {riskPercent}%</span>
            </div>
            <ScoreDetails score={s.score} />
            <a
              className="tv-link"
              href={tradingView(s.symbol)}
              target="_blank"
              rel="noreferrer"
            >
              TradingView에서 차트 열기 ↗
            </a>
          </div>
        </>
      )}
    </article>
  );
}
