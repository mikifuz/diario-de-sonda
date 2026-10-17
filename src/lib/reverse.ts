// Planejamento reverso: a partir da data de cada prova, distribui o estudo dos conteúdos
// que caem nela pelos blocos de estudo da rotina, até a véspera. Calculado na hora (não
// fica gravado): conforme você estuda, o que falta diminui e o plano se refaz.
import { addDays, daysBetween, dkey } from "./calc";
import { effortOf, isTrivial, scaleMin } from "./effort";
import { dayOff, dm, extraStudy, freeStudy, freeWindows, toMin, topicsForExam, tripOn, type FreeWindow, type Task } from "./plan";
import type { Assessment, CalEvent, RoutineBlock, Session, Subject, Topic } from "./types";

/** Minutos de estudo que cada conteúdo deve receber antes da prova (antes da dificuldade da matéria) */
export const TARGET = 120;
/** Revisão geral na véspera (resumo + prova antiga) */
export const FINAL_MIN = 60;
/** Parte do tempo de estudo de cada dia que fica livre para as aulas (consolidar e adiantar) */
export const RESERVE = 0.2;
/** Prova sem nenhum conteúdo cadastrado: tempo para a matéria toda (antes da dificuldade) */
export const NO_TOPICS_MIN = 240;
/** Sem nenhum bloco de estudo na rotina: minutos de estudo por dia que o plano supõe (sem horário marcado) */
export const NO_BLOCKS_DAY_MIN = 120;
export const NO_BLOCKS_NOTE = `Você ainda não marcou horários de estudo na rotina: o app conta ${NO_BLOCKS_DAY_MIN / 60} h de estudo por dia, sem horário. Marque seus horários em Calendário → Rotina semanal para o plano encaixar o estudo no seu dia.`;
const CHUNK = 45, MIN_CHUNK = 15;
const HORIZON = 30;

export interface RevInput {
  today: string; nowMin: number;
  blocks: RoutineBlock[]; events: CalEvent[]; subjects: Subject[]; topics: Topic[]; sessions: Session[];
  assessments: Assessment[];
}
export interface Chunk { key: string; examId: string; subjectId: string; topicId: string | null; day: string; minutes: number; title: string; why: string; final?: boolean; /** matéria toda (prova sem conteúdos) */ whole?: boolean }
export interface TopicNeed { topic: Topic; target: number; done: number; need: number; available: string | null }
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
  /** quando falta tempo: horários livres (sem nada na rotina nem no calendário) para estudar a mais */
  suggest: FreeWindow[];
  notes: string[];
}

