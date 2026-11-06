// Acompanhamento para a SUB: quando uma prova tem nota abaixo da média mínima da disciplina, o app pergunta
// se a pessoa quer se preparar para a SUB. Aceitando (assessments.sub_prep = 1 na prova), a SUB entra no
// planejamento reverso com os conteúdos da prova, contando só o estudo feito depois dela, e ganha listas de
// exercícios para refazer (as mesmas listas de exercícios do progresso pré-prova, ligadas à SUB).
import { addDays, daysBetween, nf } from "./calc";
import { isTrivial } from "./effort";
import type { Assessment, ExerciseList, Subject } from "./types";

/** A SUB costuma ser no fim do semestre: com acompanhamento, entra no plano até 60 dias antes (as provas, 30) */
export const SUB_HORIZON = 60;
/** Até quantos dias depois da prova o app ainda pergunta */
export const ASK_DAYS = 45;

export const isLow = (a: Assessment, s: Subject | undefined) =>
  !!s && a.kind === "prova" && a.grade != null && Number(a.grade) < Number(s.min_avg);

/** A SUB ligada à prova ("Tem SUB?") */
export const subOf = (exam: Assessment, assessments: Assessment[]) =>
  (exam.sub_id && assessments.find((a) => a.id === exam.sub_id && a.kind === "sub")) || null;

/** SUB que já aconteceu ou não vai acontecer: não dá mais para se preparar */
const subOver = (sub: Assessment, today: string) => sub.grade != null || sub.status === "cancelado" || (!!sub.date && sub.date < today);

/** SUBs com acompanhamento: alguma prova ligada a ela tem sub_prep = 1 */
export function trackedSubs(assessments: Assessment[]): Set<string> {
  const subs = new Set(assessments.filter((a) => a.kind === "sub").map((a) => a.id));
  return new Set(assessments.filter((a) => a.kind === "prova" && a.sub_prep === 1 && a.sub_id && subs.has(a.sub_id)).map((a) => a.sub_id!));
}

/** Provas com nota que a SUB pode substituir (as marcadas com ela), da mais antiga para a mais recente */
export function coveredBy(sub: Assessment, assessments: Assessment[]): Assessment[] {
  return assessments.filter((a) => a.kind === "prova" && a.sub_id === sub.id && a.grade != null)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

/** Dia da última prova feita que a SUB substitui: o estudo para a SUB conta a partir do dia seguinte */
export function subSince(sub: Assessment, assessments: Assessment[], today: string): string | null {
  const ds = coveredBy(sub, assessments).map((a) => a.date).filter((d): d is string => !!d && d <= today).sort();
  return ds.length ? ds[ds.length - 1] : null;
}

export interface SubAsk { exam: Assessment; subject: Subject; sub: Assessment | null; why: string }

/** Provas com nota baixa para perguntar "Quer se preparar para a SUB?" (a mais recente primeiro).
 *  `all`: também as já respondidas com "não" (para a lista da aba Provas, onde dá para mudar de ideia). */
export function subAsks(p: { assessments: Assessment[]; subjects: Subject[]; today: string; skip?: Set<string>; all?: boolean }): SubAsk[] {
  const subj = new Map(p.subjects.filter((s) => !s.archived && !isTrivial(s) && s.recovery !== "exame").map((s) => [s.id, s]));
  const tracked = trackedSubs(p.assessments);
  const out: SubAsk[] = [];
  for (const a of p.assessments) {
    const s = subj.get(a.subject_id);
    if (!s || !isLow(a, s) || a.status === "cancelado" || p.skip?.has(a.id)) continue;
    if (a.sub_prep === 1 || (a.sub_prep === 0 && !p.all)) continue;
    // nota com data no futuro é palpite (ver earlyGrades); prova muito antiga já passou da hora
    if (a.date && (a.date > p.today || daysBetween(a.date, p.today) > ASK_DAYS)) continue;
    const sub = subOf(a, p.assessments);
    if (sub && (subOver(sub, p.today) || tracked.has(sub.id))) continue;
    out.push({ exam: a, subject: s, sub, why: `Nota ${nf(Number(a.grade))} na ${a.name}; a média mínima de ${s.name} é ${nf(Number(s.min_avg))}.` });
  }
  return out.sort((x, y) => (y.exam.date || "").localeCompare(x.exam.date || ""));
}

export interface AcceptPlan {
  /** a disciplina passa a ter SUB (como o botão "+ SUB" das Notas) */
  subject: Subject | null;
  /** SUB nova (gravar antes das provas, que apontam para ela) */
  newSub: Assessment | null;
  /** a SUB (nova ou a que já existia), com a data escolhida */
  sub: Assessment;
  /** provas alteradas: a da nota baixa com sub_prep = 1 e, numa SUB nova, as provas sem SUB ligadas a ela */
  rows: Assessment[];
}

/** O que gravar ao aceitar o acompanhamento. Usa a SUB da prova; sem ela, a única SUB da disciplina que ainda
 *  vai acontecer; sem nenhuma, cria uma (a primeira SUB vale para todas as provas sem SUB, como no "+ SUB"). */
export function acceptSub(p: { exam: Assessment; subject: Subject; assessments: Assessment[]; date: string; today: string; id: string }): AcceptPlan {
  const subs = p.assessments.filter((a) => a.subject_id === p.subject.id && a.kind === "sub");
  let sub = subOf(p.exam, p.assessments);
  if (!sub) { const open = subs.filter((x) => !subOver(x, p.today)); if (open.length === 1) sub = open[0]; }
  const subject = p.subject.recovery === "sub" ? null : { ...p.subject, recovery: "sub" as const, exam_enabled: false };
  if (sub) {
    const rows: Assessment[] = [{ ...p.exam, sub_id: sub.id, sub_prep: 1 }];
    const dated = sub.date === p.date ? sub : { ...sub, date: p.date };
    if (dated !== sub) rows.push(dated);
    return { subject, newSub: null, sub: dated, rows };
  }
  const newSub: Assessment = { id: p.id, subject_id: p.subject.id, name: subs.length ? `SUB ${subs.length + 1}` : "SUB", kind: "sub", date: p.date, time: null, weight: 1, grade: null,
    predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null };
  const others = subs.length ? [] : p.assessments.filter((a) => a.subject_id === p.subject.id && a.kind === "prova" && !a.sub_id && a.id !== p.exam.id).map((a) => ({ ...a, sub_id: p.id }));
  return { subject, newSub, sub: newSub, rows: [{ ...p.exam, sub_id: p.id, sub_prep: 1 }, ...others] };
}

/** Data sugerida para uma SUB sem data: 3 semanas depois de hoje (é só um ponto de partida; a pessoa acerta) */
export const guessSubDate = (today: string) => addDays(today, 21);

/** Listas da prova copiadas para a SUB, zeradas, para refazer */
export function redoCopies(lists: ExerciseList[], sub: Assessment, after: number, now: string, newId: () => string): ExerciseList[] {
  return lists.map((l, i) => ({ id: newId(), subject_id: sub.subject_id, assessment_id: sub.id, event_id: null, name: `Refazer: ${l.name}`.slice(0, 120),
    kind: l.kind, items: [...l.items], done: {}, position: after + i, created_at: now }));
}
