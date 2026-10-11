"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { activeSubjects, useStore } from "@/lib/store";
import { daysBetween, fmtMin, gradeCalc, nf, pct, stats, todayKey } from "@/lib/calc";
import { Dot, Empty, I, Icon, Tabs } from "@/components/ui";
import { SubjectModal } from "@/components/modals";
import { Calibration, subLine, verdict } from "@/components/grades";

export default function Disciplinas() {
  const st = useStore();
  const router = useRouter();
  const [arch, setArch] = useState<"0" | "1">("0");
  const [modal, setModal] = useState(false);
  const today = todayKey();
  const list = activeSubjects(st.subjects, true).filter((s) => (arch === "1" ? s.archived : !s.archived));
  const archivedN = st.subjects.filter((s) => s.archived).length;
  return (
    <>
      <div className="row between">
        <Tabs value={arch} onChange={setArch} options={[["0", "Em andamento"], ["1", `Arquivadas (${archivedN})`]]} />
        <button className="btn pri" onClick={() => setModal(true)}><Icon d={I.plus} s={16} />Nova disciplina</button>
      </div>
      {list.length ? (
        <section className="panel">
          <div className="tbl-wrap"><table>
            <thead><tr><th>Disciplina</th><th className="n">Média atual</th><th className="hide-m">Situação</th><th className="hide-m">Próxima prova</th><th className="n hide-m">Horas</th><th className="n hide-m">Acerto</th></tr></thead>
            <tbody>{list.map((s) => {
              const items = st.assessments.filter((a) => a.subject_id === s.id);
              const r = gradeCalc(s, items), v = verdict(r), x = stats(st.sessions.filter((y) => y.subject_id === s.id));
              const next = items.filter((a) => (a.kind === "prova" || a.kind === "sub") && a.grade == null && a.status !== "cancelado" && a.date && a.date >= today)
                .sort((a, b) => a.date!.localeCompare(b.date!))[0];
              const dd = next ? daysBetween(today, next.date!) : null;
              const sl = s.recovery === "sub" && r.sub?.need != null && r.final != null ? subLine(r) : null;
              const open = () => router.push(`/disciplinas/${s.id}#notas`);
              return (
                <tr key={s.id} className="clickable" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter") open(); }}>
                  <td><span className="row" style={{ gap: 8, flexWrap: "nowrap" }}><Dot c={s.color} /><span><span className="t">{s.name}</span>{s.code && <span className="small muted hide-m"> · {s.code}</span>}<div className="small show-m" style={{ color: v.c }}>{v.t}{next ? ` · ${next.name} em ${dd} d` : ""}</div></span></span></td>
                  <td className="n" style={{ fontWeight: 600, color: r.partial == null ? "var(--muted)" : r.partial >= r.min ? "var(--ok)" : "var(--bad)" }}>{r.partial == null ? "–" : nf(r.partial)}</td>
                  <td className="small hide-m" style={{ color: v.c }}>{v.t}{sl && <div className="muted">SUB: {sl}</div>}</td>
                  <td className="small hide-m">{next ? <><span className={"cdays " + (dd! <= 3 ? "bad" : dd! <= 7 ? "warn" : "")} style={{ minWidth: 0, marginRight: 6 }}>{dd === 0 ? "hoje" : dd === 1 ? "amanhã" : `${dd} d`}</span>{next.name}</> : <span className="muted">–</span>}</td>
                  <td className="n hide-m">{fmtMin(x.min)}</td>
                  <td className="n hide-m">{pct(x.acc)}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <p className="small muted" style={{ margin: "10px 0 0" }}>Clique numa disciplina para lançar notas, ver conteúdos e sessões. &quot;Média atual&quot; considera só as notas oficiais já lançadas.</p>
        </section>
      ) : arch === "1" ? <Empty title="Nenhuma disciplina arquivada" /> : (
        <Empty title="Nenhuma disciplina cadastrada">Comece pelas matérias deste semestre (ou importe do comprovante do SIGA em Hoje → Rotina). Os conteúdos de cada uma podem ser adicionados depois.<button className="btn pri sm" onClick={() => setModal(true)}><Icon d={I.plus} s={14} />Nova disciplina</button></Empty>
      )}
      {arch === "0" && list.length > 0 && (
        <details className="panel">
          <summary>Previsão × nota real</summary>
          <div style={{ marginTop: 10 }}><Calibration subjects={list} /></div>
        </details>
      )}
      {modal && <SubjectModal id={null} onClose={() => setModal(false)} />}
    </>
  );
}
