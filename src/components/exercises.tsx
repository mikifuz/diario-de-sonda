"use client";
// Progresso pré-prova (aba Provas, em Hoje): listas de exercícios de cada prova, um quadradinho por
// exercício. Opcional. As listas em PDF são lidas no aparelho (pdf.js, sem IA); o arquivo não sai dele.
import { useState } from "react";
import { useStore } from "@/lib/store";
import { qt, todayKey } from "@/lib/calc";
import { examProgress, itemsOf, labelsOf, listStats, MAX_ITEMS, MAX_PARTS, plainQuestions, questionsOf, type Question } from "@/lib/exercises";
import type { Assessment, ExerciseKind, ExerciseList } from "@/lib/types";
import { ConfirmButton, I, Icon, Modal, Seg } from "./ui";

const MIGRATION = "Para acompanhar exercícios, rode no Supabase (SQL Editor) a migration 20261025000000_progresso_pre_prova.sql.";
const pct = (x: number) => `${Math.round(x * 1000) / 10}`.replace(".", ",") + "%";
const KINDS: [ExerciseKind, string][] = [["lista", "Lista"], ["livro", "Livro"], ["outro", "Outro"]];

/** Bloco "Progresso pré-prova" dentro do cartão da prova */
export function ExamExercises({ exam }: { exam: Assessment }) {
  const st = useStore();
  const today = todayKey();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const lists = st.exLists.filter((l) => l.assessment_id === exam.id || l.event_id === exam.id).sort((a, b) => a.position - b.position);
  const open = lists.find((l) => l.id === openId);
  const add = () => (st.exMissing ? st.toast(MIGRATION) : setAdding(true));
  const modals = (
    <>
      {adding && <AddListsModal exam={exam} after={lists.length} onClose={() => setAdding(false)} />}
      {open && <ListModal list={open} onClose={() => setOpenId(null)} />}
    </>
  );

  if (!lists.length) {
    return (
      <div className="row ex-empty">
        <span className="small muted grow">Progresso pré-prova (opcional): acompanhe as listas de exercícios desta prova.</span>
        <button className="btn sm" onClick={add}><Icon d={I.plus} s={14} />Acompanhar exercícios</button>
        {modals}
      </div>
    );
  }
  const p = examProgress(lists, exam.date!, today);
  return (
    <div className="ex-box">
      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
        <b>Progresso pré-prova</b>
        <b style={{ color: p.left ? "var(--accent)" : "var(--ok)" }}>{pct(p.pct)}</b>
      </div>
      <div className="bar" style={{ margin: "6px 0 4px" }} role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done} aria-label="Exercícios feitos">
        <i style={{ width: `${p.pct * 100}%`, background: "var(--ok)" }} />
      </div>
      <div className="row small muted" style={{ justifyContent: "space-between", gap: 8 }}>
        <span>{p.done} de {qt(p.total, "exercício", "exercícios")}</span>
        <span>{p.left ? `faltam ${p.left}${p.perDay ? ` ≈ ${p.perDay} por dia` : ""}` : "tudo feito ✓"}</span>
      </div>
      {p.warn && <div className="callout small" style={{ marginTop: 8 }}>{p.warn}</div>}
      <div className="ex-cards">
        {lists.map((l) => <ListCard key={l.id} l={l} onOpen={() => setOpenId(l.id)} />)}
        <button className="ex-card ex-new" onClick={add}><Icon d={I.plus} s={16} />Lista ou livro</button>
      </div>
      <p className="small muted" style={{ margin: "6px 0 0" }}>{p.why} Toque numa lista para marcar o que já fez.</p>
      {modals}
    </div>
  );
}

