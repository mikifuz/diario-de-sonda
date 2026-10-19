// Rotina e plano do dia. Funções puras, cobertas por testes.
// Cada decisão devolve o motivo (why) para aparecer na tela.
import { addDays, daysBetween, keyDate, pad } from "./calc";
import { holidayOf } from "./holidays";
import { effortOf, isTrivial, scaleMin } from "./effort";
import type { Assessment, CalEvent, RoutineBlock, Session, StudyPref, Subject, Topic } from "./types";

/* ============ Horas ============ */
export const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
export const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
/** "2026-11-14" → "14/11" */
export const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;

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

/* ============ Dias sem aula ============ */
export interface NoClass { all: string | null; subjects: Map<string, string> }
/** Feriado nacional ou "Sem aula / feriado" no calendário (de todas as disciplinas ou de uma) */
export function noClass(day: string, events: CalEvent[]): NoClass {
  const h = holidayOf(day);
  let all: string | null = h ? `feriado de ${h}` : null;
  const subjects = new Map<string, string>();
  for (const e of events) {
    if (e.date !== day || e.type !== "sem_aula" || e.status === "cancelado") continue;
    const why = e.title?.trim() || "sem aula";
    if (e.subject_id) subjects.set(e.subject_id, why);
    else all = all ?? why;
  }
  return { all, subjects };
}
/* ============ Viagens ============ */
/** O item do calendário ocupa este dia? (viagem vai de `date` até `end_date`) */
export const evOn = (e: CalEvent, day: string) => e.date <= day && day <= (e.end_date && e.end_date > e.date ? e.end_date : e.date);
/** Viagem neste dia: até que horário dá para contar com a rotina (minutos desde 0h).
 *  Dia da ida com horário de saída: o que termina antes da saída continua; nos outros dias, nada. */
export function tripOn(day: string, events: CalEvent[]): { trip: CalEvent; until: number } | null {
  const trip = events.find((e) => e.type === "viagem" && e.status !== "cancelado" && evOn(e, day));
  if (!trip) return null;
  return { trip, until: trip.time && day === trip.date ? toMin(trip.time) : 0 };
}

/* ============ Day off ============ */
/** Folga (day off) marcada neste dia: o plano não põe estudo nele */
export const dayOff = (day: string, events: CalEvent[]) => events.find((e) => e.type === "folga" && e.status !== "cancelado" && e.date === day) ?? null;

/** Motivo de não haver aula desta disciplina no dia (null = tem aula) */
export const classOff = (nc: NoClass, subjectId: string | null) => nc.all ?? (subjectId ? nc.subjects.get(subjectId) ?? null : null);

/* ============ Em que prova cai cada conteúdo ============ */
const isExam = (a: Assessment) => a.kind === "prova" || a.kind === "sub";

/** Provas em que um conteúdo cai, sem pedir nada ao aluno:
 *  1) a prova marcada no conteúdo;
 *  2) num assunto com subconteúdos (ex.: "Oscilações"), as provas dos subconteúdos;
 *  3) sem marcação, pela data da aula: a primeira prova depois dela.
 *  Lista vazia = não dá para saber (sem marcação, sem aula e sem prova com data). */
export function topicExams(topic: Topic, topics: Topic[], assessments: Assessment[], seen = new Set<string>()): Assessment[] {
  seen.add(topic.id);
  if (topic.assessment_id) {
    const a = assessments.find((x) => x.id === topic.assessment_id);
    if (a) return [a];
  }
  const kids = topics.filter((t) => t.parent_id === topic.id && !seen.has(t.id));
  if (kids.length) {
    const out = new Map<string, Assessment>();
    for (const k of kids) for (const a of topicExams(k, topics, assessments, seen)) out.set(a.id, a);
    if (out.size) return [...out.values()];
  }
  if (topic.taught_on) {
    const a = assessments
      .filter((x) => x.subject_id === topic.subject_id && x.kind === "prova" && x.status !== "cancelado" && x.date && x.date > topic.taught_on!)
      .sort((x, y) => x.date!.localeCompare(y.date!))[0];
    if (a) return [a];
  }
  return [];
}

/** Conteúdos que caem numa prova (todos os níveis). Conteúdo de prova que já passou fica de fora;
 *  numa SUB entram os conteúdos das provas que ela substitui; sem como saber, o conteúdo vai para
 *  a próxima prova (nextId). */
export function topicsForExam(exam: Assessment, topics: Topic[], assessments: Assessment[], nextId: string | null | undefined): Topic[] {
  return topics.filter((t) => {
    if (t.subject_id !== exam.subject_id) return false;
    const ex = topicExams(t, topics, assessments);
    if (!ex.length) return exam.id === nextId;
    return ex.some((a) => a.id === exam.id || (exam.kind === "sub" && a.sub_id === exam.id));
  });
}

