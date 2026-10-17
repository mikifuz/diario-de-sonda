"use client";
// Painel: alertas acionáveis e lista de tarefas (to-do).
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { activeSubjects, useStore } from "@/lib/store";
import { daysBetween, todayKey, qt } from "@/lib/calc";
import { buildAlerts } from "@/lib/alerts";
import { verdict } from "@/lib/verdict";
import { dayOff } from "@/lib/plan";
import type { Todo } from "@/lib/types";
import { ConfirmButton, Dot, I, Icon } from "./ui";

const ICON: Record<"bad" | "warn" | "info", string> = { bad: "var(--bad)", warn: "var(--warn)", info: "var(--accent)" };

export function AlertsPanel() {
  const st = useStore();
  const [all, setAll] = useState(false);
  const alerts = buildAlerts({
    today: todayKey(), subjects: st.subjects, topics: st.topics, sessions: st.sessions, assessments: st.assessments,
  });
  // alertas da mesma prova viram um cartão só: título curto, "amanhã" ao lado e uma linha por problema
  const groups: { id: string; items: typeof alerts }[] = [];
  for (const a of alerts) {
    const id = a.group ?? a.key;
    const g = groups.find((x) => x.id === id);
    if (g) g.items.push(a); else groups.push({ id, items: [a] });
  }
  const shown = all ? groups : groups.slice(0, 4);
  return (
    <section className="panel" aria-label="Alertas">
      <div className="panel-h"><h2>Alertas</h2><span className="lbl">{groups.length ? qt(groups.length, "aviso", "avisos") : "nada urgente"}</span></div>
      {groups.length ? (
        <div className="alerts">{shown.map(({ id, items }) => {
          const top = items[0];
          const act = items.find((a) => a.action)?.action;
          const whys = items.filter((a) => a.why || a.short);
          return (
            <div key={id} className="alert-card" style={{ borderLeftColor: ICON[top.level] }}>
              {top.head ? (
                <div className="alert-h">
                  <b>{top.head}</b>
                  {top.when && <span className={`chip ${top.level === "bad" ? "bad" : top.level === "warn" ? "warn" : "acc"}`}>{top.when}</span>}
                </div>
              ) : null}
              {items.map((a) => (
                <div key={a.key} className="alert-l">
                  <i className="dot" style={{ background: ICON[a.level] }} />
                  <span>{a.short ?? a.text}</span>
                </div>
              ))}
              <div className="alert-f">
                {whys.length > 0 && (
                  <details className="small">
                    <summary>por quê?</summary>
                    {whys.map((a) => <p key={a.key} className="muted" style={{ margin: "4px 0 0" }}>{a.short ? `${a.text} ` : ""}{a.why}</p>)}
                  </details>
                )}
                {act && <Link className="btn sm" href={act.href}>{act.label}</Link>}
              </div>
            </div>
          );
        })}</div>
      ) : <p className="small muted" style={{ margin: 0 }}>Nenhuma prova nos próximos 14 dias com conteúdo ainda sem estudo.</p>}
      {groups.length > 4 && <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setAll(!all)}>{all ? "Mostrar menos" : `Mostrar todos (${groups.length})`}</button>}
      <p className="small muted hide-m" style={{ margin: "8px 0 0" }}>Os alertas olham as provas dos próximos 14 dias e o tempo que você já registrou em cada conteúdo.</p>
    </section>
  );
}

