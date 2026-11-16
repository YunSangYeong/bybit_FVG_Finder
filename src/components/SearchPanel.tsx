import type { Settings, Status } from '../types/signal';
export function SearchPanel({
  settings: s,
  setSettings: set,
  disabled,
  onSearch,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  disabled: boolean;
  onSearch: () => void;
}) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    set({ ...s, [key]: value });
  return (
    <section className="panel settings" aria-label="검색 설정">
      <div className="section-title">
        <div>
          <span className="eyebrow">SCAN CONFIGURATION</span>
          <h2>시장의 빈틈을 찾으세요</h2>
        </div>
        <span className="pill">15m / 4h</span>
      </div>
      <fieldset disabled={disabled}>
        <div className="market-scope" role="group" aria-label="탐색시장">
          <span className="scope-label">탐색시장</span>
          <div className="scope-choices">
            {(
              [
                ['COIN', '코인만'],
                ['STOCK', '주식만'],
                ['ALL', '전체'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`scope-choice ${s.marketScope === value ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="market-scope"
                  value={value}
                  checked={s.marketScope === value}
                  onChange={() => update('marketScope', value)}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="small muted">
            {s.marketScope === 'COIN'
              ? 'Bybit 코인 무기한 상품만 탐색합니다.'
              : s.marketScope === 'STOCK'
                ? 'Bybit 주식·ETF 무기한 상품만 탐색합니다.'
                : 'Bybit 코인 + 주식·ETF 무기한 상품을 함께 탐색합니다.'}
          </p>
        </div>
        <div className="fields">
          <label>
            방향
            <select
              value={s.direction}
              onChange={(e) =>
                update('direction', e.target.value as Settings['direction'])
              }
            >
              <option>ALL</option>
              <option>LONG</option>
              <option>SHORT</option>
            </select>
          </label>
          <label>
            24h 거래대금
            <select
              value={s.turnover}
              onChange={(e) => update('turnover', +e.target.value)}
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n * 1e6}>
                  {n * 100}만 USDT
                </option>
              ))}
            </select>
          </label>
          <label>
            최소 품질 점수 <b>{s.minScore}</b>
            <input
              type="range"
              min="50"
              max="95"
              value={s.minScore}
              onChange={(e) => update('minScore', +e.target.value)}
            />
          </label>
          <label>
            최근 확정 신호
            <select
              value={s.recent}
              onChange={(e) => update('recent', +e.target.value)}
            >
              {[3, 5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  최근 {n}봉
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="options">
          {(['WAIT', 'TOUCH', 'READY', 'INVALID'] as Status[]).map((status) => (
            <label
              className={`state-option ${s.states.includes(status) ? 'selected' : ''}`}
              key={status}
            >
              <input
                type="checkbox"
                checked={s.states.includes(status)}
                onChange={(e) =>
                  update(
                    'states',
                    e.target.checked
                      ? [...s.states, status]
                      : s.states.filter((x) => x !== status),
                  )
                }
              />
              {status}
            </label>
          ))}
        </div>
        <div className="toggles">
          <label>
            <input
              type="checkbox"
              checked={s.trendFilter}
              onChange={(e) => update('trendFilter', e.target.checked)}
            />
            4h 추세 필터
          </label>
          <label>
            <input
              type="checkbox"
              disabled={s.marketScope === 'STOCK'}
              checked={s.includeETH}
              onChange={(e) => update('includeETH', e.target.checked)}
            />
            ETH 포함
          </label>
          <label>
            <input
              type="checkbox"
              checked={s.showEMA}
              onChange={(e) => update('showEMA', e.target.checked)}
            />
            차트 EMA 50·200
          </label>
        </div>
        <details>
          <summary>고급 설정 · 변위 및 위험 관리</summary>
          <div className="fields advanced">
            <label>
              최소 FVG / ATR
              <input
                type="number"
                min="0.01"
                max="5"
                step="0.05"
                value={s.gapATR}
                onChange={(e) =>
                  update('gapATR', Math.max(0.01, Math.min(5, +e.target.value)))
                }
              />
            </label>
            <label>
              최소 몸통 / ATR
              <input
                type="number"
                min="0.1"
                max="5"
                step="0.1"
                value={s.bodyATR}
                onChange={(e) =>
                  update('bodyATR', Math.max(0.1, Math.min(5, +e.target.value)))
                }
              />
            </label>
            <label>
              거래당 위험 (%)
              <input
                type="number"
                min="0.1"
                max="5"
                step="0.1"
                value={s.riskPercent}
                onChange={(e) =>
                  update(
                    'riskPercent',
                    Math.max(0.1, Math.min(5, +e.target.value)),
                  )
                }
              />
            </label>
          </div>
        </details>
        <button className="primary" onClick={onSearch} type="button">
          {disabled ? '시장 분석 중…' : '전체 시장 검색'} <span>↗</span>
        </button>
      </fieldset>
      <p className="muted small">
        Bybit USDT 무기한 · 확정 15분봉 · 공개 시장 데이터만 사용
      </p>
    </section>
  );
}
