"use client";
// Viagens: cartão com o impacto de cada viagem no estudo (tempo perdido, provas apertadas,
// quanto estudar a mais e o quê). Cálculo em src/lib/trips.ts.
import Link from "next/link";
import { useStore } from "@/lib/store";
import { fmtMin, todayKey } from "@/lib/calc";
import { masteryCfg } from "@/lib/mastery";
import { dm } from "@/lib/plan";
import { tripImpacts, tripRange, type TripImpact } from "@/lib/trips";
import type { RevInput } from "@/lib/reverse";
import { Dot, I, Icon, useNow } from "./ui";

const LEVEL: Record<TripImpact["level"], [string, string]> = { apertado: ["Precisa estudar mais", "bad"], cabe: ["Cabe na rotina", "ok"], sem_prova: ["Sem prova perto", "acc"] };

function useRevInput(): RevInput {
  const st = useStore();
  const now = new Date(useNow(60_000));
  return {
    today: todayKey(), nowMin: now.getHours() * 60 + now.getMinutes(), blocks: st.blocks, events: st.events, subjects: st.subjects, topics: st.topics,
    sessions: st.sessions, assessments: st.assessments, items: st.reviews, logs: st.reviewLogs, mistakes: st.mistakes, cfg: masteryCfg(st.profile?.mastery_cfg),
  };
}

export function TripCard({ r, onEdit }: { r: TripImpact; onEdit?: (id: string) => void }) {
  const st = useStore();
  const subName = (id: string) => st.subjects.find((s) => s.id === id)?.name ?? "";
  const today = todayKey();
  const [lbl, cls] = LEVEL[r.level];
  return (
    <div className="panel stack" style={{ gap: 10, borderLeft: `4px solid var(--${cls === "acc" ? "accent" : cls})` }}>
      <div className="panel-h" style={{ margin: 0 }}>
        <h3 style={{ margin: 0 }}>Viagem: {r.trip.title} · {tripRange(r.trip)}{r.start <= today ? " (em andamento)" : ""}</h3>
        <span className={"chip " + cls}>{lbl}</span>
      </div>
      {r.during.map((a) => (
        <div key={a.id} className="callout"><b>{a.name} de {subName(a.subject_id)} cai durante a viagem ({dm(a.date!)}).</b> Confira se a data está certa ou combine com o professor antes de ir.</div>
      ))}
      <p className="small" style={{ margin: 0 }}>{r.why}</p>
      {r.focus.length > 0 && (
        <div>
          <div className="lbl" style={{ marginBottom: 4 }}>{r.level === "apertado" ? "Estude primeiro (antes da ida, se der):" : "O que mais precisa de você nessas provas:"}</div>
          <div className="list">{r.focus.map((f) => (
            <div key={f.exam.id + f.p.topic.id} className="li" style={{ alignItems: "flex-start" }}>
              <Dot c={f.subject.color} />
              <div className="grow">
                <div className="t">{f.p.topic.name}</div>
                <div className="m">{f.subject.name} · {f.exam.name} em {dm(f.exam.date!)} · {f.p.why}</div>
                <div className="m" style={{ marginTop: 2 }}>O que fazer: {f.p.how}.</div>
              </div>
              <Link className="btn sm" href={`/sala?disciplina=${f.subject.id}&conteudo=${f.p.topic.id}&atividade=exercicios`}><Icon d={I.play} s={14} />Começar</Link>
            </div>
          ))}</div>
        </div>
      )}
      <div className="row" style={{ gap: 6 }}>
        {r.level === "apertado" && <Link className="btn sm pri" href="/hoje?aba=rotina">Pôr mais estudo na rotina</Link>}
        {r.exams.length > 0 && <Link className="btn sm" href="/hoje?aba=provas">Ver o plano das provas</Link>}
        {onEdit && <button className="btn sm ghost" onClick={() => onEdit(r.trip.id)}>Editar viagem</button>}
      </div>
      {r.lost > 0 && r.level === "apertado" && <p className="small muted" style={{ margin: 0 }}>{fmtMin(r.lost)} = blocos de estudo da sua rotina nos dias da viagem. O cálculo usa as metas do planejamento reverso (pelo índice de domínio de cada conteúdo) e o que você já estudou.</p>}
    </div>
  );
}

/** Cartões das viagens dos próximos 30 dias. `only` mostra só uma viagem. */
export function TripsPanel({ onEdit, only }: { onEdit?: (id: string) => void; only?: string }) {
  const input = useRevInput();
  const trips = input.events.some((e) => e.type === "viagem") ? tripImpacts(input).filter((r) => !only || r.trip.id === only) : [];
  if (!trips.length) return null;
  return <div className="stack" style={{ gap: 12 }}>{trips.map((r) => <TripCard key={r.trip.id} r={r} onEdit={onEdit} />)}</div>;
}