/** Prova de um conteúdo: a indicada no conteúdo ou, se não houver, a próxima prova da disciplina. */
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

/* ============ Plano do dia ============ */
export type TaskKind = "adiantar" | "consolidar" | "preparar";
export interface Task {
  key: string;
  kind: TaskKind;
  title: string;
  subject_id: string;
  topic_id: string | null;
  minutes: number;
  /** não começar antes deste horário (minutos desde 0h) */
  notBefore?: number;
  /** terminar até este horário (adiantar uma aula de hoje: antes de ela começar) */
  before?: number;
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
  /** day off marcado no dia */
  off: boolean;
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
  /** tarefas vindas do planejamento reverso (reverse.ts) */
  extra?: Task[];
  /** tarefas que a pessoa descartou (lixeira no quadrado), pelo `skipId` */
  skip?: Set<string>;
}

/** Identidade de uma tarefa descartada: aula com conteúdo some de vez (consolidar/adiantar aquele conteúdo);
 *  o resto (estudo das provas, aula sem conteúdo cadastrado) some só naquele dia */
export const skipId = (t: Task, day: string) => (t.kind !== "preparar" && t.topic_id ? `${t.kind}:${t.topic_id}` : `${t.key}@${day}`);

const CLASS_MIN = 30;
const cmpRank = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d; } return 0; };
const sessDay = (s: Session) => { const d = new Date(s.started_at); return { k: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, m: d.getHours() * 60 + d.getMinutes() }; };

/** Estudo extra marcado no calendário (tipo "Estudo planejado" com início e fim): vira bloco de estudo no dia */
export const extraStudy = (events: CalEvent[], day: string): RoutineBlock[] => events
  .filter((e) => e.type === "estudo" && e.date === day && e.status !== "cancelado" && e.time && e.end_time && toMin(e.end_time) > toMin(e.time))
  .map((e) => ({ id: `ev-${e.id}`, weekday: keyDate(day).getDay(), start_time: e.time!, end_time: e.end_time!, kind: "estudo" as const, subject_id: null, label: e.title || "Estudo extra" }));

