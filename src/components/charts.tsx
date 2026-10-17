// Gráficos em SVG desenhados com uma única escala por eixo; cores vêm dos tokens do tema.
import { fmtMin } from "@/lib/calc";

export interface DayBar { lab: string; today: boolean; total: number; segs: { v: number; c: string; n: string }[] }
export function ChartDays({ days }: { days: DayBar[] }) {
  const W = 640, H = 200, L = 34, B = 24, T = 12;
  const max = Math.max(60, ...days.map((d) => d.total));
  const hmax = Math.ceil(max / 60), step = hmax <= 4 ? 1 : hmax <= 8 ? 2 : Math.ceil(hmax / 4), top = Math.ceil(hmax / step) * step * 60;
  const bw = (W - L - 8) / days.length, y = (v: number) => H - B - (v / top) * (H - B - T);
  const ticks: number[] = [];
  for (let h = 0; h <= top / 60; h += step) ticks.push(h);
  return (
    <div className="tbl-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Horas estudadas por dia">
        {ticks.map((h) => (<g key={h}><line x1={L} x2={W - 4} y1={y(h * 60)} y2={y(h * 60)} stroke="var(--line)" /><text x={L - 6} y={y(h * 60) + 4} textAnchor="end" fontSize="10">{h}h</text></g>))}
        {days.map((d, i) => {
          const x = L + i * bw + bw * 0.18, w = bw * 0.64;
          let acc = 0;
          return (
            <g key={i}>
              {d.segs.map((sg, j) => { const y0 = y(acc), y1 = y(acc + sg.v); acc += sg.v; return <rect key={j} x={x} y={y1} width={w} height={Math.max(0, y0 - y1)} fill={sg.c}><title>{`${sg.n}: ${fmtMin(sg.v)}`}</title></rect>; })}
              {(i % 2 === 0 || days.length <= 10) && <text x={x + w / 2} y={H - 7} textAnchor="middle" fontSize="10" style={d.today ? { fill: "var(--fg)" } : undefined}>{d.lab}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
