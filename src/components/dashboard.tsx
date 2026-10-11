"use client";
// Painel: alertas acionáveis e lista de tarefas (to-do).
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { activeSubjects, useStore } from "@/lib/store";
import { daysBetween, todayKey, qt } from "@/lib/calc";
import { buildAlerts } from "@/lib/alerts";
import { verdict } from "@/lib/verdict";
import { masteryCfg } from "@/lib/mastery";
import type { Todo } from "@/lib/types";
import { ConfirmButton, Dot, I, Icon } from "./ui";

const ICON: Record<"bad" | "warn" | "info", string> = { bad: "var(--bad)", warn: "var(--warn)", info: "var(--accent)" };

export function AlertsPanel() {
  const st = useStore();
  const [all, setAll] = useState(false);
  const alerts = buildAlerts({
    today: todayKey(), subjects: st.subjects, topics: st.topics, sessions: st.sessions, assessments: st.assessments,
    items: st.reviews, logs: st.reviewLogs, mistakes: st.mistakes, cfg: masteryCfg(st.profile?.mastery_cfg),
  });
  const shown = all ? alerts : alerts.slice(0, 5);
  return (
    <section className="panel" aria-label="Alertas">
      <div className="panel-h"><h2>Alertas</h2><span className="lbl">{alerts.length ? `${alerts.length} item(ns)` : "nada urgente"}</span></div>
      {alerts.length ? (
        <div className="list">{shown.map((a) => (
          <div key={a.key} className="li" style={{ alignItems: "flex-start" }}>
            <i className="dot" style={{ background: ICON[a.level], width: 10, height: 10, marginTop: 6, flex: "none" }} />
            <div className="grow">
              <div>{a.text}</div>
              {a.why && <details className="small" style={{ marginTop: 2 }}><summary style={{ fontWeight: 400 }}>por quê?</summary><span className="muted">{a.why}</span></details>}
            </div>
            {a.action && <Link className="btn sm" href={a.action.href}>{a.action.label}</Link>}
          </div>
        ))}</div>
      ) : <p className="small muted" style={{ margin: 0 }}>Nenhuma prova nos próximos 14 dias com conteúdo frágil, confiança baixa ou sem resultado conferido, e nenhuma revisão atrasada.</p>}
      {alerts.length > 5 && <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setAll(!all)}>{all ? "Mostrar menos" : `Mostrar todos (${alerts.length})`}</button>}
      <p className="small muted" style={{ margin: "8px 0 0" }}>Os alertas usam o índice de domínio de cada conteúdo (acerto conferido, autonomia, prática recente e erros) e a confiança separadamente. Pesos em <Link href="/configuracoes">Configurações</Link>.</p>
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
  const v = verdict({ today: todayKey(), sessions: st.sessions, subjects: st.subjects, assessments: st.assessments, weeklyGoalH: Number(st.profile?.weekly_goal_h) || null });
  if (!v) return null;
  const icon = { sumiu: "👀", parado: "⏳", agua: "🌊", prova_pouco: "⚠️", notas: "📉", pouco: "🐢", voando: "🚀", normal: "🧭" }[v.kind];
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
