"use client";
import { useMemo, useState, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import { parseNum, todayKey } from "@/lib/calc";
import { cleanSteps, dm } from "@/lib/plan";
import { examAdvice, FELT_LOCAL, FELT_OPTS, pendingExamChecks, type ExamCheck } from "@/lib/examCheck";
import type { Assessment, ReviewItem } from "@/lib/types";
import { Modal, Slider, useNow } from "./ui";

const readLocal = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(FELT_LOCAL) || "{}") || {}; } catch { return {}; }
};
const writeLocal = (id: string, felt: number) => {
  try { localStorage.setItem(FELT_LOCAL, JSON.stringify({ ...readLocal(), [id]: felt })); } catch { /* sem armazenamento */ }
};

/** Depois do horário de uma prova, pergunta como foi (uma de cada vez, a mais recente primeiro) */
export function ExamCheckHost() {
  const st = useStore();
  const now = useNow(60000);
  const [skip, setSkip] = useState<Set<string>>(() => new Set());
  const [local, setLocal] = useState<Record<string, number>>(readLocal);
  const pending = useMemo(
    () => (st.ready ? pendingExamChecks({ assessments: st.assessments, blocks: st.blocks, now: new Date(now), skip, answered: local }) : []),
    [st.ready, st.assessments, st.blocks, now, skip, local]);
  if (!pending.length || st.evalId) return null;
  const c = pending[0];
  return <ExamCheckModal key={c.exam.id} c={c}
    onLater={() => setSkip((s) => new Set(s).add(c.exam.id))}
    onLocal={(felt) => { writeLocal(c.exam.id, felt); setLocal(readLocal()); }} />;
}

function ExamCheckModal({ c, onLater, onLocal }: { c: ExamCheck; onLater: () => void; onLocal: (felt: number) => void }) {
  const st = useStore();
  const today = todayKey();
  const exam = c.exam;
  const sub = st.subjects.find((s) => s.id === exam.subject_id);
  const [felt, setFelt] = useState<number | null>(null);
  const [review, setReview] = useState<boolean | null>(null);
  const [minutes, setMinutes] = useState("45");
  const [busy, setBusy] = useState(false);
  const adv = felt ? examAdvice({ exam, felt, assessments: st.assessments, subjects: st.subjects, steps: cleanSteps(st.profile?.review_steps), today }) : null;
  const wantReview = !!adv?.offer && (review ?? adv.strong);
  // banco sem a coluna "felt" (migration não rodada): a resposta fica só neste aparelho
  const hasCol = st.demo || st.assessments.some((a) => "felt" in a);

  const saveFelt = async (v: number) => {
    if (!hasCol) { onLocal(v); return true; }
    return st.save("assessments", { ...exam, felt: v } as Assessment);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!felt || !adv) { st.toast("Arraste a barra para dizer como foi."); return; }
    const min = parseNum(minutes);
    if (wantReview && (min == null || min < 5 || min > 240)) { st.toast("Tempo de revisão entre 5 e 240 minutos."); return; }
    setBusy(true);
    if (wantReview) {
      const item: ReviewItem = {
        id: crypto.randomUUID(), subject_id: exam.subject_id, topic_id: null, mistake_id: null, assessment_id: adv.next?.id ?? null,
        title: adv.title, step: 0, due: adv.due, est_min: Math.round(min!), active: true, last_reviewed_at: null,
      };
      if (!(await st.save("review_items", item))) { setBusy(false); return; }
    }
    if (!(await saveFelt(felt))) { setBusy(false); return; }
    st.toast(wantReview ? `Revisão anotada para ${adv.due === today ? "hoje" : dm(adv.due)}.` : "Obrigado! Anotado.");
  };
  const never = async () => { setBusy(true); if (!(await saveFelt(0))) setBusy(false); };

  return (
    <Modal title={`Como foi a ${exam.name}?`} sub={`${sub?.name || ""} · ${c.when}`} onClose={onLater}>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <p className="small muted" style={{ margin: 0 }}>Pelo calendário, a prova já passou ({c.why}). É só a sua impressão: não é nota e não entra em média nem acerto.</p>
        <div className="qblock"><span className="q">Como você acha que foi?</span>
          <Slider label="Como foi a prova" value={felt} onChange={setFelt} options={FELT_OPTS} /></div>
        {adv && (
          <div className={"callout" + (adv.strong ? "" : " info")}>
            {adv.text}
            {adv.offer && (
              <div className="row small" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
                <label className="check"><input type="checkbox" checked={wantReview} onChange={(e) => setReview(e.target.checked)} />
                  Anotar uma revisão para {adv.due === today ? "hoje" : dm(adv.due)}{adv.next ? ` (antes da ${adv.next.kind === "sub" ? "SUB" : adv.next.name})` : ""}</label>
                {wantReview && <label className="row" style={{ gap: 6 }}><input type="number" min={5} max={240} value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ width: 72 }} aria-label="Minutos da revisão" /> min</label>}
              </div>
            )}
          </div>
        )}
        {!hasCol && <p className="small muted" style={{ margin: 0 }}>A resposta fica guardada só neste aparelho até o banco ser atualizado.</p>}
        <div className="modal-f">
          <button type="button" className="btn ghost" style={{ marginRight: "auto" }} onClick={never} disabled={busy}>Não perguntar desta prova</button>
          <button type="button" className="btn ghost" onClick={onLater}>Agora não</button>
          <button className="btn pri" disabled={!felt || busy}>{wantReview ? "Salvar e anotar revisão" : "Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}
