// Quanto uma matéria custa para o aluno: aumenta (ou reduz) o tempo que o plano reserva para ela.
// Marcado pelo aluno na disciplina; sem marcação, estimado pelos registros (minutos por questão). Sempre com o motivo.
import { nf } from "./calc";
import type { Effort, Session, Subject } from "./types";

export const EFFORT: Record<Effort, { name: string; factor: number }> = {
  facil: { name: "Fácil", factor: 0.8 },
  media: { name: "Média", factor: 1 },
  dificil: { name: "Difícil", factor: 1.4 },
  muito: { name: "Muito difícil", factor: 1.8 },
};

export interface Pace { mine: number | null; others: number | null; n: number; nOthers: number }
/** Minutos por questão nesta matéria e nas outras (só sessões com número de questões) */
export function paceOf(subjectId: string, sessions: Session[]): Pace {
  const withQ = sessions.filter((s) => (s.questions ?? 0) > 0 && s.duration_min > 0);
  const calc = (xs: Session[]) => (xs.length ? xs.reduce((a, s) => a + s.duration_min, 0) / xs.reduce((a, s) => a + s.questions!, 0) : null);
  const mine = withQ.filter((s) => s.subject_id === subjectId), others = withQ.filter((s) => s.subject_id !== subjectId);
  return { mine: calc(mine), others: calc(others), n: mine.length, nOthers: others.length };
}

export const MIN_PACE = 3;
export interface EffortInfo { factor: number; level: Effort | null; source: "marcado" | "registros" | null; why: string; pace: Pace }

export function effortOf(subject: Pick<Subject, "id" | "name" | "traits">, sessions: Session[]): EffortInfo {
  const pace = paceOf(subject.id, sessions);
  const lvl = subject.traits?.esforco;
  if (lvl && EFFORT[lvl]) {
    const f = EFFORT[lvl].factor;
    return { factor: f, level: lvl, source: "marcado", pace, why: f === 1 ? "" : `Você marcou ${subject.name} como ${EFFORT[lvl].name.toLowerCase()} para você: o plano reserva ${f > 1 ? `${Math.round((f - 1) * 100)}% a mais` : `${Math.round((1 - f) * 100)}% a menos`} de tempo.` };
  }
  if (pace.mine != null && pace.others != null && pace.n >= MIN_PACE && pace.nOthers >= MIN_PACE) {
    const ratio = pace.mine / pace.others;
    if (ratio >= 1.3 || ratio <= 0.75) {
      const f = Math.min(1.8, Math.max(0.8, Math.round(ratio * 10) / 10));
      return { factor: f, level: null, source: "registros", pace,
        why: `Pelos seus registros você leva ${nf(pace.mine, 0)} min por questão em ${subject.name} e ${nf(pace.others, 0)} nas outras matérias: o plano reserva ${f > 1 ? `${Math.round((f - 1) * 100)}% a mais` : `${Math.round((1 - f) * 100)}% a menos`} de tempo. Marque na disciplina se quiser outro ajuste.` };
    }
  }
  return { factor: 1, level: null, source: null, pace, why: "" };
}

/** Minutos ajustados, de 5 em 5 */
export const scaleMin = (m: number, f: number) => Math.max(5, Math.round((m * f) / 5) * 5);
