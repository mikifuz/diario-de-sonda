"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal, Seg, Slider, ConfirmButton, Icon, I } from "./ui";
import { ACT, AUTO_OPTS, COLORS, COMP_OPTS, CONF_OPTS, DIFF, RES_OPTS, EVT, GRADED, PREF, PRIO, RES, STATUS } from "@/lib/constants";
import { dkey, fmtMin, pad, parseNum, todayKey, qt } from "@/lib/calc";
import { activeSubjects, useStore } from "@/lib/store";
import { EFFORT } from "@/lib/effort";
import type { Activity, Assessment, AssessmentKind, Autonomy, CalEvent, Comprehension, EventType, Priority, Result, Session, Status, StudyPref, Subject, Topic, Traits, Effort } from "@/lib/types";
import { MistakeModal } from "./planning";
import { pushLessons } from "@/lib/plan";

/* ============ Conteúdos em árvore ============ */
export function TopicOptions({ topics, subjectId, exclude }: { topics: Topic[]; subjectId: string | null; exclude?: Set<string> }) {
  const ts = topics.filter((t) => t.subject_id === subjectId && !(exclude && exclude.has(t.id)));
  const out: ReactNode[] = [];
  const walk = (pid: string | null, depth: number) =>
    ts.filter((t) => (t.parent_id || null) === pid).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR")).forEach((t) => {
      out.push(<option key={t.id} value={t.id}>{"— ".repeat(depth) + t.name}</option>);
      walk(t.id, depth + 1);
    });
  walk(null, 0);
  return <>{out}</>;
}

/* ============ Autoavaliação ============ */
export interface EvalState {
  confidence: number | null; result: Result | null; autonomy: Autonomy | null; difficulty: number | null; comprehension: Comprehension | null;
  questions: string; correct: string; notes: string;
}
export const evalFrom = (s?: Partial<Session> | null): EvalState => ({
  confidence: s?.confidence ?? null, result: s?.result ?? null, autonomy: s?.autonomy ?? null, difficulty: s?.difficulty ?? null,
  comprehension: s?.comprehension ?? null, questions: s?.questions != null ? String(s.questions) : "", correct: s?.correct != null ? String(s.correct) : "", notes: s?.notes || "",
});
function evalToRow(e: EvalState): Pick<Session, "confidence" | "result" | "autonomy" | "difficulty" | "comprehension" | "questions" | "correct" | "notes"> | string {
  const q = parseNum(e.questions), c = parseNum(e.correct);
  if (q != null && (q < 0 || !Number.isInteger(q))) return "Questões feitas deve ser um número inteiro.";
  if (c != null && (c < 0 || !Number.isInteger(c))) return "Questões certas deve ser um número inteiro.";
  if (q != null && c != null && c > q) return "Questões certas não pode ser maior que feitas.";
  return { confidence: e.confidence, result: e.result, autonomy: e.autonomy, difficulty: e.difficulty, comprehension: e.comprehension, questions: q, correct: c, notes: e.notes.trim() };
}

