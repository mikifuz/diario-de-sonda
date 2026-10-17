"use client";
// Formulário do bloco da rotina semanal.
import { useState, type FormEvent } from "react";
import { activeSubjects, useStore } from "@/lib/store";
import { qt } from "@/lib/calc";
import { slotRanges, toMin } from "@/lib/plan";
import { BLOCK, CLASS_SLOTS, COLORS, WD_S } from "@/lib/constants";
import type { BlockKind, RoutineBlock, Subject } from "@/lib/types";
import { ConfirmButton, I, Icon, Modal } from "./ui";

/* ============ Bloco da rotina ============ */
const NEW = "__nova";
export function BlockModal({ id, weekday, onClose }: { id: string | null; weekday?: number; onClose: () => void }) {
  const st = useStore();
  const orig = id ? st.blocks.find((b) => b.id === id) : null;
  const list = activeSubjects(st.subjects);
  const [days, setDays] = useState<number[]>(orig ? [orig.weekday] : [weekday ?? 1]);
  const [f, setF] = useState(() => ({
    kind: (orig?.kind || "aula") as BlockKind, start: orig?.start_time || "14:00", end: orig?.end_time || "16:00",
    subject_id: orig?.subject_id || list[0]?.id || NEW, label: orig?.label || "", newName: "",
  }));
  // horários pré-definidos marcados; vazio = horário personalizado (campos de início e fim)
  const [slots, setSlots] = useState<number[]>(() => {
    if (!orig) return [0];
    const i = CLASS_SLOTS.findIndex((x) => x.start === orig.start_time);
    const j = CLASS_SLOTS.findIndex((x) => x.end === orig.end_time);
    return orig.kind === "aula" && i >= 0 && j >= i ? Array.from({ length: j - i + 1 }, (_, k) => i + k) : [];
  });
  const up = (x: Partial<typeof f>) => setF({ ...f, ...x });
  const isClass = f.kind === "aula";
  const usesSlots = isClass && slots.length > 0;
  const ranges = usesSlots ? slotRanges(slots, CLASS_SLOTS) : [{ start: f.start, end: f.end }];
  const sub = st.subjects.find((s) => s.id === f.subject_id);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!days.length) { st.toast("Escolha pelo menos um dia."); return; }
    if (ranges.some((r) => !r.start || !r.end || toMin(r.end) <= toMin(r.start))) { st.toast("O fim precisa ser depois do início."); return; }
    if (orig && ranges.length > 1) { st.toast("Ao editar, marque horários seguidos (um bloco só)."); return; }
    let subjectId = isClass ? f.subject_id : null;
    if (isClass && subjectId === NEW) {
      const name = f.newName.trim();
      if (!name) { st.toast("Dê um nome à nova disciplina."); return; }
      const p = st.profile;
      const row: Subject = {
        id: crypto.randomUUID(), name: name.slice(0, 200), code: "", professor: "", semester: p?.current_semester || "", credits: null, hours: null,
        color: COLORS[st.subjects.length % COLORS.length], min_avg: p?.default_min_avg ?? 7, schedule: "", notes: "", traits: {},
        exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false,
        study_pref: null, recovery: "nenhuma", sub_replace_lower: false,
      };
      if (!(await st.save("subjects", row))) return;
      subjectId = row.id;
    }
    if (isClass && !subjectId) { st.toast("Escolha a disciplina da aula."); return; }
    const base = { kind: f.kind, subject_id: subjectId, label: f.label.trim().slice(0, 80) };
    const rows: RoutineBlock[] = orig
      ? [{ ...orig, ...base, weekday: days[0], start_time: ranges[0].start, end_time: ranges[0].end }]
      : days.flatMap((d) => ranges.map((r) => ({ id: crypto.randomUUID(), weekday: d, start_time: r.start, end_time: r.end, ...base })));
    const clash = rows.flatMap((r) => st.blocks.filter((b) => b.id !== r.id && b.weekday === r.weekday && toMin(b.start_time) < toMin(r.end_time) && toMin(r.start_time) < toMin(b.end_time)));
    if (await st.saveMany("routine_blocks", rows)) {
      const created = f.subject_id === NEW && isClass ? ` Disciplina "${f.newName.trim()}" criada; complete os dados em Disciplinas quando quiser.` : "";
      st.toast((clash.length ? `Salvo. Atenção: ${qt(clash.length, "bloco", "blocos")} no mesmo horário.` : "Rotina atualizada.") + created);
      onClose();
    }
  };
  return (
    <Modal title={orig ? "Editar bloco" : "Novo bloco na rotina"} sub="Rotina semanal" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        <div className="qblock"><span className="q">{orig ? "Dia" : "Dias (pode marcar vários)"}</span>
          <div className="seg">{[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => setDays(orig ? [d] : days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{WD_S[d]}</button>
          ))}</div>
        </div>
        <div className="fgrid">
          <label className="f"><span>Tipo</span><select value={f.kind} onChange={(e) => up({ kind: e.target.value as BlockKind })}>{Object.entries(BLOCK).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          {isClass
            ? <label className="f"><span>Disciplina</span><select value={f.subject_id} onChange={(e) => up({ subject_id: e.target.value })} required>
              {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value={NEW}>+ Nova disciplina…</option></select></label>
            : <label className="f"><span>Descrição (opcional)</span><input type="text" value={f.label} maxLength={80} onChange={(e) => up({ label: e.target.value })} placeholder={f.kind === "estudo" ? "Ex.: biblioteca" : "Ex.: estágio"} /></label>}
          {isClass && f.subject_id === NEW && (
            <label className="f full"><span>Nome da nova disciplina *</span><input type="text" value={f.newName} maxLength={200} onChange={(e) => up({ newName: e.target.value })} placeholder="Ex.: Mecânica dos Fluidos" autoFocus />
              <span className="small">Criada com a média mínima padrão ({String(st.profile?.default_min_avg ?? 7).replace(".", ",")}); o resto você completa depois em Disciplinas.</span></label>
          )}
        </div>
        {isClass && (
          <div className="qblock"><span className="q">Horário {orig ? "" : "(pode marcar vários)"}</span>
            <div className="seg">
              {CLASS_SLOTS.map((x, i) => (
                <button key={i} type="button" aria-pressed={slots.includes(i)} onClick={() => setSlots(slots.includes(i) ? slots.filter((k) => k !== i) : [...slots, i])}>
                  <b>{x.n}</b> <span className="num small">{x.start}–{x.end}</span></button>
              ))}
              <button type="button" aria-pressed={!slots.length} onClick={() => setSlots([])}>Outro horário</button>
            </div>
            {usesSlots && <span className="small muted">{ranges.length === 1 ? `Bloco das ${ranges[0].start} às ${ranges[0].end}.` : `${ranges.length} blocos por dia: ${ranges.map((r) => `${r.start}–${r.end}`).join(" e ")}.`} Horários seguidos viram um bloco só.</span>}
          </div>
        )}
        {!usesSlots && (
          <div className="fgrid">
            <label className="f"><span>Início</span><input type="time" value={f.start} onChange={(e) => up({ start: e.target.value })} required /></label>
            <label className="f"><span>Fim</span><input type="time" value={f.end} onChange={(e) => up({ end: e.target.value })} required /></label>
          </div>
        )}
        {isClass && <label className="f"><span>Sala ou observação (opcional)</span><input type="text" value={f.label} maxLength={80} onChange={(e) => up({ label: e.target.value })} placeholder="Ex.: Bloco F, sala 12" /></label>}
        {isClass && sub?.schedule && <p className="small muted" style={{ margin: 0 }}>Você anotou nesta disciplina: &quot;{sub.schedule}&quot;.</p>}
        {f.kind === "estudo" && <p className="small muted" style={{ margin: 0 }}>Os blocos de estudo são o tempo que o plano do dia usa para encaixar o estudo das provas e das aulas.</p>}
        <div className="modal-f">
          {orig && <span style={{ marginRight: "auto" }}><ConfirmButton label={<><Icon d={I.trash} s={15} />Excluir</>} question="Excluir este bloco?" confirmLabel="Excluir"
            onConfirm={async () => { if (await st.remove("routine_blocks", orig.id)) onClose(); }} /></span>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn pri">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
