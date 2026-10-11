// Rotina, revisão espaçada ancorada na prova e plano do dia. Funções puras, cobertas
// por testes. Cada decisão devolve o motivo (why) para aparecer na tela.
import { addDays, daysBetween, keyDate, pad, pct, verified } from "./calc";
import { DEFAULT_STEPS } from "./constants";
import type { Assessment, Autonomy, CalEvent, Mistake, Result, ReviewItem, RoutineBlock, Session, StudyPref, Subject, Topic } from "./types";

/* ============ Horas ============ */
export const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
export const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
/** "2026-11-14" → "14/11" */
export const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const emDias = (n: number) => (n === 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`);

/** Degraus válidos (dias crescentes e positivos); sem configuração usa o padrão */
export function cleanSteps(steps: number[] | null | undefined): number[] {
  const s = (steps || []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 120);
  return s.length ? s : DEFAULT_STEPS;
}

/** Texto "1, 3, 7" → [1, 3, 7]; devolve mensagem de erro se inválido */
export function parseSteps(txt: string): number[] | string {
  const parts = txt.split(/[,;\s]+/).filter(Boolean);
  if (!parts.length) return "Informe pelo menos um intervalo.";
  if (parts.length > 12) return "Use no máximo 12 intervalos.";
  const n = parts.map(Number);
  if (n.some((x) => !Number.isInteger(x) || x < 1 || x > 120)) return "Use dias inteiros entre 1 e 120.";
  if (n.some((x, i) => i > 0 && x <= n[i - 1])) return "Os intervalos precisam ser crescentes.";
  return n;
}

/** Horários escolhidos (índices) → intervalos; horários seguidos viram um bloco só */
export function slotRanges(idx: number[], slots: { start: string; end: string }[]): { start: string; end: string }[] {
  const sorted = [...new Set(idx)].filter((i) => slots[i]).sort((a, b) => a - b);
  const out: { start: string; end: string }[] = [];
  let prev = -2;
  for (const i of sorted) {
    if (i === prev + 1 && out.length) out[out.length - 1].end = slots[i].end;
    else out.push({ start: slots[i].start, end: slots[i].end });
    prev = i;
  }
  return out;
}

/* ============ Prova de cada revisão ============ */
const isExam = (a: Assessment) => a.kind === "prova" || a.kind === "sub";

/** Prova em que a revisão de um conteúdo se encerra: a indicada no conteúdo ou,
 *  se não houver, a próxima prova da disciplina. */
export function anchorFor(subjectId: string, topic: Topic | null | undefined, assessments: Assessment[], today: string): { a: Assessment; why: string } | null {
  if (topic?.assessment_id) {
    const a = assessments.find((x) => x.id === topic.assessment_id);
    if (a) return { a, why: `o conteúdo "${topic.name}" está marcado para ${a.name}` };
  }
  const next = assessments
    .filter((a) => a.subject_id === subjectId && isExam(a) && a.grade == null && a.status !== "cancelado" && a.date && a.date >= today)
    .sort((a, b) => a.date!.localeCompare(b.date!))[0];
  return next ? { a: next, why: `${next.name} é a próxima prova da disciplina (ajuste no conteúdo se não for o caso)` } : null;
}

/** Revisão em aberto ou encerrada, com o motivo */
export function itemState(item: ReviewItem, assessments: Assessment[], today: string): { open: boolean; why: string } {
  if (!item.active) return { open: false, why: "Encerrada por você." };
  const a = item.assessment_id ? assessments.find((x) => x.id === item.assessment_id) : null;
  if (a && a.status === "cancelado") return { open: false, why: `Encerrada: ${a.name} foi cancelada.` };
  if (a && (a.grade != null || (a.date && a.date < today))) return { open: false, why: `Encerrada: ${a.name} já foi realizada${a.date ? ` em ${dm(a.date)}` : ""}.` };
  return { open: true, why: a ? (a.date ? `Até ${a.name}, em ${dm(a.date)}.` : `Até ${a.name} (sem data cadastrada).`) : "Sem prova ligada: intervalos limitados a 14 dias." };
}

/** Primeira data de uma revisão nova: o primeiro degrau, sem passar da véspera da prova */
export function firstDue(steps: number[], today: string, examDate: string | null | undefined): string {
  let d = addDays(today, cleanSteps(steps)[0]);
  if (examDate) {
    const eve = addDays(examDate, -1);
    if (d > eve) d = eve < today ? today : eve;
  }
  return d;
}

/* ============ Revisão espaçada ============ */
export interface NextReview {
  step: number;
  /** null = não há mais revisão antes da prova */
  due: string | null;
  /** true = "ainda não conferi": nada muda */
  keep: boolean;
  why: string;
}
const NO_EXAM_CAP = 14;

/** Próxima data de revisão. Só o resultado conferido e a autonomia contam; a confiança não entra. */
export function nextReview(o: { step: number; steps: number[]; result: Result; autonomy: Autonomy | null; today: string; exam?: { date: string | null; name: string } | null }): NextReview {
  const steps = cleanSteps(o.steps);
  if (o.result === "nao") return { step: o.step, due: null, keep: true, why: "Ainda não conferido: a data não muda até você conferir o resultado." };
  let delta: number, reason: string;
  if (o.result === "errado") { delta = -Infinity; reason = "não conseguiu resolver, volta ao primeiro intervalo"; }
  else if (o.result === "parcial") { delta = -1; reason = "resolveu parcialmente, desce um intervalo"; }
  else if (o.autonomy === "sozinho") { delta = 1; reason = "resolveu sozinho, sobe um intervalo"; }
  else if (o.autonomy === "resolucao") { delta = -1; reason = "precisou ver a resolução, desce um intervalo"; }
  else if (o.autonomy) { delta = 0; reason = "resolveu com consulta ou ajuda, mantém o intervalo"; }
  else { delta = 0; reason = "resolveu, sem autonomia informada, mantém o intervalo"; }
  const step = Math.max(0, Math.min(steps.length - 1, delta === -Infinity ? 0 : o.step + delta));
  let days = steps[step];
  let extra = "";
  const examDate = o.exam?.date;
  if (!examDate && days > NO_EXAM_CAP) { days = NO_EXAM_CAP; extra = ` Limitado a ${NO_EXAM_CAP} dias porque não há prova com data ligada a esta revisão.`; }
  let due: string | null = addDays(o.today, days);
  if (examDate) {
    const eve = addDays(examDate, -1);
    if (eve <= o.today) { due = null; extra = ` ${o.exam!.name} é ${emDias(daysBetween(o.today, examDate))}: esta foi a última revisão antes dela.`; }
    else if (due > eve) { due = eve; days = daysBetween(o.today, eve); extra = ` Ajustado para a véspera de ${o.exam!.name} (${dm(eve)}).`; }
  }
  const head = due ? `Próxima revisão ${emDias(days)} (${dm(due)}): ${reason}.` : `Sem nova revisão: ${reason}.`;
  return { step, due, keep: false, why: head + extra };
}

/* ============ Plano do dia ============ */
export type TaskKind = "revisao" | "adiantar" | "consolidar";
export interface Task {
  key: string;
  kind: TaskKind;
  title: string;
  subject_id: string;
  topic_id: string | null;
  item_id?: string;
  minutes: number;
  /** não começar antes deste horário (minutos desde 0h) */
  notBefore?: number;
  why: string;
  rank: number[];
}
export interface Placed { task: Task; start: number; end: number }
export interface Slot { block: RoutineBlock; start: number; end: number; placed: Placed[] }
export interface DayPlan {
  slots: Slot[];
  overflow: Task[];
  /** minutos de estudo livres no resto do dia */
  capacity: number;
  /** minutos que as tarefas pediriam */
  need: number;
  notes: string[];
  hasStudyBlocks: boolean;
}
export interface PlanInput {
  today: string;
  nowMin: number;
  pref: StudyPref;
  blocks: RoutineBlock[];
  events: CalEvent[];
  subjects: Subject[];
  topics: Topic[];
  sessions: Session[];
  assessments: Assessment[];
  items: ReviewItem[];
  mistakes: Mistake[];
}

const CLASS_MIN = 30;
const cmpRank = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d; } return 0; };
const sessDay = (s: Session) => { const d = new Date(s.started_at); return { k: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, m: d.getHours() * 60 + d.getMinutes() }; };

/** Acerto conferido médio de um conteúdo (null sem dados) */
function topicAcc(sessions: Session[], topicId: string | null): number | null {
  if (!topicId) return null;
  let s = 0, n = 0;
  for (const x of sessions) { if (x.topic_id !== topicId) continue; const v = verified(x); if (v != null) { s += v; n++; } }
  return n ? s / n : null;
}

/** Blocos de estudo que sobram no dia, descontando compromissos do calendário */
export function freeStudy(blocks: RoutineBlock[], events: CalEvent[], day: string): { blocks: RoutineBlock[]; notes: string[] } {
  const wd = keyDate(day).getDay();
  let list = blocks.filter((b) => b.kind === "estudo" && b.weekday === wd).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const notes: string[] = [];
  for (const e of events) {
    if (e.date !== day || e.status === "cancelado" || (e.type !== "indisponivel" && e.type !== "pessoal")) continue;
    if (!e.time) {
      if (e.type === "indisponivel" && list.length) { notes.push(`Dia marcado como indisponível (${e.title}): blocos de estudo de hoje ignorados.`); list = []; }
      continue;
    }
    const t = toMin(e.time);
    const hit = list.filter((b) => toMin(b.start_time) <= t && t < toMin(b.end_time));
    for (const b of hit) notes.push(`Bloco das ${b.start_time.slice(0, 5)} ignorado: "${e.title}" às ${e.time.slice(0, 5)}.`);
    list = list.filter((b) => !hit.includes(b));
  }
  return { blocks: list, notes };
}

/** Tarefas candidatas para o dia, já com prioridade e motivo */
export function dayTasks(p: PlanInput): Task[] {
  const tasks: Task[] = [];
  const active = new Map(p.subjects.filter((s) => !s.archived).map((s) => [s.id, s]));

  // revisões vencidas (até hoje) e ainda abertas
  for (const it of p.items) {
    if (it.due > p.today || !active.has(it.subject_id) || !itemState(it, p.assessments, p.today).open) continue;
    const a = it.assessment_id ? p.assessments.find((x) => x.id === it.assessment_id) : null;
    const daysTo = a?.date ? daysBetween(p.today, a.date) : null;
    const late = daysBetween(it.due, p.today);
    const acc = topicAcc(p.sessions, it.topic_id);
    const nMist = it.topic_id ? p.mistakes.filter((m) => m.topic_id === it.topic_id).length : 0;
    const why = [
      a ? (daysTo != null ? `${a.name} ${emDias(daysTo)}` : `${a.name} sem data`) : "sem prova ligada",
      late > 0 ? `atrasada há ${plural(late, "dia", "dias")}` : "",
      acc != null ? `acerto conferido de ${pct(acc)} no conteúdo` : "",
      nMist > 1 ? `${nMist} erros registrados no conteúdo` : "",
    ].filter(Boolean).join("; ");
    tasks.push({
      key: "r" + it.id, kind: "revisao", title: it.title, subject_id: it.subject_id, topic_id: it.topic_id, item_id: it.id, minutes: it.est_min,
      why: why.charAt(0).toUpperCase() + why.slice(1) + ".",
      // prova em até 3 dias vem antes de tudo; depois prova mais próxima, atraso, peso, menor acerto, mais erros
      rank: [daysTo != null && daysTo <= 3 ? 0 : 2, daysTo ?? 999, -late, -(a ? Number(a.weight) : 0), acc ?? 1, -nMist],
    });
  }

  // aulas de hoje (consolidar) e de amanhã (adiantar), conforme a preferência
  const wd = keyDate(p.today).getDay();
  const tomorrow = addDays(p.today, 1);
  const todays = p.sessions.filter((s) => sessDay(s).k === p.today);
  const classes = (w: number) => p.blocks.filter((b) => b.kind === "aula" && b.weekday === w && b.subject_id && active.has(b.subject_id))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const seen = new Set<string>();
  for (const b of classes(wd).reverse()) {
    const s = active.get(b.subject_id!)!;
    const pref = s.study_pref ?? p.pref;
    if (pref === "antes" || seen.has(s.id)) continue;
    seen.add(s.id);
    const start = toMin(b.start_time), end = toMin(b.end_time);
    if (todays.some((x) => x.subject_id === s.id && sessDay(x).m >= start)) continue;
    const t = p.topics.find((x) => x.subject_id === s.id && x.taught_on === p.today);
    tasks.push({
      key: "c" + s.id, kind: "consolidar", title: `Consolidar a aula de ${s.name}${t ? `: ${t.name}` : ""}`, subject_id: s.id, topic_id: t?.id ?? null,
      minutes: CLASS_MIN, notBefore: end,
      why: `Aula de hoje às ${b.start_time.slice(0, 5)}; você prefere revisar depois da aula, enquanto está fresco.`,
      rank: [1, 0, 0, 0, 1, 0],
    });
  }
  seen.clear();
  for (const b of classes((wd + 1) % 7)) {
    const s = active.get(b.subject_id!)!;
    const pref = s.study_pref ?? p.pref;
    if (pref === "depois" || seen.has(s.id)) continue;
    seen.add(s.id);
    if (todays.some((x) => x.subject_id === s.id)) continue;
    const t = p.topics.filter((x) => x.subject_id === s.id && x.taught_on && x.taught_on >= tomorrow).sort((x, y) => x.taught_on!.localeCompare(y.taught_on!))[0];
    tasks.push({
      key: "a" + s.id, kind: "adiantar", title: `Adiantar ${s.name}${t ? `: ${t.name}` : ""}`, subject_id: s.id, topic_id: t?.id ?? null, minutes: CLASS_MIN,
      why: `Aula amanhã às ${b.start_time.slice(0, 5)}; você prefere chegar com o conteúdo adiantado.${t ? "" : " Cadastre a data das aulas nos conteúdos para saber qual é o próximo."}`,
      rank: [1, 1, 0, 0, 1, 0],
    });
  }
  return tasks.sort((a, b) => cmpRank(a.rank, b.rank));
}

/** Encaixa as tarefas nos blocos de estudo que sobram no dia, na ordem de prioridade */
export function planDay(p: PlanInput): DayPlan {
  const free = freeStudy(p.blocks, p.events, p.today);
  const hasStudyBlocks = p.blocks.some((b) => b.kind === "estudo");
  const slots: Slot[] = free.blocks
    .map((b) => ({ block: b, start: Math.max(toMin(b.start_time), p.nowMin), end: toMin(b.end_time), placed: [] as Placed[] }))
    .filter((s) => s.end - s.start >= 5);
  const tasks = dayTasks(p);
  const overflow: Task[] = [];
  for (const t of tasks) {
    let ok = false;
    for (const s of slots) {
      const cur = s.placed.length ? s.placed[s.placed.length - 1].end : s.start;
      const begin = Math.max(cur, t.notBefore ?? 0);
      if (begin + t.minutes <= s.end) { s.placed.push({ task: t, start: begin, end: begin + t.minutes }); ok = true; break; }
    }
    if (!ok) overflow.push(t);
  }
  return {
    slots, overflow, notes: free.notes, hasStudyBlocks,
    capacity: slots.reduce((a, s) => a + s.end - s.start, 0),
    need: tasks.reduce((a, t) => a + t.minutes, 0),
  };
}

/* ============ Carga até cada prova ============ */
export interface ExamLoad { a: Assessment; days: number; pending: number; need: number; capacity: number; tight: boolean; why: string }

/** Minutos de estudo na rotina por dia da semana */
export const weekCapacity = (blocks: RoutineBlock[]) => {
  const w = [0, 0, 0, 0, 0, 0, 0];
  for (const b of blocks) if (b.kind === "estudo") w[b.weekday] += toMin(b.end_time) - toMin(b.start_time);
  return w;
};

/** Para cada prova nos próximos 21 dias: revisões pendentes × tempo de estudo até a véspera.
 *  Estimativa simples: cada revisão aberta conta uma vez, e o tempo vale para todas as disciplinas. */
export function examLoads(p: Pick<PlanInput, "today" | "blocks" | "events" | "assessments" | "items" | "subjects">, horizon = 21): ExamLoad[] {
  const active = new Set(p.subjects.filter((s) => !s.archived).map((s) => s.id));
  const exams = p.assessments
    .filter((a) => active.has(a.subject_id) && isExam(a) && a.grade == null && a.status !== "cancelado" && a.date && a.date >= p.today && daysBetween(p.today, a.date) <= horizon)
    .sort((a, b) => a.date!.localeCompare(b.date!));
  const out: ExamLoad[] = [];
  for (const a of exams) {
    const days = daysBetween(p.today, a.date!);
    const its = p.items.filter((i) => i.assessment_id === a.id && itemState(i, p.assessments, p.today).open);
    if (!its.length) continue;
    const need = its.reduce((x, i) => x + i.est_min, 0);
    // tempo de estudo de hoje até a véspera, somando as provas anteriores que disputam o mesmo tempo
    let capacity = 0;
    for (let d = 0; d < days; d++) {
      const k = addDays(p.today, d);
      capacity += freeStudy(p.blocks, p.events, k).blocks.reduce((x, b) => x + toMin(b.end_time) - toMin(b.start_time), 0);
    }
    const before = out.reduce((x, o) => x + o.need, 0);
    const tight = need + before > capacity;
    out.push({
      a, days, pending: its.length, need, capacity, tight,
      why: `${plural(its.length, "revisão aberta", "revisões abertas")} (~${need} min)${before ? ` + ${before} min de provas anteriores` : ""} e ${capacity} min de estudo na sua rotina até a véspera.`,
    });
  }
  return out;
}
