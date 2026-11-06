"use client";
// Acompanhamento para a SUB (ver src/lib/subPrep.ts): a pergunta depois de uma nota baixa, a caixa do
// acompanhamento no cartão da SUB (aba Provas de Hoje) e a opção em Configurações.
import { useMemo, useState, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import { addDays, daysBetween, nf, qt, todayKey } from "@/lib/calc";
import { dm } from "@/lib/plan";
import { itemsOf, plainQuestions } from "@/lib/exercises";
import { pendingExamChecks } from "@/lib/examCheck";
import { acceptSub, coveredBy, guessSubDate, redoCopies, subAsks, SUB_HORIZON, subOf, trackedSubs, type SubAsk } from "@/lib/subPrep";
import type { Assessment, ExerciseList } from "@/lib/types";
import { Modal, useNow } from "./ui";
import { ExamExercises } from "./exercises";

export const SUB_MIGRATION = "Para o acompanhamento para a SUB, rode no Supabase (SQL Editor) a migration 20261027000000_acompanhamento_sub.sql.";

/** O banco já tem a coluna `sub_prep`? (sem ela, o app não pergunta) */
export function useSubReady() {
  const st = useStore();
  return st.demo || st.assessments.some((a) => "sub_prep" in a);
}

/** Depois de lançar uma nota abaixo da média: "Quer se preparar para a SUB?" (uma prova de cada vez).
 *  Espera o "Como foi a prova?" terminar, para não abrir duas perguntas juntas. */
export function SubPrepHost() {
  const st = useStore();
  const ready = useSubReady();
  const now = useNow(60000);
  const [skip, setSkip] = useState<Set<string>>(() => new Set());
  const today = todayKey();
  const on = st.profile?.sub_ask !== false;
  const pending = useMemo(() => (st.ready && ready && on ? subAsks({ assessments: st.assessments, subjects: st.subjects, today, skip }) : []),
    [st.ready, ready, on, st.assessments, st.subjects, today, skip]);
  const examCheck = useMemo(() => (pending.length ? pendingExamChecks({ assessments: st.assessments, blocks: st.blocks, now: new Date(now) }).length > 0 : false),
    [pending.length, st.assessments, st.blocks, now]);
  if (!pending.length || examCheck) return null;
  const c = pending[0];
  return <SubPrepModal key={c.exam.id} ask={c} asked onClose={() => setSkip((s) => new Set(s).add(c.exam.id))} />;
}

/** A pergunta e, aceitando, a montagem do acompanhamento. `asked`: veio sozinha (mostra "Não perguntar mais"). */
export function SubPrepModal({ ask, asked, onClose }: { ask: SubAsk; asked?: boolean; onClose: () => void }) {
  const st = useStore();
  const today = todayKey();
  const { exam, subject } = ask;
  const sub = ask.sub || (() => { const open = st.assessments.filter((a) => a.subject_id === subject.id && a.kind === "sub" && a.grade == null && a.status !== "cancelado" && (!a.date || a.date >= today)); return open.length === 1 ? open[0] : null; })();
  const [date, setDate] = useState(sub?.date || "");
  const examLists = st.exLists.filter((l) => l.assessment_id === exam.id);
  const [copy, setCopy] = useState(examLists.length > 0);
  const [redo, setRedo] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = useSubReady();

  const decline = async () => {
    if (!ready) { st.toast(SUB_MIGRATION); return; }
    setBusy(true);
    if (await st.save("assessments", { ...exam, sub_prep: 0 })) { st.toast("Tudo bem. Se mudar de ideia, a prova fica em Hoje → Provas."); onClose(); }
    setBusy(false);
  };
  const never = async () => {
    if (!st.demo && (!st.profile || st.profile.sub_ask === undefined)) { st.toast(SUB_MIGRATION); return; }
    setBusy(true);
    if (await st.updateProfile({ sub_ask: false })) { st.toast("Não pergunto mais. Dá para ligar de novo em Configurações."); onClose(); }
    setBusy(false);
  };
  const accept = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) { st.toast(SUB_MIGRATION); return; }
    if (!date) { st.toast("Coloque a data da SUB (se ainda não souber, uma data aproximada; dá para mudar nas Notas)."); return; }
    if (date <= today) { st.toast("A data da SUB precisa ser depois de hoje."); return; }
    const n = redo ? Math.floor(Number(redo)) : 0;
    if (redo && !(n >= 1 && n <= 100)) { st.toast("Número de questões da prova: entre 1 e 100."); return; }
    setBusy(true);
    const pl = acceptSub({ exam, subject, assessments: st.assessments, date, today, id: crypto.randomUUID() });
    const ok = (!pl.subject || await st.save("subjects", pl.subject))
      && (!pl.newSub || await st.save("assessments", pl.newSub))
      && await st.saveMany("assessments", pl.rows);
    if (!ok) { setBusy(false); return; }
    const after = st.exLists.filter((l) => l.assessment_id === pl.sub.id).length;
    const now = new Date().toISOString();
    const lists: ExerciseList[] = copy ? redoCopies(examLists, pl.sub, after, now, () => crypto.randomUUID()) : [];
    if (n) lists.push({ id: crypto.randomUUID(), subject_id: subject.id, assessment_id: pl.sub.id, event_id: null, name: `Questões da ${exam.name}`.slice(0, 120), kind: "outro",
      items: itemsOf(plainQuestions(n)), done: {}, position: after + lists.length, created_at: now });
    if (lists.length && st.exMissing) st.toast("As listas para refazer precisam da migration do progresso pré-prova (20261025000000_progresso_pre_prova.sql).");
    else if (lists.length) await st.saveMany("exercise_lists", lists);
    const d = daysBetween(today, date);
    st.toast(d > SUB_HORIZON ? `Acompanhamento montado. A SUB é em ${d} dias: o estudo entra no plano ${SUB_HORIZON} dias antes.` : "Acompanhamento para a SUB montado: o estudo já entrou no plano (Hoje → Provas).");
    onClose();
  };

  return (
    <Modal title="Quer se preparar para a SUB?" sub={`${subject.name} · ${exam.name}: nota ${nf(Number(exam.grade))}`} onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={accept}>
        <p className="small" style={{ margin: 0 }}>{ask.why} Se quiser, o app monta um <b>acompanhamento para a SUB</b>:</p>
        <ul className="small" style={{ margin: 0, paddingLeft: "1.2em" }}>
          <li>os conteúdos da {exam.name} entram no plano das provas, com blocos de estudo distribuídos até a SUB (só conta o que você estudar a partir de agora);</li>
          <li>uma lista de exercícios para refazer, com quadradinhos para marcar;</li>
          <li>o progresso aparece na aba Provas, em Hoje.</li>
        </ul>
        <label className="f"><span>Data da SUB{sub ? ` (${sub.name})` : ""}</span>
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} /></label>
        {!date && <span className="small muted" style={{ marginTop: -8 }}>Ainda não sabe? <button type="button" className="btn sm ghost" onClick={() => setDate(guessSubDate(today))}>Usar uma data aproximada (daqui a 3 semanas)</button></span>}
        {examLists.length > 0 && <label className="check small"><input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          Refazer {examLists.length === 1 ? `a lista "${examLists[0].name}"` : `as ${examLists.length} listas`} da {exam.name} (cópia zerada)</label>}
        <label className="f"><span>Questões da {exam.name} para refazer (opcional)</span>
          <input type="number" inputMode="numeric" min={1} max={100} value={redo} placeholder="ex.: 5" onChange={(e) => setRedo(e.target.value)} /></label>
        {!sub && <p className="small muted" style={{ margin: 0 }}>{subject.name} ainda não tem SUB nas Notas: o app cria uma{st.assessments.some((a) => a.subject_id === subject.id && a.kind === "sub") ? "" : " (vale para as provas sem SUB, como o botão \"+ SUB\")"}.</p>}
        {!ready && <p className="small" style={{ margin: 0 }}>{SUB_MIGRATION}</p>}
        <div className="modal-f">
          {asked && <button type="button" className="btn ghost" style={{ marginRight: "auto" }} onClick={never} disabled={busy}>Não perguntar mais</button>}
          <button type="button" className="btn ghost" onClick={decline} disabled={busy}>Não quero</button>
          <button className="btn pri" disabled={busy}>Sim, quero me preparar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Topo do cartão da SUB na aba Provas: de onde veio, refazer as listas e parar o acompanhamento */