/** Cartão quadradinho de uma lista: nome, x/y, a próxima e um mosaico do que já foi feito */
function ListCard({ l, onOpen }: { l: ExerciseList; onOpen: () => void }) {
  const s = listStats(l);
  return (
    <button className="ex-card" onClick={onOpen} aria-label={`${l.name}: ${s.done} de ${s.total} feitos. Abrir para marcar.`}>
      <span className="ex-name">{l.name}</span>
      <span className="ex-num"><b>{s.done}</b>/{s.total}</span>
      <span className="ex-mos" aria-hidden="true">{l.items.map((it) => <i key={it} className={l.done[it] ? "on" : ""} />)}</span>
      <span className="small" style={{ color: s.left ? "var(--muted)" : "var(--ok)" }}>
        {!s.left ? "✓ completa" : s.done ? `próxima: ${s.next}` : "não iniciada"}
      </span>
    </button>
  );
}

/** Marcar os exercícios de uma lista (toca no quadradinho), editar as questões ou excluir */
function ListModal({ list, onClose }: { list: ExerciseList; onClose: () => void }) {
  const st = useStore();
  const [edit, setEdit] = useState<{ name: string; kind: ExerciseKind; qs: Question[] } | null>(null);
  const s = listStats(list);
  const today = todayKey();
  const toggle = (it: string) => {
    const done = { ...list.done };
    if (done[it]) delete done[it]; else done[it] = today;
    st.save("exercise_lists", { ...list, done });
  };
  const saveEdit = async () => {
    if (!edit) return;
    const items = itemsOf(edit.qs);
    if (!edit.name.trim() || !items.length) { st.toast("Dê um nome e deixe pelo menos um exercício."); return; }
    const done = Object.fromEntries(Object.entries(list.done).filter(([k]) => items.includes(k)));
    if (await st.save("exercise_lists", { ...list, name: edit.name.trim().slice(0, 120), kind: edit.kind, items, done })) setEdit(null);
  };

  if (edit) {
    return (
      <Modal title="Editar lista" sub={list.name} onClose={() => setEdit(null)}>
        <DraftEditor d={edit} onChange={(x) => setEdit({ ...edit, ...x })} />
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="btn ghost" onClick={() => setEdit(null)}>Voltar</button>
          <button className="btn pri" onClick={saveEdit}>Salvar</button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={list.name} sub={`${s.done} de ${s.total} · ${s.left ? (s.next ? `próxima: ${s.next}` : "") : "completa"}`} onClose={onClose}>
      <div className="ex-grid">
        {questionsOf(list.items).map((q) => (
          <span key={q.n} className="ex-q">
            {labelsOf(q).map((it) => (
              <button key={it} className={"ex-sq" + (list.done[it] ? " on" : "")} aria-pressed={!!list.done[it]} onClick={() => toggle(it)}
                title={list.done[it] ? `Feito em ${list.done[it].split("-").reverse().slice(0, 2).join("/")}. Tocar desmarca.` : "Tocar marca como feito hoje"}>{it}</button>
            ))}
          </span>
        ))}
      </div>
      <p className="small muted" style={{ margin: "10px 0 0" }}>Toque no exercício quando terminar. O app guarda o dia para medir o seu ritmo até a prova.</p>
      <div className="row" style={{ justifyContent: "space-between", gap: 8, marginTop: 12 }}>
        <ConfirmButton small label={<><Icon d={I.trash} s={14} />Excluir lista</>} question="Excluir a lista e o que foi marcado?" confirmLabel="Excluir"
          onConfirm={() => { st.remove("exercise_lists", list.id); onClose(); }} />
        <span className="row" style={{ gap: 8 }}>
          <button className="btn sm ghost" onClick={() => setEdit({ name: list.name, kind: list.kind, qs: questionsOf(list.items) })}><Icon d={I.edit} s={14} />Editar questões</button>
          {s.next && <button className="btn sm pri" onClick={() => toggle(s.next!)}><Icon d={I.check} s={14} />Fiz a {s.next}</button>}
        </span>
      </div>
    </Modal>
  );
}

interface Draft { name: string; kind: ExerciseKind; qs: Question[]; note?: string }

/** Nome, tipo e as questões (cada uma com quantas letras tem), em grade compacta */
function DraftEditor({ d, onChange }: { d: Draft; onChange: (x: Partial<Draft>) => void }) {
  const total = itemsOf(d.qs).length;
  const setParts = (i: number, parts: number) => onChange({ qs: d.qs.map((q, k) => (k === i ? { ...q, parts: Math.max(1, Math.min(MAX_PARTS, parts)) } : q)) });
  const nextN = () => String(Math.max(0, ...d.qs.map((q) => Number(q.n) || 0)) + 1);
  return (
    <div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="f grow" style={{ minWidth: 180 }}><span>Nome</span>
          <input type="text" value={d.name} maxLength={120} onChange={(e) => onChange({ name: e.target.value })} /></label>
        <Seg value={d.kind} options={KINDS} onChange={(k) => onChange({ kind: k || d.kind })} required />
      </div>
      {d.note && <div className="callout small" style={{ marginTop: 8 }}>{d.note}</div>}
      <div className="row small muted" style={{ justifyContent: "space-between", margin: "10px 0 6px" }}>
        <span>{qt(d.qs.length, "questão", "questões")} · <b style={{ color: "var(--fg)" }}>{qt(total, "exercício", "exercícios")}</b></span>
        <span>+ e − mudam quantas letras a questão tem</span>
      </div>
      <div className="ex-edit">
        {d.qs.map((q, i) => (
          <span key={i} className="ex-eq">
            <b>{q.n}</b>
            <span className="muted">{q.parts > 1 ? `a–${"abcdefghijklmnopqrstuvwxyz"[q.parts - 1]}` : "—"}</span>
            <button type="button" aria-label={`Questão ${q.n}: uma letra a menos`} onClick={() => setParts(i, q.parts - 1)} disabled={q.parts <= 1}>−</button>
            <button type="button" aria-label={`Questão ${q.n}: uma letra a mais`} onClick={() => setParts(i, q.parts + 1)}>+</button>
          </span>
        ))}
      </div>
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button type="button" className="btn sm ghost" onClick={() => total < MAX_ITEMS && onChange({ qs: [...d.qs, { n: nextN(), parts: 1 }] })}><Icon d={I.plus} s={13} />Questão</button>
        {d.qs.length > 1 && <button type="button" className="btn sm ghost" onClick={() => onChange({ qs: d.qs.slice(0, -1) })}>Tirar a última</button>}
      </div>
    </div>
  );
}

/** Mandar as listas (vários PDFs de uma vez) ou digitar à mão; prévia antes de salvar */
function AddListsModal({ exam, after, onClose }: { exam: Assessment; after: number; onClose: () => void }) {
  const st = useStore();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState("");
  const [manual, setManual] = useState({ name: "", kind: "livro" as ExerciseKind, n: "" });
  const fromNotes = st.assessments.some((a) => a.id === exam.id);

  const read = async (files: File[]) => {
    if (!files.length) return;
    setBusy("Lendo as listas…");
    const out: Draft[] = [];
    try {
      const { pdfItems } = await import("@/lib/sigaPdf");
      const { parseListPdf } = await import("@/lib/exercises");
      for (const f of files.slice(0, 12)) {
        if (!f.name.toLowerCase().endsWith(".pdf")) { out.push({ name: f.name, kind: "lista", qs: plainQuestions(10), note: "Só leio PDF. Em Word, use Salvar como PDF; ou acerte o número de questões abaixo." }); continue; }
        try {
          const r = parseListPdf(await pdfItems(f), f.name);
          out.push(r.questions.length ? { name: r.name, kind: "lista", qs: r.questions }
            : { name: r.name, kind: "lista", qs: plainQuestions(10), note: "Não achei as questões neste PDF (pode ser foto ou digitalização). Coloquei 10: acerte o número abaixo." });
        } catch {
          out.push({ name: f.name, kind: "lista", qs: plainQuestions(10), note: "Não consegui abrir este PDF. Coloquei 10 questões: acerte o número abaixo." });
        }
      }
    } finally { setBusy(""); }
    setDrafts((d) => [...d, ...out]);
  };
  const addManual = () => {
    const n = Math.round(Number(manual.n.replace(",", ".")));
    if (!manual.name.trim() || !(n >= 1)) { st.toast("Dê um nome e diga quantos exercícios são."); return; }
    setDrafts((d) => [...d, { name: manual.name.trim(), kind: manual.kind, qs: plainQuestions(Math.min(n, MAX_ITEMS)) }]);
    setManual({ name: "", kind: manual.kind, n: "" });
  };
  const save = async () => {
    const rows: ExerciseList[] = drafts.map((d, k) => ({
      id: crypto.randomUUID(), subject_id: exam.subject_id, assessment_id: fromNotes ? exam.id : null, event_id: fromNotes ? null : exam.id,
      name: (d.name.trim() || "Lista").slice(0, 120), kind: d.kind, items: itemsOf(d.qs), done: {}, position: after + k, created_at: new Date().toISOString(),
    })).filter((r) => r.items.length);
    if (!rows.length) return;
    if (await st.saveMany("exercise_lists", rows)) { st.toast(rows.length > 1 ? `${rows.length} listas adicionadas.` : "Lista adicionada."); onClose(); }
  };

  return (
    <Modal title="Acompanhar exercícios" sub={exam.name} onClose={onClose}>
      <div className="ex-add">
        <div className="ex-drop">
          <b>Mandar as listas (PDF)</b>
          <span className="small muted">Pode escolher várias de uma vez. O app conta as questões e as letras (a, b, c…); o arquivo não sai do aparelho.</span>
          <label className={"btn sm" + (busy ? " disabled" : "")} style={{ alignSelf: "flex-start", cursor: "pointer" }}>
            <Icon d={I.plus} s={14} />Escolher PDFs
            <input type="file" accept=".pdf,application/pdf" multiple className="sr-only" disabled={!!busy}
              onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; read(fs); }} />
          </label>
        </div>
        <div className="ex-drop">
          <b>Digitar à mão</b>
          <span className="small muted">Livro, lista sem PDF ou uma meta sua: ex. 50 exercícios do livro.</span>
          <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <input type="text" value={manual.name} maxLength={120} placeholder="Ex.: Halliday cap. 15" aria-label="Nome" onChange={(e) => setManual({ ...manual, name: e.target.value })} />
            <input type="text" inputMode="numeric" value={manual.n} placeholder="nº" aria-label="Quantos exercícios" style={{ width: 64 }} onChange={(e) => setManual({ ...manual, n: e.target.value })} />
            <button type="button" className="btn icon" aria-label="Adicionar" onClick={addManual}><Icon d={I.plus} s={16} /></button>
          </div>
        </div>
      </div>
      {busy && <p className="small muted">{busy}</p>}
      {drafts.map((d, i) => (
        <div key={i} className="ex-draft">
          <DraftEditor d={d} onChange={(x) => setDrafts((ds) => ds.map((y, k) => (k === i ? { ...y, ...x } : y)))} />
          <button type="button" className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setDrafts((ds) => ds.filter((_, k) => k !== i))}>Não adicionar esta</button>
        </div>
      ))}
      {drafts.length > 0 && <p className="small muted" style={{ margin: "8px 0 0" }}>Confira a contagem: cada letra é um exercício; questão sem letra conta como um. Se o professor pede várias coisas numa questão sem letras (ex.: quatro matrizes), use o + para separar.</p>}
      <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn pri" disabled={!drafts.length || !!busy} onClick={save}>
          {drafts.length ? `Salvar ${qt(drafts.length, "lista", "listas")} · ${qt(drafts.reduce((s, d) => s + itemsOf(d.qs).length, 0), "exercício", "exercícios")}` : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}
