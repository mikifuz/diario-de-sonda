// Hábitos do dia: marcado hoje, quantos dias nos últimos 7 e sequência atual. Funções puras.
import { addDays } from "./calc";
import type { HabitCheck } from "./types";

export const HABIT_IDEAS = ["Fiquei pouco tempo no celular", "Dormi 7 horas ou mais", "Fiz exercício físico", "Bebi bastante água", "Estudei sem distração", "Li algo fora da faculdade"];

export interface HabitStats { today: HabitCheck | null; week: number; streak: number }

export function habitStats(habitId: string, checks: HabitCheck[], today: string): HabitStats {
  const days = new Set(checks.filter((c) => c.habit_id === habitId).map((c) => c.day));
  const todayCheck = checks.find((c) => c.habit_id === habitId && c.day === today) ?? null;
  let week = 0;
  for (let i = 0; i < 7; i++) if (days.has(addDays(today, -i))) week++;
  // sequência: dias seguidos até hoje (se hoje ainda não marcou, conta até ontem)
  let streak = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) { streak++; d = addDays(d, -1); }
  return { today: todayCheck, week, streak };
}
