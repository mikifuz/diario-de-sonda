"use client";
// Folha da semana (A4 deitada): a semana que passou (resumo do relatório) + os próximos 7 dias,
// dia a dia, com aulas, provas e tarefas de estudo; hábitos para marcar. Imprimir → Salvar como PDF.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { agenda, useStore } from "@/lib/store";
import { addDays, fmtMin, keyDate, nf, pct, qt, todayKey } from "@/lib/calc";
import { EVT, WD_S } from "@/lib/constants";
import { masteryCfg } from "@/lib/mastery";
import { classOff, dm, fromMin, noClass, planWeek, type PlanInput, type Task } from "@/lib/plan";
import { reversePlan, todayTasks } from "@/lib/reverse";
import { buildReport, reportWeek } from "@/lib/report";

const label = (t: Task) => (t.kind === "revisao" ? `Revisão: ${t.title}` : t.title);
const EXAM = new Set(["prova", "sub", "trabalho", "entrega", "apresentacao"]);

export function WeekPrint({ start, onDone }: { start: string; onDone: () => void }) {
  const st = useStore();
  const today = todayKey();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const cfg = masteryCfg(st.profile?.mastery_cfg);
  const plans = reversePlan({ today, nowMin, blocks: st.blocks, events: st.events, subjects: st.subjects, topics: st.topics, sessions: st.sessions,
    assessments: st.assessments, items: st.reviews, logs: st.reviewLogs, mistakes: st.mistakes, cfg });
  const base: PlanInput = { today, nowMin, pref: st.profile?.study_pref || "depois", blocks: st.blocks, events: st.events, subjects: st.subjects, topics: st.topics,
    sessions: st.sessions, assessments: st.assessments, items: st.reviews, mistakes: st.mistakes, logs: st.reviewLogs, cfg };
  const week = planWeek(base, days.filter((d) => d >= today), (d) => todayTasks(plans, d));
  const rep = buildReport({ week: reportWeek(today, now.getHours()).week, sessions: st.sessions, subjects: st.subjects, assessments: st.assessments, mistakes: st.mistakes, logs: st.reviewLogs, items: st.reviews });
  const subName = (id: string | null) => (id ? st.subjects.find((s) => s.id === id)?.name ?? "" : "");
  const ag = agenda(st.subjects, st.assessments, st.events).filter((e) => e.status === "pendente");
  const habits = st.habits.filter((h) => h.active).sort((a, b) => a.position - b.position);
  const todos = st.todos.filter((t) => !t.done && t.due && t.due <= days[6]).sort((a, b) => a.due!.localeCompare(b.due!));

  useEffect(() => {
    const title = document.title;
    document.title = `Semana ${dm(days[0]).replace("/", "-")} a ${dm(days[6]).replace("/", "-")} - Diário de Sonda`;
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); document.title = title; onDone(); };
    window.addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => window.print(), 150);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); document.body.classList.remove("printing"); document.title = title; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const r = rep?.data;
  return createPortal(
    <div id="print-root" className="ps ps-week" aria-hidden="true">
      <header className="ps-h">
        <div><div className="ps-k">Diário de Sonda · plano da semana</div><h1>{dm(days[0])} a {dm(days[6])}</h1></div>
        <div className="ps-k" style={{ textAlign: "right" }}>Gerado em {now.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
      </header>

      {r && (
        <section className="ps-box">
          <b>A semana que passou ({dm(r.from)} a {dm(r.to)}):</b> {fmtMin(r.minutes)} de estudo em {qt(r.sessions, "sessão", "sessões")}, {qt(r.days, "dia", "dias")}
          {r.prevMinutes && r.minutes !== r.prevMinutes ? ` (${r.minutes >= r.prevMinutes ? "+" : "−"}${fmtMin(Math.abs(r.minutes - r.prevMinutes))} que a anterior)` : ""}
          {" · "}acerto conferido {pct(r.acc)}{r.accN ? ` (${r.accN})` : ""} · confiança {r.conf == null ? "–" : `${nf(r.conf)}/5`} · {qt(r.reviews, "revisão feita", "revisões feitas")}
          {r.bySubject.length > 0 && <> · {r.bySubject.slice(0, 5).map((x) => `${x.name} ${fmtMin(x.minutes)}`).join(", ")}</>}
          {r.mistakes.length > 0 && <> · erros mais comuns: {r.mistakes.slice(0, 3).map((m) => m.cat).join(", ")}</>}
        </section>
      )}

      <div className="ps-days">
        {days.map((d) => {
          const p = week.find((w) => w.day === d)?.plan;
          const wd = keyDate(d).getDay();
          const nc = noClass(d, st.events);
          const classes = st.blocks.filter((b) => b.kind === "aula" && b.weekday === wd && !classOff(nc, b.subject_id) && !st.subjects.find((s) => s.id === b.subject_id)?.archived)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));
          const items = ag.filter((e) => e.date === d && e.type !== "sem_aula");
          const tasks = p ? p.slots.flatMap((s) => s.placed) : [];
          return (
            <div key={d} className="ps-day">
              <div className="ps-dh">{WD_S[wd]} {dm(d)}</div>
              {nc.all && <div className="ps-tag">Sem aula: {nc.all}</div>}
              {items.filter((e) => EXAM.has(e.type)).map((e) => <div key={e.id} className="ps-exam">{EVT[e.type]}: {e.title} · {subName(e.subject_id)}</div>)}
              {classes.map((b) => <div key={b.id} className="ps-cl">{b.start_time.slice(0, 5)} Aula · {subName(b.subject_id)}</div>)}
              {items.filter((e) => !EXAM.has(e.type)).map((e) => <div key={e.id} className="ps-cl">{e.time ? `${e.time.slice(0, 5)} ` : ""}{e.title}</div>)}
              {d < today ? <div className="ps-m">(já passou)</div> : <>
                {tasks.map((x) => <div key={x.task.key} className="ps-t1"><span className="box" />{fromMin(x.start)} {label(x.task)} <span className="ps-m">({x.task.minutes})</span></div>)}
                {!tasks.length && <div className="ps-m">{p && p.slots.length ? "Blocos de estudo livres" : "Sem bloco de estudo na rotina"}</div>}
                {p && p.overflow.length > 0 && <div className="ps-m">+{qt(p.overflow.length, "tarefa não coube", "tarefas não couberam")} ({fmtMin(p.overflow.reduce((a, t) => a + t.minutes, 0))})</div>}
              </>}
            </div>
          );
        })}
      </div>

      <div className="ps-foot2">
        {habits.length > 0 && (
          <table className="ps-hab"><thead><tr><th>Hábitos</th>{days.map((d) => <th key={d}>{WD_S[keyDate(d).getDay()]}</th>)}</tr></thead>
            <tbody>{habits.map((h) => <tr key={h.id}><td>{h.name}</td>{days.map((d) => <td key={d}><span className="box" /></td>)}</tr>)}</tbody></table>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b className="ps-k">Tarefas com prazo até {dm(days[6])}</b>
          {todos.length ? <ul className="ps-l">{todos.map((t) => <li key={t.id}><span className="box" />{t.title}<span className="ps-m"> · {dm(t.due!)}{t.subject_id ? ` · ${subName(t.subject_id)}` : ""}</span></li>)}</ul> : <p className="ps-m" style={{ margin: "2px 0" }}>Nenhuma.</p>}
        </div>
      </div>
      <footer className="ps-f">Considera a rotina, o calendário e os feriados. O motivo de cada tarefa está no app; o plano muda conforme você registra o que estudou.</footer>
    </div>,
    document.body,
  );
}
