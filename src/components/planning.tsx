"use client";
// Formulários de registro de erro, da revisão espaçada e da rotina semanal.
import { useState, type FormEvent } from "react";
import { activeSubjects, useStore } from "@/lib/store";
import { addDays, parseNum, todayKey, qt } from "@/lib/calc";
import { anchorFor, cleanSteps, dm, firstDue, nextReview, slotRanges, toMin } from "@/lib/plan";
import { AUTO_OPTS, BLOCK, CLASS_SLOTS, COLORS, CONF_OPTS, MISTAKE, MISTAKE_D, RES_OPTS, WD_S } from "@/lib/constants";
import { MISTAKE_ORDER, MISTAKE_SOURCES, mistakeCats, mistakeText, mistakeTitle } from "@/lib/mistakes";
import type { Autonomy, BlockKind, Mistake, MistakeCategory, Result, ReviewItem, ReviewLog, RoutineBlock, Session, Subject } from "@/lib/types";
import { ConfirmButton, I, Icon, Modal, Seg, Slider } from "./ui";
import { TopicOptions } from "./modals";

const short = (t: string, n = 80) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

/** Provas e SUBs da disciplina, para escolher onde a revisão termina */
function ExamOptions({ subjectId }: { subjectId: string }) {
  const st = useStore();
  const list = st.assessments.filter((a) => a.subject_id === subjectId && (a.kind === "prova" || a.kind === "sub"))
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  return <>{list.map((a) => <option key={a.id} value={a.id}>{a.name}{a.date ? ` (${dm(a.date)})` : " (sem data)"}</option>)}</>;
}

