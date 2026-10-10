"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { activeSubjects, useStore } from "@/lib/store";
import { fmtMin, gradeCalc, nf, pct, stats } from "@/lib/calc";
import { Empty, I, Icon, Tabs } from "@/components/ui";
import { SubjectModal } from "@/components/modals";

export default function Disciplinas() {
  const st = useStore();
  const router = useRouter();
  const [arch, setArch] = useState<"0" | "1">("0");
  const [modal, setModal] = useState(false);
  const list = activeSubjects(st.subjects, true).filter((s) => (arch === "1" ? s.archived : !s.archived));
  const archivedN = st.subjects.filter((s) => s.archived).length;
  return (
    <>
      <div className="row between">
        <Tabs value={arch} onChange={setArch} options={[["0", "Em andamento"], ["1", `Arquivadas (${archivedN})`]]} />
        <button className="btn pri" onClick={() => setModal(true)}><Icon d={I.plus} s={16} />Nova disciplina</button>
      </div>
      {list.length ? (
        <section className="grid g3">{list.map((s) => {
          const x = stats(st.sessions.filter((y) => y.subject_id === s.id)), gc = gradeCalc(s, st.assessments.filter((a) => a.subject_id === s.id));
          const nt = st.topics.filter((t) => t.subject_id === s.id).length;
          const open = () => router.push(`/disciplinas/${s.id}`);
          return (
            <article key={s.id} className="panel clickable stack" style={{ gap: 12 }} tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}>
              <div className="row between" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <span className="lbl">{s.code || "sem código"}{s.semester ? " · " + s.semester : ""}</span>
                  <h2 className="t" style={{ marginTop: 2 }}>{s.name}</h2>
                  <div className="small muted">{s.professor || "Professor não informado"}</div>
                </div>
                <i className="dot" style={{ background: s.color, width: 14, height: 14, marginTop: 4 }} />
              </div>
              <div className="grid g3" style={{ gap: 8 }}>
                <div className="kpi"><span className="lbl">Horas</span><span className="num">{fmtMin(x.min)}</span></div>
                <div className="kpi"><span className="lbl">Acerto</span><span className="num">{pct(x.acc)}</span></div>
                <div className="kpi"><span className="lbl">Média</span><span className="num" style={{ color: gc.partial == null ? "inherit" : gc.partial >= gc.min ? "var(--ok)" : "var(--bad)" }}>{gc.partial == null ? "–" : nf(gc.partial)}</span></div>
              </div>
              <div className="small muted">{nt} conteúdo(s) · {x.n} sessão(ões) · mínima {nf(gc.min)}</div>
            </article>
          );
        })}</section>
      ) : arch === "1" ? <Empty title="Nenhuma disciplina arquivada" /> : (
        <Empty title="Nenhuma disciplina cadastrada">Comece pelas matérias deste semestre. Os conteúdos de cada uma podem ser adicionados depois.<button className="btn pri sm" onClick={() => setModal(true)}><Icon d={I.plus} s={14} />Nova disciplina</button></Empty>
      )}
      {modal && <SubjectModal id={null} onClose={() => setModal(false)} />}
    </>
  );
}
