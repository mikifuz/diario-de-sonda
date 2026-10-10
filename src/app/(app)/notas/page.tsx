"use client";
import Link from "next/link";
import { useState } from "react";
import { activeSubjects, useStore } from "@/lib/store";
import { gradeCalc, nf, parseNum } from "@/lib/calc";
import type { Assessment, Scenario, Subject } from "@/lib/types";
import { ConfirmButton, Dot, Empty, I, Icon, Tabs } from "@/components/ui";

const SN: Record<Scenario, string> = { c: "conservador", e: "esperado", o: "otimista" };
const simKey = (k: Scenario) => (k === "c" ? "sim_c" : k === "e" ? "sim_e" : "sim_o") as "sim_c" | "sim_e" | "sim_o";
const show = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

/** Campo que salva ao sair (blur) ou Enter; volta ao valor salvo se inválido */
function Cell({ value, onSave, label, wide, type = "text", placeholder, style }: { value: string; onSave: (v: string) => Promise<boolean> | boolean | void; label: string; wide?: boolean; type?: string; placeholder?: string; style?: React.CSSProperties }) {
  return (
    <input key={value} type={type} inputMode={type === "text" && !wide ? "decimal" : undefined} defaultValue={value} aria-label={label} placeholder={placeholder}
      className={wide ? "wide" : undefined} style={style}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onBlur={async (e) => { const v = e.target.value; if (v === value) return; const ok = await onSave(v); if (ok === false) e.target.value = value; }} />
  );
}

