"use client";
// Importa disciplinas e horários de aula do comprovante de matrícula do SIGA (UDESC).
// O PDF é lido no navegador; nada é gravado antes da confirmação.
import { useState } from "react";
import { activeSubjects, useStore } from "@/lib/store";
import { matchSubject, parseSiga, sameName, type SigaResult } from "@/lib/siga";
import { COLORS, WD_S } from "@/lib/constants";
import type { RoutineBlock, Subject } from "@/lib/types";
import { Dot, Modal } from "./ui";

export function ImportSigaModal({ onClose }: { onClose: () => void }) {
  const st = useStore();
  const [busy, setBusy] = useState("");
  const [res, setRes] = useState<SigaResult | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const oldClasses = st.blocks.filter((b) => b.kind === "aula");
  const [replace, setReplace] = useState(true);
  const existing = activeSubjects(st.subjects);
  const findExisting = (code: string, name: string) => existing.find((s) => (s.code && matchSubject([{ code: s.code }], code)) || sameName(s.name, name));

  const read = async (file: File) => {
    setBusy("Lendo o arquivo…");
    try {
      const { pdfItems } = await import("@/lib/sigaPdf");
      setRes(parseSiga(await pdfItems(file)));
    } catch {
      setRes({ period: null, subjects: [], classes: [], warnings: ["Não consegui ler este arquivo. Confira se é um PDF (não uma foto) do comprovante de matrícula."] });
    } finally { setBusy(""); }
  };

  const save = async () => {
    if (!res) return;
    setBusy("Importando…");
    try {
      const p = st.profile;
      const semester = res.period ? res.period.replace("/", ".") : p?.current_semester || "";
      const idOf = new Map<string, string>(); // código do SIGA → disciplina no diário
      const newSubs: Subject[] = [], updSubs: Subject[] = [];
      res.subjects.forEach((s, i) => {
        const ex = findExisting(s.code, s.name);
        if (ex) {
          idOf.set(s.code, ex.id);
          // completa só o que estiver vazio; não sobrescreve o que a pessoa já preencheu
          if (!ex.code || ex.credits == null || ex.hours == null) updSubs.push({ ...ex, code: ex.code || s.code, credits: ex.credits ?? s.credits, hours: ex.hours ?? s.hours });
          return;
        }
        if (skip.has(s.code)) return;
        const row: Subject = {
          id: crypto.randomUUID(), name: s.name.slice(0, 200), code: s.code, professor: "", semester, credits: s.credits, hours: s.hours,
          color: COLORS[(st.subjects.length + i) % COLORS.length], min_avg: p?.default_min_avg ?? 7, schedule: "", notes: "", traits: {},
          exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false,
          study_pref: null, recovery: "nenhuma", sub_replace_lower: false,
        };
        newSubs.push(row);
        idOf.set(s.code, row.id);
      });
      if (!(await st.saveMany("subjects", [...newSubs, ...updSubs]))) return;
      if (replace) for (const b of oldClasses) if (!(await st.remove("routine_blocks", b.id))) return;
      const blocks: RoutineBlock[] = res.classes.flatMap((c) => {
        const s = matchSubject(res.subjects, c.code);
        const sid = s && idOf.get(s.code);
        return sid ? [{ id: crypto.randomUUID(), weekday: c.weekday, start_time: c.start, end_time: c.end, kind: "aula" as const, subject_id: sid, label: c.label }] : [];
      });
      if (!(await st.saveMany("routine_blocks", blocks))) return;
      st.toast(`${blocks.length} aula(s) na rotina${newSubs.length ? `, ${newSubs.length} disciplina(s) nova(s)` : ""}. Agora adicione seus blocos de estudo.`);
      onClose();
    } finally { setBusy(""); }
  };

  const subName = (code: string) => res?.subjects.find((s) => matchSubject([s], code))?.name || code;
  const nNew = res ? res.subjects.filter((s) => !findExisting(s.code, s.name) && !skip.has(s.code)).length : 0;
  return (
    <Modal title="Importar do comprovante de matrícula" sub="Rotina semanal · SIGA (UDESC)" onClose={onClose}>
      {!res ? (
        <div className="stack" style={{ gap: 12 }}>
          <p style={{ margin: 0 }}>No SIGA, gere o <b>Comprovante de matrícula</b> (PDF) e escolha o arquivo aqui. O diário lê as disciplinas e a grade de horários e mostra tudo para você conferir antes de salvar.</p>
          <p className="small muted" style={{ margin: 0 }}>O arquivo é lido aqui no seu aparelho e não é enviado para lugar nenhum. Funciona com o PDF original; foto ou print da tela não têm o texto que o diário precisa.</p>
          <label className="btn pri" style={{ alignSelf: "flex-start" }}>
            {busy || "Escolher PDF"}
            <input type="file" accept="application/pdf,.pdf" hidden disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); }} />
          </label>
          <div className="modal-f"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {res.warnings.map((w) => <div key={w} className="callout">{w}</div>)}
          {res.subjects.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 6 }}>Disciplinas{res.period ? ` · ${res.period}` : ""}</h3>
              <div className="list">{res.subjects.map((s) => {
                const ex = findExisting(s.code, s.name);
                return (
                  <div key={s.code} className="li">
                    {ex ? <Dot c={ex.color} /> : <input type="checkbox" checked={!skip.has(s.code)} aria-label={`Criar ${s.name}`}
                      onChange={(e) => { const n = new Set(skip); if (e.target.checked) n.delete(s.code); else n.add(s.code); setSkip(n); }} />}
                    <div className="grow"><div className="t">{s.name}</div><div className="m">{s.code}{s.hours ? ` · ${s.hours}h` : ""}{s.credits ? ` · ${s.credits} créditos` : ""}</div></div>
                    <span className={"chip " + (ex ? "" : "acc")}>{ex ? `já existe: ${ex.name}` : skip.has(s.code) ? "não criar" : "nova"}</span>
                  </div>
                );
              })}</div>
            </div>
          )}
          {res.classes.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 6 }}>Aulas na semana</h3>
              <div className="list">{res.classes.map((c, i) => {
                const s = matchSubject(res.subjects, c.code);
                const off = s && !findExisting(s.code, s.name) && skip.has(s.code);
                return (
                  <div key={i} className="li" style={off ? { opacity: 0.45 } : undefined}>
                    <span className="cdays">{WD_S[c.weekday]}</span>
                    <div className="grow"><div className="t">{c.start}–{c.end} · {subName(c.code)}</div>{c.label && <div className="m">{c.label}</div>}</div>
                  </div>
                );
              })}</div>
            </div>
          )}
          {res.classes.length > 0 && oldClasses.length > 0 && (
            <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Apagar as {oldClasses.length} aula(s) que já estão na rotina (blocos de estudo e outros continuam)</label>
          )}
          {res.subjects.length > 0 && <p className="small muted" style={{ margin: 0 }}>
            Disciplinas que já existem no diário (mesmo código ou mesmo nome) são reaproveitadas. {nNew ? `${nNew} serão criadas com a sua média mínima padrão; professor, SUB e o resto você completa depois em Disciplinas.` : ""}</p>}
          <div className="modal-f">
            <button type="button" className="btn ghost" onClick={() => setRes(null)} disabled={!!busy}>Escolher outro arquivo</button>
            <button type="button" className="btn pri" onClick={save} disabled={!!busy || !res.classes.length}>{busy || "Importar"}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