export function EvalFields({ v, set }: { v: EvalState; set: (v: EvalState) => void }) {
  const up = (p: Partial<EvalState>) => set({ ...v, ...p });
  const open = !!(v.questions || v.difficulty != null || v.comprehension || v.notes);
  return (
    <>
      <div className="qblock"><span className="q">Quão confiante você se sentiu resolvendo?</span>
        <Slider label="Confiança" value={v.confidence} onChange={(x) => up({ confidence: x })} options={CONF_OPTS} /></div>
      <div className="qblock"><span className="q">Como foi o resultado?</span>
        <Slider label="Resultado" value={v.result === "nao" ? null : v.result} onChange={(x) => up({ result: x })} options={RES_OPTS} />
        <label className="check small"><input type="checkbox" checked={v.result === "nao"} onChange={(e) => up({ result: e.target.checked ? "nao" : null })} />{RES.nao} (não entra no acerto)</label></div>
      <div className="qblock"><span className="q">Quanto apoio você usou?</span>
        <Slider label="Apoio usado" value={v.autonomy} onChange={(x) => up({ autonomy: x })} options={AUTO_OPTS} /></div>
      <details open={open}>
        <summary>Mais detalhes (opcional)</summary>
        <div className="stack" style={{ marginTop: 12, gap: 14 }}>
          <div className="fgrid">
            <label className="f"><span>Questões feitas</span><input type="number" min={0} value={v.questions} onChange={(e) => up({ questions: e.target.value })} /></label>
            <label className="f"><span>Questões certas (conferidas)</span><input type="number" min={0} value={v.correct} onChange={(e) => up({ correct: e.target.value })} /></label>
          </div>
          <div className="qblock"><span className="q">Dificuldade percebida</span>
            <Slider label="Dificuldade percebida" value={v.difficulty} onChange={(x) => up({ difficulty: x })} options={DIFF.map((d, i) => [i, d] as [number, string])} /></div>
          <div className="qblock"><span className="q">Compreensão</span>
            <Slider label="Compreensão" value={v.comprehension} onChange={(x) => up({ comprehension: x })} options={COMP_OPTS} /></div>
          <label className="f"><span>Observações</span><textarea value={v.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="Onde travou, o que precisa rever…" /></label>
          <p className="small muted" style={{ margin: 0 }}>Quando você informa questões feitas e certas, o acerto conferido usa esse número. Sem isso, usa o resultado declarado (&quot;Ainda não conferi&quot; não entra no cálculo).</p>
        </div>
      </details>
    </>
  );
}

export function EvalModal({ id, onClose }: { id: string; onClose: () => void }) {
  const st = useStore();
  const s = st.sessions.find((x) => x.id === id);
  const [v, setV] = useState<EvalState>(() => evalFrom(s));
  const [logMistake, setLogMistake] = useState(true);
  const [mistakeFor, setMistakeFor] = useState<Session | null>(null);
  if (mistakeFor) return <MistakeModal id={null} preset={{ subject_id: mistakeFor.subject_id, topic_id: mistakeFor.topic_id, session_id: mistakeFor.id }} onClose={onClose} />;
  if (!s) return null;
  const sub = st.subjects.find((x) => x.id === s.subject_id);
  const wrong = v.result === "parcial" || v.result === "errado";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = evalToRow(v);
    if (typeof r === "string") { st.toast(r); return; }
    if (await st.save("study_sessions", { ...s, ...r })) {
      st.toast("Sessão registrada.");
      if (wrong && logMistake) setMistakeFor(s); else onClose();
    }
  };
  return (
    <Modal title="Como foi a sessão?" sub={`${sub?.name || ""} · ${fmtMin(s.duration_min)}`} onClose={onClose}>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <EvalFields v={v} set={setV} />
        {wrong && <label className="check"><input type="checkbox" checked={logMistake} onChange={(e) => setLogMistake(e.target.checked)} />Registrar o erro (já agenda uma revisão)</label>}
        <div className="modal-f"><button type="button" className="btn ghost" onClick={onClose}>Pular</button><button className="btn pri">Salvar avaliação</button></div>
      </form>
    </Modal>
  );
}

