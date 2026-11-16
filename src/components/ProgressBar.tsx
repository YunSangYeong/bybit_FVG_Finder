import type { Progress } from '../hooks/useScanner';
export function ProgressBar({
  progress: p,
  cancel,
}: {
  progress: Progress;
  cancel: () => void;
}) {
  const percent = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <section className="panel progress" aria-live="polite">
      <div className="row">
        <strong>
          {p.running
            ? '시장 분석 중'
            : p.cancelled
              ? '검색 취소됨'
              : p.error
                ? '검색 실패'
                : '검색 완료'}
        </strong>
        <span>
          {p.done} / {p.total} · 실패 {p.failures.length}
        </span>
      </div>
      <progress max="100" value={percent} />
      <div className="row">
        <small>{p.current.join(', ') || `${percent}% 완료`}</small>
        {p.running && (
          <button className="secondary" onClick={cancel}>
            검색 취소
          </button>
        )}
      </div>
    </section>
  );
}
