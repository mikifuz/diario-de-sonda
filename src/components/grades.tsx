"use client";
// Notas de uma disciplina em formato enxuto (uma linha por avaliação) e o resumo usado
// na visão geral de Disciplinas. Os cálculos ficam em calc.ts (gradeCalc).
import { useState } from "react";
import { useStore } from "@/lib/store";
import { gradeCalc, nf, parseNum, type GradeResult } from "@/lib/calc";
import { RECOVERY } from "@/lib/constants";
import type { Assessment, Recovery, Scenario, Subject } from "@/lib/types";
import { ConfirmButton, I, Icon, Tabs } from "./ui";

const SN: Record<Scenario, string> = { c: "conservador", e: "esperado", o: "otimista" };
const simKey = (k: Scenario) => (k === "c" ? "sim_c" : k === "e" ? "sim_e" : "sim_o") as "sim_c" | "sim_e" | "sim_o";
const show = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
const dm = (k: string | null) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}` : "");

/** Campo que salva ao sair (blur) ou Enter; volta ao valor salvo se inválido */
function Cell({ value, onSave, label, wide, type = "text", placeholder, style }: { value: string; onSave: (v: string) => Promise<boolean> | boolean | void; label: string; wide?: boolean; type?: string; placeholder?: string; style?: React.CSSProperties }) {
  return (
    <input key={value} type={type} inputMode={type === "text" && !wide ? "decimal" : undefined} defaultValue={value} aria-label={label} placeholder={placeholder}
      className={wide ? "wide" : undefined} style={style}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onBlur={async (e) => { const v = e.target.value; if (v === value) return; const ok = await onSave(v); if (ok === false) e.target.value = value; }} />
  );
}

export const sortItems = (items: Assessment[]) => [...items].sort((a, b) =>
  Number(a.kind === "sub") - Number(b.kind === "sub") || (a.date || "9999").localeCompare(b.date || "9999") || a.name.localeCompare(b.name, "pt-BR"));

/** Situação da disciplina em uma frase curta, com cor */
export function verdict(r: GradeResult): { t: string; c: string } {
  if (!r.nItems) return { t: "sem avaliações cadastradas", c: "var(--muted)" };
  if (r.sub?.official && r.sub.final != null && r.sub.replaced) return r.sub.final >= r.min ? { t: `aprovado com a SUB (${nf(r.sub.final)})`, c: "var(--ok)" } : { t: `abaixo da mínima mesmo com a SUB (${nf(r.sub.final)})`, c: "var(--bad)" };
  if (r.final != null) return r.final >= r.min ? { t: `aprovado (${nf(r.final)})`, c: "var(--ok)" } : { t: `abaixo da mínima (${nf(r.final)})`, c: "var(--bad)" };
  if ((r.needed ?? 0) <= 0) return { t: "mínima já garantida", c: "var(--ok)" };
  if ((r.needed ?? 0) > r.max) return { t: `precisaria de ${nf(r.needed)} nas restantes (acima de 10)`, c: "var(--bad)" };
  return { t: `precisa de ${nf(r.needed)} nas restantes`, c: (r.needed ?? 0) > 8 ? "var(--warn)" : "var(--fg)" };
}

/** Frase da SUB: qual prova substitui e quanto precisa */
export function subLine(r: GradeResult, sc?: Scenario): string | null {
  const sb = r.sub;
  if (!sb) return null;
  if (!sb.target) return "A SUB substitui a menor nota entre as provas; lance as notas das provas para ver qual seria.";
  if (sb.base == null) return `A SUB substituiria a prova de menor nota; faltam notas${sc ? ` (ou a simulação do cenário ${SN[sc]})` : ""} para calcular quanto precisa.`;
  let t = `Substituiria ${sb.target.name} (${nf(sb.target.value)}). `;
  t += sb.need == null ? "A média já atinge a mínima sem ela." : sb.need > 10 ? "Mesmo com 10 na SUB não chega à mínima." : `Precisa de ${nf(Math.max(0, sb.need))} na SUB.`;
  if (sb.value != null && sb.final != null) t += ` Com ${nf(sb.value)}${sb.official ? "" : " (simulada)"}: ${sb.replaced ? `média ${nf(sb.final)}` : "não substitui (não é maior)"}.`;
  return t;
}

export function GradesPanel({ s }: { s: Subject }) {
  const st = useStore();
  const [sc, setSc] = useState<Scenario>("e");
  const [showPred, setShowPred] = useState(false);
  const items = sortItems(st.assessments.filter((a) => a.subject_id === s.id));
  const r = gradeCalc(s, items, sc);
  const v = verdict(r);
  const sl = subLine(r, sc);
  const grade = (x: string): number | null | false => { const n = parseNum(x); if (n != null && (n < 0 || n > 10)) { st.toast("Use notas entre 0 e 10."); return false; } return n; };
  const setItem = async (a: Assessment, patch: Partial<Assessment>) => st.save("assessments", { ...a, ...patch });
  const setSub = async (patch: Partial<Subject>) => st.save("subjects", { ...s, ...patch });
  const blank = (p: Partial<Assessment>): Assessment => ({ id: crypto.randomUUID(), subject_id: s.id, name: "", kind: "prova", date: null, time: null, weight: 1, grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", ...p });
  const nProvas = items.filter((i) => i.kind !== "sub").length;
  const hasSub = items.some((i) => i.kind === "sub");
  const ex = r.exam;
  const projV = r.proj[sc];

  return (
    <section className="panel" id="notas">
      <div className="panel-h">
        <h2>Notas</h2>
        <span className="row small" style={{ gap: 6 }}>Simulação <Tabs value={sc} onChange={setSc} label="Cenário da simulação" options={[["c", "Conservadora"], ["e", "Esperada"], ["o", "Otimista"]]} /></span>
      </div>
      {items.length > 0 ? (
        <div className="tbl-wrap"><table className="grades">
          <thead><tr><th>Avaliação</th><th className="hide-m">Data</th><th className="n">Peso</th>{showPred && <th className="n" title="Nota que você esperava, anotada antes da prova">Previsão</th>}<th className="n">Nota</th><th className="n">Simul.</th><th /></tr></thead>
          <tbody>{items.map((a) => (
            <tr key={a.id}>
              <td><Cell wide value={a.name} label="Nome da avaliação" style={{ minWidth: 70 }} onSave={(x) => (x.trim() ? setItem(a, { name: x.trim() }) : false)} /><div className="show-m" style={{ marginTop: 3 }}><Cell type="date" value={a.date || ""} label="Data" style={{ maxWidth: 140, textAlign: "left", fontSize: ".8em", padding: "2px 4px" }} onSave={(x) => setItem(a, { date: x || null })} /></div></td>
              <td className="hide-m"><Cell type="date" value={a.date || ""} label="Data" style={{ maxWidth: 140, textAlign: "left" }} onSave={(x) => setItem(a, { date: x || null })} /></td>
              <td className="n">{a.kind === "sub" ? <span className="chip acc" title="A SUB não tem peso: substitui a menor nota de prova">SUB</span>
                : <Cell value={show(a.weight)} label="Peso" style={{ maxWidth: 52 }} onSave={(x) => { const n = parseNum(x); if (n == null || n <= 0) { st.toast("O peso precisa ser maior que zero."); return false; } return setItem(a, { weight: n }); }} />}</td>
              {showPred && <td className="n"><Cell value={show(a.predicted)} label="Previsão" placeholder="–" style={{ maxWidth: 58 }} onSave={(x) => { const g = grade(x); return g === false ? false : setItem(a, { predicted: g }); }} /></td>}
              <td className="n"><Cell value={show(a.grade)} label="Nota oficial" placeholder="–" style={{ maxWidth: 58, fontWeight: 600 }} onSave={(x) => { const g = grade(x); return g === false ? false : setItem(a, { grade: g, status: g != null ? "concluido" : "pendente" }); }} /></td>
              <td className="n">{a.grade != null ? <span className="muted small">–</span> : <Cell value={show(a[simKey(sc)])} label={`Nota simulada (${SN[sc]})`} placeholder="–" style={{ maxWidth: 58, fontStyle: "italic" }} onSave={(x) => { const g = grade(x); return g === false ? false : setItem(a, { [simKey(sc)]: g }); }} />}</td>
              <td><ConfirmButton small label={<Icon d={I.trash} s={14} />} confirmLabel="Remover" onConfirm={() => st.remove("assessments", a.id)} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="small muted" style={{ margin: 0 }}>Nenhuma avaliação ainda. Adicione as provas e trabalhos com o peso de cada um.</p>}

      <div className="row" style={{ marginTop: 10, gap: 6 }}>
        <button className="btn sm" onClick={() => st.save("assessments", blank({ name: `P${nProvas + 1}` }))}><Icon d={I.plus} s={14} />Avaliação</button>
        {s.recovery === "sub" && !hasSub && <button className="btn sm" onClick={() => st.save("assessments", blank({ name: "SUB", kind: "sub" }))}><Icon d={I.plus} s={14} />SUB</button>}
        {r.nRem > 0 && r.needed != null && r.needed > 0 && r.needed <= 10 && (
          <button className="btn sm ghost" onClick={() => { const n = Math.round((r.needed ?? 0) * 10) / 10; st.saveMany("assessments", items.filter((i) => i.grade == null && i.kind !== "sub").map((i) => ({ ...i, [simKey(sc)]: n }))); }}>Simular {nf(r.needed)} nas restantes</button>
        )}
        <button className="btn sm ghost" aria-pressed={showPred} onClick={() => setShowPred(!showPred)}>{showPred ? "Esconder previsão" : "Previsão"}</button>
      </div>

      {r.nItems > 0 && (
        <div className="stack small" style={{ marginTop: 12, gap: 4 }}>
          <div>
            Média atual <b className="num">{r.partial == null ? "–" : nf(r.partial)}</b> <span className="muted">(peso {nf(r.Wk, 0)} de {nf(r.W, 0)} lançado)</span>
            {" · "}<span style={{ color: v.c }}>{v.t}</span>
            {projV != null && r.nRem > 0 && <> · projeção {SN[sc]} <b className="num" style={{ color: projV >= r.min ? "var(--ok)" : "var(--bad)" }}>{nf(projV)}</b></>}
          </div>
          {sl && <div><span className="chip acc">SUB</span> {sl}</div>}
          {ex && ex.need != null && <div>Exame: {ex.eligible === false ? `média ${nf(ex.base)} abaixo do mínimo para fazer exame (${nf(ex.minTake)}).` : `precisaria de ${nf(Math.max(0, ex.need))} no exame${ex.need > 10 ? " (não alcançável)" : ""}.`}</div>}
          <span className="muted">Simulação é estimativa e não entra na média atual. Média = Σ(peso × nota) ÷ Σ(pesos).</span>
        </div>
      )}

      <details style={{ marginTop: 10 }}>
        <summary className="small">Regras de média desta disciplina · mínima {nf(r.min)} · {RECOVERY[s.recovery].toLowerCase()}</summary>
        <div className="stack small" style={{ marginTop: 10, gap: 10 }}>
          <div className="row" style={{ gap: 14 }}>
            <label className="row" style={{ gap: 6 }}>Média mínima <Cell value={show(s.min_avg)} label="Média mínima" style={{ width: 60 }} onSave={(x) => { const n = parseNum(x); if (n == null || n < 0 || n > 10) { st.toast("A média mínima deve estar entre 0 e 10."); return false; } return setSub({ min_avg: n }); }} /></label>
            <label className="row" style={{ gap: 6 }}>Recuperação
              <select value={s.recovery} onChange={(e) => { const x = e.target.value as Recovery; setSub({ recovery: x, exam_enabled: x === "exame" }); }} style={{ width: "auto" }}>{Object.entries(RECOVERY).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          </div>
          {s.recovery === "sub" && <label className="check"><input type="checkbox" checked={s.sub_replace_lower} onChange={(e) => setSub({ sub_replace_lower: e.target.checked })} />A SUB substitui a nota mesmo se for menor (depende do professor)</label>}
          {s.recovery === "exame" && (
            <div className="row" style={{ gap: 14 }}>
              <label className="row" style={{ gap: 6 }}>Peso da média <Cell value={show(s.exam_w_avg)} label="Peso da média" style={{ width: 56 }} onSave={(x) => { const n = parseNum(x); if (!n || n <= 0) return false; return setSub({ exam_w_avg: n }); }} /></label>
              <label className="row" style={{ gap: 6 }}>Peso do exame <Cell value={show(s.exam_w_exam)} label="Peso do exame" style={{ width: 56 }} onSave={(x) => { const n = parseNum(x); if (!n || n <= 0) return false; return setSub({ exam_w_exam: n }); }} /></label>
              <label className="row" style={{ gap: 6 }}>Final mínima <Cell value={show(s.exam_min_final)} label="Final mínima" style={{ width: 56 }} onSave={(x) => { const g = grade(x); if (g === false || g == null) return false; return setSub({ exam_min_final: g }); }} /></label>
              <label className="row" style={{ gap: 6 }}>Mínima para fazer exame <Cell value={show(s.exam_min_take)} label="Média mínima para fazer exame" placeholder="–" style={{ width: 56 }} onSave={(x) => { const g = grade(x); return g === false ? false : setSub({ exam_min_take: g }); }} /></label>
            </div>
          )}
          <span className="muted">A SUB substitui a menor nota entre as provas (trabalhos não entram). Confira as regras com o professor; cada disciplina pode ter uma regra diferente.</span>
        </div>
      </details>
    </section>
  );
}

/** Previsão × nota real em todas as disciplinas */
export function Calibration({ subjects }: { subjects: Subject[] }) {
  const st = useStore();
  const calib = st.assessments.filter((a) => a.predicted != null && a.grade != null && subjects.some((s) => s.id === a.subject_id))
    .map((a) => ({ a, s: subjects.find((s) => s.id === a.subject_id)!, d: Number(a.grade) - Number(a.predicted) }));
  if (!calib.length) return <p className="small muted" style={{ margin: 0 }}>Anote a previsão antes de cada prova (botão &quot;Previsão&quot; nas notas da disciplina) e a nota quando sair. A comparação aparece aqui.</p>;
  return (
    <>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Avaliação</th><th className="n">Previsão</th><th className="n">Nota</th><th className="n">Diferença</th></tr></thead>
        <tbody>{calib.map(({ a, s, d }) => (
          <tr key={a.id}><td>{s.name} · {a.name}{a.date ? ` · ${dm(a.date)}` : ""}</td><td className="n">{nf(a.predicted)}</td><td className="n">{nf(a.grade)}</td>
            <td className="n" style={{ color: Math.abs(d) < 0.5 ? "var(--muted)" : d > 0 ? "var(--ok)" : "var(--bad)" }}>{d > 0 ? "+" : ""}{nf(d)}</td></tr>
        ))}</tbody>
      </table></div>
      <p className="small muted" style={{ margin: "10px 0 0" }}>Média da diferença: {nf(calib.reduce((x, c) => x + c.d, 0) / calib.length)} ponto(s). Valor negativo indica que você costuma esperar mais do que tira.</p>
    </>
  );
}
