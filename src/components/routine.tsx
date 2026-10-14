"use client";
import { activeSubjects, useStore } from "@/lib/store";
import { fmtMin, nf, qt } from "@/lib/calc";
import { toMin, weekCapacity } from "@/lib/plan";
import { BLOCK, WEEKDAYS } from "@/lib/constants";
import { I, Icon } from "@/components/ui";

/** Semana típica (blocos da rotina), usada na aba Rotina e no topo do Painel */
export function WeekRoutine({ title = "Semana típica", onBlock, onSiga, children }: { title?: string; onBlock: (id: string | null, weekday?: number) => void; onSiga: () => void; children?: React.ReactNode }) {
  const st = useStore();
  const p = st.profile!;
  const cap = weekCapacity(st.blocks);
  const total = cap.reduce((a, b) => a + b, 0);
  const today = new Date().getDay();
  const color = (k: string, sid: string | null) => (k === "aula" ? st.subjects.find((s) => s.id === sid)?.color || "var(--muted)" : k === "estudo" ? "var(--accent)" : k === "exercicio" ? "var(--ok)" : "var(--line)");
  const workout = st.blocks.filter((b) => b.kind === "exercicio").reduce((a, b) => a + Math.max(0, toMin(b.end_time) - toMin(b.start_time)), 0);
  const workoutDays = new Set(st.blocks.filter((b) => b.kind === "exercicio").map((b) => b.weekday)).size;
  const noClasses = activeSubjects(st.subjects).filter((s) => s.schedule && !st.blocks.some((b) => b.kind === "aula" && b.subject_id === s.id));
  return (
    <section className="panel">
      <div className="panel-h"><h2>{title}</h2><span className="row" style={{ gap: 6 }}><button className="btn sm" onClick={onSiga}>Importar aulas do SIGA (PDF)</button><button className="btn sm pri" onClick={() => onBlock(null)}><Icon d={I.plus} s={14} />Adicionar bloco</button></span></div>
      {children}
      <div className="week">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const bs = st.blocks.filter((b) => b.weekday === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
          return (
            <div key={d} className={"wday" + (d === today ? " today" : "")}>
              <div className="row between" style={{ flexWrap: "nowrap" }}><b className="small">{WEEKDAYS[d]}{d === today ? " · hoje" : ""}</b><span className="lbl">{cap[d] ? fmtMin(cap[d]) : ""}</span></div>
              {bs.map((b) => {
                const s = b.subject_id ? st.subjects.find((x) => x.id === b.subject_id) : null;
                return (
                  <button key={b.id} type="button" className={"blk " + b.kind} style={{ ["--c" as string]: color(b.kind, b.subject_id) }} onClick={() => onBlock(b.id)}>
                    <span className="num">{b.start_time}–{b.end_time}</span>
                    <span>{b.kind === "aula" ? s?.name || "Aula" : BLOCK[b.kind]}{b.label ? ` · ${b.label}` : ""}</span>
                  </button>
                );
              })}
              <button type="button" className="btn sm ghost" onClick={() => onBlock(null, d)} aria-label={`Adicionar bloco na ${WEEKDAYS[d]}`}><Icon d={I.plus} s={13} /></button>
            </div>
          );
        })}
      </div>
      <p className="small" style={{ margin: "12px 0 0" }}>
        {total ? <>Sua rotina tem <b>{fmtMin(total)}</b> de estudo por semana{p.weekly_goal_h ? <> (meta: {nf(p.weekly_goal_h, 0)}h{total / 60 < p.weekly_goal_h ? `; faltam ${fmtMin(p.weekly_goal_h * 60 - total)} na rotina para chegar à meta` : ""})</> : ""}.</> : <span className="muted">Ainda não há blocos de estudo.</span>}
      </p>
      <p className="small" style={{ margin: "6px 0 0" }}>{workout ? <>Exercício físico: <b>{fmtMin(workout)}</b> por semana, em {qt(workoutDays, "dia", "dias")}.</> : <span className="muted">Nenhum bloco de exercício físico na rotina ainda.</span>}</p>
      {noClasses.length > 0 && <p className="small muted" style={{ margin: "6px 0 0" }}>Com horário anotado, mas sem aula na rotina: {noClasses.map((s) => `${s.name} (${s.schedule})`).join("; ")}.</p>}
    </section>
  );
}
