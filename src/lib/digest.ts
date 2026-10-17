// Resumo da manhã enviado como aviso no celular. Função pura e testada: só fatos dos dados
// (provas marcadas, tarefas com prazo, dias sem sessão). Sem nada a dizer, não manda.
import { addDays, daysBetween, qt } from "./calc";
import { dm } from "./plan";
import type { Assessment, Subject, Todo } from "./types";

/** provas nos próximos dias que entram no resumo (0 = hoje) */
export const DIGEST_EXAM_DAYS = 3;
/** dias sem nenhuma sessão para o resumo lembrar */
export const DIGEST_IDLE_DAYS = 3;

export interface DigestInput {
  today: string;
  subjects: Pick<Subject, "id" | "name" | "archived">[];
  assessments: Assessment[];
  todos: Pick<Todo, "done" | "due">[];
  /** dia da sessão mais recente (null = nunca estudou) */
  lastStudy: string | null;
}
export interface Digest { title: string; body: string; url: string }

const quando = (d: number, date: string) => (d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias (${dm(date)})`);

export function morningDigest(p: DigestInput): Digest | null {
  const active = new Map(p.subjects.filter((s) => !s.archived).map((s) => [s.id, s.name]));
  const limit = addDays(p.today, DIGEST_EXAM_DAYS);
  const exams = p.assessments
    .filter((a) => (a.kind === "prova" || a.kind === "sub") && a.status !== "cancelado" && a.grade == null && !!a.date && a.date >= p.today && a.date <= limit && active.has(a.subject_id))
    .sort((a, b) => a.date!.localeCompare(b.date!));
  const tasks = p.todos.filter((t) => !t.done && !!t.due && t.due <= p.today).length;
  const idle = p.lastStudy ? daysBetween(p.lastStudy, p.today) : 0;

  const parts: string[] = exams.map((a) => `${a.name} de ${active.get(a.subject_id)} ${quando(daysBetween(p.today, a.date!), a.date!)}`);
  if (tasks) parts.push(`${qt(tasks, "tarefa", "tarefas")} com prazo até hoje`);
  if (idle >= DIGEST_IDLE_DAYS) parts.push(`sem estudar há ${idle} dias`);
  if (!parts.length) return null;

  const [first, ...rest] = parts;
  return {
    title: first.charAt(0).toUpperCase() + first.slice(1),
    body: rest.length ? rest.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(" · ") : "Toque para ver o plano do dia.",
    url: exams.length ? "/hoje?aba=provas" : "/hoje",
  };
}

/** Data de hoje (aaaa-mm-dd) no horário de Brasília, para o servidor que roda em UTC */
export function brDay(d: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}
