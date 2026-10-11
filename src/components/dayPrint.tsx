"use client";
// Folha do dia para imprimir ou salvar em PDF ("Imprimir → Salvar como PDF" do aparelho):
// agenda com horários, o que não coube, tarefas, hábitos e provas próximas, com caixinhas para marcar à caneta.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { agenda, useStore } from "@/lib/store";
import { daysBetween, fmtMin, keyDate, qt } from "@/lib/calc";
import { BLOCK, EVT } from "@/lib/constants";
import { classOff, dm, fromMin, noClass, planDay, toMin, type PlanInput, type Task } from "@/lib/plan";

const label = (t: Task) => (t.kind === "revisao" ? `Revisão: ${t.title}` : t.title);

interface Line { at: number | null; end: number | null; text: string; sub?: string; box: boolean }

export function DayPrint({ input, onDone }: { input: PlanInput; onDone: () => void }) {
  const st = useStore();
  const day = input.today;
  const plan = planDay(input);
  const wd = keyDate(day).getDay();
  const subName = (id: string | null) => (id ? st.subjects.find((s) => s.id === id)?.name ?? "" : "");

  useEffect(() => {
    const title = document.title;
    document.title = `Plano ${dm(day).replace("/", "-")} - Diário de Sonda`;
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); document.title = title; onDone(); };
    window.addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => window.print(), 150);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); document.body.classList.remove("printing"); document.title = title; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // linha do tempo: aulas e outros blocos da rotina, compromissos do calendário e as tarefas de estudo encaixadas
  const lines: Line[] = [];
  const nc = noClass(day, st.events);
  for (const b of st.blocks.filter((x) => x.weekday === wd && x.kind !== "estudo")) {
    if (b.kind === "aula" && b.subject_id && st.subjects.find((s) => s.id === b.subject_id)?.archived) continue;
    const off = b.kind === "aula" ? classOff(nc, b.subject_id) : null;
    if (off) { lines.push({ at: toMin(b.start_time), end: toMin(b.end_time), text: `Sem aula de ${subName(b.subject_id) || "disciplina"}`, sub: off, box: false }); continue; }
    lines.push({ at: toMin(b.start_time), end: toMin(b.end_time), text: b.kind === "aula" ? `Aula de ${subName(b.subject_id) || "disciplina"}` : BLOCK[b.kind], sub: b.label || undefined, box: b.kind === "exercicio" });
  }
  const cal = agenda(st.subjects, st.assessments, st.events).filter((e) => e.date === day && e.status !== "cancelado" && e.status !== "concluido");
  for (const e of cal) lines.push({ at: e.time ? toMin(e.time) : null, end: null, text: `${EVT[e.type] ?? ""}${e.title && e.title !== EVT[e.type] ? `: ${e.title}` : ""}`, sub: subName(e.subject_id) || undefined, box: true });
  for (const s of plan.slots) {
    if (!s.placed.length) lines.push({ at: s.start, end: s.end, text: "Estudo livre", sub: s.block.label || undefined, box: false });
    for (const p of s.placed) lines.push({ at: p.start, end: p.end, text: label(p.task), sub: subName(p.task.subject_id), box: true });
  }
  lines.sort((a, b) => (a.at ?? -1) - (b.at ?? -1));

  const todos = st.todos.filter((t) => !t.done && t.due && t.due <= day).sort((a, b) => a.due!.localeCompare(b.due!));
  const noDate = st.todos.filter((t) => !t.done && !t.due).slice(0, 5);
  const habits = st.habits.filter((h) => h.active).sort((a, b) => a.position - b.position);
  const exams = agenda(st.subjects, st.assessments, st.events)
    .filter((e) => (e.type === "prova" || e.type === "sub" || e.type === "trabalho" || e.type === "entrega") && e.status === "pendente" && e.date > day && daysBetween(day, e.date) <= 14);
  const dateLabel = keyDate(day).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const time = (l: Line) => (l.at == null ? "—" : `${fromMin(l.at)}${l.end != null ? `–${fromMin(l.end)}` : ""}`);
  const taskLine = (t: Task) => <li key={t.key}><span className="box" />{label(t)}<span className="ps-m"> · {subName(t.subject_id)} · {t.minutes} min</span></li>;

  return createPortal(
    <div id="print-root" className="ps" aria-hidden="true">
      <header className="ps-h">
        <div><div className="ps-k">Diário de Sonda · plano do dia</div><h1>{dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</h1></div>
        <div className="ps-k" style={{ textAlign: "right" }}>Estudo livre: {fmtMin(plan.capacity)}<br />Tarefas pedem: {fmtMin(plan.need)}</div>
      </header>

      <h2>Agenda</h2>
      {lines.length ? <table className="ps-t"><tbody>{lines.map((l, i) => (
        <tr key={i}><td className="ps-time">{time(l)}</td><td>{l.box ? <span className="box" /> : <span className="nobox" />}<b>{l.text}</b>{l.sub ? <span className="ps-m"> · {l.sub}</span> : null}</td></tr>
      ))}</tbody></table> : <p className="ps-m">Nada na rotina nem no calendário para este dia.</p>}

      {plan.overflow.length > 0 && <><h2>Não coube nos blocos de estudo</h2><ul className="ps-l">{plan.overflow.map(taskLine)}</ul></>}

      {(todos.length > 0 || noDate.length > 0) && <><h2>Tarefas</h2><ul className="ps-l">
        {todos.map((t) => <li key={t.id}><span className="box" />{t.title}<span className="ps-m">{t.subject_id ? ` · ${subName(t.subject_id)}` : ""} · {t.due === day ? "prazo hoje" : `atrasada desde ${dm(t.due!)}`}</span></li>)}
        {noDate.map((t) => <li key={t.id}><span className="box" />{t.title}<span className="ps-m">{t.subject_id ? ` · ${subName(t.subject_id)}` : ""} · sem prazo</span></li>)}
      </ul></>}

      {habits.length > 0 && <><h2>Hábitos</h2><ul className="ps-l ps-cols">{habits.map((h) => <li key={h.id}><span className="box" />{h.name}</li>)}</ul></>}

      <h2>Anotações</h2>
      <div className="ps-notes" />

      <footer className="ps-f">
        {exams.length ? <>Chegando: {exams.slice(0, 5).map((e) => `${e.title} de ${subName(e.subject_id)} em ${qt(daysBetween(day, e.date), "dia", "dias")}`).join(" · ")}<br /></> : null}
        Gerado em {new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}. O motivo de cada tarefa está no app.
      </footer>
    </div>,
    document.body,
  );
}
