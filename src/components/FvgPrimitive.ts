import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
} from 'lightweight-charts';
export interface BoxCoordinates {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export function boxCoordinates(
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null,
  start: number,
  end: number,
  lower: number,
  upper: number,
): BoxCoordinates | null {
  const left = timeToX(start),
    right = timeToX(end),
    a = priceToY(upper),
    b = priceToY(lower);
  return left === null || right === null || a === null || b === null
    ? null
    : {
        left: Math.min(left, right),
        right: Math.max(left, right),
        top: Math.min(a, b),
        bottom: Math.max(a, b),
      };
}
export class FvgPrimitive implements ISeriesPrimitive<Time> {
  private attachment?: SeriesAttachedParameter<Time>;
  private view: IPrimitivePaneView;
  constructor(
    private start: Time,
    private end: Time,
    private lower: number,
    private upper: number,
    private long: boolean,
  ) {
    this.view = {
      zOrder: () => 'bottom',
      renderer: () => ({
        draw: (target: Parameters<IPrimitivePaneRenderer['draw']>[0]) => {
          const a = this.attachment;
          if (!a) return;
          const coords = boxCoordinates(
            (t) => a.chart.timeScale().timeToCoordinate(t as Time),
            (p) => a.series.priceToCoordinate(p),
            this.start as number,
            this.end as number,
            this.lower,
            this.upper,
          );
          if (!coords) return;
          target.useMediaCoordinateSpace(({ context: ctx }) => {
            const { left, right, top, bottom } = coords;
            ctx.fillStyle = this.long
              ? 'rgba(36,178,134,.20)'
              : 'rgba(235,91,108,.20)';
            ctx.strokeStyle = this.long ? '#24b286' : '#eb5b6c';
            ctx.fillRect(left, top, right - left, bottom - top);
            ctx.strokeRect(left, top, right - left, bottom - top);
            ctx.font = '10px sans-serif';
            ctx.fillStyle = ctx.strokeStyle;
            ctx.fillText('FVG', left + 5, top + 12);
          });
        },
      }),
    };
  }
  attached(p: SeriesAttachedParameter<Time>) {
    this.attachment = p;
    p.requestUpdate();
  }
  detached() {
    this.attachment = undefined;
  }
  paneViews() {
    return [this.view];
  }
}
