"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { friendlyError, sb } from "@/lib/supabase";
import { pct, qt } from "@/lib/calc";
import { forecast, summary } from "@/lib/curriculum";
import { CourseDetail, CourseList, CourseModal, Flowchart, ForecastPanel, Legend, OptativesPanel, SetupGrade } from "@/components/curriculum";
import { ConfirmButton, I, Icon } from "@/components/ui";

export default function Curso() {
  const st = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null | undefined>(undefined);
  const s = useMemo(() => summary(st.courses), [st.courses]);
  const fc = useMemo(() => ({ con: forecast(st.courses, new Date(), "conservadora"), oti: forecast(st.courses, new Date(), "otimista") }), [st.courses]);

  if (!st.courses.length) return <SetupGrade />;

  const pick = (id: string | null) => {
    setSel(id);
    if (id) setTimeout(() => document.getElementById("detalhe")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 30);
  };
  const wipe = async () => {
    setSel(null);
    if (st.demo) { for (const c of [...st.courses]) await st.remove("curriculum", c.id); return; }
    const { error } = await sb().from("curriculum").delete().eq("user_id", st.uid);
    if (error) st.toast(friendlyError(error));
    st.reload("curriculum");
  };
  const hasOpt = st.courses.some((c) => c.kind === "optativa");
  const hasOther = st.courses.some((c) => c.phase == null && c.kind !== "optativa");

  return (
    <>
      <section className="kpis" aria-label="Resumo do curso">
        <div className="kpi"><span className="lbl">Créditos cursados</span><span className="v">{pct(s.pct)}</span><span className="s">{s.done} de {s.total}</span><div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${s.pct * 100}%`, background: "var(--ok)" }} /></div></div>
        <div className="kpi"><span className="lbl">Pode cursar</span><span className="v">{s.available.length}</span><span className="s">obrigatórias liberadas</span></div>
        <div className="kpi"><span className="lbl">Optativas</span><span className="v">{s.optDone}<small>/{s.optNeed}</small></span><span className="s">créditos</span></div>
        <div className="kpi"><span className="lbl">Formatura prevista</span><span className="v">{fc.con.finish ?? "–"}</span><span className="s">{fc.oti.finish && fc.oti.finish !== fc.con.finish ? `otimista: ${fc.oti.finish} · ` : ""}<a href="#previsao">ver previsão</a></span></div>
      </section>
      <div id="previsao"><ForecastPanel /></div>

      {s.bottlenecks.length > 0 && (
        <section className="panel">
          <div className="panel-h"><h2>Gargalos</h2><span className="lbl">o que mais trava o resto</span></div>
          <div className="list">{s.bottlenecks.map((b) => (
            <div key={b.c.id} className="li">
              <div className="grow"><button className="linkish t" onClick={() => pick(b.c.id)}>{b.c.name}</button>
                <div className="m">{b.c.phase ? `${b.c.phase}ª fase · ` : ""}libera, em cadeia, {qt(b.n, "disciplina que falta", "disciplinas que faltam")}. Se atrasar, elas atrasam junto.</div></div>
            </div>
          ))}</div>
        </section>
      )}

      <section className="panel">
        <div className="panel-h"><h2>Fluxograma</h2><span className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => setEdit(null)}><Icon d={I.plus} s={14} />Disciplina</button></span></div>
        <p className="small muted" style={{ margin: "0 0 8px" }}>Toque numa disciplina: acende em laranja o que ela exige e em verde o que ela libera. Arraste para o lado para ver todas as fases.</p>
        <Legend />
        <Flowchart sel={sel} onSel={pick} />
      </section>

      <div id="detalhe">{sel && <CourseDetail id={sel} onClose={() => setSel(null)} onEdit={() => setEdit(sel)} onSel={pick} />}</div>

      <section className="panel">
        <div className="panel-h"><h2>Pode cursar no próximo semestre</h2><span className="lbl">{qt(s.available.length, "obrigatória", "obrigatórias")}</span></div>
        {s.available.length ? <div className="list">{s.available.map((c) => (
          <div key={c.id} className="li"><div className="grow"><button className="linkish t" onClick={() => pick(c.id)}>{c.name}</button><div className="m">{c.phase ? `${c.phase}ª fase · ` : ""}{qt(c.credits, "crédito", "créditos")}{c.status === "reprovada" ? " · refazer" : ""}</div></div></div>
        ))}</div> : <p className="small muted" style={{ margin: 0 }}>Nenhuma obrigatória liberada agora: as que faltam dependem das que você está cursando.</p>}
        <p className="small muted" style={{ margin: "8px 0 0" }}>Conta só pré-requisitos e a regra dos 70%. Horário, vagas e oferta da disciplina no semestre são com o SIGA.</p>
      </section>

      {(hasOpt || s.optNeed > 0) && <OptativesPanel onSel={pick} />}
      {hasOther && (
        <section className="panel">
          <div className="panel-h"><h2>Extensão e atividades complementares</h2></div>
          <CourseList kinds={["complementar", "extensao", "estagio", "tcc", "obrigatoria"]} onSel={pick} />
        </section>
      )}

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <ConfirmButton small label="Apagar minha grade" question="Apagar a grade inteira? Suas disciplinas, sessões e notas do app continuam." confirmLabel="Apagar grade" onConfirm={wipe} />
      </div>
      {edit !== undefined && <CourseModal id={edit} onClose={() => setEdit(undefined)} />}
    </>
  );
}
