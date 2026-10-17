"use client";
import { topicName, useStore } from "@/lib/store";
import { fmtMin } from "@/lib/calc";
import { ACT } from "@/lib/constants";
import type { Session } from "@/lib/types";
import { Dot, I, Icon } from "./ui";

export function SessionRow({ s, onEdit }: { s: Session; onEdit: () => void }) {
  const st = useStore();
  const sub = st.subjects.find((x) => x.id === s.subject_id);
  const time = new Date(s.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const tn = topicName(st.topics, s.topic_id);
  return (
    <div className="li">
      <Dot c={sub?.color || "var(--muted)"} />
      <div className="grow">
        <div className="t">{sub?.name || "Disciplina removida"}{tn && <span className="muted" style={{ fontWeight: 400 }}> · {tn}</span>}</div>
        <div className="m">{time} · {ACT[s.activity]} · {fmtMin(s.duration_min)}{s.notes ? ` · ${s.notes.slice(0, 80)}` : ""}</div>
      </div>
      <button className="btn icon ghost" onClick={onEdit} aria-label="Editar sessão"><Icon d={I.edit} s={16} /></button>
    </div>
  );
}
