"use client";
import { topicName, useStore } from "@/lib/store";
import { fmtMin, pct, verified } from "@/lib/calc";
import { ACT, AUTO_S } from "@/lib/constants";
import type { Session } from "@/lib/types";
import { Dot, I, Icon } from "./ui";

export function SessionRow({ s, onEdit }: { s: Session; onEdit: () => void }) {
  const st = useStore();
  const sub = st.subjects.find((x) => x.id === s.subject_id), v = verified(s);
  const time = new Date(s.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const tn = topicName(st.topics, s.topic_id);
  return (
    <div className="li">
      <Dot c={sub?.color || "var(--muted)"} />
      <div className="grow">
        <div className="t">{sub?.name || "Disciplina removida"}{tn && <span className="muted" style={{ fontWeight: 400 }}> · {tn}</span>}</div>
        <div className="m">{time} · {ACT[s.activity]} · {fmtMin(s.duration_min)}{s.questions ? ` · ${s.correct != null ? s.correct + "/" : ""}${s.questions} questões` : ""}{s.notes ? ` · ${s.notes.slice(0, 80)}` : ""}</div>
      </div>
      <div className="row hide-m" style={{ gap: 6 }}>
        {s.confidence ? <span className="chip acc" title="Confiança declarada">conf. {s.confidence}/5</span> : <span className="chip" title="Sem autoavaliação">sem avaliação</span>}
        {v != null && <span className={"chip " + (v >= 0.8 ? "ok" : v >= 0.5 ? "warn" : "bad")} title="Acerto conferido">{pct(v)}</span>}
        {s.autonomy && <span className="chip">{AUTO_S[s.autonomy]}</span>}
      </div>
      <button className="btn icon ghost" onClick={onEdit} aria-label="Editar sessão"><Icon d={I.edit} s={16} /></button>
    </div>
  );
}
