// Planejamento reverso: a partir da data de cada prova, distribui o estudo dos conteúdos
// que caem nela pelos blocos de estudo da rotina, até a véspera. Calculado na hora (não
// fica gravado): conforme você estuda, o que falta diminui e o plano se refaz.
import { addDays, daysBetween, dkey, nf, qt } from "./calc";
import { BAND, mastery, type Band, type MasteryCfg } from "./mastery";
import { effortOf, isTrivial, scaleMin } from "./effort";
import { dm, freeStudy, toMin, topicsForExam, type Task } from "./plan";
import type { Assessment, CalEvent, Mistake, ReviewItem, ReviewLog, RoutineBlock, Session, Subject, Topic } from "./types";

/** Minutos de estudo que cada conteúdo deve receber antes da prova, pela faixa do índice */
export const TARGET: Record<Band | "sem", number> = { sem: 120, fragil: 120, construcao: 75, dominado: 30 };
/** Revisão geral na véspera (resumo + prova antiga) */
export const FINAL_MIN = 60;
/** Parte do tempo de estudo de cada dia que fica livre para revisões espaçadas e aulas */
export const RESERVE = 0.2;
const CHUNK = 45, MIN_CHUNK = 15;
const HORIZON = 30;

export interface RevInput {
  today: string; nowMin: number;
  blocks: RoutineBlock[]; events: CalEvent[]; subjects: Subject[]; topics: Topic[]; sessions: Session[];
  assessments: Assessment[]; items: ReviewItem[]; logs: ReviewLog[]; mistakes: Mistake[]; cfg?: MasteryCfg;
}
export interface Chunk { key: string; examId: string; subjectId: string; topicId: string | null; day: string; minutes: number; title: string; why: string; final?: boolean }
export interface TopicNeed { topic: Topic; score: number | null; band: Band | null; target: number; done: number; need: number; available: string | null; mistakes: number; conf: number | null; urgency: number }
/** Quando não cabe tudo: o que estudar primeiro, por quê e como */
export interface Priority { topic: Topic; why: string; how: string }
export interface ExamPlan {
  exam: Assessment; subject: Subject; days: number;
  topics: TopicNeed[];
  chunks: Chunk[];
  /** minutos que não couberam antes da prova */
  missing: number;
  /** quando falta tempo: os conteúdos para priorizar */
  priority: Priority[];
  notes: string[];
}

const r5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);

/** Conteúdos que caem numa prova (`topicsForExam`: marcados, pelos subconteúdos ou pela data da aula).
 *  Só os conteúdos "folha" (sem subconteúdos), para não contar o mesmo assunto duas vezes. */
export function examTopics(exam: Assessment, topics: Topic[], assessments: Assessment[], today: string): Topic[] {
  const next = assessments.filter((a) => a.subject_id === exam.subject_id && a.kind === "prova" && a.grade == null && a.status !== "cancelado" && a.date && a.date >= today)
    .sort((a, b) => a.date!.localeCompare(b.date!))[0];
  const parents = new Set(topics.map((t) => t.parent_id).filter(Boolean));
  return topicsForExam(exam, topics, assessments, next?.id).filter((t) => !parents.has(t.id));
}

/** O que estudar primeiro num conteúdo, com o motivo e o que fazer */
export function priorityOf(t: TopicNeed): Priority {
  const why = [
    t.score == null ? "ainda sem resultado conferido" : `domínio ${t.score} (${BAND[t.band!][0].toLowerCase()})`,
    t.mistakes ? qt(t.mistakes, "erro registrado", "erros registrados") : "",
    t.conf != null && t.conf <= 2.5 ? `confiança baixa (${nf(t.conf)}/5)` : "",
    t.done === 0 ? "nada estudado ainda para esta prova" : "",
  ].filter(Boolean).join(", ");
  const how = t.mistakes ? "refaça os exercícios em que errou e depois questões novas do mesmo tipo"
    : t.conf != null && t.conf <= 2.5 ? "resolva exercícios e confira as respostas: é o que mostra se a insegurança tem fundamento"
    : t.score == null ? "faça uma lista curta e anote quantas acertou"
    : "exercícios do básico ao nível de prova";
  return { topic: t.topic, why, how };
}

