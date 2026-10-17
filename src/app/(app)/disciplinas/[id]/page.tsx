"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { dkey, fmtMin, gradeCalc, keyDate, nf, stats, qt } from "@/lib/calc";
import { dm } from "@/lib/plan";
import { WD_S } from "@/lib/constants";
import type { Effort, Subject, Topic } from "@/lib/types";
import { Dot, Empty, I, Icon, Seg } from "@/components/ui";
import { EFFORT, effortOf } from "@/lib/effort";
import { SessionModal, SubjectModal, TopicModal, TopicOptions } from "@/components/modals";
import { SessionRow } from "@/components/SessionRow";
import { GradesPanel } from "@/components/grades";
import { ImportSyllabusModal } from "@/components/importSyllabus";

export default function Disciplina() {
  const { id } = useParams<{ id: string }>();
  const st = useStore();
  const router = useRouter();
  const [modal, setModal] = useState<null | { k: "edit" } | { k: "topic"; id: string } | { k: "session"; id: string } | { k: "syllabus" }>(null);
  const [newTopic, setNewTopic] = useState("");
  const [parent, setParent] = useState("");
  // vindo do guia de primeiros passos: abre direto a importação do cronograma
  useEffect(() => { if (new URLSearchParams(window.location.search).get("abrir") === "cronograma") setModal({ k: "syllabus" }); }, []);
  const s = st.subjects.find((x) => x.id === id);
  if (!s) return <Empty title="Disciplina não encontrada">Ela pode ter sido excluída.<Link className="btn sm" href="/disciplinas">Ver disciplinas</Link></Empty>;

  const ses = st.sessions.filter((x) => x.subject_id === s.id).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const sp = stats(ses), gc = gradeCalc(s, st.assessments.filter((a) => a.subject_id === s.id));
  const ts = st.topics.filter((t) => t.subject_id === s.id);
  const classes = st.blocks.filter((b) => b.kind === "aula" && b.subject_id === s.id).sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.start_time.localeCompare(b.start_time));
  const kidsOf = (tid: string) => ts.filter((c) => c.parent_id === tid).map((c) => c.id);
  const rows: ReactNode[] = [];
  const walk = (pid: string | null, depth: number) =>
    ts.filter((t) => (t.parent_id || null) === pid).sort((a, b) => (a.taught_on || "9999").localeCompare(b.taught_on || "9999") || a.position - b.position || a.name.localeCompare(b.name, "pt-BR")).forEach((t: Topic) => {
      const ids = new Set([t.id, ...kidsOf(t.id)]);
      const tst = stats(ses.filter((x) => x.topic_id && ids.has(x.topic_id)));
      const last = ses.find((x) => x.topic_id === t.id);
      const exam = t.assessment_id ? st.assessments.find((a) => a.id === t.assessment_id) : null;
      rows.push(
        <div key={t.id} className={"topic" + (depth ? " child" : "")} style={depth > 1 ? { marginLeft: (depth - 1) * 22 } : undefined}>
          <span className="tn">{t.name}</span>
          <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
            {!tst.n && <span className="chip" title="Nenhuma sessão registrada neste conteúdo">não estudado</span>}
            <button className="btn icon ghost" onClick={() => setModal({ k: "topic", id: t.id })} aria-label="Editar conteúdo"><Icon d={I.edit} s={15} /></button>
          </span>
          <div className="tm"><span>{fmtMin(tst.min)}</span><span>{qt(tst.n, "sessão", "sessões")}</span>{last && <span>último: {keyDate(dkey(last.started_at)).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>}{t.taught_on && <span>aula {dm(t.taught_on)}</span>}{exam && <span>cai na {exam.name}</span>}</div>
        </div>,
      );
      walk(t.id, depth + 1);
    });
  walk(null, 0);

  const addTopic = async (e: FormEvent) => {
    e.preventDefault();
    const name = newTopic.trim();
    if (!name) return;
    const siblings = ts.filter((t) => (t.parent_id || "") === parent);
    if (await st.save("topics", { id: crypto.randomUUID(), subject_id: s.id, parent_id: parent || null, name, position: siblings.length, taught_on: null, assessment_id: null })) setNewTopic("");
  };
  const tr = s.traits || {};
  const traitList = [tr.discursiva && "Prefere questões discursivas", tr.detalhada && "Exige resolução detalhada", tr.teoria && "Ênfase em teoria", tr.calculos && "Ênfase em cálculos", tr.unidades && "Rigor com unidades", tr.algarismos && "Rigor com algarismos significativos", tr.metodos && "Métodos exigidos: " + tr.metodos, tr.nivel && "Dificuldade habitual: " + tr.nivel].filter(Boolean) as string[];

  return (
    <>
      <div className="row between">
        <Link className="btn ghost" href="/disciplinas"><Icon d={I.back} s={16} />Disciplinas</Link>
        <div className="row">
          <button className="btn" onClick={() => setModal({ k: "syllabus" })}>Importar cronograma</button>
          <button className="btn" onClick={() => setModal({ k: "edit" })}><Icon d={I.edit} s={15} />Editar</button>
          <button className="btn" onClick={async () => { if (await st.save("subjects", { ...s, archived: !s.archived })) st.toast(s.archived ? "Disciplina reativada." : "Disciplina arquivada."); }}><Icon d={I.archive} s={15} />{s.archived ? "Desarquivar" : "Arquivar"}</button>
        </div>
      </div>
      <section className="panel">
        <div className="row between" style={{ alignItems: "flex-start", gap: 16 }}>
          <div className="stack" style={{ gap: 4 }}>
            <span className="lbl">{s.code || "sem código"}{s.semester ? " · " + s.semester : ""}{s.credits ? ` · ${s.credits} créditos` : ""}{s.hours ? ` · ${s.hours}h` : ""}</span>
            <div className="row" style={{ gap: 8 }}><Dot c={s.color} size={12} /><span>{s.professor || "Professor não informado"}</span></div>
            {classes.length > 0
              ? <span className="small muted">Aulas na rotina: {classes.map((b) => `${WD_S[b.weekday]} ${b.start_time}–${b.end_time}`).join(", ")}</span>
              : s.schedule && <span className="small muted">Aulas: {s.schedule} · <Link href="/calendario#rotina">colocar na rotina</Link></span>}
            {s.notes && <span className="small" style={{ maxWidth: "65ch", whiteSpace: "pre-wrap" }}>{s.notes}</span>}
            <EffortControl s={s} />
            {traitList.length > 0 && <div className="row" style={{ gap: 6, marginTop: 6 }}>{traitList.map((x) => <span key={x} className="chip">{x}</span>)}</div>}
          </div>
          <button className="btn pri" onClick={() => router.push(`/sala?disciplina=${s.id}`)}><Icon d={I.play} s={15} />Estudar agora</button>
        </div>
      </section>
      <section className="kpis">
        <div className="kpi"><span className="lbl">Horas totais</span><span className="v">{fmtMin(sp.min)}</span><span className="s">{sp.n} sessões</span></div>
        <div className="kpi"><span className="lbl">Média atual</span><span className="v" style={{ color: gc.partial == null ? "inherit" : gc.partial >= gc.min ? "var(--ok)" : "var(--bad)" }}>{gc.partial == null ? "–" : nf(gc.partial)}</span>
          <span className="s">{gc.needed != null ? `precisa de ${nf(Math.max(0, gc.needed))} nas restantes` : `mínima ${nf(gc.min)}`} · <a href="#notas">notas</a></span></div>
      </section>
      <GradesPanel s={s} />
      <section className="grid g2">
        <div className="panel">
          <div className="panel-h"><h2>Conteúdos</h2><span className="lbl">{ts.length} itens</span></div>
          {rows.length ? <div>{rows}</div> : <Empty>Nenhum conteúdo ainda. Importe o cronograma do professor (Excel, Word ou PDF) ou adicione os assuntos abaixo.<button className="btn pri sm" onClick={() => setModal({ k: "syllabus" })}>Importar cronograma</button></Empty>}
          <form className="row" style={{ marginTop: 14, flexWrap: "nowrap" }} onSubmit={addTopic}>
            <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Novo conteúdo, ex.: Equação característica" aria-label="Nome do conteúdo" required />
            <select value={parent} onChange={(e) => setParent(e.target.value)} aria-label="Dentro de" style={{ maxWidth: "40%" }}><option value="">No nível principal</option><TopicOptions topics={st.topics} subjectId={s.id} /></select>
            <button className="btn pri icon" aria-label="Adicionar conteúdo"><Icon d={I.plus} s={16} /></button>
          </form>
        </div>
        <div className="panel">
          <div className="panel-h"><h2>Sessões recentes</h2><span className="lbl">{ses.length} no total</span></div>
          {ses.length ? <div className="list">{ses.slice(0, 8).map((x) => <SessionRow key={x.id} s={x} onEdit={() => setModal({ k: "session", id: x.id })} />)}</div> : <Empty>Nenhuma sessão registrada nesta disciplina.</Empty>}
        </div>
      </section>
      {modal?.k === "edit" && <SubjectModal id={s.id} onClose={() => setModal(null)} />}
      {modal?.k === "syllabus" && <ImportSyllabusModal s={s} onClose={() => setModal(null)} />}
      {modal?.k === "topic" && <TopicModal id={modal.id} onClose={() => setModal(null)} />}
      {modal?.k === "session" && <SessionModal id={modal.id} onClose={() => setModal(null)} />}
    </>
  );
}

/** "Para você, esta matéria é…": muda o tempo que o plano reserva */
function EffortControl({ s }: { s: Subject }) {
  const st = useStore();
  const e = effortOf(s);
  const set = (v: Effort | null) => st.save("subjects", { ...s, traits: { ...s.traits, esforco: v ?? undefined } });
  return (
    <div className="stack" style={{ gap: 4, marginTop: 6 }}>
      <span className="small">Para você, esta matéria é:</span>
      <Seg value={e.level} onChange={(v) => set(v)} options={(Object.keys(EFFORT) as Effort[]).map((k) => [k, EFFORT[k].name] as [Effort, string])} />
      {e.why && <span className="small muted" style={{ maxWidth: "65ch" }}>{e.why}</span>}
    </div>
  );
}
