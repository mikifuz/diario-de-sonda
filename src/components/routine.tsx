"use client";
import { useEffect, useState } from "react";
import { activeSubjects, useStore } from "@/lib/store";
import { fmtMin, nf, qt } from "@/lib/calc";
import { cleanSteps, parseSteps, toMin, weekCapacity } from "@/lib/plan";
import { BLOCK, PREF, WEEKDAYS } from "@/lib/constants";
import type { StudyPref } from "@/lib/types";
import { I, Icon } from "@/components/ui";
import { BlockModal } from "@/components/planning";
import { ImportSigaModal } from "@/components/importSiga";

/** Semana típica (blocos da rotina), embaixo do calendário */
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

/** Rotina semanal completa (grade + preferências do plano), embaixo do calendário.
 *  id="rotina" para os links /calendario#rotina; ?abrir=siga já abre a importação do SIGA. */
export function RoutineSection({ openSiga = false }: { openSiga?: boolean }) {
  const st = useStore();
  const p = st.profile!;
  const [modal, setModal] = useState<null | { k: "block"; id: string | null; weekday?: number } | { k: "siga" }>(openSiga ? { k: "siga" } : null);
  const [stepsTxt, setStepsTxt] = useState(cleanSteps(p.review_steps).join(", "));
  useEffect(() => {
    if (location.hash !== "#rotina" && !openSiga) return;
    const t = setTimeout(() => document.getElementById("rotina")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    return () => clearTimeout(t);
  }, [openSiga]);
  const saveSteps = async () => {
    const r = parseSteps(stepsTxt);
    if (typeof r === "string") { st.toast(r); return; }
    if (await st.updateProfile({ review_steps: r })) { setStepsTxt(r.join(", ")); st.toast("Intervalos salvos."); }
  };
  const close = () => setModal(null);
  return (
    <div id="rotina" className="stack" style={{ gap: 16, scrollMarginTop: 16 }}>
      <WeekRoutine title="Rotina semanal" onBlock={(id, weekday) => setModal({ k: "block", id, weekday })} onSiga={() => setModal({ k: "siga" })}>
        <p className="small muted" style={{ margin: "0 0 12px" }}>Cadastre aulas, blocos de estudo e o que mais ocupa sua semana (trabalho, deslocamento, descanso). Só os blocos de <b>estudo</b> recebem tarefas; os outros servem para você enxergar a semana. Exceções do dia a dia vão no calendário acima, como &quot;Indisponível&quot; ou &quot;Compromisso pessoal&quot;.</p>
      </WeekRoutine>
      <details className="panel">
        <summary>Preferências do plano e intervalos de revisão</summary>
        <div className="fgrid" style={{ marginTop: 12 }}>
          <label className="f"><span>Como você prefere acompanhar as aulas (padrão)</span>
            <select value={p.study_pref} onChange={(e) => st.updateProfile({ study_pref: e.target.value as StudyPref })}>{Object.entries(PREF).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
            <span className="small">Cada disciplina pode ter a sua preferência (Disciplinas → Editar).</span></label>
          <label className="f"><span>Intervalos da revisão espaçada (dias)</span>
            <span className="row" style={{ flexWrap: "nowrap" }}><input type="text" value={stepsTxt} onChange={(e) => setStepsTxt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveSteps(); }} aria-label="Intervalos em dias" />
              <button type="button" className="btn sm" onClick={saveSteps}>Salvar</button></span>
            <span className="small">Separados por vírgula, crescentes. Nenhum intervalo passa da véspera da prova.</span></label>
        </div>
        <p className="small muted" style={{ margin: "10px 0 0" }}>Nada aqui é compartilhado: a sala de estudos continua vendo só apelido, presença e minutos por dia.</p>
      </details>
      {modal?.k === "block" && <BlockModal id={modal.id} weekday={modal.weekday} onClose={close} />}
      {modal?.k === "siga" && <ImportSigaModal onClose={close} />}
    </div>
  );
}
