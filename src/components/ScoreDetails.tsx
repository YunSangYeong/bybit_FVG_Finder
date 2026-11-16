import type { Score } from '../types/signal';
const names: Record<keyof Score, string> = {
  trend: '4h 추세',
  sweep: '유동성 스윕',
  bos: 'BOS',
  gap: 'FVG 크기',
  displacement: '강한 변위',
  volume: '거래량',
  freshness: '신선도',
  retest: '리테스트',
};
export function ScoreDetails({ score }: { score: Score }) {
  return (
    <details className="score-details">
      <summary>품질 점수 세부 내역</summary>
      <div className="score-grid">
        {(Object.keys(score) as (keyof Score)[]).map((key) => (
          <div key={key}>
            <span>{names[key]}</span>
            <b>+{score[key]}</b>
          </div>
        ))}
      </div>
      <p className="small muted">
        점수는 조건 충족도이며 매매 성공 확률이 아닙니다.
      </p>
    </details>
  );
}