/* ============ Erro ============ */
// Sem digitar (pedido do dono): disciplina, conteúdo e uma lista para assinalar; o app monta o resto.
export interface MistakePreset { subject_id?: string; topic_id?: string | null; session_id?: string | null }
const EST_OPTS: [number, string][] = [[10, "10 min"], [15, "15 min"], [25, "25 min"], [40, "40 min"]];
export function MistakeModal({ id, preset, onClose }: { id: string | null; preset?: MistakePreset; onClose: () => void }) {
  const st = useStore();
  const today = todayKey(), yesterday = addDays(today, -1);
  const orig = id ? st.mistakes.find((x) => x.id === id) : null;
  const list = activeSubjects(st.subjects, true).filter((x) => !x.archived || x.id === orig?.subject_id);
  const origCats = orig ? mistakeCats(orig) : [];
  const [f, setF] = useState(() => ({
    subject_id: orig?.subject_id || preset?.subject_id || list[0]?.id || "", topic_id: orig?.topic_id ?? preset?.topic_id ?? "",
    cats: origCats, source: orig?.source || "", occurred_on: orig?.occurred_on || today, schedule: !orig, est: 15,
  }));
  const up = (x: Partial<typeof f>) => setF({ ...f, ...x });
  const toggle = (c: MistakeCategory) => up({ cats: f.cats.includes(c) ? f.cats.filter((x) => x !== c) : [...f.cats, c] });
  const review = orig ? st.reviews.find((r) => r.mistake_id === orig.id) : null;
  const topic = st.topics.find((t) => t.id === f.topic_id);
  const anchor = anchorFor(f.subject_id, topic, st.assessments, today);
  const steps = cleanSteps(st.profile?.review_steps);
  const text = mistakeText(f.cats);
  // registro antigo escrito à mão: o texto fica, a menos que a pessoa mude o que está assinalado
  const sameCats = !!orig && f.cats.length === origCats.length && f.cats.every((c) => origCats.includes(c));
  const oldNote = orig && orig.description !== mistakeText(origCats)?.description ? orig.description : "";
  const when = f.occurred_on === today ? "hoje" : f.occurred_on === yesterday ? "ontem" : "outro";
  if (!list.length) return <Modal title="Registrar erro" onClose={onClose}><p>Cadastre uma disciplina primeiro.</p></Modal>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text) { st.toast("Assinale pelo menos um item: o que aconteceu?"); return; }
    const keep = sameCats && orig;
    const row: Mistake = {
      id: orig?.id || crypto.randomUUID(), subject_id: f.subject_id, topic_id: f.topic_id || null, session_id: orig?.session_id ?? preset?.session_id ?? null,
      category: text.category, description: keep ? orig.description : text.description, correction: keep ? orig.correction : text.correction,
      source: f.source, occurred_on: f.occurred_on || today,
    };
    if (!(await st.save("mistakes", row))) return;
    if (!orig && f.schedule) {
      const where = topic?.name || list.find((x) => x.id === f.subject_id)?.name || "";
      const item: ReviewItem = {
        id: crypto.randomUUID(), subject_id: row.subject_id, topic_id: row.topic_id, mistake_id: row.id, assessment_id: anchor?.a.id ?? null,
        title: short(mistakeTitle(f.cats, where), 200), step: 0, due: firstDue(steps, today, anchor?.a.date), est_min: f.est, active: true, last_reviewed_at: null,
      };
      if (!(await st.save("review_items", item))) return;
      st.toast(`Erro registrado. Primeira revisão em ${dm(item.due)}.`);
    } else st.toast(orig ? "Erro atualizado." : "Erro registrado.");
    onClose();
  };
  return (
    <Modal title={orig ? "Editar erro" : "Registrar erro"} sub="Revisar" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        <div className="fgrid">
          <label className="f"><span>Disciplina</span><select value={f.subject_id} onChange={(e) => up({ subject_id: e.target.value, topic_id: "" })} required>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="f"><span>Conteúdo</span><select value={f.topic_id} onChange={(e) => up({ topic_id: e.target.value })}><option value="">Geral da disciplina</option><TopicOptions topics={st.topics} subjectId={f.subject_id} /></select></label>
        </div>
        <fieldset className="qblock" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="q">O que aconteceu? <span className="small muted">(assinale tudo o que vale)</span></legend>
          <div className="stack" style={{ gap: 6, marginTop: 6 }}>
            {MISTAKE_ORDER.map((c) => (
              <label key={c} className="check" style={{ alignItems: "flex-start" }}>
                <input type="checkbox" checked={f.cats.includes(c)} onChange={() => toggle(c)} />
                <span><b>{MISTAKE[c]}</b> <span className="small muted">· {MISTAKE_D[c]}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        {text && <p className="small" style={{ margin: 0 }}><b>Como evitar:</b> {sameCats && orig?.correction ? orig.correction : text.correction}</p>}
        {oldNote && <p className="small muted" style={{ margin: 0 }}>Anotação antiga: {oldNote}{sameCats ? "" : " (será trocada pelo que está assinalado)"}</p>}
        <div className="qblock"><span className="q">De onde veio <span className="small muted">(opcional)</span></span>
          <Seg value={f.source || null} onChange={(x) => up({ source: x || "" })} options={[...new Set([...MISTAKE_SOURCES, ...(f.source ? [f.source] : [])])].map((x) => [x, x] as [string, string])} />
        </div>
        <div className="qblock"><span className="q">Quando</span>
          <div className="row" style={{ gap: 8 }}>
            <Seg required value={when} onChange={(x) => up({ occurred_on: x === "hoje" ? today : x === "ontem" ? yesterday : addDays(today, -2) })} options={[["hoje", "Hoje"], ["ontem", "Ontem"], ["outro", "Outro dia"]]} />
            {when === "outro" && <input type="date" value={f.occurred_on} max={today} onChange={(e) => up({ occurred_on: e.target.value || today })} aria-label="Data do erro" />}
          </div>
        </div>
        {!orig && (
          <div className="stack" style={{ gap: 8 }}>
            <label className="check"><input type="checkbox" checked={f.schedule} onChange={(e) => up({ schedule: e.target.checked })} />Agendar revisão deste erro</label>
            {f.schedule && (
              <div className="stack small" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 8 }}><span>Tempo para revisar</span><Seg required value={f.est} onChange={(x) => up({ est: x ?? 15 })} options={EST_OPTS} /></div>
                <span className="muted">{anchor
                  ? `Até ${anchor.a.name}${anchor.a.date ? ` (${dm(anchor.a.date)})` : ""}, porque ${anchor.why}. Primeira revisão em ${dm(firstDue(steps, today, anchor.a.date))}.`
                  : `Sem prova futura cadastrada nesta disciplina: intervalos limitados a 14 dias. Primeira revisão em ${dm(firstDue(steps, today, null))}.`}</span>
              </div>
            )}
          </div>
        )}
        {orig && review && <p className="small muted" style={{ margin: 0 }}>Este erro tem uma revisão agendada para {dm(review.due)}. Ela pode ser editada em Hoje → Revisar.</p>}
        <div className="modal-f">
          {orig && <span style={{ marginRight: "auto" }}><ConfirmButton label={<><Icon d={I.trash} s={15} />Excluir</>} question={review ? "Excluir o erro e a revisão dele?" : "Excluir este erro?"} confirmLabel="Excluir"
            onConfirm={async () => { if (await st.remove("mistakes", orig.id)) { st.toast("Erro excluído."); onClose(); } }} /></span>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn pri">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/* ============ Item de revisão (conteúdo) ============ */
export function ReviewItemModal({ id, preset, onClose }: { id: string | null; preset?: { subject_id?: string; topic_id?: string | null }; onClose: () => void }) {
  const st = useStore();
  const today = todayKey();
  const orig = id ? st.reviews.find((x) => x.id === id) : null;
  const list = activeSubjects(st.subjects, true).filter((x) => !x.archived || x.id === orig?.subject_id);
  const steps = cleanSteps(st.profile?.review_steps);
  const init = () => {
    const subject_id = orig?.subject_id || preset?.subject_id || list[0]?.id || "";
    const topic_id = orig?.topic_id ?? preset?.topic_id ?? "";
    const t = st.topics.find((x) => x.id === topic_id);
    const an = orig ? null : anchorFor(subject_id, t, st.assessments, today);
    return {
      subject_id, topic_id: topic_id || "", title: orig?.title || (t ? `Revisar ${t.name}` : ""), assessment_id: orig ? orig.assessment_id || "" : an?.a.id || "",
      due: orig?.due || firstDue(steps, today, an?.a.date), est: String(orig?.est_min ?? 25), active: orig?.active ?? true,
    };
  };
  const [f, setF] = useState(init);
  const up = (x: Partial<typeof f>) => setF({ ...f, ...x });
  const mistake = orig?.mistake_id ? st.mistakes.find((m) => m.id === orig.mistake_id) : null;
  if (!list.length) return <Modal title="Nova revisão" onClose={onClose}><p>Cadastre uma disciplina primeiro.</p></Modal>;
  const changeTopic = (topic_id: string) => {
    const t = st.topics.find((x) => x.id === topic_id);
    const an = anchorFor(f.subject_id, t, st.assessments, today);
    up({ topic_id, title: !f.title || f.title.startsWith("Revisar ") ? (t ? `Revisar ${t.name}` : "") : f.title, assessment_id: an?.a.id || "", due: orig ? f.due : firstDue(steps, today, an?.a.date) });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const est = parseNum(f.est);
    if (!f.title.trim()) { st.toast("Dê um título à revisão."); return; }
    if (est == null || est < 5 || est > 240) { st.toast("Tempo estimado entre 5 e 240 minutos."); return; }
    if (!f.due) { st.toast("Informe a data da próxima revisão."); return; }
    const row: ReviewItem = {
      id: orig?.id || crypto.randomUUID(), subject_id: f.subject_id, topic_id: f.topic_id || null, mistake_id: orig?.mistake_id ?? null, assessment_id: f.assessment_id || null,
      title: short(f.title.trim(), 200), step: orig?.step ?? 0, due: f.due, est_min: Math.round(est), active: f.active, last_reviewed_at: orig?.last_reviewed_at ?? null,
    };
    if (await st.save("review_items", row)) { st.toast(orig ? "Revisão atualizada." : `Revisão agendada para ${dm(row.due)}.`); onClose(); }
  };
  return (
    <Modal title={orig ? "Editar revisão" : "Nova revisão de conteúdo"} sub="Revisão espaçada" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        {mistake && <div className="callout info small">Revisão do erro: {mistake.description}</div>}
        <div className="fgrid">
          <label className="f"><span>Disciplina</span><select value={f.subject_id} disabled={!!mistake} onChange={(e) => up({ subject_id: e.target.value, topic_id: "", assessment_id: "" })}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="f"><span>Conteúdo</span><select value={f.topic_id} onChange={(e) => changeTopic(e.target.value)}><option value="">Geral da disciplina</option><TopicOptions topics={st.topics} subjectId={f.subject_id} /></select></label>
          <label className="f full"><span>Título</span><input type="text" value={f.title} maxLength={200} onChange={(e) => up({ title: e.target.value })} required placeholder="Ex.: Revisar integrais triplas" /></label>
          <label className="f"><span>Termina na prova</span><select value={f.assessment_id} onChange={(e) => up({ assessment_id: e.target.value })}><option value="">Nenhuma (até 14 dias)</option><ExamOptions subjectId={f.subject_id} /></select></label>
          <label className="f"><span>Próxima revisão</span><input type="date" value={f.due} onChange={(e) => up({ due: e.target.value })} required /></label>
          <label className="f"><span>Tempo estimado (min)</span><input type="number" min={5} max={240} value={f.est} onChange={(e) => up({ est: e.target.value })} /></label>
        </div>
        {orig && <label className="check"><input type="checkbox" checked={!f.active} onChange={(e) => up({ active: !e.target.checked })} />Encerrar esta revisão (não aparece mais no plano)</label>}
        <p className="small muted" style={{ margin: 0 }}>Depois que a prova escolhida acontece, a revisão se encerra sozinha. Sem prova, os intervalos ficam limitados a 14 dias.</p>
        <div className="modal-f">
          {orig && <span style={{ marginRight: "auto" }}><ConfirmButton label={<><Icon d={I.trash} s={15} />Excluir</>} question="Excluir a revisão e o histórico dela?" confirmLabel="Excluir"
            onConfirm={async () => { if (await st.remove("review_items", orig.id)) { st.toast("Revisão excluída."); onClose(); } }} /></span>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn pri">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/* ============ Fazer a revisão ============ */
export function ReviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  const st = useStore();
  const today = todayKey();
  const item = st.reviews.find((x) => x.id === id);
  const [result, setResult] = useState<Result | null>(null);
  const [autonomy, setAutonomy] = useState<Autonomy | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [asSession, setAsSession] = useState(false);
  const [minutes, setMinutes] = useState(String(item?.est_min ?? 15));
  if (!item) return null;
  const sub = st.subjects.find((x) => x.id === item.subject_id);
  const mistake = item.mistake_id ? st.mistakes.find((m) => m.id === item.mistake_id) : null;
  const exam = item.assessment_id ? st.assessments.find((a) => a.id === item.assessment_id) : null;
  const steps = cleanSteps(st.profile?.review_steps);
  const nr = result ? nextReview({ step: item.step, steps, result, autonomy, today, exam: exam ? { date: exam.date, name: exam.name } : null }) : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!result || !nr) { st.toast("Diga como foi o resultado."); return; }
    const min = parseNum(minutes);
    if (asSession && (min == null || min < 1 || min > 1440 || !Number.isInteger(min))) { st.toast("Informe a duração em minutos inteiros."); return; }
    const log: ReviewLog = {
      id: crypto.randomUUID(), item_id: item.id, reviewed_at: new Date().toISOString(), result, autonomy, confidence,
      prev_step: item.step, new_step: nr.step, prev_due: item.due, new_due: nr.keep ? item.due : nr.due,
    };
    if (!(await st.save("review_logs", log))) return;
    // sem nova revisão antes da prova: guarda para o dia seguinte a ela (se a prova mudar de data, a revisão volta)
    const due = nr.keep ? item.due : nr.due ?? (exam?.date ? addDays(exam.date, 1) : item.due);
    if (!(await st.save("review_items", { ...item, step: nr.step, due, last_reviewed_at: log.reviewed_at }))) return;
    if (asSession) {
      const s: Session = {
        id: crypto.randomUUID(), subject_id: item.subject_id, topic_id: item.topic_id, activity: "revisao", started_at: new Date(Date.now() - min! * 60000).toISOString(),
        duration_min: min!, questions: null, correct: null, notes: `Revisão: ${item.title}`, confidence, result, autonomy, difficulty: null, comprehension: null,
      };
      await st.save("study_sessions", s);
    }
    st.toast(nr.keep ? "Registrado. A data muda quando você conferir." : nr.due ? `Próxima revisão em ${dm(nr.due)}.` : "Última revisão antes da prova registrada.");
    onClose();
  };
  return (
    <Modal title="Como foi a revisão?" sub={`${sub?.name || ""} · ${item.title}`} onClose={onClose}>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        {mistake && (
          <div className="callout info">
            <b>{MISTAKE[mistake.category]}:</b> {mistake.description}{mistake.source && <span className="muted"> ({mistake.source})</span>}
            {mistake.correction && <details style={{ marginTop: 6 }}><summary className="small">Ver a correção (tente lembrar antes)</summary><p style={{ margin: ".4em 0 0", whiteSpace: "pre-wrap" }}>{mistake.correction}</p></details>}
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>Refaça uma questão parecida sem olhar a resolução e responda com o resultado conferido.</p>
        <div className="qblock"><span className="q">Como foi o resultado?</span>
          <Slider label="Resultado" value={result === "nao" ? null : result} onChange={setResult} options={RES_OPTS} />
          <label className="check small"><input type="checkbox" checked={result === "nao"} onChange={(e) => setResult(e.target.checked ? "nao" : null)} />Ainda não conferi (a data não muda)</label></div>
        <div className="qblock"><span className="q">Quanto apoio você usou?</span>
          <Slider label="Apoio usado" value={autonomy} onChange={setAutonomy} options={AUTO_OPTS} /></div>
        <div className="qblock"><span className="q">Confiança (opcional, não muda a data)</span>
          <Slider label="Confiança" value={confidence} onChange={setConfidence} options={CONF_OPTS} /></div>
        {nr && <div className="callout info small">{nr.why}</div>}
        <div className="row small">
          <label className="check"><input type="checkbox" checked={asSession} onChange={(e) => setAsSession(e.target.checked)} />Registrar também como sessão de revisão</label>
          {asSession && <label className="row" style={{ gap: 6 }}><input type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ width: 72 }} /> min</label>}
        </div>
        {asSession && <p className="small muted" style={{ margin: 0 }}>Deixe desmarcado se você já cronometrou esta revisão, para não contar o tempo duas vezes.</p>}
        <div className="modal-f"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn pri" disabled={!result}>Salvar revisão</button></div>
      </form>
    </Modal>
  );
}

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
        {f.kind === "estudo" && <p className="small muted" style={{ margin: 0 }}>Os blocos de estudo são o tempo que o plano do dia usa para encaixar revisões e aulas.</p>}
        <div className="modal-f">
          {orig && <span style={{ marginRight: "auto" }}><ConfirmButton label={<><Icon d={I.trash} s={15} />Excluir</>} question="Excluir este bloco?" confirmLabel="Excluir"
            onConfirm={async () => { if (await st.remove("routine_blocks", orig.id)) onClose(); }} /></span>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn pri">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