function GradeCard({ s, sc }: { s: Subject; sc: Scenario }) {
  const st = useStore();
  const items = st.assessments.filter((a) => a.subject_id === s.id).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.name.localeCompare(b.name, "pt-BR"));
  const r = gradeCalc(s, items, sc);
  const grade = (v: string): number | null | false => { const n = parseNum(v); if (n != null && (n < 0 || n > 10)) { st.toast("Use notas entre 0 e 10."); return false; } return n; };
  const setItem = async (a: Assessment, patch: Partial<Assessment>) => st.save("assessments", { ...a, ...patch });
  const setSub = async (patch: Partial<Subject>) => st.save("subjects", { ...s, ...patch });

  let verdict: React.ReactNode;
  if (!r.nItems) verdict = <span className="muted">Cadastre as avaliações e seus pesos.</span>;
  else if (r.final != null) verdict = r.final >= r.min ? <span style={{ color: "var(--ok)" }}>Média final {nf(r.final)}: aprovado pela média.</span> : <span style={{ color: "var(--bad)" }}>Média final {nf(r.final)}: abaixo de {nf(r.min)}.</span>;
  else if ((r.needed ?? 0) <= 0) verdict = <span style={{ color: "var(--ok)" }}>Média mínima já garantida, mesmo tirando zero no restante.</span>;
  else if ((r.needed ?? 0) > r.max) verdict = <span style={{ color: "var(--bad)" }}>Seria preciso {nf(r.needed)} de média nas restantes, acima de 10.{s.exam_enabled ? " Confira a simulação de exame." : ""}</span>;
  else verdict = <>Precisa de <b className="num">{nf(r.needed)}</b> de média nas avaliações restantes (peso {nf(r.Wr, 0)} de {nf(r.W, 0)}).</>;
  const explain = r.nItems ? `Você já somou ${nf(r.Sk)} pontos ponderados. Para média ${nf(r.min)} são necessários ${nf(r.min * r.W)} (= ${nf(r.min)} × ${nf(r.W, 0)}).${r.Wr > 0 ? ` Faltam ${nf(Math.max(0, r.min * r.W - r.Sk))} pontos em peso ${nf(r.Wr, 0)}, ou seja ${nf(Math.max(0, r.needed ?? 0))} por ponto de peso.` : ""}` : "";
  const ex = r.exam;
  const exTxt = ex && ex.need != null ? (ex.eligible === false
    ? <>Média {nf(ex.base)} fica abaixo de {nf(ex.minTake)}, o mínimo configurado para fazer exame.</>
    : <>Com média {nf(ex.base)}{r.final == null ? ` (cenário ${SN[sc]})` : ""}, o exame precisaria de <b className="num">{nf(Math.max(0, ex.need))}</b> para final {nf(ex.mf)} (final = ({nf(ex.wa, 0)}×média + {nf(ex.we, 0)}×exame) ÷ {nf(ex.wa + ex.we, 0)}).{ex.need > 10 ? " Acima de 10: não alcançável." : ""}</>) : null;

  const addItem = () => st.save("assessments", { id: crypto.randomUUID(), subject_id: s.id, name: `Avaliação ${items.length + 1}`, kind: "prova", date: null, time: null, weight: 1, grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "" });
  const fillNeeded = () => {
    const v = Math.round((r.needed ?? 0) * 10) / 10;
    st.saveMany("assessments", items.filter((i) => i.grade == null).map((i) => ({ ...i, [simKey(sc)]: v })));
  };

  return (
    <section className="panel">
      <div className="panel-h">
        <div className="row" style={{ gap: 8 }}><Dot c={s.color} /><h2>{s.name}</h2></div>
        <label className="row small" style={{ gap: 6 }}>Média mínima
          <Cell value={show(s.min_avg)} label="Média mínima" style={{ width: 72 }} onSave={(v) => { const n = parseNum(v); if (n == null || n < 0 || n > 10) { st.toast("A média mínima deve estar entre 0 e 10."); return false; } return setSub({ min_avg: n }); }} />
        </label>
      </div>
      {items.length > 0 && (
        <div className="tbl-wrap"><table>
          <thead><tr><th>Avaliação</th><th>Data</th><th className="n">Peso</th><th className="n">Previsão</th><th className="n">Nota</th><th className="n">Simulação</th><th /></tr></thead>
          <tbody>{items.map((a) => (
            <tr key={a.id}>
              <td><Cell wide value={a.name} label="Nome da avaliação" onSave={(v) => (v.trim() ? setItem(a, { name: v.trim() }) : false)} /></td>
              <td><Cell type="date" value={a.date || ""} label="Data" style={{ maxWidth: 150, textAlign: "left" }} onSave={(v) => setItem(a, { date: v || null })} /></td>
              <td className="n"><Cell value={show(a.weight)} label="Peso" style={{ maxWidth: 62 }} onSave={(v) => { const n = parseNum(v); if (n == null || n <= 0) { st.toast("O peso precisa ser maior que zero."); return false; } return setItem(a, { weight: n }); }} /></td>
              <td className="n"><Cell value={show(a.predicted)} label="Previsão" placeholder="–" onSave={(v) => { const g = grade(v); return g === false ? false : setItem(a, { predicted: g }); }} /></td>
              <td className="n"><Cell value={show(a.grade)} label="Nota oficial" placeholder="–" style={{ fontWeight: 600 }} onSave={(v) => { const g = grade(v); return g === false ? false : setItem(a, { grade: g, status: g != null ? "concluido" : "pendente" }); }} /></td>
              <td className="n">{a.grade != null ? <span className="muted small">lançada</span> : <Cell value={show(a[simKey(sc)])} label={`Nota simulada (${SN[sc]})`} placeholder="–" onSave={(v) => { const g = grade(v); return g === false ? false : setItem(a, { [simKey(sc)]: g }); }} />}</td>
              <td><ConfirmButton small label={<Icon d={I.trash} s={15} />} confirmLabel="Remover" onConfirm={() => st.remove("assessments", a.id)} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={addItem}><Icon d={I.plus} s={14} />Adicionar avaliação</button>
        {r.nRem > 0 && r.needed != null && r.needed > 0 && r.needed <= 10 && <button className="btn sm ghost" onClick={fillNeeded}>Preencher simulação com {nf(r.needed)}</button>}
      </div>
      {r.nItems > 0 && (
        <>
          <div className="grid g4" style={{ marginTop: 16, gap: 12 }}>
            <div className="kpi"><span className="lbl">Média das lançadas</span><span className="v" style={{ fontSize: "1.35rem" }}>{r.partial == null ? "–" : nf(r.partial)}</span><span className="s">peso {nf(r.Wk, 0)} de {nf(r.W, 0)} lançado</span></div>
            {(["c", "e", "o"] as Scenario[]).map((k) => (
              <div key={k} className="kpi"><span className="lbl">Projeção {SN[k]}</span>
                <span className="v" style={{ fontSize: "1.35rem", color: r.proj[k] == null ? "var(--muted)" : r.proj[k]! >= r.min ? "var(--ok)" : "var(--bad)" }}>{r.proj[k] == null ? "–" : nf(r.proj[k])}</span>
                <span className="s">{r.proj[k] == null ? (r.nRem ? "preencha a simulação" : "sem pendências") : r.proj[k]! >= r.min ? "acima da mínima" : "abaixo da mínima"}</span></div>
            ))}
          </div>
          <div className="stack" style={{ marginTop: 14, gap: 6 }}><div>{verdict}</div><div className="small muted">{explain}</div></div>
        </>
      )}
      <details style={{ marginTop: 12 }} open={s.exam_enabled}>
        <summary className="small">Exame final ou recuperação</summary>
        <div className="row" style={{ marginTop: 10, gap: 14 }}>
          <label className="check"><input type="checkbox" checked={s.exam_enabled} onChange={(e) => setSub({ exam_enabled: e.target.checked })} />Esta disciplina tem exame</label>
          <label className="row small" style={{ gap: 6 }}>Peso da média <Cell value={show(s.exam_w_avg)} label="Peso da média" style={{ width: 60 }} onSave={(v) => { const n = parseNum(v); if (!n || n <= 0) return false; return setSub({ exam_w_avg: n }); }} /></label>
          <label className="row small" style={{ gap: 6 }}>Peso do exame <Cell value={show(s.exam_w_exam)} label="Peso do exame" style={{ width: 60 }} onSave={(v) => { const n = parseNum(v); if (!n || n <= 0) return false; return setSub({ exam_w_exam: n }); }} /></label>
          <label className="row small" style={{ gap: 6 }}>Final mínima <Cell value={show(s.exam_min_final)} label="Final mínima" style={{ width: 60 }} onSave={(v) => { const g = grade(v); if (g === false || g == null) return false; return setSub({ exam_min_final: g }); }} /></label>
          <label className="row small" style={{ gap: 6 }}>Média mínima para fazer exame <Cell value={show(s.exam_min_take)} label="Média mínima para fazer exame" placeholder="–" style={{ width: 60 }} onSave={(v) => { const g = grade(v); return g === false ? false : setSub({ exam_min_take: g }); }} /></label>
        </div>
        <p className="small muted" style={{ margin: "8px 0 0" }}>Confira as regras no regimento do seu curso; cada universidade usa pesos diferentes.</p>
        {exTxt && <div className="callout" style={{ marginTop: 10 }}>{exTxt}</div>}
      </details>
    </section>
  );
}

export default function Notas() {
  const st = useStore();
  const [sc, setSc] = useState<Scenario>("e");
  const list = activeSubjects(st.subjects);
  if (!list.length) return <Empty title="Nenhuma disciplina cadastrada">Cadastre uma disciplina para lançar avaliações e simular médias.<Link className="btn pri sm" href="/disciplinas"><Icon d={I.plus} s={14} />Ir para disciplinas</Link></Empty>;
  const calib = st.assessments.filter((a) => a.predicted != null && a.grade != null && list.some((s) => s.id === a.subject_id))
    .map((a) => ({ a, s: list.find((s) => s.id === a.subject_id)!, d: Number(a.grade) - Number(a.predicted) }));
  return (
    <>
      <div className="callout info"><b>Como a média é calculada:</b> média ponderada, Σ(peso × nota) ÷ Σ(pesos), na escala de 0 a 10. Cada disciplina tem sua própria média mínima e regra de exame, editáveis no cartão. A coluna <b>Previsão</b> é a nota que você acha que vai tirar, registrada antes da prova; ela serve para comparar com a nota real.</div>
      <div className="row between"><span className="lbl">Cenário em edição na coluna Simulação</span><Tabs value={sc} onChange={setSc} label="Cenário de simulação" options={[["c", "Conservador"], ["e", "Esperado"], ["o", "Otimista"]]} /></div>
      {list.map((s) => <GradeCard key={s.id} s={s} sc={sc} />)}
      <section className="panel">
        <div className="panel-h"><h2>Previsão × nota real</h2><span className="lbl">{calib.length} avaliação(ões)</span></div>
        {calib.length ? (
          <>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Avaliação</th><th className="n">Previsão</th><th className="n">Nota</th><th className="n">Diferença</th></tr></thead>
              <tbody>{calib.map(({ a, s, d }) => (
                <tr key={a.id}><td>{s.name} · {a.name}</td><td className="n">{nf(a.predicted)}</td><td className="n">{nf(a.grade)}</td>
                  <td className="n" style={{ color: Math.abs(d) < 0.5 ? "var(--muted)" : d > 0 ? "var(--ok)" : "var(--bad)" }}>{d > 0 ? "+" : ""}{nf(d)}</td></tr>
              ))}</tbody>
            </table></div>
            <p className="small muted" style={{ margin: "10px 0 0" }}>Média da diferença: {nf(calib.reduce((x, c) => x + c.d, 0) / calib.length)} ponto(s). Valor negativo indica que você costuma esperar mais do que tira.</p>
          </>
        ) : <p className="muted small" style={{ margin: 0 }}>Preencha a previsão antes de cada prova e a nota quando sair. A comparação aparece aqui.</p>}
      </section>
    </>
  );
}