/* ============ Sessão (manual ou edição) ============ */
export function SessionModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const st = useStore();
  const orig = id ? st.sessions.find((x) => x.id === id) : null;
  const list = activeSubjects(st.subjects, true).filter((x) => !x.archived || x.id === orig?.subject_id);
  const start = orig ? new Date(orig.started_at) : new Date(Date.now() - 60 * 60000);
  const [subjectId, setSubjectId] = useState(orig?.subject_id || list[0]?.id || "");
  const [topicId, setTopicId] = useState(orig?.topic_id || "");
  const [activity, setActivity] = useState<Activity>(orig?.activity || "exercicios");
  const [date, setDate] = useState(dkey(start));
  const [time, setTime] = useState(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
  const [dur, setDur] = useState(String(orig?.duration_min ?? 60));
  const [ev, setEv] = useState<EvalState>(() => evalFrom(orig));
  if (!list.length) return <Modal title="Registrar sessão" onClose={onClose}><p>Cadastre uma disciplina primeiro.</p></Modal>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const d = parseNum(dur);
    if (!d || d < 1 || d > 1440 || !Number.isInteger(d)) { st.toast("Informe a duração em minutos inteiros (1 a 1440)."); return; }
    const r = evalToRow(ev);
    if (typeof r === "string") { st.toast(r); return; }
    const [y, m, dd] = date.split("-").map(Number), [hh, mi] = (time || "12:00").split(":").map(Number);
    const row: Session = { id: orig?.id || crypto.randomUUID(), subject_id: subjectId, topic_id: topicId || null, activity, started_at: new Date(y, m - 1, dd, hh, mi).toISOString(), duration_min: d, ...r };
    if (await st.save("study_sessions", row)) { st.toast(orig ? "Sessão atualizada." : "Sessão registrada."); onClose(); }
  };
  return (
    <Modal title={orig ? "Editar sessão" : "Registrar sessão"} sub="Sessão de estudo" onClose={onClose}>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <div className="fgrid">
          <label className="f"><span>Disciplina</span><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(""); }} required>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="f"><span>Conteúdo</span><select value={topicId} onChange={(e) => setTopicId(e.target.value)}><option value="">Geral da disciplina</option><TopicOptions topics={st.topics} subjectId={subjectId} /></select></label>
          <label className="f"><span>Atividade</span><select value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>{Object.entries(ACT).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label className="f"><span>Data</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label className="f"><span>Início</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <label className="f"><span>Duração (minutos)</span><input type="number" min={1} max={1440} value={dur} onChange={(e) => setDur(e.target.value)} required /></label>
        </div>
        <h3>Autoavaliação</h3>
        <EvalFields v={ev} set={setEv} />
        <div className="modal-f">
          {orig && <span style={{ marginRight: "auto" }}><ConfirmButton label={<><Icon d={I.trash} s={15} />Excluir</>} question="Excluir esta sessão?" confirmLabel="Sim, excluir" onConfirm={async () => { if (await st.remove("study_sessions", orig.id)) { st.toast("Sessão excluída."); onClose(); } }} /></span>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn pri">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/* ============ Disciplina ============ */
const TRAITS: [keyof Traits, string][] = [["discursiva", "Prefere questões discursivas"], ["detalhada", "Exige resolução detalhada"], ["teoria", "Ênfase em teoria"], ["calculos", "Ênfase em cálculos"], ["unidades", "Rigor com unidades"], ["algarismos", "Rigor com algarismos significativos"]];
export function SubjectModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const st = useStore();
  const router = useRouter();
  const orig = id ? st.subjects.find((x) => x.id === id) : null;
  const p = st.profile;
  const [f, setF] = useState(() => ({
    name: orig?.name || "", code: orig?.code || "", professor: orig?.professor || "", semester: orig?.semester ?? p?.current_semester ?? "",
    min_avg: String(orig?.min_avg ?? p?.default_min_avg ?? 7).replace(".", ","), credits: orig?.credits != null ? String(orig.credits) : "", hours: orig?.hours != null ? String(orig.hours) : "",
    schedule: orig?.schedule || "", notes: orig?.notes || "", color: orig?.color || COLORS[st.subjects.length % COLORS.length], traits: { ...(orig?.traits || {}) } as Traits,
    study_pref: (orig?.study_pref || "") as StudyPref | "", esforco: (orig?.traits?.esforco || "") as Effort | "",
  }));
  const up = (x: Partial<typeof f>) => setF({ ...f, ...x });
  const nSes = orig ? st.sessions.filter((x) => x.subject_id === orig.id).length : 0;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { st.toast("Dê um nome à disciplina."); return; }
    const min = parseNum(f.min_avg);
    if (min == null || min < 0 || min > 10) { st.toast("A média mínima deve estar entre 0 e 10."); return; }
    const row: Subject = {
      id: orig?.id || crypto.randomUUID(), name: f.name.trim(), code: f.code.trim(), professor: f.professor.trim(), semester: f.semester.trim(),
      credits: parseNum(f.credits), hours: parseNum(f.hours), color: f.color, min_avg: min, schedule: f.schedule.trim(), notes: f.notes.trim(), traits: { ...f.traits, esforco: f.esforco || undefined },
      exam_enabled: orig?.exam_enabled ?? false, exam_w_avg: orig?.exam_w_avg ?? 1, exam_w_exam: orig?.exam_w_exam ?? 1, exam_min_final: orig?.exam_min_final ?? 5,
      exam_min_take: orig?.exam_min_take ?? null, archived: orig?.archived ?? false,
      study_pref: f.study_pref || null, recovery: orig?.recovery ?? "nenhuma", sub_replace_lower: orig?.sub_replace_lower ?? false,
    };
    if (await st.save("subjects", row)) {
      onClose();
      if (!orig) { st.toast("Disciplina criada. Agora adicione os conteúdos."); router.push(`/disciplinas/${row.id}`); }
    }
  };
  return (
    <Modal title={orig ? "Editar disciplina" : "Nova disciplina"} sub="Disciplina" onClose={onClose}>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <div className="fgrid">
          <label className="f full"><span>Nome *</span><input type="text" value={f.name} onChange={(e) => up({ name: e.target.value })} required placeholder="Ex.: Equações Diferenciais" /></label>
          <label className="f"><span>Código</span><input type="text" value={f.code} onChange={(e) => up({ code: e.target.value })} /></label>
          <label className="f"><span>Professor(a)</span><input type="text" value={f.professor} onChange={(e) => up({ professor: e.target.value })} /></label>
          <label className="f"><span>Semestre</span><input type="text" value={f.semester} onChange={(e) => up({ semester: e.target.value })} placeholder="2026.2" /></label>
          <label className="f"><span>Média mínima</span><input type="text" inputMode="decimal" value={f.min_avg} onChange={(e) => up({ min_avg: e.target.value })} /></label>
          <label className="f"><span>Créditos</span><input type="number" min={0} value={f.credits} onChange={(e) => up({ credits: e.target.value })} /></label>
          <label className="f"><span>Carga horária (h)</span><input type="number" min={0} value={f.hours} onChange={(e) => up({ hours: e.target.value })} /></label>
          <label className="f full"><span>Horários de aula (anotação)</span><input type="text" value={f.schedule} onChange={(e) => up({ schedule: e.target.value })} placeholder="Ex.: Seg e Qua 08:20–10:00" />
            <span className="small">Para o plano do dia usar as aulas, cadastre-as em Hoje → Rotina.</span></label>
          <label className="f full"><span>Como prefere estudar esta disciplina</span><select value={f.study_pref} onChange={(e) => up({ study_pref: e.target.value as StudyPref | "" })}>
            <option value="">Segue o padrão ({PREF[st.profile?.study_pref || "depois"].toLowerCase()})</option>{Object.entries(PREF).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label className="f full"><span>Para você, esta matéria é</span><select value={f.esforco} onChange={(e) => up({ esforco: e.target.value as Effort | "" })}>
            <option value="">Não marquei (o app estima pelos seus registros)</option>{(Object.keys(EFFORT) as Effort[]).map((k) => <option key={k} value={k}>{EFFORT[k].name}{k === "trivial" ? " (sem tempo de estudo no plano; só aviso na véspera e no dia da prova)" : EFFORT[k].factor !== 1 ? ` (${EFFORT[k].factor > 1 ? "+" : "−"}${Math.round(Math.abs(EFFORT[k].factor - 1) * 100)}% de tempo no plano)` : ""}</option>)}</select>
            <span className="small">É sobre você, não sobre o professor: matéria difícil ganha mais tempo no plano do dia e no plano das provas.</span></label>
          <div className="f full"><span>Cor</span><div className="swatches">{COLORS.map((c) => <button key={c} type="button" style={{ ["--c" as string]: c }} aria-pressed={f.color === c} aria-label={`Cor ${c}`} onClick={() => up({ color: c })} />)}</div></div>
          <label className="f full"><span>Critérios de avaliação e observações</span><textarea value={f.notes} onChange={(e) => up({ notes: e.target.value })} /></label>
        </div>
        <details open={Object.entries(f.traits).some(([k, v]) => k !== "esforco" && Boolean(v))}>
          <summary>Como o professor avalia (opcional)</summary>
          <div className="stack" style={{ marginTop: 10, gap: 8 }}>
            {TRAITS.map(([k, n]) => <label key={k} className="check"><input type="checkbox" checked={!!f.traits[k]} onChange={(e) => up({ traits: { ...f.traits, [k]: e.target.checked } })} />{n}</label>)}
            <div className="fgrid">
              <label className="f"><span>Métodos exigidos</span><input type="text" value={f.traits.metodos || ""} onChange={(e) => up({ traits: { ...f.traits, metodos: e.target.value } })} placeholder="Ex.: Laplace obrigatório" /></label>
              <label className="f"><span>Dificuldade habitual</span><select value={f.traits.nivel || ""} onChange={(e) => up({ traits: { ...f.traits, nivel: e.target.value } })}><option value="">Não sei</option>{["Baixa", "Média", "Alta", "Muito alta"].map((x) => <option key={x}>{x}</option>)}</select></label>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Essas informações vão orientar os simulados de uma próxima etapa.</p>
          </div>
        </details>
        <div className="modal-f">
          {orig && <span style={{ marginRight: "auto" }}><ConfirmButton label={<><Icon d={I.trash} s={15} />Excluir</>} question={`Excluir a disciplina e ${nSes === 1 ? "sua sessão" : `suas ${nSes} sessões`}? Arquivar mantém o histórico.`} confirmLabel="Excluir tudo"
            onConfirm={async () => { if (await st.remove("subjects", orig.id)) { st.toast("Disciplina excluída."); onClose(); router.push("/disciplinas"); } }} /></span>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn pri">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/* ============ Conteúdo ============ */
export function TopicModal({ id, onClose }: { id: string; onClose: () => void }) {
  const st = useStore();
  const t = st.topics.find((x) => x.id === id);
  const [name, setName] = useState(t?.name || "");
  const [parent, setParent] = useState(t?.parent_id || "");
  const [taught, setTaught] = useState(t?.taught_on || "");
  const [exam, setExam] = useState(t?.assessment_id || "");
  const [push, setPush] = useState(true);
  if (!t) return null;
  // aula remarcada para depois: oferece empurrar as aulas seguintes
  const later = t.taught_on && taught && taught > t.taught_on ? st.topics.filter((x) => x.subject_id === t.subject_id && x.id !== t.id && x.taught_on && x.taught_on > t.taught_on!).length : 0;
  const classDays = st.blocks.filter((b) => b.kind === "aula" && b.subject_id === t.subject_id).map((b) => b.weekday);
  const exams = st.assessments.filter((a) => a.subject_id === t.subject_id && (a.kind === "prova" || a.kind === "sub")).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const desc = new Set([t.id]);
  let grew = true;
  while (grew) { grew = false; for (const x of st.topics) if (x.parent_id && desc.has(x.parent_id) && !desc.has(x.id)) { desc.add(x.id); grew = true; } }
  const n = st.sessions.filter((x) => x.topic_id === t.id).length;
  const sub = st.subjects.find((x) => x.id === t.subject_id);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const row = { ...t, name: name.trim(), parent_id: parent || null, taught_on: taught || null, assessment_id: exam || null };
    if (later && push) {
      const moved = pushLessons(st.topics, t.id, taught, classDays).map((x) => (x.id === t.id ? { ...row, taught_on: x.taught_on } : x));
      if (await st.saveMany("topics", moved)) { st.toast(`Aula remarcada; ${qt(moved.length - 1, "aula seguinte empurrada", "aulas seguintes empurradas")}.`); onClose(); }
      return;
    }
    if (await st.save("topics", row)) onClose();
  };
  return (
    <Modal title="Editar conteúdo" sub={sub?.name} onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        <label className="f"><span>Nome</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="f"><span>Dentro de</span><select value={parent} onChange={(e) => setParent(e.target.value)}><option value="">Nível principal</option><TopicOptions topics={st.topics} subjectId={t.subject_id} exclude={desc} /></select></label>
        <div className="fgrid">
          <label className="f"><span>Data da aula</span><input type="date" value={taught} onChange={(e) => setTaught(e.target.value)} /></label>
          <label className="f"><span>Cai na prova</span><select value={exam} onChange={(e) => setExam(e.target.value)}><option value="">Próxima prova da disciplina</option>
            {exams.map((a) => <option key={a.id} value={a.id}>{a.name}{a.date ? ` (${a.date.slice(8, 10)}/${a.date.slice(5, 7)})` : " (sem data)"}</option>)}</select></label>
        </div>
        {later > 0 && <label className="check"><input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />
          Aula remarcada: empurrar também {later === 1 ? "o conteúdo seguinte" : `os ${later} conteúdos seguintes`} para o próximo dia de aula{classDays.length ? "" : " (pelos dias em que a disciplina costuma ter aula)"}</label>}
        <p className="small muted" style={{ margin: 0 }}>A data da aula ajuda o plano do dia a sugerir o que adiantar ou consolidar. A prova define até quando este conteúdo é revisado.</p>
        <div className="modal-f">
          <span style={{ marginRight: "auto" }}><ConfirmButton label={<><Icon d={I.trash} s={15} />Excluir</>} question={n > 0 ? n === 1 ? `1 sessão ficará como "geral da disciplina".` : `${n} sessões ficarão como "geral da disciplina".` : "Excluir?"} confirmLabel="Excluir"
            onConfirm={async () => {
              // subconteúdos sobem um nível antes de excluir
              const kids = st.topics.filter((x) => x.parent_id === t.id).map((x) => ({ ...x, parent_id: t.parent_id }));
              if (kids.length) await st.saveMany("topics", kids);
              if (await st.remove("topics", t.id)) onClose();
            }} /></span>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn pri">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/* ============ Item do calendário ============ */
interface EvForm { title: string; type: EventType; subject_id: string; date: string; end: string; time: string; priority: Priority; status: Status; description: string; counted: boolean; weight: string }
export function EventModal({ id, src, date, type, onClose }: { id: string | null; src?: "event" | "item"; date?: string; type?: EventType; onClose: () => void }) {
  const st = useStore();
  const list = activeSubjects(st.subjects);
  const item = id && src === "item" ? st.assessments.find((a) => a.id === id) : null;
  const ev = id && src === "event" ? st.events.find((e) => e.id === id) : null;
  const [f, setF] = useState<EvForm>(() => item
    ? { title: item.name, type: item.kind as EventType, subject_id: item.subject_id, date: item.date || todayKey(), end: "", time: item.time || "", priority: item.priority, status: item.status, description: item.description, counted: true, weight: String(item.weight).replace(".", ",") }
    : ev ? { title: ev.title, type: ev.type, subject_id: ev.subject_id || "", date: ev.date, end: ev.end_date || "", time: ev.time || "", priority: ev.priority, status: ev.status, description: ev.description, counted: false, weight: "1" }
      : type === "viagem" ? { title: "", type, subject_id: "", date: date || todayKey(), end: "", time: "", priority: "media", status: "pendente", description: "", counted: false, weight: "1" }
      : { title: "", type: "prova", subject_id: list[0]?.id || "", date: date || todayKey(), end: "", time: "", priority: "alta", status: "pendente", description: "", counted: true, weight: "1" });
  const up = (x: Partial<EvForm>) => setF({ ...f, ...x });
  const canCount = GRADED.includes(f.type) && !!f.subject_id;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.title.trim() || !f.date) { st.toast("Preencha título e data."); return; }
    const counted = canCount && f.counted;
    const w = parseNum(f.weight);
    if (counted && (w == null || w <= 0)) { st.toast("Informe um peso maior que zero."); return; }
    const time = f.time || null;
    const trip = f.type === "viagem";
    if (trip && f.end && f.end < f.date) { st.toast("A volta precisa ser no mesmo dia ou depois da ida."); return; }
    if (counted) {
      const base: Assessment = item ? { ...item } : { id: crypto.randomUUID(), subject_id: f.subject_id, name: "", kind: "prova", date: null, time: null, weight: 1, grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "",
        // prova nova: se a disciplina tem uma única SUB, ela vale para esta prova
        sub_id: (() => { const subs = st.assessments.filter((a) => a.subject_id === f.subject_id && a.kind === "sub"); return f.type === "prova" && subs.length === 1 ? subs[0].id : null; })() };
      const row: Assessment = { ...base, id: item && item.subject_id === f.subject_id ? item.id : crypto.randomUUID(), subject_id: f.subject_id, name: f.title.trim(), kind: f.type as AssessmentKind, date: f.date, time, weight: w!, priority: f.priority, status: f.status, description: f.description.trim() };
      if (!(await st.save("assessments", row))) return;
      if (item && item.id !== row.id) await st.remove("assessments", item.id);
      if (ev) await st.remove("events", ev.id);
    } else {
      const row: CalEvent = { id: ev?.id || crypto.randomUUID(), subject_id: trip ? null : f.subject_id || null, title: f.title.trim(), type: f.type, date: f.date, time, priority: f.priority, status: f.status, description: f.description.trim(),
        // só manda a volta quando há uma (assim o resto do calendário funciona mesmo antes da migration de viagens)
        ...(trip ? { end_date: f.end && f.end > f.date ? f.end : null } : ev?.end_date ? { end_date: null } : {}) };
      if (!(await st.save("events", row))) return;
      if (item) await st.remove("assessments", item.id);
    }
    st.toast(trip ? "Viagem salva: o plano de estudo já foi refeito em volta dela." : "Salvo no calendário.");
    onClose();
  };
  return (
    <Modal title={id ? (f.type === "viagem" ? "Editar viagem" : "Editar item") : f.type === "viagem" ? "Nova viagem" : "Novo item"} sub="Calendário" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        <div className="fgrid">
          <label className="f full"><span>{f.type === "viagem" ? "Para onde? *" : "Título *"}</span><input type="text" value={f.title} onChange={(e) => up({ title: e.target.value })} required placeholder={f.type === "viagem" ? "Ex.: Casa dos pais" : "Ex.: Prova 2"} /></label>
          <label className="f"><span>Tipo</span><select value={f.type} onChange={(e) => up({ type: e.target.value as EventType })}>{Object.entries(EVT).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          {f.type === "viagem" ? <>
            <label className="f"><span>Ida *</span><input type="date" value={f.date} onChange={(e) => up({ date: e.target.value, end: f.end && f.end < e.target.value ? e.target.value : f.end })} required /></label>
            <label className="f"><span>Volta</span><input type="date" value={f.end} min={f.date} onChange={(e) => up({ end: e.target.value })} /></label>
            <label className="f"><span>Horário de saída</span><input type="time" value={f.time} onChange={(e) => up({ time: e.target.value })} /></label>
            <p className="small full" style={{ margin: 0 }}>Nos dias da viagem (da ida até a volta) os blocos de estudo da sua rotina não contam. Com horário de saída, no dia da ida contam só os blocos que terminam antes. O app refaz o plano das provas em volta da viagem e avisa se você vai precisar estudar mais nos outros dias, e o quê.</p>
          </> : <>
          <label className="f"><span>Disciplina</span><select value={f.subject_id} onChange={(e) => up({ subject_id: e.target.value })}><option value="">Nenhuma</option>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          {f.type === "sem_aula" && <p className="small full" style={{ margin: 0 }}>Sem disciplina: não há aula de nenhuma matéria neste dia (feriado, recesso). Com disciplina: só a aula dela não acontece. No plano, os horários dessas aulas viram tempo de estudo. Feriados nacionais o app já conhece.</p>}
          <label className="f"><span>Data *</span><input type="date" value={f.date} onChange={(e) => up({ date: e.target.value })} required /></label>
          <label className="f"><span>Horário</span><input type="time" value={f.time} onChange={(e) => up({ time: e.target.value })} /></label>
          </>}
          {f.type !== "viagem" && <label className="f"><span>Prioridade</span><select value={f.priority} onChange={(e) => up({ priority: e.target.value as Priority })}>{Object.entries(PRIO).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>}
          <label className="f"><span>Status</span><select value={f.status} onChange={(e) => up({ status: e.target.value as Status })}>{Object.entries(STATUS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          {canCount && <div className="full row"><label className="check"><input type="checkbox" checked={f.counted} onChange={(e) => up({ counted: e.target.checked })} />{f.type === "sub" ? "Lançar em Notas (substitui a menor nota de prova)" : "Conta na média da disciplina"}</label>
            {f.counted && f.type !== "sub" && <label className="row small" style={{ gap: 6 }}>Peso <input type="text" inputMode="decimal" value={f.weight} onChange={(e) => up({ weight: e.target.value })} style={{ width: 70 }} /></label>}</div>}
          <label className="f full"><span>Descrição</span><textarea value={f.description} onChange={(e) => up({ description: e.target.value })} /></label>
        </div>
        <div className="modal-f">
          {id && <span style={{ marginRight: "auto" }}><ConfirmButton label={<><Icon d={I.trash} s={15} />Excluir</>} question={item ? "Excluir? A nota lançada também será removida." : "Excluir?"} confirmLabel="Excluir"
            onConfirm={async () => { if (await st.remove(item ? "assessments" : "events", id)) onClose(); }} /></span>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn pri">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
