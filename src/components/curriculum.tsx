"use client";
// Meu curso: fluxograma interativo da matriz, detalhes de cada disciplina, edição e montagem inicial.
import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import { gradeCalc, nf, parseNum, qt } from "@/lib/calc";
import { HEAVY, STATUS_NAME, TEMPLATES, courseState, effective, fillSlots, forecast, fromTemplate, matchSubject, requiresAll, summary, unlocksAll, type CourseState, type Forecast, type State } from "@/lib/curriculum";
import type { Course, CourseKind, CourseStatus, Prereq } from "@/lib/types";
import { ConfirmButton, I, Icon, Modal } from "./ui";

export const STATE_NAME: Record<State, string> = { aprovada: "Aprovada", cursando: "Cursando", reprovada: "Reprovada", liberada: "Liberada", bloqueada: "Bloqueada" };
const STATE_ICON: Record<State, string> = { aprovada: "✓", cursando: "▶", reprovada: "✕", liberada: "○", bloqueada: "🔒" };
export const KIND_NAME: Record<CourseKind, string> = { obrigatoria: "Obrigatória", vaga: "Vaga de optativa", optativa: "Optativa (catálogo)", estagio: "Estágio", tcc: "TCC", extensao: "Extensão", complementar: "Atividades complementares" };
const PH = (n: number) => `${n}ª fase`;

/* ============ Fluxograma ============ */
interface Line { key: string; d: string; from: string; to: string; co: boolean }