export function TodoPanel() {
  const st = useStore();
  const today = todayKey();
  const subs = activeSubjects(st.subjects);
  const [title, setTitle] = useState("");
  const [sub, setSub] = useState("");
  const [due, setDue] = useState("");
  const open = st.todos.filter((t) => !t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.title.localeCompare(b.title, "pt-BR"));
  const done = st.todos.filter((t) => t.done).sort((a, b) => (b.done_at || "").localeCompare(a.done_at || ""));
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const row: Todo = { id: crypto.randomUUID(), title: title.trim().slice(0, 200), subject_id: sub || null, due: due || null, done: false, done_at: null };
    if (await st.save("tasks", row)) { setTitle(""); setDue(""); }
  };
  const toggle = (t: Todo) => st.save("tasks", { ...t, done: !t.done, done_at: t.done ? null : new Date().toISOString() });
  const Row = ({ t }: { t: Todo }) => {
    const s = t.subject_id ? st.subjects.find((x) => x.id === t.subject_id) : null;
    const dd = t.due ? daysBetween(today, t.due) : null;
    return (
      <div className="li">
        <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={t.done ? "Marcar como não feita" : "Marcar como feita"} style={{ width: 18, height: 18, accentColor: "var(--accent)", flex: "none" }} />
        <div className="grow">
          <div className="t" style={t.done ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{t.title}</div>
          {(s || t.due) && <div className="m">{s && <span className="row" style={{ gap: 6, display: "inline-flex" }}><Dot c={s.color} />{s.name}</span>}{s && t.due ? " · " : ""}
            {t.due && !t.done && <span style={{ color: dd! < 0 ? "var(--bad)" : dd! <= 1 ? "var(--warn)" : undefined }}>{dd! < 0 ? `atrasada ${-dd!} d` : dd === 0 ? "hoje" : dd === 1 ? "amanhã" : `${t.due.slice(8, 10)}/${t.due.slice(5, 7)}`}</span>}</div>}
        </div>
        <ConfirmButton small label={<Icon d={I.trash} s={14} />} confirmLabel="Excluir" onConfirm={() => st.remove("tasks", t.id)} />
      </div>
    );
  };
  return (
    <section className="panel" aria-label="Tarefas">
      <div className="panel-h"><h2>Tarefas</h2><span className="lbl">{qt(open.length, "pendente", "pendentes")}</span></div>
      <form className="stack" style={{ gap: 8, marginBottom: 8 }} onSubmit={add}>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa, ex.: entregar lista 4" aria-label="Nova tarefa" required />
          <button className="btn pri icon" aria-label="Adicionar tarefa"><Icon d={I.plus} s={16} /></button>
        </div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <select value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Disciplina (opcional)"><option value="">Sem disciplina</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Prazo (opcional)" style={{ maxWidth: 160 }} />
        </div>
      </form>
      {open.length ? <div className="list">{open.map((t) => <Row key={t.id} t={t} />)}</div> : <p className="small muted" style={{ margin: 0 }}>Nenhuma tarefa pendente.</p>}
      {done.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="small">Concluídas ({done.length})</summary>
          <div className="list">{done.slice(0, 30).map((t) => <Row key={t.id} t={t} />)}</div>
          <ConfirmButton small label="Apagar concluídas" question={`Apagar ${qt(done.length, "tarefa concluída", "tarefas concluídas")}?`} confirmLabel="Apagar" onConfirm={async () => { for (const t of done) await st.remove("tasks", t.id); }} />
        </details>
      )}
    </section>
  );
}

/** "Geralzão" do Painel: frase direta (com um pingo de ironia) e o fato que a justifica */
export function VerdictCard() {
  const st = useStore();
  const v = verdict({ today: todayKey(), sessions: st.sessions, subjects: st.subjects, assessments: st.assessments, weeklyGoalH: Number(st.profile?.weekly_goal_h) || null, off: !!dayOff(todayKey(), st.events) });
  if (!v) return null;
  const icon = { folga: "😴", sumiu: "👀", parado: "⏳", agua: "🌊", prova_pouco: "⚠️", notas: "📉", pouco: "🐢", voando: "🚀", normal: "🧭" }[v.kind];
  const color = { bad: "var(--bad)", warn: "var(--warn)", ok: "var(--ok)", info: "var(--accent)" }[v.level];
  return (
    <section className="panel verdict" style={{ borderLeft: `4px solid ${color}` }} aria-label="Como anda seu estudo">
      <div className="row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "nowrap" }}>
        <span aria-hidden="true" style={{ fontSize: "1.8rem", lineHeight: 1 }}>{icon}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <b style={{ fontSize: "1.1rem", display: "block" }}>{v.title}</b>
          <span className="small muted">{v.why}</span>
          {v.action && <div style={{ marginTop: 8 }}><Link className="btn sm" href={v.action.href}>{v.action.label}</Link></div>}
        </div>
      </div>
    </section>
  );
}
