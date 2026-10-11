"use client";
import { holidayOf } from "@/lib/holidays";
import { useState } from "react";
import { agenda, useStore, type AgendaItem } from "@/lib/store";
import { addDays, daysBetween, dkey, keyDate, nf, todayKey, qt } from "@/lib/calc";
import { EVT, GRADED } from "@/lib/constants";
import { Dot, I, Icon } from "@/components/ui";
import { EventModal } from "@/components/modals";

const fmtDL = (k: string) => keyDate(k).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

export default function Calendario() {
  const st = useStore();
  const t = todayKey();
  const [month, setMonth] = useState(t.slice(0, 7));
  const [sel, setSel] = useState(t);
  const [modal, setModal] = useState<null | { id: string | null; src?: "event" | "item"; date?: string }>(null);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = addDays(dkey(first), -((first.getDay() + 6) % 7));
  const ag = agenda(st.subjects, st.assessments, st.events);
  const byDay: Record<string, AgendaItem[]> = {};
  for (const e of ag) (byDay[e.date] ||= []).push(e);
  const color = (e: AgendaItem) => {
    const s = st.subjects.find((x) => x.id === e.subject_id);
    return e.type === "indisponivel" || e.type === "pessoal" ? "var(--muted)" : s ? s.color : "var(--accent)";
  };
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const k = addDays(start, i);
    if (i === 35 && k.slice(0, 7) !== month) break;
    cells.push(k);
  }
  const go = (n: number) => { const d = new Date(y, m - 1 + n, 1); setMonth(dkey(d).slice(0, 7)); };
  const pick = (k: string) => { setSel(k); if (k.slice(0, 7) !== month) setMonth(k.slice(0, 7)); };
  const done = (e: AgendaItem) => e.status === "concluido" || e.status === "cancelado";
  const up = ag.filter((e) => e.date >= t && e.date <= addDays(t, 30) && e.status === "pendente");
  const dayEv = byDay[sel] || [];

  const Row = ({ e }: { e: AgendaItem }) => {
    const s = st.subjects.find((x) => x.id === e.subject_id);
    return (
      <div className="li clickable" onClick={() => setModal({ id: e.id, src: e.src })}>
        <Dot c={color(e)} />
        <div className="grow">
          <div className="t" style={done(e) ? { textDecoration: "line-through", opacity: 0.7 } : undefined}>{e.title}</div>
          <div className="m">{EVT[e.type]}{s ? " · " + s.name : ""}{e.time ? " · " + e.time : ""}{e.src === "item" ? `${e.type === "sub" ? "" : ` · peso ${nf(e.weight ?? 0, 0)}`}${e.grade != null ? ` · nota ${nf(e.grade)}` : ""}` : ""}</div>
        </div>
        {e.priority === "alta" && e.status === "pendente" && <span className="chip bad">alta</span>}
      </div>
    );
  };

  return (
    <>
      <section className="grid g3">
        <div className="panel span2">
          <div className="panel-h">
            <div className="row">
              <button className="btn icon ghost" onClick={() => go(-1)} aria-label="Mês anterior"><Icon d={I.back} s={16} /></button>
              <h2 style={{ minWidth: "11ch", textAlign: "center" }}>{first.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
              <button className="btn icon ghost" onClick={() => go(1)} aria-label="Próximo mês"><Icon d={I.chev} s={16} /></button>
              <button className="btn sm ghost" onClick={() => { setMonth(t.slice(0, 7)); setSel(t); }}>Hoje</button>
            </div>
            <button className="btn pri" onClick={() => setModal({ id: null, date: sel })}><Icon d={I.plus} s={16} />Novo item</button>
          </div>
          <div className="cal">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <div key={d} className="wd">{d}</div>)}
            {cells.map((k) => {
              const evs = byDay[k] || [];
              return (
                <button key={k} className={["day", k.slice(0, 7) !== month && "out", k === t && "today", k === sel && "sel"].filter(Boolean).join(" ")} onClick={() => pick(k)} aria-label={`${fmtDL(k)}, ${evs.length} item(ns)`}>
                  <span className="dn">{keyDate(k).getDate()}</span>
                  {holidayOf(k) && <span className="ev" style={{ ["--c" as string]: "var(--muted)" }} title="Feriado nacional: sem aula">{holidayOf(k)}</span>}
                  {evs.slice(0, 3).map((e) => <span key={e.id} className="ev" style={{ ["--c" as string]: color(e) }}>{GRADED.includes(e.type) ? "● " : ""}{e.title}</span>)}
                  {evs.length > 3 && <span className="small muted">+{evs.length - 3}</span>}
                  <span className="dots">{evs.slice(0, 4).map((e) => <i key={e.id} style={{ ["--c" as string]: color(e) }} />)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-h"><h3>{fmtDL(sel)}</h3><button className="btn sm" onClick={() => setModal({ id: null, date: sel })}><Icon d={I.plus} s={14} />Adicionar</button></div>
            {holidayOf(sel) && <p className="small" style={{ margin: "0 0 8px" }}>Feriado nacional: <b>{holidayOf(sel)}</b>. Sem aula; no plano, os horários de aula viram tempo de estudo.</p>}
            {dayEv.length ? <div className="list">{dayEv.map((e) => <Row key={e.id} e={e} />)}</div> : <p className="muted small" style={{ margin: 0 }}>Nada marcado neste dia.</p>}
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Próximos 30 dias</h3><span className="lbl">{qt(up.length, "pendente", "pendentes")}</span></div>
            {up.length ? <div className="list">{up.slice(0, 10).map((e) => {
              const dd = daysBetween(t, e.date);
              return (
                <div key={e.id} className="li clickable" onClick={() => setModal({ id: e.id, src: e.src })}>
                  <span className={"cdays " + (GRADED.includes(e.type) ? (dd <= 3 ? "bad" : dd <= 7 ? "warn" : "") : "")}>{dd === 0 ? "hoje" : dd === 1 ? "amanhã" : `${dd} dias`}</span>
                  <div className="grow"><div className="t">{e.title}</div><div className="m">{EVT[e.type]} · {keyDate(e.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</div></div>
                </div>
              );
            })}</div> : <p className="muted small" style={{ margin: 0 }}>Nada pendente.</p>}
          </div>
        </div>
      </section>
      {modal && <EventModal id={modal.id} src={modal.src} date={modal.date} onClose={() => setModal(null)} />}
    </>
  );
}