export function Flowchart({ sel, onSel }: { sel: string | null; onSel: (id: string | null) => void }) {
  const st = useStore();
  const courses = st.courses;
  const slots = useMemo(() => fillSlots(courses), [courses]);
  const states = useMemo(() => new Map(courses.map((c) => [c.id, courseState(c, courses, slots)])), [courses, slots]);
  const grid = courses.filter((c) => c.phase != null && c.kind !== "optativa");
  const maxPhase = Math.max(0, ...grid.map((c) => c.phase!));
  const cols = Array.from({ length: maxPhase }, (_, i) => grid.filter((c) => c.phase === i + 1).sort((a, b) => a.position - b.position));
  const inner = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const [lines, setLines] = useState<Line[]>([]);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const out: Line[] = [];
      for (const c of grid) for (const p of c.prereqs) {
        const a = cards.current.get(p.id), b = cards.current.get(c.id);
        if (!a || !b) continue;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const y1 = ra.top + ra.height / 2 - box.top, y2 = rb.top + rb.height / 2 - box.top;
        let d: string;
        if (ra.left >= rb.left - 4) {
          // mesma fase (correquisito): curva pela esquerda
          const x = ra.left - box.left, x2 = rb.left - box.left;
          d = `M${x} ${y1} C${x - 22} ${y1}, ${x2 - 22} ${y2}, ${x2} ${y2}`;
        } else {
          const x1 = ra.right - box.left, x2 = rb.left - box.left, k = Math.min(60, (x2 - x1) / 2);
          d = `M${x1} ${y1} C${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`;
        }
        out.push({ key: `${p.id}-${c.id}`, d, from: p.id, to: c.id, co: !!p.co });
      }
      setLines(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [courses]); // eslint-disable-line react-hooks/exhaustive-deps

  const req = useMemo(() => (sel ? requiresAll(sel, courses) : new Set<string>()), [sel, courses]);
  const lib = useMemo(() => (sel ? unlocksAll(sel, courses) : new Set<string>()), [sel, courses]);
  const tone = (id: string) => (!sel ? "" : id === sel ? " sel" : req.has(id) ? " req" : lib.has(id) ? " lib" : " dim");
  const lineTone = (l: Line) => {
    if (!sel) return "";
    if ((l.to === sel || req.has(l.to)) && (req.has(l.from) || l.from === sel)) return " req";
    if ((l.from === sel || lib.has(l.from)) && lib.has(l.to)) return " lib";
    return " dim";
  };

  if (!grid.length) return null;
  return (
    <div className="flow" role="region" aria-label="Fluxograma do curso" onClick={(e) => { if (e.target === e.currentTarget) onSel(null); }}>
      <div className="flow-in" ref={inner}>
        <svg className="flow-svg" aria-hidden="true">
          {lines.map((l) => <path key={l.key} d={l.d} className={"fl" + (l.co ? " co" : "") + lineTone(l)} />)}
        </svg>
        {cols.map((col, i) => (
          <div key={i} className="flow-col">
            <div className="flow-h">{PH(i + 1)}</div>
            {col.map((c) => {
              const s = states.get(c.id)!;
              const fill = c.kind === "vaga" ? slots.get(c.id) : null;
              return (
                <button key={c.id} type="button" ref={(b) => { if (b) cards.current.set(c.id, b); else cards.current.delete(c.id); }}
                  className={`fcard st-${s.state}${tone(c.id)}`} aria-pressed={sel === c.id} onClick={() => onSel(sel === c.id ? null : c.id)}
                  title={`${c.name}: ${STATE_NAME[s.state]}. ${s.why}`}>
                  <span className="fn">{c.name}{fill ? <small> · {fill.name}</small> : null}</span>
                  <span className="fm"><span aria-hidden="true">{STATE_ICON[s.state]}</span> {STATE_NAME[s.state]} · {c.credits} cr</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <div className="row small" style={{ gap: 10 }}>
      {(["aprovada", "cursando", "liberada", "bloqueada", "reprovada"] as State[]).map((s) => <span key={s} className={`fleg st-${s}`}><i />{STATE_NAME[s]}</span>)}
      <span className="fleg"><svg width="26" height="8" aria-hidden="true"><path d="M1 4h24" className="fl co" /></svg>correquisito (junto)</span>
    </div>
  );
}

/* ============ Detalhes de uma disciplina ============ */
export function CourseDetail({ id, onClose, onEdit, onSel }: { id: string; onClose: () => void; onEdit: () => void; onSel: (id: string) => void }) {
  const st = useStore();
  const c0 = st.courses.find((c) => c.id === id);
  if (!c0) return null;
  const slots = fillSlots(st.courses);
  const c = effective(c0, slots);
  const s = courseState(c0, st.courses, slots);
  const byId = new Map(st.courses.map((x) => [x.id, x]));
  const direct = st.courses.filter((x) => x.prereqs.some((p) => p.id === c0.id));
  const allLib = unlocksAll(c0.id, st.courses);
  const subj = matchSubject(c0, st.subjects);
  const gc = subj ? gradeCalc(subj, st.assessments.filter((a) => a.subject_id === subj.id)) : null;
  const fill = c0.kind === "vaga" ? slots.get(c0.id) : null;
  const set = (patch: Partial<Course>) => st.save("curriculum", { ...c0, ...patch });

  return (
    <section className="panel" aria-label={`Detalhes de ${c0.name}`}>
      <div className="panel-h">
        <div><span className="lbl">{c0.phase ? PH(c0.phase) : KIND_NAME[c0.kind]} · {qt(c0.credits, "crédito", "créditos")}</span><h2 style={{ marginTop: 2 }}>{c0.name}</h2></div>
        <span className="row" style={{ gap: 6 }}><button className="btn sm" onClick={onEdit}><Icon d={I.edit} s={14} />Editar</button><button className="btn sm ghost" onClick={onClose} aria-label="Fechar detalhes">✕</button></span>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <p className="small" style={{ margin: 0 }}><span className={`chip ${chipOf(s.state)}`}>{STATE_NAME[s.state]}</span> {s.why}</p>
        {c0.kind === "vaga" ? (
          <p className="small muted" style={{ margin: 0 }}>{fill ? `Preenchida por ${fill.name}.` : "Ainda vazia: marque uma optativa como cursando ou aprovada no quadro de optativas e ela ocupa esta vaga."}</p>
        ) : (
          <div className="fgrid">
            <label className="f"><span>Situação</span>
              <select value={c.status} onChange={(e) => set({ status: e.target.value as CourseStatus })}>{(Object.keys(STATUS_NAME) as CourseStatus[]).map((k) => <option key={k} value={k}>{STATUS_NAME[k]}</option>)}</select></label>
            {(c.status === "aprovada" || c.status === "reprovada") && <>
              <GradeField c={c0} />
              <label className="f"><span>Semestre</span><input type="text" defaultValue={c0.term} placeholder="Ex.: 2025/2" maxLength={20} onBlur={(e) => { if (e.target.value.trim() !== c0.term) set({ term: e.target.value.trim() }); }} /></label>
            </>}
          </div>
        )}
        {subj && <p className="small" style={{ margin: 0 }}>No app: <Link href={`/disciplinas/${subj.id}`}>{subj.name}</Link>{gc?.partial != null ? ` · média atual ${nf(gc.partial)}` : ""}{c.status === "cursando" ? " · quando terminar, marque aqui como aprovada (ou reprovada)." : ""}</p>}
        <div className="grid g2" style={{ gap: 12 }}>
          <div>
            <b className="small">Exige</b>
            {c0.prereqs.length || c0.min_pct ? (
              <ul className="plain small">
                {c0.prereqs.map((p) => { const r = byId.get(p.id); if (!r) return null; const rs = courseState(r, st.courses, slots);
                  return <li key={p.id}><button className="linkish" onClick={() => onSel(r.id)}>{r.name}</button>{p.co ? " (correquisito: pode ser junto)" : ""} — <span className={`t-${rs.state}`}>{STATE_NAME[rs.state].toLowerCase()}</span></li>; })}
                {c0.min_pct && c0.min_phase ? <li>{c0.min_pct}% dos créditos das fases 1 a {c0.min_phase}</li> : null}
              </ul>
            ) : <p className="small muted" style={{ margin: "4px 0 0" }}>Nenhum pré-requisito na matriz.</p>}
          </div>
          <div>
            <b className="small">Libera</b>
            {direct.length ? (
              <ul className="plain small">
                {direct.map((r) => <li key={r.id}><button className="linkish" onClick={() => onSel(r.id)}>{r.name}</button>{r.prereqs.find((p) => p.id === c0.id)?.co ? " (junto)" : ""}</li>)}
                {allLib.size > direct.length && <li className="muted">e, em cadeia, mais {qt(allLib.size - direct.length, "disciplina", "disciplinas")}</li>}
              </ul>
            ) : <p className="small muted" style={{ margin: "4px 0 0" }}>Nenhuma disciplina depende dela.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function GradeField({ c }: { c: Course }) {
  const st = useStore();
  const [v, setV] = useState(c.grade != null ? String(c.grade).replace(".", ",") : "");
  const save = () => {
    const n = v.trim() ? parseNum(v) : null;
    if (n != null && (n < 0 || n > 10)) { st.toast("A nota deve estar entre 0 e 10."); return; }
    if (n !== c.grade) st.save("curriculum", { ...c, grade: n });
  };
  return <label className="f"><span>Nota final (opcional)</span><input type="text" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onBlur={save} placeholder="Ex.: 7,5" /></label>;
}

export const chipOf = (s: State) => ({ aprovada: "ok", cursando: "acc", liberada: "warn", bloqueada: "", reprovada: "bad" })[s];

/* ============ Lista de optativas e outros ============ */
export function CourseList({ kinds, onSel }: { kinds: CourseKind[]; onSel: (id: string) => void }) {
  const st = useStore();
  const slots = fillSlots(st.courses);
  const list = st.courses.filter((c) => kinds.includes(c.kind) && c.phase == null).sort((a, b) => a.position - b.position);
  return (
    <div className="list">{list.map((c) => {
      const s: CourseState = courseState(c, st.courses, slots);
      return (
        <div key={c.id} className="li">
          <div className="grow"><button className="linkish t" onClick={() => onSel(c.id)}>{c.name}</button><div className="m">{qt(c.credits, "crédito", "créditos")}{s.state === "bloqueada" ? ` · ${s.why}` : ""}</div></div>
          <select aria-label={`Situação de ${c.name}`} style={{ width: "auto", flex: "none", maxWidth: "48%" }} value={c.status} onChange={(e) => st.save("curriculum", { ...c, status: e.target.value as CourseStatus })}>
            {(Object.keys(STATUS_NAME) as CourseStatus[]).map((k) => <option key={k} value={k}>{STATUS_NAME[k]}</option>)}
          </select>
        </div>
      );
    })}</div>
  );
}

/* ============ Editar / adicionar disciplina ============ */
export function CourseModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const st = useStore();
  const orig = id ? st.courses.find((c) => c.id === id) : null;
  const [f, setF] = useState(() => ({
    name: orig?.name || "", code: orig?.code || "", phase: orig ? (orig.phase ? String(orig.phase) : "") : "1", credits: String(orig?.credits ?? 4), kind: orig?.kind || "obrigatoria" as CourseKind,
    prereqs: orig?.prereqs || [] as Prereq[], rule: !!orig?.min_pct, pct: String(orig?.min_pct ?? 70), upTo: String(orig?.min_phase ?? Math.max(1, (orig?.phase ?? 2) - 1)), subject_id: orig?.subject_id || "",
  }));
  const up = (x: Partial<typeof f>) => setF({ ...f, ...x });
  const others = st.courses.filter((c) => c.id !== orig?.id && c.kind !== "vaga").sort((a, b) => (a.phase ?? 99) - (b.phase ?? 99) || a.position - b.position);
  const has = (cid: string) => f.prereqs.find((p) => p.id === cid);
  const toggle = (cid: string) => up({ prereqs: has(cid) ? f.prereqs.filter((p) => p.id !== cid) : [...f.prereqs, { id: cid }] });
  const toggleCo = (cid: string) => up({ prereqs: f.prereqs.map((p) => (p.id === cid ? { id: cid, ...(p.co ? {} : { co: true }) } : p)) });
  const [filter, setFilter] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { st.toast("Dê um nome à disciplina."); return; }
    const credits = parseNum(f.credits);
    if (credits == null || credits < 0 || credits > 60 || !Number.isInteger(credits)) { st.toast("Créditos: número inteiro de 0 a 60."); return; }
    const pct = parseNum(f.pct), upTo = parseNum(f.upTo);
    if (f.rule && (pct == null || pct < 1 || pct > 100 || upTo == null || upTo < 1 || upTo > 15)) { st.toast("Confira a regra de créditos (1 a 100% e fase de 1 a 15)."); return; }
    // evita ciclo: a disciplina não pode exigir algo que depende dela
    const lib = orig ? unlocksAll(orig.id, st.courses) : new Set<string>();
    const loop = f.prereqs.find((p) => lib.has(p.id));
    if (loop) { st.toast(`${st.courses.find((c) => c.id === loop.id)?.name} depende desta disciplina; não pode ser pré-requisito dela.`); return; }
    const row: Course = {
      id: orig?.id || crypto.randomUUID(), name: f.name.trim(), code: f.code.trim(), phase: f.phase ? Number(f.phase) : null, credits, kind: f.kind,
      prereqs: f.prereqs, min_pct: f.rule ? pct : null, min_phase: f.rule ? upTo : null,
      status: orig?.status || "pendente", grade: orig?.grade ?? null, term: orig?.term || "", subject_id: f.subject_id || null,
      position: orig?.position ?? Math.max(0, ...st.courses.map((c) => c.position)) + 1,
    };
    if (await st.save("curriculum", row)) { st.toast(orig ? "Disciplina atualizada." : "Disciplina adicionada à grade."); onClose(); }
  };
  const del = async () => {
    if (!orig) return;
    const deps = st.courses.filter((c) => c.prereqs.some((p) => p.id === orig.id)).map((c) => ({ ...c, prereqs: c.prereqs.filter((p) => p.id !== orig.id) }));
    if (deps.length && !(await st.saveMany("curriculum", deps))) return;
    if (await st.remove("curriculum", orig.id)) onClose();
  };
  const shown = others.filter((c) => !filter.trim() || c.name.toLowerCase().includes(filter.trim().toLowerCase()) || has(c.id));

  return (
    <Modal title={orig ? "Editar disciplina" : "Nova disciplina na grade"} sub="Meu curso" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="fgrid">
          <label className="f full"><span>Nome</span><input type="text" value={f.name} onChange={(e) => up({ name: e.target.value })} maxLength={200} /></label>
          <label className="f"><span>Fase</span><select value={f.phase} onChange={(e) => up({ phase: e.target.value })}><option value="">Fora das fases</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{PH(i + 1)}</option>)}</select></label>
          <label className="f"><span>Créditos</span><input type="text" inputMode="numeric" value={f.credits} onChange={(e) => up({ credits: e.target.value })} /></label>
          <label className="f"><span>Tipo</span><select value={f.kind} onChange={(e) => up({ kind: e.target.value as CourseKind })}>{(Object.keys(KIND_NAME) as CourseKind[]).map((k) => <option key={k} value={k}>{KIND_NAME[k]}</option>)}</select></label>
          <label className="f"><span>Código no SIGA (opcional)</span><input type="text" value={f.code} onChange={(e) => up({ code: e.target.value })} maxLength={40} /></label>
          <label className="f full"><span>Disciplina no app (opcional)</span><select value={f.subject_id} onChange={(e) => up({ subject_id: e.target.value })}><option value="">Nenhuma</option>{st.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <div className="f full">
            <span>Pré-requisitos</span>
            <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Procurar disciplina…" aria-label="Procurar pré-requisito" />
            <div className="prq">{shown.map((c) => (
              <div key={c.id} className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <label className="check grow"><input type="checkbox" checked={!!has(c.id)} onChange={() => toggle(c.id)} />{c.name}<span className="muted small">{c.phase ? ` · ${PH(c.phase)}` : ""}</span></label>
                {has(c.id) && <label className="check small" style={{ whiteSpace: "nowrap" }}><input type="checkbox" checked={!!has(c.id)?.co} onChange={() => toggleCo(c.id)} />junto</label>}
              </div>
            ))}</div>
            <span className="small">"Junto" = correquisito: pode ser cursado no mesmo semestre.</span>
          </div>
          <div className="f full">
            <label className="check"><input type="checkbox" checked={f.rule} onChange={(e) => up({ rule: e.target.checked })} />Exige uma parte dos créditos das fases anteriores</label>
            {f.rule && <span className="row small" style={{ gap: 6 }}><input type="text" inputMode="numeric" value={f.pct} onChange={(e) => up({ pct: e.target.value })} style={{ width: 60 }} aria-label="Porcentagem" />% dos créditos das fases 1 a
              <input type="text" inputMode="numeric" value={f.upTo} onChange={(e) => up({ upTo: e.target.value })} style={{ width: 50 }} aria-label="Até a fase" /></span>}
          </div>
        </div>
        <div className="modal-f">
          {orig && <span style={{ marginRight: "auto" }}><ConfirmButton label={<><Icon d={I.trash} s={15} />Excluir</>} question="Tirar esta disciplina da grade? Ela também sai dos pré-requisitos das outras." confirmLabel="Excluir" onConfirm={del} /></span>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn pri">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/* ============ Montar a grade ============ */
export function SetupGrade() {
  const st = useStore();
  const [tpl, setTpl] = useState<string>(TEMPLATES[0].id);
  const [phase, setPhase] = useState(() => {
    const m = /(\d+)/.exec(st.profile?.current_semester || "");
    return m && Number(m[1]) <= 10 ? Number(m[1]) : 1;
  });
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (tpl ? fromTemplate(phase, st.subjects) : []), [tpl, phase, st.subjects]);
  const cursando = preview.filter((c) => c.status === "cursando");
  const create = async () => {
    setBusy(true);
    const ok = await st.saveMany("curriculum", preview);
    setBusy(false);
    if (ok) st.toast("Grade montada. Toque numa disciplina para ver o que ela exige e o que libera.");
  };
  const t = TEMPLATES.find((x) => x.id === tpl);
  return (
    <section className="panel" style={{ padding: 24 }}>
      <div className="stack" style={{ gap: 14, maxWidth: 720 }}>
        <span className="lbl">Meu curso</span>
        <h2>Monte a grade do seu curso</h2>
        <p style={{ margin: 0 }}>Com a matriz, o diário mostra o fluxograma das disciplinas, o que cada uma exige e libera, o que você pode cursar no próximo semestre e quanto falta para formar.</p>
        <div className="fgrid">
          <label className="f full"><span>Matriz</span>
            <select value={tpl} onChange={(e) => setTpl(e.target.value)}>{TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}<option value="">Começar do zero (adicionar à mão)</option></select>
            {t && <span className="small">{t.note}</span>}</label>
          {tpl && <label className="f"><span>Em que fase você está agora?</span>
            <select value={phase} onChange={(e) => setPhase(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>{PH(i + 1)}</option>)}</select></label>}
        </div>
        {tpl && <p className="small" style={{ margin: 0 }}>
          {phase > 1 ? <>As disciplinas da 1ª {phase > 2 ? `à ${PH(phase - 1)}` : "fase"} entram como <b>aprovadas</b>. </> : null}
          {cursando.length ? <>Pelo nome, {qt(cursando.length, "disciplina sua", "disciplinas suas")} do app {cursando.length === 1 ? "entra" : "entram"} como <b>cursando</b>: {cursando.map((c) => c.name).join(", ")}. </> : null}
          Depois é só ajustar o que for diferente (reprovação, aproveitamento, disciplina adiantada).
        </p>}
        <div className="row">
          {tpl ? <button className="btn pri" onClick={create} disabled={busy}>{busy ? "Montando…" : "Montar minha grade"}</button>
            : <AddFirst />}
        </div>
      </div>
    </section>
  );
}

function AddFirst() {
  const [open, setOpen] = useState(false);
  return <><button className="btn pri" onClick={() => setOpen(true)}><Icon d={I.plus} s={14} />Adicionar a primeira disciplina</button>{open && <CourseModal id={null} onClose={() => setOpen(false)} />}</>;
}

/* ============ Previsão de formatura ============ */
function PlanCard({ f, title, open, onToggle }: { f: Forecast; title: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="kpi" style={{ border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 14 }}>
      <span className="lbl">{title}</span>
      <span className="v">{f.finish ?? "—"}</span>
      <span className="s">{f.terms.length ? `${qt(f.terms.length, "semestre", "semestres")}, de ${f.terms[0].term} a ${f.terms[f.terms.length - 1].term}` : "não falta nenhuma disciplina"}</span>
      <span className="small" style={{ marginTop: 4 }}>{f.heavy.length ? <>Puxados: {f.heavy.map((t) => `${t.term} (${t.credits} cr)`).join(", ")}</> : <span className="muted">Nenhum semestre acima de {HEAVY} créditos.</span>}</span>
      {f.terms.length > 0 && <button className="btn sm ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={onToggle} aria-expanded={open}>{open ? "Fechar" : "Ver semestre a semestre"}</button>}
    </div>
  );
}

function PlanTerms({ f }: { f: Forecast }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="list">{f.terms.map((t) => (
        <div key={t.term} className="li" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
          <div className="row" style={{ gap: 8 }}><b className="num">{t.term}</b><span className={"chip " + (t.heavy ? "warn" : "")}>{t.credits} cr{t.heavy ? " · puxado" : ""}</span></div>
          <div className="small">{t.items.length ? t.items.map((x) => x.name).join(" · ") : <span className="muted">sem disciplina (esperando a ordem da matriz)</span>}</div>
        </div>
      ))}</div>
      {f.notes.map((n) => <p key={n} className="small" style={{ margin: 0 }}>{n}</p>)}
      <p className="small muted" style={{ margin: 0 }}>{f.why}</p>
    </div>
  );
}

export function ForecastPanel() {
  const st = useStore();
  const [open, setOpen] = useState<"c" | "o" | null>(null);
  const { con, oti, chain } = useMemo(() => {
    const today = new Date();
    return { con: forecast(st.courses, today, "conservadora"), oti: forecast(st.courses, today, "otimista"), chain: summary(st.courses).chain };
  }, [st.courses]);
  const idx = (f: Forecast) => new Map(f.terms.flatMap((t, i) => t.items.map((it) => [it.id, i] as const)));
  const ci = idx(con), oi = idx(oti);
  const ahead = oti.terms.flatMap((t) => t.items).filter((it) => !/^Optativa/.test(it.name) && (oi.get(it.id) ?? 99) < (ci.get(it.id) ?? 99)).map((it) => it.name);
  const gain = con.stuck.length || oti.stuck.length ? 0 : con.terms.length - oti.terms.length;

  return (
    <section className="panel">
      <div className="panel-h"><h2>Previsão de formatura</h2><span className="lbl">sem reprovações</span></div>
      <div className="grid g2" style={{ gap: 12 }}>
        <PlanCard f={con} title="Conservadora · seguindo a grade" open={open === "c"} onToggle={() => setOpen(open === "c" ? null : "c")} />
        <PlanCard f={oti} title="Otimista · adiantando o que der" open={open === "o"} onToggle={() => setOpen(open === "o" ? null : "o")} />
      </div>
      <div className="callout" style={{ marginTop: 12 }}>
        {gain > 0 ? <>
          <b>Para formar em {oti.finish} em vez de {con.finish}</b> ({qt(gain, "semestre", "semestres")} antes), dá para adiantar {ahead.slice(0, 4).join(", ")}{ahead.length > 4 ? ` e mais ${ahead.length - 4}` : ""}
          {oti.heavy.length ? <>, encarando {oti.heavy.length === 1 ? "um semestre puxado" : `${oti.heavy.length} semestres puxados`} ({oti.heavy.map((t) => `${t.term}: ${t.credits} cr`).join(", ")})</> : null}
          {oti.together ? ", e fazer o estágio junto com as últimas disciplinas" : ""}.
        </> : con.terms.length ? <>
          <b>Adiantar não traz a formatura para antes de {con.finish}.</b>
        </> : <b>Você já cumpriu todas as disciplinas da matriz.</b>}
        {chain.length > 1 && <> Quem segura a data é a cadeia <b>{chain.join(" → ")}</b>: atrasar qualquer uma delas atrasa a formatura.</>}
      </div>
      {open === "c" && <div style={{ marginTop: 12 }}><h3 style={{ margin: "0 0 6px" }}>Conservadora</h3><PlanTerms f={con} /></div>}
      {open === "o" && <div style={{ marginTop: 12 }}><h3 style={{ margin: "0 0 6px" }}>Otimista</h3><PlanTerms f={oti} /></div>}
    </section>
  );
}

/* ============ Optativas ============ */
export function OptativesPanel({ onSel }: { onSel: (id: string) => void }) {
  const st = useStore();
  const [add, setAdd] = useState<string | null | undefined>(undefined);
  const slots = fillSlots(st.courses);
  const used = new Map([...slots.entries()].map(([vaga, o]) => [o.id, st.courses.find((c) => c.id === vaga)?.name ?? ""]));
  const opts = st.courses.filter((c) => c.kind === "optativa").sort((a, b) => a.position - b.position);
  const mine = opts.filter((c) => c.status !== "pendente");
  const catalog = opts.filter((c) => c.status === "pendente");
  const { optDone: got, optNeed: need } = summary(st.courses);
  return (
    <section className="panel">
      <div className="panel-h"><h2>Optativas</h2><span className="row" style={{ gap: 8 }}><span className="lbl">{got} de {need} créditos</span><button className="btn sm pri" onClick={() => setAdd(null)}><Icon d={I.plus} s={14} />Adicionar optativa</button></span></div>
      <p className="small muted" style={{ margin: "0 0 8px" }}>Podem ser feitas em qualquer fase, respeitando o pré-requisito de cada uma (e a oferta no SIGA). Cada optativa aprovada ou em curso ocupa uma vaga (Optativa I a IV) no fluxograma.</p>
      {mine.length ? <div className="list">{mine.map((c) => (
        <div key={c.id} className="li">
          <div className="grow"><button className="linkish t" onClick={() => onSel(c.id)}>{c.name}</button>
            <div className="m">{STATUS_NAME[c.status]}{c.term ? ` em ${c.term}` : ""}{c.grade != null ? ` · nota ${nf(c.grade)}` : ""} · {qt(c.credits, "crédito", "créditos")}{used.get(c.id) ? ` · ocupa a ${used.get(c.id)}` : ""}</div></div>
          <button className="btn sm ghost" onClick={() => setAdd(c.id)} aria-label={`Editar ${c.name}`}><Icon d={I.edit} s={14} /></button>
        </div>
      ))}</div> : <p className="small muted" style={{ margin: 0 }}>Nenhuma optativa feita ainda. Já fez alguma? Toque em "Adicionar optativa".</p>}
      {catalog.length > 0 && <details style={{ marginTop: 10 }}><summary className="small" style={{ cursor: "pointer" }}>Catálogo de optativas ({catalog.length})</summary>
        <div className="list" style={{ marginTop: 6 }}>{catalog.map((c) => { const s = courseState(c, st.courses, slots); return (
          <div key={c.id} className="li"><div className="grow"><button className="linkish t" onClick={() => setAdd(c.id)}>{c.name}</button><div className="m">{qt(c.credits, "crédito", "créditos")}{s.state === "bloqueada" ? ` · ${s.why}` : ""}</div></div></div>
        ); })}</div></details>}
      {add !== undefined && <OptativeModal id={add} onClose={() => setAdd(undefined)} />}
    </section>
  );
}

function OptativeModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const st = useStore();
  const orig = id ? st.courses.find((c) => c.id === id) : null;
  const catalog = st.courses.filter((c) => c.kind === "optativa" && (c.status === "pendente" || c.id === id)).sort((a, b) => a.position - b.position);
  const [f, setF] = useState(() => ({
    pick: orig?.id || "", name: "", credits: String(orig?.credits ?? 2),
    status: (orig && orig.status !== "pendente" ? orig.status : "aprovada") as CourseStatus, term: orig?.term || "", grade: orig?.grade != null ? String(orig.grade).replace(".", ",") : "",
  }));
  const up = (x: Partial<typeof f>) => setF({ ...f, ...x });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const base = f.pick ? st.courses.find((c) => c.id === f.pick) : null;
    if (!base && !f.name.trim()) { st.toast("Escolha a optativa ou escreva o nome."); return; }
    const credits = parseNum(f.credits);
    if (credits == null || credits < 1 || credits > 20 || !Number.isInteger(credits)) { st.toast("Créditos: número inteiro de 1 a 20."); return; }
    const grade = f.grade.trim() ? parseNum(f.grade) : null;
    if (grade != null && (grade < 0 || grade > 10)) { st.toast("A nota deve estar entre 0 e 10."); return; }
    const row: Course = base ? { ...base, credits, status: f.status, term: f.term.trim(), grade }
      : { id: crypto.randomUUID(), name: f.name.trim(), code: "", phase: null, credits, kind: "optativa", prereqs: [], min_pct: null, min_phase: null, status: f.status, grade, term: f.term.trim(), subject_id: null, position: Math.max(0, ...st.courses.map((c) => c.position)) + 1 };
    if (await st.save("curriculum", row)) { st.toast(f.status === "cursando" ? "Optativa em curso: já ocupa uma vaga." : "Optativa registrada."); onClose(); }
  };
  const undo = async () => { if (orig && (await st.save("curriculum", { ...orig, status: "pendente", term: "", grade: null }))) onClose(); };
  return (
    <Modal title={orig && orig.status !== "pendente" ? "Editar optativa" : "Adicionar optativa"} sub="Meu curso" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="fgrid">
          <label className="f full"><span>Optativa</span>
            <select value={f.pick} onChange={(e) => { const c = st.courses.find((x) => x.id === e.target.value); up({ pick: e.target.value, credits: String(c?.credits ?? 2) }); }}>
              <option value="">Outra (escrever o nome)</option>
              {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
          {!f.pick && <label className="f full"><span>Nome da optativa</span><input type="text" value={f.name} onChange={(e) => up({ name: e.target.value })} maxLength={200} placeholder="Ex.: optativa feita em outro curso" /></label>}
          <label className="f"><span>Situação</span><select value={f.status} onChange={(e) => up({ status: e.target.value as CourseStatus })}>
            <option value="aprovada">Aprovada</option><option value="cursando">Cursando</option><option value="dispensada">Dispensada (aproveitamento)</option><option value="reprovada">Reprovada</option></select></label>
          <label className="f"><span>Semestre</span><input type="text" value={f.term} onChange={(e) => up({ term: e.target.value })} placeholder="Ex.: 2025/2" maxLength={20} /></label>
          <label className="f"><span>Nota final (opcional)</span><input type="text" inputMode="decimal" value={f.grade} onChange={(e) => up({ grade: e.target.value })} placeholder="Ex.: 8,5" /></label>
          <label className="f"><span>Créditos</span><input type="text" inputMode="numeric" value={f.credits} onChange={(e) => up({ credits: e.target.value })} /></label>
        </div>
        <div className="modal-f">
          {orig && orig.status !== "pendente" && <span style={{ marginRight: "auto" }}><button type="button" className="btn ghost" onClick={undo}>Desfazer (voltar ao catálogo)</button></span>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn pri">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