/** Blocos de estudo que sobram no dia, descontando compromissos do calendário */
export function freeStudy(blocks: RoutineBlock[], events: CalEvent[], day: string): { blocks: RoutineBlock[]; notes: string[] } {
  const wd = keyDate(day).getDay();
  let list = [...blocks.filter((b) => b.kind === "estudo" && b.weekday === wd), ...extraStudy(events, day)];
  const notes: string[] = [];
  // day off: nenhum estudo no dia
  const off = dayOff(day, events);
  if (off) {
    notes.push("Hoje é seu day off: nada de estudo no plano. O que estava marcado para hoje foi para os outros dias.");
    return { blocks: [], notes };
  }
  // viagem: os blocos de estudo da rotina não contam (no dia da ida, só os que acabam antes da saída)
  const trip = tripOn(day, events);
  if (trip) {
    const kept = list.filter((b) => toMin(b.end_time) <= trip.until);
    if (list.length > kept.length) notes.push(trip.until
      ? `Viagem (${trip.trip.title}) com saída às ${fromMin(trip.until)}: só contam os blocos de estudo antes disso.`
      : `Viagem (${trip.trip.title}): os blocos de estudo da rotina neste dia não contam.`);
    return { blocks: kept.sort((a, b) => a.start_time.localeCompare(b.start_time)), notes };
  }
  // dia sem aula: os horários de aula viram tempo de estudo
  const nc = noClass(day, events);
  const off2 = blocks.filter((b) => b.kind === "aula" && b.weekday === wd && classOff(nc, b.subject_id));
  if (off2.length) {
    const why = [...new Set(off2.map((b) => classOff(nc, b.subject_id)!))].join("; ");
    notes.push(`Sem aula (${why}): ${off2.length === 1 ? "o horário da aula virou" : "os horários de aula viraram"} tempo de estudo.`);
    list = [...list, ...off2.map((b) => ({ ...b, id: `${b.id}-livre`, kind: "estudo" as const, subject_id: null, label: "Horário de aula livre" }))];
  }
  list.sort((a, b) => a.start_time.localeCompare(b.start_time));
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
  // day off: nada de estudo (o planejamento das provas já tira este dia)
  if (dayOff(p.today, p.events)) return [];

  // aulas de hoje (consolidar) e de amanhã (adiantar), conforme a preferência
  const yesterday = addDays(p.today, -1);
  const tomorrow = addDays(p.today, 1);
  const since = (sid: string, day: string, min = 0) => p.sessions.some((x) => { const d = sessDay(x); return x.subject_id === sid && (d.k > day || (d.k === day && d.m >= min)); });
  // aulas do dia (sem as de feriado ou de dia marcado "sem aula")
  const classes = (day: string) => {
    const nc = noClass(day, p.events), w = keyDate(day).getDay();
    const trip = tripOn(day, p.events);
    return p.blocks.filter((b) => b.kind === "aula" && b.weekday === w && b.subject_id && active.has(b.subject_id) && !isTrivial(active.get(b.subject_id)) && !classOff(nc, b.subject_id) && (!trip || toMin(b.start_time) < trip.until))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  };
  // dia de prova não tem aula de conteúdo: a aula daquele dia é a prova
  const examBetween = (sid: string, from: string, to: string) => p.assessments.find((a) => a.subject_id === sid && isExam(a) && a.status !== "cancelado" && a.date && a.date >= from && a.date <= to);
  const seen = new Set<string>();
  // consolidar: a aula de hoje e, se ainda não estudou a matéria depois dela, a de ontem (o que não coube ontem vem para hoje)
  for (const [day, ago] of [[p.today, 0], [yesterday, 1]] as const) {
    for (const b of classes(day).reverse()) {
      const s = active.get(b.subject_id!)!;
      const pref = s.study_pref ?? p.pref;
      if (pref === "antes" || seen.has(s.id)) continue;
      seen.add(s.id);
      const start = toMin(b.start_time), end = toMin(b.end_time);
      if (since(s.id, day, start)) continue;
      if (examBetween(s.id, day, p.today)) continue;
      const t = lastTaught(p.topics, s.id, day);
      const eff = effortOf(s);
      tasks.push({
        key: "c" + s.id, kind: "consolidar", title: `Revisar a aula de ${ago ? "ontem" : "hoje"} de ${s.name}${t ? `: ${t.name}` : ""}`, subject_id: s.id, topic_id: t?.id ?? null,
        minutes: scaleMin(CLASS_MIN, eff.factor), notBefore: ago ? undefined : end,
        why: ago ? `Aula de ontem às ${b.start_time.slice(0, 5)} e você ainda não estudou ${s.name} depois dela; você prefere revisar depois da aula.${eff.why ? ` ${eff.why}` : ""}`
          : `Aula de hoje às ${b.start_time.slice(0, 5)}; você prefere revisar depois da aula, enquanto está fresco.${eff.why ? ` ${eff.why}` : ""}`,
        rank: [1, ago ? 0.5 : 0, 0, 0, 1, 0],
      });
    }
  }
  seen.clear();
  // adiantar: a aula de amanhã e, se ainda dá tempo antes dela, a de hoje que ainda não começou
  const studyStarts = freeStudy(p.blocks, p.events, p.today).blocks.map((b) => Math.max(toMin(b.start_time), p.nowMin));
  for (const [day, isToday] of [[p.today, true], [tomorrow, false]] as const) {
    for (const b of classes(day)) {
      const s = active.get(b.subject_id!)!;
      const pref = s.study_pref ?? p.pref;
      const start = toMin(b.start_time);
      if (pref === "depois" || seen.has(s.id)) continue;
      if (isToday && (start <= p.nowMin || !studyStarts.some((x) => x + 15 <= start) || since(s.id, yesterday))) continue;
      seen.add(s.id);
      if (!isToday && since(s.id, p.today)) continue;
      const t = p.topics.filter((x) => x.subject_id === s.id && x.taught_on && x.taught_on >= day).sort((x, y) => x.taught_on!.localeCompare(y.taught_on!))[0];
      // prova antes (ou no dia) da próxima aula: o foco é a prova (o plano da prova já reserva o tempo), não matéria nova
      if (examBetween(s.id, day, t?.taught_on ?? day)) continue;
      const eff = effortOf(s);
      tasks.push({
        key: "a" + s.id, kind: "adiantar", title: `Adiantar ${s.name}${t ? `: ${t.name}${t.taught_on !== day ? ` (previsto para ${dm(t.taught_on!)})` : ""}` : ""}`, subject_id: s.id, topic_id: t?.id ?? null, minutes: scaleMin(CLASS_MIN, eff.factor),
        before: isToday ? start : undefined,
        why: `Aula ${isToday ? "hoje" : "amanhã"} às ${b.start_time.slice(0, 5)}; você prefere chegar com o conteúdo adiantado.${t ? "" : " Cadastre a data das aulas nos conteúdos para saber qual é o próximo."}${eff.why ? ` ${eff.why}` : ""}`,
        rank: [1, isToday ? 0.5 : 1, 0, 0, 1, 0],
      });
    }
  }
  tasks.push(...(p.extra || []));
  return tasks.sort((a, b) => cmpRank(a.rank, b.rank));
}