const r5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);
const fmtH = (m: number) => (m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m / 60} h`);

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
  const why = t.done === 0 ? "nada estudado ainda para esta prova" : `estudou ${t.done} de ${t.target} min da meta`;
  const how = t.done === 0 ? "comece pelos exercícios do básico e depois vá para o nível de prova" : "exercícios no nível de prova, principalmente os tipos que ainda travam";
  return { topic: t.topic, why, how };
}

/** Horários livres para estudar a mais antes da prova: os dois maiores, em dias diferentes, de até 2 h.
 *  `taken`: horários já sugeridos para outra prova (cada horário livre é sugerido uma vez só). */
export function suggestWindows(p: Pick<RevInput, "blocks" | "events" | "today" | "nowMin">, eve: string, missing: number, taken = new Set<string>()): FreeWindow[] {
  const all: FreeWindow[] = [];
  for (let d = p.today; d <= eve; d = addDays(d, 1)) all.push(...freeWindows(p.blocks, p.events, d, d === p.today ? Math.ceil((p.nowMin + 30) / 30) * 30 : undefined));
  const want = Math.min(120, Math.max(60, Math.ceil(missing / 30) * 30));
  const out: FreeWindow[] = [];
  for (const w of all.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.day.localeCompare(b.day) || a.start - b.start)) {
    if (out.length >= 2 || out.some((x) => x.day === w.day) || taken.has(`${w.day}@${w.start}`)) continue;
    taken.add(`${w.day}@${w.start}`);
    out.push({ day: w.day, start: w.start, end: Math.min(w.end, w.start + want) });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** Prova cadastrada só no calendário (sem contar na média) também entra no plano, se não houver
 *  uma prova da mesma disciplina no mesmo dia em Notas. */
export function calendarExams(events: CalEvent[], assessments: Assessment[]): Assessment[] {
  return events.filter((e) => e.type === "prova" && e.subject_id && e.status !== "cancelado" && e.status !== "concluido" && e.date
    && !assessments.some((a) => a.subject_id === e.subject_id && a.date === e.date && (a.kind === "prova" || a.kind === "sub")))
    .map((e) => ({ id: e.id, subject_id: e.subject_id!, name: e.title || "Prova", kind: "prova", date: e.date, time: e.time, weight: 0, grade: null, predicted: null,
      sim_c: null, sim_e: null, sim_o: null, priority: e.priority, status: e.status, description: e.description, sub_id: null }));
}

export function reversePlan(p0: RevInput): ExamPlan[] {
  const p = { ...p0, assessments: [...p0.assessments, ...calendarExams(p0.events, p0.assessments)] };
  const active = new Map(p.subjects.filter((s) => !s.archived).map((s) => [s.id, s]));
  const exams = p.assessments
    .filter((a) => a.kind === "prova" && active.has(a.subject_id) && !isTrivial(active.get(a.subject_id)) && a.grade == null && a.status !== "cancelado" && a.date && a.date > p.today && daysBetween(p.today, a.date) <= HORIZON)
    .sort((a, b) => a.date!.localeCompare(b.date!) || Number(b.weight) - Number(a.weight));
  // capacidade de cada dia (minutos de estudo livres, menos a reserva). Sem nenhum bloco de estudo na rotina,
  // supõe 2 h por dia (menos viagem e dia indisponível): antes, sem blocos, nenhuma prova recebia estudo.
  const noBlocks = !p.blocks.some((b) => b.kind === "estudo");
  const cap = new Map<string, number>();
  const capOf = (d: string) => {
    if (!cap.has(d)) {
      const off = tripOn(d, p.events) || dayOff(d, p.events) || p.events.some((e) => e.date === d && e.type === "indisponivel" && !e.time && e.status !== "cancelado");
      const extra = extraStudy(p.events, d).reduce((x, b) => x + Math.max(0, toMin(b.end_time) - Math.max(toMin(b.start_time), d === p.today ? p.nowMin : 0)), 0);
      const free = noBlocks ? (off ? 0 : NO_BLOCKS_DAY_MIN + extra)
        : freeStudy(p.blocks, p.events, d).blocks.reduce((x, b) => x + Math.max(0, toMin(b.end_time) - Math.max(toMin(b.start_time), d === p.today ? p.nowMin : 0)), 0);
      cap.set(d, Math.floor(free * (1 - RESERVE)));
    }
    return cap.get(d)!;
  };
  const take = (d: string, m: number) => cap.set(d, capOf(d) - m);
  const out: ExamPlan[] = [];
  const suggested = new Set<string>();

  for (const exam of exams) {
    const subject = active.get(exam.subject_id)!;
    const days = daysBetween(p.today, exam.date!);
    const eve = addDays(exam.date!, -1);
    const from = addDays(exam.date!, -45);
    const notes: string[] = noBlocks ? [NO_BLOCKS_NOTE] : [];
    const eff = effortOf(subject);
    if (eff.why) notes.push(eff.why);
    const topics: TopicNeed[] = examTopics(exam, p.topics, p.assessments, p.today).map((t) => {
      const target = scaleMin(TARGET, eff.factor);
      const done = p.sessions.filter((s) => s.topic_id === t.id && dkey(s.started_at) >= from && dkey(s.started_at) <= p.today).reduce((a, s) => a + s.duration_min, 0);
      // conteúdo ainda não dado: só entra a partir da aula
      const available = t.taught_on && t.taught_on > p.today ? t.taught_on : null;
      return { topic: t, target, done, need: r5(target - done), available };
    })
      // quando não cabe tudo, o tempo vai primeiro para o que foi menos estudado (nada estudado na frente), depois pela ordem das aulas
      .sort((a, b) => a.done / a.target - b.done / b.target || (a.topic.taught_on || "").localeCompare(b.topic.taught_on || ""));
    // sem conteúdos cadastrados: reserva tempo para a matéria toda (sem isso a prova ficava sem nenhum estudo até a véspera)
    let whole: { target: number; done: number; need: number } | null = null;
    if (!topics.length) {
      const target = scaleMin(NO_TOPICS_MIN, eff.factor);
      const done = p.sessions.filter((s) => s.subject_id === subject.id && dkey(s.started_at) >= from && dkey(s.started_at) <= p.today).reduce((a, s) => a + s.duration_min, 0);
      whole = { target, done, need: r5(target - done) };
      notes.push(`Nenhum conteúdo ligado a esta prova: o app reserva ${fmtH(target)} para a matéria toda (exercícios e resumo) e desconta o que você já estudou de ${subject.name}. Importe o cronograma ou cadastre os conteúdos para o plano dizer o que estudar em cada dia.`);
    }

    const chunks: Chunk[] = [];
    let missing = 0;
    // 1) revisão geral na véspera
    if (days >= 1) {
      const m = Math.min(FINAL_MIN, capOf(eve));
      if (m >= MIN_CHUNK) {
        take(eve, m);
        chunks.push({ key: `f-${exam.id}`, examId: exam.id, subjectId: subject.id, topicId: null, day: eve, minutes: m, final: true,
          title: `Revisão geral para a ${exam.name}`, why: `Véspera da ${exam.name}: resumo dos conteúdos e uma prova antiga, sem conteúdo novo.` });
        if (m < FINAL_MIN) missing += FINAL_MIN - m;
      } else { missing += FINAL_MIN; notes.push(`Sem tempo de estudo na véspera (${dm(eve)}) para a revisão geral.`); }
    }
    // 2) conteúdos, em pedaços de até 45 min, no máximo um pedaço por conteúdo por dia (espaçado)
    const split = (need: number) => {
      const parts: number[] = [];
      let left = need;
      while (left > 0) { const c = Math.min(CHUNK, left); parts.push(c); left -= c; }
      if (parts.length > 1 && parts[parts.length - 1] < MIN_CHUNK) parts[parts.length - 2] += parts.pop()!;
      return parts;
    };
    const pending: { id: string; t: TopicNeed | null; m: number; available: string | null }[] = whole
      // matéria toda: até dois pedaços por dia (com conteúdos cadastrados, é um por conteúdo por dia)
      ? split(whole.need).map((m, i) => ({ id: `*${i % 2}`, t: null, m, available: null }))
      : topics.flatMap((t) => split(t.need).map((m) => ({ id: t.topic.id, t, m, available: t.available })));
    for (let d = p.today; d < exam.date! && pending.length; d = addDays(d, 1)) {
      const used = new Set<string>();
      for (let i = 0; i < pending.length; ) {
        const { id, t, m, available } = pending[i];
        if (used.has(id) || (available && available > d) || capOf(d) < m) { i++; continue; }
        take(d, m);
        used.add(id);
        const left = `${daysBetween(d, exam.date!) === 1 ? "Falta 1 dia" : `Faltam ${daysBetween(d, exam.date!)} dias`} para a ${exam.name} de ${subject.name}.`;
        if (t) {
          chunks.push({ key: `c-${exam.id}-${t.topic.id}-${d}`, examId: exam.id, subjectId: subject.id, topicId: t.topic.id, day: d, minutes: m,
            title: `${t.topic.name}`, why: `${left} ${t.topic.name}: meta de ${t.target} min antes da prova, já estudou ${t.done} min.` });
        } else {
          chunks.push({ key: `g-${exam.id}-${d}`, examId: exam.id, subjectId: subject.id, topicId: null, day: d, minutes: m, whole: true,
            title: `Matéria da ${exam.name} (exercícios e resumo)`, why: `${left} Sem conteúdos cadastrados: meta de ${whole!.target} min para a matéria toda, já estudou ${whole!.done} min de ${subject.name}.` });
        }
        pending.splice(i, 1);
      }
    }
    missing += pending.reduce((a, x) => a + x.m, 0);
    const priority: Priority[] = missing > 0 ? topics.filter((t) => t.need > 0).slice(0, 3).map(priorityOf) : [];
    const suggest = missing > 0 ? suggestWindows(p, eve, missing, suggested) : [];
    if (missing > 0 && (topics.length || whole)) notes.push(`Faltam ${missing} min de estudo antes da ${exam.name}: não couberam nos seus horários de estudo até ${dm(eve)} (depois das provas anteriores e de ${Math.round(RESERVE * 100)}% reservado para as aulas).`);
    if (topics.some((t) => t.available)) notes.push("Conteúdos que ainda não foram dados entram no plano a partir da data da aula.");
    out.push({ exam, subject, days, topics, chunks: chunks.sort((a, b) => a.day.localeCompare(b.day)), missing, priority, suggest, notes });
  }
  return out;
}

/** Os pedaços de hoje viram tarefas do plano do dia */
export function todayTasks(plans: ExamPlan[], today: string): Task[] {
  return plans.flatMap((pl) => pl.chunks.filter((c) => c.day === today).map((c) => ({
    key: "p" + c.key, kind: "preparar" as const, title: c.final ? c.title : c.whole ? `Estudar ${pl.subject.name} para a ${pl.exam.name}` : `Estudar ${c.title} para a ${pl.exam.name}`, subject_id: c.subjectId, topic_id: c.topicId,
    minutes: c.minutes, why: c.why,
    // prova em até 3 dias vem antes de tudo; senão logo antes das aulas: o planejamento reverso só põe
    // no dia o que cabe em 80% do tempo de estudo, e o resto (a reserva) fica para as aulas.
    // (antes vinha depois das aulas, e consolidar/adiantar de outras matérias tomava o bloco inteiro.)
    rank: [pl.days <= 3 ? 0 : 0.5, pl.days, 0, -Number(pl.exam.weight), 0, 0],
  })));
}
