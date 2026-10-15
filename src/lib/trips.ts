// Viagens: quanto estudo da rotina a viagem tira, que provas ela aperta e o que estudar
// a mais antes (ou depois) dela. Usa o planejamento reverso com e sem a viagem; nada gravado.
import { addDays, fmtMin, qt } from "./calc";
import { dm, freeStudy, toMin, tripOn } from "./plan";
import { priorityOf, reversePlan, type ExamPlan, type Priority, type RevInput } from "./reverse";
import type { Assessment, CalEvent, Subject } from "./types";

/** Provas até quantos dias depois da volta contam como "apertadas pela viagem" */
export const AFTER = 14;
const HORIZON = 30;
const GRADED_KINDS = new Set(["prova", "sub", "trabalho", "entrega", "apresentacao"]);

export interface TripFocus { subject: Subject; exam: Assessment; p: Priority }
export interface TripImpact {
  trip: CalEvent;
  start: string;
  end: string;
  /** minutos de estudo da rotina que a viagem tira (de agora em diante) */
  lost: number;
  /** avaliações marcadas para os dias da viagem */
  during: Assessment[];
  /** provas entre a ida e 2 semanas depois da volta (até 30 dias), com o que falta e quanto disso é da viagem */
  exams: { plan: ExamPlan; extra: number }[];
  /** minutos de estudo que não cabem na rotina antes dessas provas */
  missing: number;
  /** quanto do que falta é por causa da viagem */
  fromTrip: number;
  /** como compensar: minutos a mais por dia nos dias fora da viagem até a véspera da última prova */
  makeUp: { days: number; perDay: number; until: string; before: number } | null;
  /** conteúdos para priorizar (mais urgentes primeiro) */
  focus: TripFocus[];
  level: "apertado" | "cabe" | "sem_prova";
  why: string;
}

const lastDay = (e: CalEvent) => (e.end_date && e.end_date > e.date ? e.end_date : e.date);
const studyMin = (p: RevInput, events: CalEvent[], d: string) =>
  freeStudy(p.blocks, events, d).blocks.reduce((x, b) => x + Math.max(0, toMin(b.end_time) - Math.max(toMin(b.start_time), d === p.today ? p.nowMin : 0)), 0);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);
const r5up = (n: number) => Math.ceil(n / 5) * 5;

/** Viagens que ainda não acabaram e começam nos próximos 30 dias */
export function upcomingTrips(events: CalEvent[], today: string): CalEvent[] {
  return events.filter((e) => e.type === "viagem" && e.status !== "cancelado" && lastDay(e) >= today && e.date <= addDays(today, HORIZON))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function tripImpact(p: RevInput, trip: CalEvent): TripImpact {
  const start = trip.date, end = lastDay(trip);
  const without = p.events.filter((e) => e.id !== trip.id);
  // tempo de estudo da rotina perdido nos dias da viagem (de hoje em diante)
  let lost = 0;
  for (let d = start < p.today ? p.today : start; d <= end; d = addDays(d, 1)) lost += studyMin(p, without, d) - studyMin(p, p.events, d);

  const during = p.assessments.filter((a) => GRADED_KINDS.has(a.kind) && a.grade == null && a.status !== "cancelado" && a.date && a.date >= start && a.date <= end && a.date >= p.today)
    .sort((a, b) => a.date!.localeCompare(b.date!));

  const withTrip = reversePlan(p);
  const noTrip = new Map(reversePlan({ ...p, events: without }).map((pl) => [pl.exam.id, pl]));
  const exams = withTrip.filter((pl) => pl.exam.date! >= start && pl.exam.date! <= addDays(end, AFTER))
    .map((plan) => ({ plan, extra: Math.max(0, plan.missing - (noTrip.get(plan.exam.id)?.missing ?? 0)) }));
  const missing = exams.reduce((a, x) => a + x.plan.missing, 0);
  const fromTrip = exams.reduce((a, x) => a + x.extra, 0);

  // compensar nos dias fora da viagem, de hoje até a véspera da última prova apertada
  let makeUp: TripImpact["makeUp"] = null;
  const tight = exams.filter((x) => x.plan.missing > 0);
  if (tight.length) {
    const until = addDays(tight[tight.length - 1].plan.exam.date!, -1);
    let days = 0, before = 0;
    for (let d = p.today; d <= until; d = addDays(d, 1)) {
      const t = tripOn(d, p.events);
      if (t && t.until === 0) continue;
      days++;
      if (d < start) before++;
    }
    if (days) makeUp = { days, perDay: r5up(missing / days), until, before };
  }

  // o que estudar primeiro: conteúdos mais urgentes das provas apertadas pela viagem
  const focus: TripFocus[] = exams
    .flatMap((x) => x.plan.topics.filter((t) => t.need > 0).map((t) => ({ t, x })))
    .sort((a, b) => b.t.urgency - a.t.urgency || a.x.plan.exam.date!.localeCompare(b.x.plan.exam.date!))
    .slice(0, 4)
    .map(({ t, x }) => ({ subject: x.plan.subject, exam: x.plan.exam, p: priorityOf(t) }));

  const examNames = list(exams.map((x) => `${x.plan.exam.name} de ${x.plan.subject.name} (${dm(x.plan.exam.date!)})`));
  const lostTxt = lost > 0 ? `A viagem tira ${fmtMin(lost)} de estudo da sua rotina` : "A viagem não tira blocos de estudo da sua rotina";
  let level: TripImpact["level"], why: string;
  if (!exams.length) {
    level = "sem_prova";
    why = `${lostTxt}. Não há prova cadastrada até ${AFTER} dias depois da volta, então o plano das provas não muda.`;
  } else if (missing > 0) {
    level = "apertado";
    why = `Você vai precisar estudar mais do que está na sua rotina. ${lostTxt} e faltam ${fmtMin(missing)} de estudo antes de ${examNames}` +
      (fromTrip > 0 && fromTrip < missing ? ` (${fmtMin(fromTrip)} disso por causa da viagem)` : fromTrip >= missing ? " por causa da viagem" : ", que já não cabiam na rotina") +
      (makeUp ? `. Para compensar, estude cerca de ${fmtMin(makeUp.perDay)} a mais por dia nos ${qt(makeUp.days, "dia", "dias")} fora da viagem até ${dm(makeUp.until)}${makeUp.before ? ` (${qt(makeUp.before, "dia", "dias")} antes da ida)` : ""}.` : ".");
  } else {
    level = "cabe";
    why = `${lostTxt}, mas o plano de ${examNames} cabe nos outros dias: o app já tirou os estudos dos dias da viagem e passou para antes ou depois dela.`;
  }
  return { trip, start, end, lost, during, exams, missing, fromTrip, makeUp, focus, level, why };
}

export const tripImpacts = (p: RevInput) => upcomingTrips(p.events, p.today).map((t) => tripImpact(p, t));
/** Dias da viagem: "18/10 a 20/10" */
export const tripRange = (t: CalEvent) => (lastDay(t) === t.date ? dm(t.date) : `${dm(t.date)} a ${dm(lastDay(t))}`);