/** Encaixa as tarefas nos blocos de estudo que sobram no dia, na ordem de prioridade */
export function planDay(p: PlanInput): DayPlan {
  const free = freeStudy(p.blocks, p.events, p.today);
  const off = !!dayOff(p.today, p.events);
  const hasStudyBlocks = p.blocks.some((b) => b.kind === "estudo") || extraStudy(p.events, p.today).length > 0;
  const slots: Slot[] = free.blocks
    .map((b) => ({ block: b, start: Math.max(toMin(b.start_time), p.nowMin), end: toMin(b.end_time), placed: [] as Placed[] }))
    .filter((s) => s.end - s.start >= 5);
  const tasks = dayTasks(p).filter((t) => !p.skip?.has(skipId(t, p.today)));
  const overflow: Task[] = [];
  for (const t of tasks) {
    let ok = false;
    for (const s of slots) {
      const cur = s.placed.length ? s.placed[s.placed.length - 1].end : s.start;
      const begin = Math.max(cur, t.notBefore ?? 0);
      if (begin + t.minutes <= Math.min(s.end, t.before ?? Infinity)) { s.placed.push({ task: t, start: begin, end: begin + t.minutes }); ok = true; break; }
    }
    if (!ok) overflow.push(t);
  }
  return {
    slots, overflow, notes: free.notes, hasStudyBlocks, off,
    capacity: slots.reduce((a, s) => a + s.end - s.start, 0),
    need: tasks.reduce((a, t) => a + t.minutes, 0),
  };
}

/* ============ O que não coube: para onde vai ============ */
export interface Moved { day: string; start: number; label: string }
/** Simula os próximos dias e diz em que dia e bloco cada tarefa que não coube hoje vai entrar.
 *  As aulas (consolidar/adiantar) reaparecem sozinhas no plano do dia seguinte enquanto você não estudar a matéria;
 *  o estudo das provas é redistribuído pelo planejamento reverso, que se refaz todo dia. */
export function whereNext(base: PlanInput, overflow: Task[], extraFor: (day: string) => Task[], days = 7): Map<string, Moved | null> {
  const out = new Map<string, Moved | null>();
  let left = overflow.filter((t) => t.kind === "preparar");
  const lessons = overflow.filter((t) => t.kind !== "preparar");
  const sameLesson = (a: Task, b: Task) => a.kind === b.kind && a.subject_id === b.subject_id;
  let pending = [...lessons];
  for (let i = 1; i <= days && (left.length || pending.length); i++) {
    const day = addDays(base.today, i);
    const plan = planDay({ ...base, today: day, nowMin: 0, extra: [...left.map((t) => ({ ...t, rank: [0.4, ...t.rank.slice(1)] })), ...extraFor(day)] });
    const placed = plan.slots.flatMap((s) => s.placed);
    const label = (x: Placed) => `${i === 1 ? "amanhã" : `${WD_LONG[keyDate(day).getDay()]} (${dm(day)})`}, no bloco das ${fromMin(x.start)}`;
    left = left.filter((t) => { const x = placed.find((y) => y.task.key === t.key); if (x) out.set(t.key, { day, start: x.start, label: label(x) }); return !x; });
    // a aula volta no dia seguinte (consolidar a de ontem, adiantar a de hoje); se não voltou, não tem mais como encaixar
    pending = i === 1 ? pending.filter((t) => { const x = placed.find((y) => sameLesson(y.task, t)); if (x) out.set(t.key, { day, start: x.start, label: label(x) }); return false; }) : [];
  }
  for (const t of overflow) if (!out.has(t.key)) out.set(t.key, null);
  return out;
}
const WD_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/* ============ Horário livre para estudar a mais ============ */
export interface FreeWindow { day: string; start: number; end: number }
const DAY_FROM = 8 * 60, DAY_TO = 22 * 60;
/** Horários livres de um dia (8h–22h) sem nenhum bloco da rotina nem compromisso do calendário.
 *  Compromisso sem fim conta 1 h. Dia de viagem, day off ou indisponível o dia todo não tem horário livre. */
