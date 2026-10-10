// Gráficos em SVG desenhados com uma única escala por eixo; cores vêm dos tokens do tema.
import { fmtMin, nf, pct } from "@/lib/calc";

export function Gauge({ v, label, sub, color }: { v: number | null; label: string; sub: string; color: string }) {
  const r = 34, c = Math.PI * r, val = v == null ? 0 : Math.max(0, Math.min(1, v));
  const a = Math.PI * (1 - val);
  return (
    <div className="gauge">
      <svg width="92" height="58" viewBox="0 0 92 58" role="img" aria-label={`${label}: ${v == null ? "sem dados" : pct(v)}`}>
        <path d="M12 50 A34 34 0 0 1 80 50" fill="none" stroke="var(--panel2)" strokeWidth="9" />
        {v != null && <path d="M12 50 A34 34 0 0 1 80 50" fill="none" stroke={color} strokeWidth="9" strokeDasharray={`${c * val} ${c}`} />}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const b = Math.PI * (1 - t);
          return <line key={t} x1={46 + Math.cos(b) * 41} y1={50 - Math.sin(b) * 41} x2={46 + Math.cos(b) * 45} y2={50 - Math.sin(b) * 45} stroke="var(--muted)" strokeWidth="1" />;
        })}
        {v != null && (<><line x1="46" y1="50" x2={46 + Math.cos(a) * 28} y2={50 - Math.sin(a) * 28} stroke="var(--fg)" strokeWidth="2" strokeLinecap="round" /><circle cx="46" cy="50" r="3.5" fill="var(--fg)" /></>)}
      </svg>
      <div className="kpi"><span className="lbl">{label}</span><span className="v">{v == null ? "–" : <>{Math.round(v * 100)}<small>%</small></>}</span><span className="s">{sub}</span></div>
    </div>
  );
}

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

export function ChartCalib({ rows }: { rows: { n: number; acc: number | null }[] }) {
  const W = 360, H = 200, L = 34, B = 34, T = 14, y = (v: number) => H - B - v * (H - B - T), bw = (W - L - 10) / 5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Acerto conferido por nível de confiança">
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (<g key={v}><line x1={L} x2={W - 6} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10">{v * 100}%</text></g>))}
      {rows.map((r, i) => {
        const x = L + i * bw + bw * 0.2, w = bw * 0.6, rv = i / 4;
        return (
          <g key={i}>
            {r.acc != null && <rect x={x} y={y(r.acc)} width={w} height={H - B - y(r.acc)} fill="var(--accent)" opacity={0.85}><title>{`Confiança ${i + 1}: ${pct(r.acc)} de acerto em ${r.n} registro(s)`}</title></rect>}
            <line x1={x - 3} x2={x + w + 3} y1={y(rv)} y2={y(rv)} stroke="var(--fg)" strokeWidth="2" strokeDasharray="3 2" />
            <text x={x + w / 2} y={H - B + 14} textAnchor="middle" fontSize="11" style={{ fill: "var(--fg)" }}>{i + 1}</text>
            <text x={x + w / 2} y={H - B + 27} textAnchor="middle" fontSize="9">n={r.n}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function ChartLine({ pts, min, max, fmt, labels, color, label }: { pts: (number | null)[]; min: number; max: number; fmt: (v: number) => string; labels: string[]; color: string; label: string }) {
  const W = 360, H = 120, L = 34, B = 20, T = 10, n = pts.length;
  const x = (i: number) => L + (n <= 1 ? 0 : (i * (W - L - 12)) / (n - 1));
  const y = (v: number) => H - B - ((v - min) / (max - min)) * (H - B - T);
  let d = "";
  pts.forEach((v, i) => { if (v != null) d += (d ? "L" : "M") + x(i) + " " + y(v); });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {[min, (min + max) / 2, max].map((v) => (<g key={v}><line x1={L} x2={W - 6} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10">{fmt(v)}</text></g>))}
      {d && <path d={d} fill="none" stroke={color} strokeWidth="2" />}
      {pts.map((v, i) => (
        <g key={i}>
          {(i % 2 === 0 || n <= 6) && <text x={x(i)} y={H - 5} textAnchor="middle" fontSize="9">{labels[i]}</text>}
          {v != null && <circle cx={x(i)} cy={y(v)} r={i === n - 1 ? 4 : 2.5} fill={color}><title>{`${labels[i]}: ${fmt(v)}`}</title></circle>}
        </g>
      ))}
    </svg>
  );
}

export { nf };
