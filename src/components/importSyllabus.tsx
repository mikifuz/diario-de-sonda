"use client";
// Importa o cronograma do professor (Excel, Word, PDF ou texto colado) para uma disciplina:
// conteúdos com a data da aula e a prova em que caem, e as provas em Notas. Prévia antes de gravar.
import { useState } from "react";
import { useStore } from "@/lib/store";
import { buildPlan, classify, KIND_LABEL, norm, rowsFromText, subCoverage, type Entry, type EntryKind } from "@/lib/syllabus";
import type { Assessment, CalEvent, Subject, Topic } from "@/lib/types";
import { Modal } from "./ui";
import { qt } from "@/lib/calc";

const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const DEFAULT_ON: Record<EntryKind, boolean> = { aula: true, prova: true, sub: true, trabalho: true, exercicios: false, sem_aula: true };

export function ImportSyllabusModal({ s, onClose }: { s: Subject; onClose: () => void }) {
  const st = useStore();
  const [busy, setBusy] = useState("");
  const [entries, setEntries] = useState<(Entry & { on: boolean })[] | null>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState("");
  const [link, setLink] = useState(true);
  const [err, setErr] = useState("");

  const load = (es: Entry[]) => {
    if (!es.length) { setErr("Não encontrei aulas com data neste arquivo. Confira se é o cronograma (com datas) ou cole o texto."); return; }
    setErr("");
    setEntries(es.map((e) => ({ ...e, on: DEFAULT_ON[e.kind] })));
  };
  const read = async (file: File) => {
    setBusy("Lendo o arquivo…");
    try {
      const { readSyllabus } = await import("@/lib/syllabusFile");
      load(classify((await readSyllabus(file)).rows));
    } catch (e) {
      setErr((e as Error).message === "antigo" ? "Formato antigo (.xls ou .doc). Abra no Excel/Word e salve como .xlsx ou .docx, ou cole o texto." : "Não consegui ler este arquivo. Use .xlsx, .docx ou .pdf (com texto, não foto), ou cole o texto.");
    } finally { setBusy(""); }
  };

  const setOne = (i: number, patch: Partial<Entry & { on: boolean }>) => setEntries((es) => es!.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const chosen = (entries || []).filter((e) => e.on);
  const plan = buildPlan(chosen);

  const save = async () => {
    setBusy("Importando…");
    try {
      const mine = st.assessments.filter((a) => a.subject_id === s.id);
      const examId = new Map<string, string>();
      const newExams: Assessment[] = [];
      for (const x of plan.exams) {
        const kind = x.kind;
        const ex = mine.find((a) => norm(a.name) === x.key || (a.date === x.date && a.kind === kind));
        if (ex) { examId.set(x.key, ex.id); if (!ex.date) newExams.push({ ...ex, date: x.date }); continue; }
        const row: Assessment = { id: crypto.randomUUID(), subject_id: s.id, name: x.name.slice(0, 120), kind, date: x.date, time: null, weight: x.weight ?? 1,
          grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null };
        newExams.push(row); examId.set(x.key, row.id);
      }
      // "Tem SUB?": cada prova fica ligada à SUB que pode substituí-la (só se ainda não tiver)
      const cov = subCoverage(plan.exams);
      const rowOf = (key: string) => newExams.find((a) => a.id === examId.get(key)) ?? mine.find((a) => a.id === examId.get(key));
      for (const [subKey, provaKeys] of cov) {
        const subId = examId.get(subKey);
        for (const k of provaKeys) {
          const row = rowOf(k);
          if (!row || row.sub_id || !subId) continue;
          const upd = { ...row, sub_id: subId };
          const i = newExams.findIndex((a) => a.id === row.id);
          if (i >= 0) newExams[i] = upd; else newExams.push(upd);
        }
      }
      // SUBs precisam existir antes das provas que apontam para elas
      newExams.sort((a, b) => Number(b.kind === "sub") - Number(a.kind === "sub"));
      if (newExams.length && !(await st.saveMany("assessments", newExams))) return;
      if (plan.exams.some((x) => x.kind === "sub") && s.recovery === "nenhuma") await st.save("subjects", { ...s, recovery: "sub", exam_enabled: false });

      const ts = st.topics.filter((t) => t.subject_id === s.id);
      let pos = ts.length;
      // assuntos (pais) primeiro
      const parents = new Map<string, Topic>();
      for (const t of plan.topics) {
        if (!t.parent || parents.has(norm(t.parent))) continue;
        const ex = ts.find((x) => norm(x.name) === norm(t.parent!));
        parents.set(norm(t.parent), ex ?? { id: crypto.randomUUID(), subject_id: s.id, parent_id: null, name: t.parent.slice(0, 200), position: pos++, taught_on: t.first, assessment_id: null });
      }
      const newParents = [...parents.values()].filter((p) => !ts.some((x) => x.id === p.id));
      if (newParents.length && !(await st.saveMany("topics", newParents))) return;
      const rows: Topic[] = [];
      let created = 0, updated = 0;
      for (const t of plan.topics) {
        const parent_id = t.parent ? parents.get(norm(t.parent))!.id : null;
        const assessment_id = link && t.exam ? examId.get(t.exam) ?? null : null;
        const ex = ts.find((x) => norm(x.name) === norm(t.name) && (x.parent_id ?? null) === parent_id) || ts.find((x) => norm(x.name) === norm(t.name));
        if (ex) {
          // completa só o que estiver vazio
          if (!ex.taught_on || (!ex.assessment_id && assessment_id)) { rows.push({ ...ex, taught_on: ex.taught_on || t.first, assessment_id: ex.assessment_id || assessment_id }); updated++; }
          continue;
        }
        rows.push({ id: crypto.randomUUID(), subject_id: s.id, parent_id, name: t.name, position: pos++, taught_on: t.first, assessment_id });
        created++;
      }
      if (rows.length && !(await st.saveMany("topics", rows))) return;
      // dias sem aula do cronograma (feriado, recesso…): viram "Sem aula" no calendário, só desta disciplina
      const offs = chosen.filter((e) => e.kind === "sem_aula" && !st.events.some((x) => x.type === "sem_aula" && x.date === e.date && (x.subject_id === s.id || !x.subject_id)));
      const offRows: CalEvent[] = [...new Map(offs.map((e) => [e.date, e])).values()].map((e) => ({
        id: crypto.randomUUID(), subject_id: s.id, title: e.raw.trim().slice(0, 120) || "Sem aula", type: "sem_aula", date: e.date, time: null, priority: "baixa", status: "pendente", description: "Do cronograma do professor",
      }));
      if (offRows.length && !(await st.saveMany("events", offRows))) return;
      const noWeight = plan.exams.some((x) => x.kind !== "sub" && x.weight == null);
      st.toast(`${qt(created, "conteúdo novo", "conteúdos novos")}${updated ? `, ${qt(updated, "atualizado", "atualizados")}` : ""}, ${qt(newExams.length, "avaliação", "avaliações")}${offRows.length ? `, ${qt(offRows.length, "dia sem aula", "dias sem aula")}` : ""}.${noWeight ? " Confira os pesos em Notas." : ""}`);
      onClose();
    } finally { setBusy(""); }
  };

  return (
    <Modal title="Importar cronograma" sub={s.name} onClose={onClose}>
      {!entries ? (
        <div className="stack" style={{ gap: 12 }}>
          <p style={{ margin: 0 }}>Escolha o cronograma que o professor mandou. O app procura as datas e os conteúdos de cada aula, as provas e os dias sem aula, e mostra tudo para você conferir antes de salvar.</p>
          <p className="small muted" style={{ margin: 0 }}>Funciona com Excel (.xlsx), Word (.docx) e PDF com texto. O arquivo é lido aqui no seu aparelho e não é enviado para lugar nenhum.</p>
          {err && <div className="callout">{err}</div>}
          {!paste ? (
            <div className="row">
              <label className="btn pri">{busy || "Escolher arquivo"}
                <input type="file" accept=".xlsx,.docx,.pdf,.xls,.doc" hidden disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} /></label>
              <button type="button" className="btn ghost" onClick={() => setPaste(true)}>Colar o texto</button>
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <label className="f"><span>Uma aula por linha, com a data</span>
                <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 160 }} placeholder={"14/10 – Integrais triplas\n16/10 – Teorema de Green\n21/10 – Prova 2"} /></label>
              <div className="row"><button type="button" className="btn pri" onClick={() => load(classify(rowsFromText(text, new Date().getFullYear())))}>Ler texto</button>
                <button type="button" className="btn ghost" onClick={() => setPaste(false)}>Voltar</button></div>
            </div>
          )}
          <div className="modal-f"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <div className="small">
            <b>{plan.topics.length}</b> {plan.topics.length === 1 ? "conteúdo" : "conteúdos"} em {qt(chosen.filter((e) => e.kind === "aula").length, "aula", "aulas")} · <b>{plan.exams.length}</b> {plan.exams.length === 1 ? "avaliação" : "avaliações"}
            {entries.some((e) => e.kind === "sem_aula") && <> · {qt(entries.filter((e) => e.kind === "sem_aula").length, "dia", "dias")} sem aula</>}
          </div>
          <p className="small muted" style={{ margin: 0 }}>Desmarque o que não quer importar e corrija o tipo se precisar. Conteúdos repetidos viram um só, com a data da primeira aula. Feriados e aulas de exercícios vêm desmarcados.</p>
          <div className="list" style={{ maxHeight: "46vh", overflowY: "auto" }}>{entries.map((e, i) => (
            <div key={i} className="li" style={{ opacity: e.on ? 1 : 0.5, padding: "6px 0", gap: 8 }}>
              <input type="checkbox" checked={e.on} onChange={(x) => setOne(i, { on: x.target.checked })} aria-label="Importar esta linha" style={{ width: 16, height: 16, flex: "none" }} />
              <span className="cdays" style={{ minWidth: 0 }}>{dm(e.date)}</span>
              <div className="grow small">{e.parent && <span className="muted">{e.parent} › </span>}{e.name}{e.weight != null && <span className="muted"> · peso {e.weight}</span>}</div>
              <select value={e.kind} onChange={(x) => setOne(i, { kind: x.target.value as EntryKind, on: DEFAULT_ON[x.target.value as EntryKind] || e.on })} aria-label="Tipo" style={{ width: "auto", padding: "3px 6px", fontSize: ".82em" }}>
                {(Object.keys(KIND_LABEL) as EntryKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
            </div>
          ))}</div>
          <label className="check"><input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />Ligar cada conteúdo à prova seguinte (define até quando ele é revisado)</label>
          <p className="small muted" style={{ margin: 0 }}>Conteúdos e provas que já existem na disciplina (mesmo nome) não são duplicados; só ganham a data se estiverem sem. Os pesos das provas vêm do cronograma quando aparecem; senão ficam 1 e você ajusta em Notas.</p>
          <div className="modal-f">
            <button type="button" className="btn ghost" onClick={() => setEntries(null)} disabled={!!busy}>Outro arquivo</button>
            <button type="button" className="btn pri" onClick={save} disabled={!!busy || (!plan.topics.length && !plan.exams.length)}>{busy || "Importar"}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
