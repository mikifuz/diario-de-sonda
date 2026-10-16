"use client";
import { holidayOf } from "@/lib/holidays";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { agenda, useStore, type AgendaItem } from "@/lib/store";
import { addDays, daysBetween, dkey, fmtMin, keyDate, nf, todayKey, qt } from "@/lib/calc";
import { EVT, GRADED } from "@/lib/constants";
import { Dot, I, Icon } from "@/components/ui";
import { EventModal } from "@/components/modals";
import { TripsPanel } from "@/components/trips";
import { WeekPrint } from "@/components/weekPrint";
import { RoutineSection } from "@/components/routine";
import { evOn } from "@/lib/plan";
import { tripRange } from "@/lib/trips";
import type { CalEvent, EventType } from "@/lib/types";

const fmtDL = (k: string) => keyDate(k).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

export default function CalendarioPage() {
  return <Suspense fallback={null}><Calendario /></Suspense>;
}

function Calendario() {
  const st = useStore();
  const params = useSearchParams();
  const t = todayKey();
  const [month, setMonth] = useState(t.slice(0, 7));
  const [sel, setSel] = useState(t);
  const [modal, setModal] = useState<null | { id: string | null; src?: "event" | "item"; date?: string; type?: EventType }>(null);
  const [print, setPrint] = useState(false);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = addDays(dkey(first), -((first.getDay() + 6) % 7));
  const ag = agenda(st.subjects, st.assessments, st.events);
  const byDay: Record<string, AgendaItem[]> = {};
  for (const e of ag) {
    // viagem aparece em todos os dias, da ida até a volta
    if (e.type === "viagem" && e.end_date && e.end_date > e.date) for (let d = e.date; d <= e.end_date; d = addDays(d, 1)) (byDay[d] ||= []).push(e);
    else (byDay[e.date] ||= []).push(e);
  }
  const color = (e: AgendaItem) => {
    const s = st.subjects.find((x) => x.id === e.subject_id);
    return e.type === "viagem" ? "var(--warn)" : e.type === "indisponivel" || e.type === "pessoal" ? "var(--muted)" : s ? s.color : "var(--accent)";
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
  const selTrip = st.events.find((e) => e.type === "viagem" && e.status !== "cancelado" && evOn(e, sel));
  // tempo estudado (sessões registradas) por dia
  const studied: Record<string, number> = {};
  for (const x of st.sessions) studied[dkey(x.started_at)] = (studied[dkey(x.started_at)] || 0) + x.duration_min;
  const short = (mn: number) => (mn >= 60 ? `${Math.floor(mn / 60)}h${mn % 60 ? String(mn % 60).padStart(2, "0") : ""}` : `${mn}min`);
  const selSes = st.sessions.filter((x) => dkey(x.started_at) === sel);
  const selBySub = Object.entries(selSes.reduce<Record<string, { min: number; n: number }>>((a, x) => { const o = (a[x.subject_id] ||= { min: 0, n: 0 }); o.min += x.duration_min; o.n++; return a; }, {}))
    .sort((a, b) => b[1].min - a[1].min);

  const Row = ({ e }: { e: AgendaItem }) => {
    const s = st.subjects.find((x) => x.id === e.subject_id);
    return (
      <div className="li clickable" onClick={() => setModal({ id: e.id, src: e.src })}>
        <Dot c={color(e)} />
        <div className="grow">
          <div className="t" style={done(e) ? { textDecoration: "line-through", opacity: 0.7 } : undefined}>{e.title}</div>
          <div className="m">{EVT[e.type]}{e.type === "viagem" ? ` · ${tripRange(e as CalEvent)}${e.time ? `, saída ${e.time}` : ""}` : ""}{s ? " · " + s.name : ""}{e.time && e.type !== "viagem" ? " · " + e.time : ""}{e.src === "item" ? `${e.type === "sub" ? "" : ` · peso ${nf(e.weight ?? 0, 0)}`}${e.grade != null ? ` · nota ${nf(e.grade)}` : ""}` : ""}</div>
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
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => setPrint(true)}>Plano da semana (PDF)</button>
              <button className="btn" onClick={() => setModal({ id: null, date: sel > t ? sel : t, type: "viagem" })}><Icon d={I.plus} s={16} />Viagem</button>
              <button className="btn pri" onClick={() => setModal({ id: null, date: sel })}><Icon d={I.plus} s={16} />Novo item</button>
            </div>
          </div>
          <div className="cal">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <div key={d} className="wd">{d}</div>)}
            {cells.map((k) => {
              const evs = byDay[k] || [];
              return (
                <button key={k} className={["day", k.slice(0, 7) !== month && "out", k === t && "today", k === sel && "sel"].filter(Boolean).join(" ")} onClick={() => pick(k)}
                  aria-label={`${fmtDL(k)}, ${qt(evs.length, "item", "itens")}${studied[k] ? `, estudou ${fmtMin(studied[k])}` : ""}`}
                  style={studied[k] && k !== sel ? { background: `color-mix(in srgb,var(--ok) ${Math.round(6 + Math.min(1, studied[k] / 240) * 22)}%,transparent)` } : undefined}>
                  <span className="row" style={{ justifyContent: "space-between", gap: 2, flexWrap: "nowrap" }}><span className="dn">{keyDate(k).getDate()}</span>{studied[k] ? <span className="cstudy" title={`Estudou ${fmtMin(studied[k])}`}>{short(studied[k])}</span> : null}</span>
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
            {studied[sel] ? (
              <div style={{ margin: "0 0 10px" }}>
                <p className="small" style={{ margin: "0 0 4px" }}>Você estudou <b>{fmtMin(studied[sel])}</b> neste dia ({qt(selSes.length, "sessão", "sessões")}):</p>
                <div className="stack small" style={{ gap: 2 }}>{selBySub.map(([sid, v]) => { const s = st.subjects.find((x) => x.id === sid); return (
                  <span key={sid} className="row" style={{ gap: 6, flexWrap: "nowrap" }}><Dot c={s?.color || "var(--muted)"} /><span className="grow">{s?.name || "Disciplina apagada"}</span><span className="num">{fmtMin(v.min)}</span></span>); })}</div>
              </div>
            ) : sel <= t ? <p className="small muted" style={{ margin: "0 0 8px" }}>Nenhum estudo registrado neste dia.</p> : null}
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
      {selTrip && <TripsPanel only={selTrip.id} onEdit={(id) => setModal({ id, src: "event" })} />}
      <RoutineSection openSiga={params.get("abrir") === "siga"} />
      {print && <WeekPrint start={t} onDone={() => setPrint(false)} />}
      {modal && <EventModal id={modal.id} src={modal.src} date={modal.date} type={modal.type} onClose={() => setModal(null)} />}
    </>
  );
}