export function reversePlan(p: RevInput): ExamPlan[] {
  const active = new Map(p.subjects.filter((s) => !s.archived).map((s) => [s.id, s]));
  const exams = p.assessments
    .filter((a) => a.kind === "prova" && active.has(a.subject_id) && !isTrivial(active.get(a.subject_id)) && a.grade == null && a.status !== "cancelado" && a.date && a.date > p.today && daysBetween(p.today, a.date) <= HORIZON)
    .sort((a, b) => a.date!.localeCompare(b.date!) || Number(b.weight) - Number(a.weight));
  // capacidade de cada dia (minutos de estudo livres, menos a reserva)
  const cap = new Map<string, number>();
  const capOf = (d: string) => {
    if (!cap.has(d)) {
      const free = freeStudy(p.blocks, p.events, d).blocks.reduce((x, b) => x + Math.max(0, toMin(b.end_time) - Math.max(toMin(b.start_time), d === p.today ? p.nowMin : 0)), 0);
      cap.set(d, Math.floor(free * (1 - RESERVE)));
    }
    return cap.get(d)!;
  };
  const take = (d: string, m: number) => cap.set(d, capOf(d) - m);
  const mIn = { sessions: p.sessions, logs: p.logs, items: p.items, mistakes: p.mistakes, today: p.today, cfg: p.cfg };
  const out: ExamPlan[] = [];

  for (const exam of exams) {
    const subject = active.get(exam.subject_id)!;
    const days = daysBetween(p.today, exam.date!);
    const eve = addDays(exam.date!, -1);
    const from = addDays(exam.date!, -45);
    const notes: string[] = [];
    const eff = effortOf(subject, p.sessions);
    if (eff.why) notes.push(eff.why);
    const topics: TopicNeed[] = examTopics(exam, p.topics, p.assessments, p.today).map((t) => {
      const m = mastery(new Set([t.id]), mIn);
      const target = scaleMin(TARGET[m.band ?? "sem"], eff.factor);
      const done = p.sessions.filter((s) => s.topic_id === t.id && dkey(s.started_at) >= from && dkey(s.started_at) <= p.today).reduce((a, s) => a + s.duration_min, 0);
      // conteúdo ainda não dado: só entra a partir da aula
      const available = t.taught_on && t.taught_on > p.today ? t.taught_on : null;
      const mistakes = p.mistakes.filter((x) => x.topic_id === t.id && x.occurred_on >= from).length;
      const confs = p.sessions.filter((x) => x.topic_id === t.id && x.confidence != null && dkey(x.started_at) >= from).map((x) => x.confidence!);
      const conf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
      // urgência: domínio baixo (ou sem dados), erros registrados, confiança baixa e nada estudado ainda
      const urgency = (m.score == null ? 55 : 100 - m.score) + Math.min(3, mistakes) * 12 + (conf != null && conf <= 2.5 ? 20 : 0) + (done === 0 ? 10 : 0);
      return { topic: t, score: m.score, band: m.band, target, done, need: r5(target - done), available, mistakes, conf, urgency };
    }).sort((a, b) => b.urgency - a.urgency || (a.score ?? -1) - (b.score ?? -1));
    if (!topics.length) notes.push("Nenhum conteúdo ligado a esta prova. Importe o cronograma ou marque em cada conteúdo em que prova ele cai.");

    const chunks: Chunk[] = [];
    let missing = 0;
    // 1) revisão geral na véspera
    if (days >= 1) {
      const m = Math.min(FINAL_MIN, capOf(eve));
      if (m >= MIN_CHUNK) {
        take(eve, m);
        chunks.push({ key: `f-${exam.id}`, examId: exam.id, subjectId: subject.id, topicId: null, day: eve, minutes: m, final: true,
          title: `Revisão geral para a ${exam.name}`, why: `Véspera da ${exam.name}: resumo dos conteúdos, erros registrados e uma prova antiga, sem conteúdo novo.` });
        if (m < FINAL_MIN) missing += FINAL_MIN - m;
      } else { missing += FINAL_MIN; notes.push(`Sem tempo de estudo na véspera (${dm(eve)}) para a revisão geral.`); }
    }
    // 2) conteúdos, em pedaços de até 45 min, no máximo um pedaço por conteúdo por dia (espaçado)
    const pending = topics.flatMap((t) => {
      const parts: number[] = [];
      let left = t.need;
      while (left > 0) { const c = Math.min(CHUNK, left); parts.push(c); left -= c; }
      if (parts.length > 1 && parts[parts.length - 1] < MIN_CHUNK) parts[parts.length - 2] += parts.pop()!;
      return parts.map((m) => ({ t, m }));
    });
    for (let d = p.today; d < exam.date! && pending.length; d = addDays(d, 1)) {
      const used = new Set<string>();
      for (let i = 0; i < pending.length; ) {
        const { t, m } = pending[i];
        if (used.has(t.topic.id) || (t.available && t.available > d) || capOf(d) < m || (d === eve && capOf(d) < m)) { i++; continue; }
        take(d, m);
        used.add(t.topic.id);
        const label = t.band ? `domínio ${t.score} (${BAND[t.band][0]})` : "sem resultado conferido";
        chunks.push({ key: `c-${exam.id}-${t.topic.id}-${d}`, examId: exam.id, subjectId: subject.id, topicId: t.topic.id, day: d, minutes: m,
          title: `${t.topic.name}`, why: `${daysBetween(d, exam.date!) === 1 ? "Falta 1 dia" : `Faltam ${daysBetween(d, exam.date!)} dias`} para a ${exam.name} de ${subject.name}. ${t.topic.name}: ${label}; meta de ${t.target} min antes da prova, já estudou ${t.done} min.` });
        pending.splice(i, 1);
      }
    }
    missing += pending.reduce((a, x) => a + x.m, 0);
    const priority: Priority[] = missing > 0 ? topics.filter((t) => t.need > 0).slice(0, 3).map(priorityOf) : [];
    if (missing > 0 && topics.length) notes.push(`Faltam ${missing} min de estudo antes da ${exam.name}: não couberam nos blocos de estudo até ${dm(eve)} (depois das provas anteriores e de ${Math.round(RESERVE * 100)}% reservado para revisões e aulas).`);
    if (topics.some((t) => t.available)) notes.push("Conteúdos que ainda não foram dados entram no plano a partir da data da aula.");
    out.push({ exam, subject, days, topics, chunks: chunks.sort((a, b) => a.day.localeCompare(b.day)), missing, priority, notes });
  }
  return out;
}

/** Os pedaços de hoje viram tarefas do plano do dia */
export function todayTasks(plans: ExamPlan[], today: string): Task[] {
  return plans.flatMap((pl) => pl.chunks.filter((c) => c.day === today).map((c) => ({
    key: "p" + c.key, kind: "preparar" as const, title: c.final ? c.title : `Estudar ${c.title} para a ${pl.exam.name}`, subject_id: c.subjectId, topic_id: c.topicId,
    minutes: c.minutes, why: c.why,
    // prova em até 3 dias vem junto das revisões urgentes; senão depois das aulas
    rank: [pl.days <= 3 ? 0 : 1.5, pl.days, 0, -Number(pl.exam.weight), 0, 0],
  })));
}
