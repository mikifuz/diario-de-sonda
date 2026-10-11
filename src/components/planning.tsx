"use client";
// Formulários do banco de erros, da revisão espaçada e da rotina semanal.
import { useState, type FormEvent } from "react";
import { activeSubjects, useStore } from "@/lib/store";
import { addDays, parseNum, todayKey } from "@/lib/calc";
import { anchorFor, cleanSteps, dm, firstDue, nextReview, toMin } from "@/lib/plan";
import { AUTO, BLOCK, CONF, MISTAKE, MISTAKE_D, WD_S } from "@/lib/constants";
import type { Autonomy, BlockKind, Mistake, MistakeCategory, Result, ReviewItem, ReviewLog, RoutineBlock, Session } from "@/lib/types";
import { ConfirmButton, I, Icon, Modal, Seg } from "./ui";
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
export interface MistakePreset { subject_id?: string; topic_id?: string | null; session_id?: string | null }
export function MistakeModal({ id, preset, onClose }: { id: string | null; preset?: MistakePreset; onClose: () => void }) {
  const st = useStore();
  const today = todayKey();
  const orig = id ? st.mistakes.find((x) => x.id === id) : null;
  const list = activeSubjects(st.subjects, true).filter((x) => !x.archived || x.id === orig?.subject_id);
  const [f, setF] = useState(() => ({
    subject_id: orig?.subject_id || preset?.subject_id || list[0]?.id || "", topic_id: orig?.topic_id ?? preset?.topic_id ?? "",
    category: (orig?.category || null) as MistakeCategory | null, description: orig?.description || "", correction: orig?.correction || "",
    source: orig?.source || "", occurred_on: orig?.occurred_on || today, schedule: !orig, est: "15",
  }));
  const up = (x: Partial<typeof f>) => setF({ ...f, ...x });
  const review = orig ? st.reviews.find((r) => r.mistake_id === orig.id) : null;
  const topic = st.topics.find((t) => t.id === f.topic_id);
  const anchor = anchorFor(f.subject_id, topic, st.assessments, today);
  const steps = cleanSteps(st.profile?.review_steps);
  if (!list.length) return <Modal title="Registrar erro" onClose={onClose}><p>Cadastre uma disciplina primeiro.</p></Modal>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.category) { st.toast("Escolha o tipo de erro."); return; }
    if (!f.description.trim()) { st.toast("Descreva o erro."); return; }
    const est = parseNum(f.est);
    if (f.schedule && (est == null || est < 5 || est > 240)) { st.toast("Tempo de revisão entre 5 e 240 minutos."); return; }
    const row: Mistake = {
      id: orig?.id || crypto.randomUUID(), subject_id: f.subject_id, topic_id: f.topic_id || null, session_id: orig?.session_id ?? preset?.session_id ?? null,
      category: f.category, description: f.description.trim(), correction: f.correction.trim(), source: f.source.trim(), occurred_on: f.occurred_on || today,
    };
    if (!(await st.save("mistakes", row))) return;
    if (!orig && f.schedule) {
      const item: ReviewItem = {
        id: crypto.randomUUID(), subject_id: row.subject_id, topic_id: row.topic_id, mistake_id: row.id, assessment_id: anchor?.a.id ?? null,
        title: short(row.description), step: 0, due: firstDue(steps, today, anchor?.a.date), est_min: Math.round(est!), active: true, last_reviewed_at: null,
      };
      if (!(await st.save("review_items", item))) return;
      st.toast(`Erro registrado. Primeira revisão em ${dm(item.due)}.`);
    } else st.toast(orig ? "Erro atualizado." : "Erro registrado.");
    onClose();
  };
  return (
    <Modal title={orig ? "Editar erro" : "Registrar erro"} sub="Banco de erros" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        <div className="fgrid">
          <label className="f"><span>Disciplina</span><select value={f.subject_id} onChange={(e) => up({ subject_id: e.target.value, topic_id: "" })} required>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="f"><span>Conteúdo</span><select value={f.topic_id} onChange={(e) => up({ topic_id: e.target.value })}><option value="">Geral da disciplina</option><TopicOptions topics={st.topics} subjectId={f.subject_id} /></select></label>
        </div>
        <div className="qblock"><span className="q">Que tipo de erro foi?</span>
          <Seg value={f.category} onChange={(x) => up({ category: x })} options={(Object.keys(MISTAKE) as MistakeCategory[]).map((k) => [k, MISTAKE[k]] as [MistakeCategory, string])} />
          {f.category && <span className="small muted">{MISTAKE_D[f.category]}.</span>}
        </div>
        <label className="f"><span>O que você errou? *</span><textarea value={f.description} onChange={(e) => up({ description: e.target.value })} required placeholder="Ex.: esqueci o jacobiano ao trocar para coordenadas cilíndricas" /></label>
        <label className="f"><span>Qual é o certo / como evitar</span><textarea value={f.correction} onChange={(e) => up({ correction: e.target.value })} placeholder="Ex.: dV = r dr dθ dz; conferir o fator r antes de integrar" /></label>
        <div className="fgrid">
          <label className="f"><span>De onde veio</span><input type="text" value={f.source} maxLength={200} onChange={(e) => up({ source: e.target.value })} placeholder="Ex.: Lista 3, questão 5" /></label>
          <label className="f"><span>Data</span><input type="date" value={f.occurred_on} onChange={(e) => up({ occurred_on: e.target.value })} required /></label>
        </div>
        {!orig && (
          <div className="stack" style={{ gap: 8 }}>
            <label className="check"><input type="checkbox" checked={f.schedule} onChange={(e) => up({ schedule: e.target.checked })} />Agendar revisão deste erro</label>
            {f.schedule && (
              <div className="row small" style={{ gap: 8 }}>
                <label className="row" style={{ gap: 6 }}>Tempo estimado <input type="number" min={5} max={240} value={f.est} onChange={(e) => up({ est: e.target.value })} style={{ width: 72 }} /> min</label>
                <span className="muted">{anchor
                  ? `Até ${anchor.a.name}${anchor.a.date ? ` (${dm(anchor.a.date)})` : ""}, porque ${anchor.why}. Primeira revisão em ${dm(firstDue(steps, today, anchor.a.date))}.`
                  : `Sem prova futura cadastrada nesta disciplina: intervalos limitados a 14 dias. Primeira revisão em ${dm(firstDue(steps, today, null))}.`}</span>
              </div>
            )}
          </div>
        )}
        {orig && review && <p className="small muted" style={{ margin: 0 }}>Este erro tem uma revisão agendada para {dm(review.due)}. Ela pode ser editada em Hoje → Revisões.</p>}
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
          <Seg value={result} onChange={setResult} options={[["certo", "Resolvi corretamente"], ["parcial", "Resolvi parcialmente"], ["errado", "Não consegui resolver"], ["nao", "Ainda não conferi"]]} /></div>
        <div className="qblock"><span className="q">Quanto apoio você usou?</span>
          <Seg value={autonomy} onChange={setAutonomy} options={Object.entries(AUTO) as [Autonomy, string][]} /></div>
        <div className="qblock"><span className="q">Confiança (opcional, não muda a data)</span>
          <Seg scale value={confidence} onChange={setConfidence} options={[1, 2, 3, 4, 5].map((n) => [n, String(n), CONF[n - 1]] as [number, string, string])} /></div>
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
export function BlockModal({ id, weekday, onClose }: { id: string | null; weekday?: number; onClose: () => void }) {
  const st = useStore();
  const orig = id ? st.blocks.find((b) => b.id === id) : null;
  const list = activeSubjects(st.subjects);
  const [days, setDays] = useState<number[]>(orig ? [orig.weekday] : [weekday ?? 1]);
  const [f, setF] = useState(() => ({
    kind: (orig?.kind || "estudo") as BlockKind, start: orig?.start_time || "14:00", end: orig?.end_time || "16:00",
    subject_id: orig?.subject_id || list[0]?.id || "", label: orig?.label || "",
  }));
  const up = (x: Partial<typeof f>) => setF({ ...f, ...x });
  const sub = st.subjects.find((s) => s.id === f.subject_id);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!days.length) { st.toast("Escolha pelo menos um dia."); return; }
    if (!f.start || !f.end || toMin(f.end) <= toMin(f.start)) { st.toast("O fim precisa ser depois do início."); return; }
    if (f.kind === "aula" && !f.subject_id) { st.toast("Escolha a disciplina da aula."); return; }
    const base = { start_time: f.start, end_time: f.end, kind: f.kind, subject_id: f.kind === "aula" ? f.subject_id : null, label: f.label.trim().slice(0, 80) };
    const rows: RoutineBlock[] = orig ? [{ ...orig, ...base, weekday: days[0] }] : days.map((d) => ({ id: crypto.randomUUID(), weekday: d, ...base }));
    const clash = rows.flatMap((r) => st.blocks.filter((b) => b.id !== r.id && b.weekday === r.weekday && toMin(b.start_time) < toMin(r.end_time) && toMin(r.start_time) < toMin(b.end_time)));
    if (await st.saveMany("routine_blocks", rows)) {
      st.toast(clash.length ? `Salvo. Atenção: ${clash.length} bloco(s) no mesmo horário.` : "Rotina atualizada.");
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
          {f.kind === "aula"
            ? <label className="f"><span>Disciplina</span><select value={f.subject_id} onChange={(e) => up({ subject_id: e.target.value })} required>{list.length ? list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : <option value="">Cadastre uma disciplina</option>}</select></label>
            : <label className="f"><span>Descrição (opcional)</span><input type="text" value={f.label} maxLength={80} onChange={(e) => up({ label: e.target.value })} placeholder={f.kind === "estudo" ? "Ex.: biblioteca" : "Ex.: estágio"} /></label>}
          <label className="f"><span>Início</span><input type="time" value={f.start} onChange={(e) => up({ start: e.target.value })} required /></label>
          <label className="f"><span>Fim</span><input type="time" value={f.end} onChange={(e) => up({ end: e.target.value })} required /></label>
          {f.kind === "aula" && <label className="f full"><span>Sala ou observação (opcional)</span><input type="text" value={f.label} maxLength={80} onChange={(e) => up({ label: e.target.value })} placeholder="Ex.: Bloco F, sala 12" /></label>}
        </div>
        {f.kind === "aula" && sub?.schedule && <p className="small muted" style={{ margin: 0 }}>Você anotou nesta disciplina: &quot;{sub.schedule}&quot;.</p>}
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