export function SubPrepBox({ sub, note }: { sub: Assessment; note?: string }) {
  const st = useStore();
  const today = todayKey();
  const cov = coveredBy(sub, st.assessments);
  const mine = st.exLists.filter((l) => l.assessment_id === sub.id);
  const fromExams = st.exLists.filter((l) => cov.some((a) => a.id === l.assessment_id) && !mine.some((m) => m.name === `Refazer: ${l.name}`.slice(0, 120)));
  const stop = async () => {
    if (await st.saveMany("assessments", cov.filter((a) => a.sub_prep === 1).map((a) => ({ ...a, sub_prep: 0 })))) st.toast("Acompanhamento parado: a SUB saiu do plano. As listas continuam guardadas.");
  };
  const copy = async () => {
    if (st.exMissing) { st.toast("Rode a migration do progresso pré-prova (20261025000000_progresso_pre_prova.sql)."); return; }
    if (await st.saveMany("exercise_lists", redoCopies(fromExams, sub, mine.length, new Date().toISOString(), () => crypto.randomUUID()))) st.toast(qt(fromExams.length, "lista copiada", "listas copiadas") + " para refazer.");
  };
  return (
    <div className="callout info small" style={{ marginBottom: 8 }}>
      <b>Acompanhamento para a SUB.</b> {cov.length ? `Substitui a menor nota entre ${cov.map((a) => `${a.name} (${nf(Number(a.grade))})`).join(", ")}.` : "Nenhuma prova com nota marcada com esta SUB."}
      {sub.date && ` ${daysBetween(today, sub.date) === 1 ? "Falta 1 dia" : `Faltam ${daysBetween(today, sub.date)} dias`}.`}
      {note && ` ${note.replace(/^Acompanhamento para a SUB: e/, "E")}`}
      <span className="row" style={{ gap: 6, marginTop: 6 }}>
        {fromExams.length > 0 && <button className="btn sm" onClick={copy}>Refazer {fromExams.length === 1 ? `a lista "${fromExams[0].name}"` : `as ${fromExams.length} listas da prova`}</button>}
        <button className="btn sm ghost" onClick={stop}>Parar o acompanhamento</button>
      </span>
    </div>
  );
}