export function freeWindows(blocks: RoutineBlock[], events: CalEvent[], day: string, fromMin0 = DAY_FROM, minLen = 60): FreeWindow[] {
  if (tripOn(day, events) || dayOff(day, events) || events.some((e) => e.date === day && e.type === "indisponivel" && !e.time && e.status !== "cancelado")) return [];
  const wd = keyDate(day).getDay();
  const nc = noClass(day, events);
  const busy: [number, number][] = [
    ...blocks.filter((b) => b.weekday === wd && !(b.kind === "aula" && classOff(nc, b.subject_id))).map((b) => [toMin(b.start_time), toMin(b.end_time)] as [number, number]),
    ...events.filter((e) => e.date === day && e.time && e.status !== "cancelado").map((e) => [toMin(e.time!), e.end_time ? toMin(e.end_time) : toMin(e.time!) + 60] as [number, number]),
  ].sort((a, b) => a[0] - b[0]);
  const out: FreeWindow[] = [];
  let cur = Math.max(DAY_FROM, fromMin0);
  for (const [a, b] of busy) {
    if (a > cur && Math.min(a, DAY_TO) - cur >= minLen) out.push({ day, start: cur, end: Math.min(a, DAY_TO) });
    cur = Math.max(cur, b);
  }
  if (DAY_TO - cur >= minLen) out.push({ day, start: cur, end: DAY_TO });
  return out;
}

/** Minutos de estudo na rotina por dia da semana */
export const weekCapacity = (blocks: RoutineBlock[]) => {
  const w = [0, 0, 0, 0, 0, 0, 0];
  for (const b of blocks) if (b.kind === "estudo") w[b.weekday] += toMin(b.end_time) - toMin(b.start_time);
  return w;
};

/* ============ Cronograma: aula atual e aula remarcada ============ */
/** Conteúdo da aula mais recente (até hoje) de uma disciplina */
export function lastTaught(topics: Topic[], subjectId: string, today: string): Topic | null {
  return topics.filter((t) => t.subject_id === subjectId && t.taught_on && t.taught_on <= today)
    .sort((a, b) => b.taught_on!.localeCompare(a.taught_on!))[0] ?? null;
}

/** Próximo dia de aula depois de `day`, pelos dias da semana informados */
export function nextClassDay(day: string, weekdays: number[]): string {
  const set = new Set(weekdays);
  for (let i = 1; i <= 14; i++) { const k = addDays(day, i); if (!set.size || set.has(keyDate(k).getDay())) return set.size ? k : addDays(day, 7); }
  return addDays(day, 7);
}

/** Aula remarcada: o conteúdo vai para `newDate` e cada conteúdo seguinte da disciplina
 *  passa para o próximo dia de aula. Os dias de aula vêm da rotina; sem rotina, dos próprios conteúdos. */
export function pushLessons(topics: Topic[], id: string, newDate: string, classWeekdays: number[]): Topic[] {
  const t = topics.find((x) => x.id === id);
  if (!t) return [];
  const old = t.taught_on;
  const moved = [{ ...t, taught_on: newDate }];
  if (!old || newDate <= old) return moved;
  const same = topics.filter((x) => x.subject_id === t.subject_id && x.id !== id && x.taught_on);
  const wds = classWeekdays.length ? classWeekdays : [...new Set(same.map((x) => keyDate(x.taught_on!).getDay()))];
  return [...moved, ...same.filter((x) => x.taught_on! > old).map((x) => ({ ...x, taught_on: nextClassDay(x.taught_on!, wds) }))];
}

/** Frase "estudando para quê" da Sala, respeitando passado, hoje e futuro:
 *  "Estudando para a P2 (em 3 dias) · conteúdo dado na aula de 16/09." */
export function studyHint(taughtOn: string | null, exam: { name: string; date: string | null } | null, today: string): string {
  const d = exam?.date ? daysBetween(today, exam.date) : null;
  const examPart = exam && d != null && d >= 0 ? `Estudando para a ${exam.name} (${d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`})` : "";
  const classPart = !taughtOn ? "" : taughtOn < today ? `conteúdo dado na aula de ${dm(taughtOn)}` : taughtOn === today ? "conteúdo da aula de hoje" : `adiantando a aula de ${dm(taughtOn)}`;
  const txt = [examPart, classPart].filter(Boolean).join(" · ");
  return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) + "." : "";
}

/** Plano de vários dias seguidos (folha da semana); `extraFor` dá os pedaços do planejamento reverso de cada dia. */
export function planWeek(base: PlanInput, days: string[], extraFor: (day: string) => Task[]): { day: string; plan: DayPlan }[] {
  return days.map((day) => ({ day, plan: planDay({ ...base, today: day, nowMin: day === base.today ? base.nowMin : 0, extra: extraFor(day) }) }));
}
