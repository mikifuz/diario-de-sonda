// Quanto uma matéria custa para o aluno: aumenta (ou reduz) o tempo que o plano reserva para ela.
// Marcado pelo aluno na disciplina (sem marcação = média). Sempre com o motivo.
import { addDays } from "./calc";
import type { Assessment, Effort, Subject } from "./types";

export const EFFORT: Record<Effort, { name: string; factor: number }> = {
  trivial: { name: "Extremamente fácil", factor: 0 },
  facil: { name: "Fácil", factor: 0.8 },
  media: { name: "Média", factor: 1 },
  dificil: { name: "Difícil", factor: 1.5 },
  muito: { name: "Muito difícil", factor: 2 },
};

export interface EffortInfo { factor: number; level: Effort | null; why: string }

export function effortOf(subject: Pick<Subject, "id" | "name" | "traits">): EffortInfo {
  const lvl = subject.traits?.esforco;
  if (lvl === "trivial") return { factor: 0, level: lvl, why: TRIVIAL_WHY(subject.name) };
  if (lvl && EFFORT[lvl]) {
    const f = EFFORT[lvl].factor;
    return { factor: f, level: lvl, why: f === 1 ? "" : `Você marcou ${subject.name} como ${EFFORT[lvl].name.toLowerCase()} para você: o plano reserva ${f > 1 ? `${Math.round((f - 1) * 100)}% a mais` : `${Math.round((1 - f) * 100)}% a menos`} de tempo.` };
  }
  return { factor: 1, level: null, why: "" };
}

/** Minutos ajustados, de 5 em 5 */
export const scaleMin = (m: number, f: number) => Math.max(5, Math.round((m * f) / 5) * 5);

/* ============ Matéria extremamente fácil (pedido do dono) ============ */
// Não ganha tempo de estudo no plano (nem aulas para consolidar/adiantar, nem planejamento da prova);
// o app só avisa na véspera e no dia da prova.
const TRIVIAL_WHY = (name: string) => `Você marcou ${name} como extremamente fácil para você: o plano não reserva tempo de estudo para ela; o app só avisa na véspera e no dia da prova.`;
export const isTrivial = (s: Pick<Subject, "traits"> | null | undefined) => s?.traits?.esforco === "trivial";

export interface EasyReminder { key: string; exam: Assessment; subject: Subject; when: "hoje" | "amanhã"; text: string; why: string }
/** Provas (e SUBs) de matérias extremamente fáceis que são hoje ou amanhã */
export function easyReminders(today: string, subjects: Subject[], assessments: Assessment[]): EasyReminder[] {
  const tomorrow = addDays(today, 1);
  return assessments
    .filter((a) => (a.kind === "prova" || a.kind === "sub") && a.grade == null && a.status !== "cancelado" && (a.date === today || a.date === tomorrow))
    .sort((a, b) => a.date!.localeCompare(b.date!) || (a.time || "").localeCompare(b.time || ""))
    .flatMap((exam) => {
      const subject = subjects.find((s) => s.id === exam.subject_id && !s.archived);
      if (!subject || !isTrivial(subject)) return [];
      const when = exam.date === today ? "hoje" : "amanhã";
      return [{
        key: `easy-${exam.id}`, exam, subject, when,
        text: when === "hoje" ? `${exam.name} de ${subject.name} é hoje${exam.time ? ` às ${exam.time.slice(0, 5)}` : ""}: dê uma olhada rápida no conteúdo antes.` : `${exam.name} de ${subject.name} é amanhã${exam.time ? ` às ${exam.time.slice(0, 5)}` : ""}: dê uma estudada rápida hoje.`,
        why: TRIVIAL_WHY(subject.name),
      }];
    });
}
