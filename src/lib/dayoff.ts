// Day off (pedido do dono): um dia de folga marcado na Sala. O plano do dia fica vazio, o estudo das provas
// vai para os outros dias e o grupo vê "de folga hoje". A sequência de dias estudados quebra (folga é folga).
// Durante o semestre letivo: um por semana (segunda a domingo). Nas férias: livre. Em dia de prova, só pergunta.
import { addDays, keyDate } from "./calc";
import { dm } from "./plan";
import type { Assessment, CalEvent, Subject } from "./types";

/** Semestre letivo suposto (a UDESC não manda o calendário para o app): 1º/02 a 15/07 e 1º/08 a 20/12 */
export function inSemester(day: string): boolean {
  const md = day.slice(5);
  return (md >= "02-01" && md <= "07-15") || (md >= "08-01" && md <= "12-20");
}

/** Segunda e domingo da semana do dia */
export function weekOf(day: string): [string, string] {
  const mon = addDays(day, -((keyDate(day).getDay() + 6) % 7));
  return [mon, addDays(mon, 6)];
}

export const isOff = (e: CalEvent) => e.type === "folga" && e.status !== "cancelado";

export interface DayOffCheck {
  /** já é folga hoje */
  already: CalEvent | null;
  /** pode tirar hoje (respeitando o limite da semana) */
  ok: boolean;
  why: string;
  /** provas de hoje: o app pergunta "tem certeza?" antes */
  exams: string[];
}

export function dayOffCheck(p: { today: string; events: CalEvent[]; assessments: Assessment[]; subjects: Pick<Subject, "id" | "name" | "archived">[] }): DayOffCheck {
  const already = p.events.find((e) => isOff(e) && e.date === p.today) ?? null;
  const name = (id: string | null) => p.subjects.find((s) => s.id === id)?.name ?? "";
  const active = new Set(p.subjects.filter((s) => !s.archived).map((s) => s.id));
  const exams = [
    ...p.assessments.filter((a) => (a.kind === "prova" || a.kind === "sub") && a.date === p.today && a.status !== "cancelado" && a.grade == null && active.has(a.subject_id))
      .map((a) => `${a.name} de ${name(a.subject_id)}`),
    ...p.events.filter((e) => (e.type === "prova" || e.type === "sub") && e.date === p.today && e.status !== "cancelado").map((e) => `${e.title}${e.subject_id ? ` de ${name(e.subject_id)}` : ""}`),
  ];
  if (already) return { already, ok: false, why: "Hoje já é seu day off.", exams };
  if (!inSemester(p.today)) return { already, ok: true, why: "Férias: day off liberado, sem limite.", exams };
  const [mon, sun] = weekOf(p.today);
  const used = p.events.find((e) => isOff(e) && e.date >= mon && e.date <= sun);
  if (used) return { already, ok: false, why: `Você já tirou day off nesta semana (${dm(used.date)}). Durante o semestre é um por semana; na segunda (${dm(addDays(sun, 1))}) libera de novo.`, exams };
  return { already, ok: true, why: "Durante o semestre: um day off por semana (de segunda a domingo).", exams };
}