/** Aba Provas: SUBs com acompanhamento que ainda não estão no plano (sem data ou mais de 60 dias) e
 *  provas com nota baixa sem acompanhamento (para quem desligou a pergunta ou disse "não"). */
export function SubPrepPanels({ planned }: { planned: Set<string> }) {
  const st = useStore();
  const ready = useSubReady();
  const today = todayKey();
  const [ask, setAsk] = useState<SubAsk | null>(null);
  if (!ready) return null;
  const tracked = trackedSubs(st.assessments);
  const waiting = st.assessments.filter((a) => tracked.has(a.id) && !planned.has(a.id) && a.grade == null && a.status !== "cancelado" && (!a.date || a.date > today)
    && st.subjects.some((s) => s.id === a.subject_id && !s.archived));
  const low = subAsks({ assessments: st.assessments, subjects: st.subjects, today, all: true });
  const setDate = (a: Assessment, d: string) => d && d > today ? st.save("assessments", { ...a, date: d }) : st.toast("A data da SUB precisa ser depois de hoje.");
  return (
    <>
      {waiting.map((a) => {
        const s = st.subjects.find((x) => x.id === a.subject_id)!;
        return (
          <section key={a.id} className="panel">
            <div className="panel-h"><h2>{a.name} · {s.name}</h2><span className="chip">{a.date ? `${dm(a.date)} · em ${qt(daysBetween(today, a.date), "dia", "dias")}` : "sem data"}</span></div>
            <SubPrepBox sub={a} />
            {a.date
              ? <p className="small muted" style={{ margin: "0 0 8px" }}>O estudo para a SUB entra no plano {SUB_HORIZON} dias antes dela (a partir de {dm(addDays(a.date, -SUB_HORIZON))}). Até lá, dá para ir refazendo os exercícios.</p>
              : <label className="f small" style={{ marginBottom: 8 }}><span>Sem data, o app não consegue distribuir o estudo. Data da SUB:</span><input type="date" min={today} onChange={(e) => setDate(a, e.target.value)} /></label>}
            {a.date && <ExamExercises exam={a} />}
          </section>
        );
      })}
      {low.length > 0 && (
        <section className="panel">
          <div className="panel-h"><h2>Notas abaixo da média</h2><span className="lbl">sem acompanhamento para a SUB</span></div>
          <div className="list small">{low.map((x) => (
            <div key={x.exam.id} className="li">
              <div className="grow"><div className="t">{x.exam.name} · {x.subject.name}</div><div className="m">{x.why}{subOf(x.exam, st.assessments)?.date ? ` SUB em ${dm(subOf(x.exam, st.assessments)!.date!)}.` : ""}</div></div>
              <button className="btn sm" onClick={() => setAsk(x)}>Preparar para a SUB</button>
            </div>
          ))}</div>
        </section>
      )}
      {ask && <SubPrepModal ask={ask} onClose={() => setAsk(null)} />}
    </>
  );
}

/** Configurações: ligar/desligar a pergunta */
export function SubAskSetting() {
  const st = useStore();
  const p = st.profile;
  const missing = !st.demo && (!p || p.sub_ask === undefined);
  return (
    <section className="panel">
      <div className="panel-h"><h2>Acompanhamento para a SUB</h2><span className="lbl">{missing ? "banco desatualizado" : p?.sub_ask === false ? "não pergunta" : "pergunta"}</span></div>
      <label className="check"><input type="checkbox" checked={!missing && p?.sub_ask !== false} disabled={missing}
        onChange={async (e) => { if (await st.updateProfile({ sub_ask: e.target.checked })) st.toast(e.target.checked ? "Vou perguntar quando sair uma nota baixa." : "Não pergunto mais."); }} />
        Perguntar se quero me preparar para a SUB quando eu lançar uma nota abaixo da média</label>
      <p className="small muted" style={{ margin: "8px 0 0" }}>Aceitando, a SUB entra no plano das provas com os conteúdos da prova, ganha uma lista de exercícios para refazer e o progresso aparece em Hoje → Provas. Mesmo sem a pergunta, dá para começar por lá, em &quot;Notas abaixo da média&quot;.</p>
      {missing && <p className="small" style={{ margin: "8px 0 0" }}>{SUB_MIGRATION}</p>}
    </section>
  );
}
