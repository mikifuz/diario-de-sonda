/* "Como foi a prova?": depois do horário da prova, o app pergunta como a pessoa se sentiu.
 * A resposta (assessments.felt, 1–5; 0 = não perguntar) é só uma impressão: não é nota,
 * não entra em média nem em acerto. Indo mal, o app recomenda uma revisão antes da próxima prova. */
import { daysBetween, dkey, keyDate, pad } from "./calc";
import { anchorFor, dm, firstDue, toMin } from "./plan";
import type { Assessment, RoutineBlock, Subject } from "./types";

export const FELT = ["Muito mal", "Mal", "Mais ou menos", "Bem", "Muito bem"];
export const FELT_OPTS = FELT.map((f, i) => [i + 1, f] as [number, string]);
/** Até quantos dias depois da prova o app ainda pergunta */
export const ASK_DAYS = 7;
/** Prova sem aula na rotina: duração suposta a partir do horário cadastrado */
const DEFAULT_MIN = 120;
/** Sem horário nenhum: pergunta a partir das 18h do dia */
const LATE = 18 * 60;

const hm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** Blocos de aula da disciplina no dia da semana, com horários seguidos juntos (até 20 min de intervalo) */
function classSpans(blocks: RoutineBlock[], subjectId: string, weekday: number): [number, number][] {
  const bs = blocks.filter((b) => b.kind === "aula" && b.subject_id === subjectId && b.weekday === weekday)
    .map((b) => [toMin(b.start_time), toMin(b.end_time)] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const b of bs) {
    const last = out[out.length - 1];
    if (last && b[0] - last[1] <= 20) last[1] = Math.max(last[1], b[1]);
    else out.push([...b]);
  }
  return out;
}

/** Quando a prova termina (minutos do dia), com o motivo */
export function examEnd(a: Assessment, blocks: RoutineBlock[]): { start: number | null; end: number; why: string } {
  const spans = a.date ? classSpans(blocks, a.subject_id, keyDate(a.date).getDay()) : [];
  if (a.time) {
    const start = toMin(a.time);
    const span = spans.find(([s, e]) => start >= s - 30 && start < e);
    if (span) return { start, end: span[1], why: `prova às ${a.time}, no horário da aula (até ${hm(span[1])})` };
    return { start, end: start + DEFAULT_MIN, why: `prova às ${a.time} (contando 2 h de prova)` };
  }
  if (spans.length) return { start: spans[0][0], end: spans[0][1], why: `no horário da aula da rotina (${hm(spans[0][0])}–${hm(spans[0][1])})` };
  return { start: null, end: LATE, why: "sem horário cadastrado nem aula na rotina; pergunto a partir das 18h" };
}

export interface ExamCheck { exam: Assessment; when: string; why: string }

/** Provas (e SUBs) que já aconteceram, ainda sem nota e sem resposta, dos últimos dias */
export function pendingExamChecks(p: { assessments: Assessment[]; blocks: RoutineBlock[]; now: Date; skip?: Set<string>; answered?: Record<string, number> }): ExamCheck[] {
  const today = dkey(p.now);
  const nowMin = p.now.getHours() * 60 + p.now.getMinutes();
  const out: ExamCheck[] = [];
  for (const a of p.assessments) {
    if ((a.kind !== "prova" && a.kind !== "sub") || !a.date || a.status === "cancelado") continue;
    if (a.grade != null || a.felt != null || p.answered?.[a.id] != null || p.skip?.has(a.id)) continue;
    const ago = daysBetween(a.date, today);
    if (ago < 0 || ago > ASK_DAYS) continue;
    const e = examEnd(a, p.blocks);
    if (ago === 0 && nowMin < e.end) continue;
    const when = ago === 0 ? (e.start != null ? `hoje às ${hm(e.start)}` : "hoje") : ago === 1 ? "ontem" : `em ${dm(a.date)}`;
    out.push({ exam: a, when, why: e.why });
  }
  // a mais recente primeiro (memória mais fresca)
  return out.sort((x, y) => y.exam.date!.localeCompare(x.exam.date!) || (y.exam.time || "").localeCompare(x.exam.time || ""));
}

export interface ExamAdvice {
  /** recomenda (e já deixa marcado) anotar uma revisão */
  strong: boolean;
  offer: boolean;
  text: string;
  next: Assessment | null;
  due: string;
  title: string;
}

/** O que dizer depois da resposta, com a revisão sugerida (ancorada na próxima prova da disciplina) */
export function examAdvice(p: { exam: Assessment; felt: number; assessments: Assessment[]; subjects: Subject[]; steps: number[]; today: string }): ExamAdvice {
  const others = p.assessments.filter((a) => a.id !== p.exam.id && !(a.date && p.exam.date && a.date <= p.exam.date));
  const next = anchorFor(p.exam.subject_id, null, others, p.today)?.a ?? null;
  const subName = p.subjects.find((s) => s.id === p.exam.subject_id)?.name || "";
  const due = firstDue(p.steps, p.today, next?.date);
  const title = `Revisar ${p.exam.name}${subName ? ` de ${subName}` : ""}: refazer as questões em que travou`.slice(0, 200);
  let nextTxt = "";
  if (next?.date) {
    const d = daysBetween(p.today, next.date);
    nextTxt = ` A próxima é ${next.kind === "sub" ? "a SUB" : next.name} ${d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`} (${dm(next.date)}).`;
  }
  const base = { next, due, title };
  if (p.felt <= 2) return { ...base, strong: true, offer: true,
    text: `Recomendo muito uma revisão: é legal revisar antes de partir para a próxima prova. Refaça as questões em que travou enquanto ainda lembra delas e anote os erros no banco de erros.${nextTxt}` };
  if (p.felt === 3) return { ...base, strong: false, offer: true,
    text: `Vale anotar agora onde travou, enquanto lembra. Uma revisão curta ajuda a não carregar a dúvida para a próxima.${nextTxt}` };
  return { ...base, strong: false, offer: false, text: "Boa! Quando sair a nota, lance em Notas da disciplina." };
}

/** Respostas guardadas só neste aparelho (quando o banco ainda não tem a coluna `felt`) */
export const FELT_LOCAL = "ds-exam-felt";
