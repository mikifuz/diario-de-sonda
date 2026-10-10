"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { activeSubjects, timerMs, topicName, useStore } from "@/lib/store";
import { dkey, fmtClock, fmtMin, inRange, keyDate, nf, pct, periodRange, stats, verified, type Period } from "@/lib/calc";
import { ACT, AUTO_S } from "@/lib/constants";
import type { Activity, Session } from "@/lib/types";
import { Dot, Empty, I, Icon, Tabs, useNow } from "@/components/ui";
import { SessionModal, SubjectModal, TopicOptions } from "@/components/modals";
import { SessionRow } from "@/components/SessionRow";

function TimerPanel({ onManual, onNewSubject }: { onManual: () => void; onNewSubject: () => void }) {
  const st = useStore();
  const params = useSearchParams();
  const now = useNow();
  const list = activeSubjects(st.subjects);
  const pre = params.get("disciplina");
  const [subjectId, setSubjectId] = useState(pre && list.some((s) => s.id === pre) ? pre : list[0]?.id || "");
  const [topicId, setTopicId] = useState("");
  const [activity, setActivity] = useState<Activity>("exercicios");
  const [discard, setDiscard] = useState(false);
  const t = st.profile?.timer;

  if (t) {
    const s = st.subjects.find((x) => x.id === t.subject_id), tn = topicName(st.topics, t.topic_id);
    return (
      <div className="panel">
        <div className="panel-h"><h2>Sessão em andamento</h2><span className={"chip " + (t.running ? "ok" : "warn")}>{t.running ? "cronometrando" : "pausada"}</span></div>
        <div className="row between" style={{ gap: 20 }}>
          <div className="stack" style={{ gap: 6 }}>
            <div className="clock">{fmtClock(timerMs(t, now))}</div>
            <div className="row" style={{ gap: 8 }}><Dot c={s?.color || "var(--muted)"} /><b>{s?.name || "Disciplina removida"}</b>{tn && <span className="muted">· {tn}</span>}<span className="chip">{ACT[t.activity]}</span></div>
          </div>
          <div className="row">
            {discard ? (
              <><span className="small">Descartar {fmtClock(timerMs(t, now))} sem salvar?</span>
                <button className="btn danger sm" onClick={() => { st.discardTimer(); setDiscard(false); st.toast("Sessão descartada."); }}>Descartar</button>
                <button className="btn sm ghost" onClick={() => setDiscard(false)}>Manter</button></>
            ) : (
              <>{t.running ? <button className="btn" onClick={st.pauseTimer}><Icon d={I.pause} s={16} />Pausar</button> : <button className="btn" onClick={st.resumeTimer}><Icon d={I.play} s={16} />Retomar</button>}
                <button className="btn pri" onClick={st.stopTimer}><Icon d={I.stop} s={16} />Encerrar e avaliar</button>
                <button className="btn ghost" onClick={() => setDiscard(true)}>Descartar</button></>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (!list.length) return <div className="panel"><Empty title="Cadastre uma disciplina primeiro">As sessões ficam ligadas a uma disciplina e, se quiser, a um conteúdo.<button className="btn pri sm" onClick={onNewSubject}><Icon d={I.plus} s={14} />Nova disciplina</button></Empty></div>;
  return (
    <div className="panel">
      <div className="panel-h"><h2>Cronômetro</h2><button className="btn sm" onClick={onManual}><Icon d={I.plus} s={14} />Registrar manualmente</button></div>
      <div className="fgrid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
        <label className="f"><span>Disciplina</span><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(""); }}>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="f"><span>Conteúdo</span><select value={topicId} onChange={(e) => setTopicId(e.target.value)}><option value="">Geral da disciplina</option><TopicOptions topics={st.topics} subjectId={subjectId} /></select></label>
        <label className="f"><span>Atividade</span><select value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>{Object.entries(ACT).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn pri" onClick={() => st.startTimer(subjectId, topicId || null, activity)}><Icon d={I.play} s={16} />Iniciar cronômetro</button>
        <span className="small muted">O tempo continua contando mesmo se você fechar a página ou trocar de aparelho.</span>
      </div>
    </div>
  );
}

function Sessoes() {
  const st = useStore();
  const [per, setPer] = useState<Period>("30");
  const [subF, setSubF] = useState("");
  const [modal, setModal] = useState<null | { k: "session"; id: string | null } | { k: "subject" }>(null);
  const rng = periodRange(per);
  const ses = st.sessions.filter((s) => inRange(s, rng) && (!subF || s.subject_id === subF)).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const groups: [string, Session[]][] = [];
  for (const s of ses) {
    const k = dkey(s.started_at);
    const g = groups.find((x) => x[0] === k);
    if (g) g[1].push(s); else groups.push([k, [s]]);
  }
  const sp = stats(ses);
  return (
    <>
      <TimerPanel onManual={() => setModal({ k: "session", id: null })} onNewSubject={() => setModal({ k: "subject" })} />
      <div className="panel">
        <div className="panel-h"><h2>Histórico</h2>
          <div className="row">
            <select value={subF} onChange={(e) => setSubF(e.target.value)} aria-label="Filtrar disciplina" style={{ width: "auto" }}><option value="">Todas as disciplinas</option>{activeSubjects(st.subjects, true).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <Tabs value={per} onChange={setPer} label="Período" options={[["7", "7 dias"], ["30", "30 dias"], ["semestre", "Semestre"], ["tudo", "Tudo"]]} />
          </div>
        </div>
        <div className="row small muted" style={{ marginBottom: 8, gap: 16 }}><span>{sp.n} sessões</span><span>{fmtMin(sp.min)}</span><span>confiança {sp.conf == null ? "–" : nf(sp.conf)}/5</span><span>acerto conferido {pct(sp.acc)}</span></div>
        {groups.length ? groups.map(([k, arr]) => (
          <div key={k} style={{ marginTop: 10 }}>
            <div className="row between" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
              <span className="lbl">{keyDate(k).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span>
              <span className="num small muted">{fmtMin(arr.reduce((a, s) => a + s.duration_min, 0))}</span>
            </div>
            <div className="list">{arr.map((s) => <SessionRow key={s.id} s={s} onEdit={() => setModal({ k: "session", id: s.id })} />)}</div>
          </div>
        )) : <Empty>Nenhuma sessão neste filtro.</Empty>}
      </div>
      {modal?.k === "session" && <SessionModal id={modal.id} onClose={() => setModal(null)} />}
      {modal?.k === "subject" && <SubjectModal id={null} onClose={() => setModal(null)} />}
    </>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Sessoes /></Suspense>;
}
