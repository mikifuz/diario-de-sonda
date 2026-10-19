// Tela Hoje: saudação, frase do dia e os "quadrados" com o que a pessoa vai fazer hoje
// (aulas e outros blocos da rotina, itens do calendário, tarefas de estudo do plano e tarefas com prazo).
import { BLOCK, EVT } from "./constants";
import { classOff, evOn, noClass, toMin, type DayPlan, type Moved, type Task } from "./plan";
import type { AgendaItem } from "./store";
import type { CalEvent, RoutineBlock, Subject, Todo } from "./types";

export function greeting(hour: number): string {
  return hour >= 5 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite";
}

export const firstName = (name: string | null | undefined) => (name || "").trim().split(/\s+/)[0] || "";

/** Frases do dia (motivação com um pouco da piada do petróleo do app) */
export const MOTTOS = [
  "Um bloco de estudo de cada vez. É assim que se perfura um poço.",
  "Constância vence maratona: 40 minutos hoje valem mais que 6 horas na véspera.",
  "Errar no exercício é barato. Errar na prova é que sai caro.",
  "Quem revisa hoje não precisa reaprender amanhã.",
  "Você não precisa de motivação para começar. Começar é que traz a motivação.",
  "Do fundo do poço só dá para subir. Bora?",
  "Pequenas sessões, todo dia, fazem a sonda chegar no reservatório.",
  "Faça a parte difícil primeiro; o resto do dia fica leve.",
  "Uma questão feita sozinho ensina mais que dez resoluções lidas.",
  "Hoje é um bom dia para acertar o que ontem deu errado.",
  "Desliga o celular, liga o cronômetro. O resto é consequência.",
  "Ninguém fica bom em Cálculo lendo. Fica fazendo conta.",
  "Descansar também faz parte do plano. Sumir, não.",
  "O seu eu da semana de provas agradece cada revisão de hoje.",
];

/** A mesma frase o dia inteiro, outra no dia seguinte */
export function motto(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const n = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return MOTTOS[((n % MOTTOS.length) + MOTTOS.length) % MOTTOS.length];
}

export type CardKind = "aula" | "sem_aula" | "rotina" | "calendario" | "estudo" | "livre" | "nao_coube" | "tarefa";
export interface DayCard {
  key: string;
  kind: CardKind;
  /** minutos desde 0h; null = sem horário */
  at: number | null;
  end: number | null;
  /** etiqueta curta (Aula, Revisão, Prova…) */
  tag: string;
  title: string;
  sub?: string;
  subject_id: string | null;
  task?: Task;
  /** não coube hoje: para onde vai (null = sem horário livre nos próximos dias) */
  moved?: Moved | null;
  todo?: Todo;
  /** já terminou (só para itens com horário) */
  past: boolean;
}

const TASK_TAG: Record<Task["kind"], string> = { consolidar: "Revisar aula", adiantar: "Adiantar aula", preparar: "Preparar prova" };

export interface DayCardsInput {
  day: string;
  nowMin: number;
  blocks: RoutineBlock[];
  events: CalEvent[];
  /** agenda() do app: eventos + avaliações */
  agenda: AgendaItem[];
  subjects: Subject[];
  plan: DayPlan;
  todos: Todo[];
  /** tarefas que não couberam e a pessoa escolheu fazer hoje mesmo assim (viram quadrados sem horário) */
  forced?: Set<string>;
  /** para onde vai cada tarefa que não coube (whereNext) */
  moved?: Map<string, Moved | null>;
}

export function dayCards(p: DayCardsInput): DayCard[] {
  const wd = new Date(p.day + "T12:00:00").getDay();
  const name = (id: string | null) => (id ? p.subjects.find((s) => s.id === id)?.name ?? "" : "");
  const archived = (id: string | null) => !!id && !!p.subjects.find((s) => s.id === id)?.archived;
  const out: DayCard[] = [];
  const nc = noClass(p.day, p.events);
  for (const b of p.blocks.filter((x) => x.weekday === wd && x.kind !== "estudo")) {
    if (b.kind === "aula" && archived(b.subject_id)) continue;
    const at = toMin(b.start_time), end = toMin(b.end_time);
    const off = b.kind === "aula" ? classOff(nc, b.subject_id) : null;
    if (b.kind === "aula") out.push({ key: "b" + b.id, kind: off ? "sem_aula" : "aula", at, end, tag: off ? "Sem aula" : "Aula", title: name(b.subject_id) || b.label || "Aula", sub: off || b.label || undefined, subject_id: b.subject_id, past: end <= p.nowMin });
    else out.push({ key: "b" + b.id, kind: "rotina", at, end, tag: BLOCK[b.kind], title: b.label || BLOCK[b.kind], subject_id: null, past: end <= p.nowMin });
  }
  for (const e of p.agenda) {
    if (!evOn(e, p.day) || e.status === "cancelado" || e.status === "concluido" || e.type === "sem_aula") continue;
    const at = e.time && e.date === p.day ? toMin(e.time) : null;
    out.push({ key: "e" + e.id, kind: "calendario", at, end: null, tag: EVT[e.type] ?? "Calendário", title: e.title || EVT[e.type], sub: name(e.subject_id) || undefined, subject_id: e.subject_id, past: false });
  }
  for (const s of p.plan.slots) {
    if (!s.placed.length) out.push({ key: "l" + s.block.id, kind: "livre", at: s.start, end: s.end, tag: "Estudo livre", title: s.block.label || "Bloco de estudo sem tarefa", subject_id: null, past: s.end <= p.nowMin });
    for (const x of s.placed) out.push({ key: "t" + x.task.key, kind: "estudo", at: x.start, end: x.end, tag: TASK_TAG[x.task.kind], title: x.task.title, sub: name(x.task.subject_id), subject_id: x.task.subject_id, task: x.task, past: x.end <= p.nowMin });
  }
  // sem blocos de estudo na rotina, nada "deixou de caber": são as tarefas do dia, sem horário
  for (const t of p.plan.overflow) {
    const late = p.plan.hasStudyBlocks && !p.forced?.has(t.key);
    out.push({ key: "o" + t.key, kind: late ? "nao_coube" : "estudo", at: null, end: null, tag: TASK_TAG[t.kind], title: t.title, sub: name(t.subject_id), subject_id: t.subject_id, task: t, past: false, ...(late && p.moved ? { moved: p.moved.get(t.key) ?? null } : {}) });
  }
  for (const t of p.todos.filter((x) => !x.done && x.due && x.due <= p.day)) out.push({ key: "d" + t.id, kind: "tarefa", at: null, end: null, tag: t.due === p.day ? "Tarefa · prazo hoje" : "Tarefa atrasada", title: t.title, sub: name(t.subject_id) || undefined, subject_id: t.subject_id, todo: t, past: false });
  const order: CardKind[] = ["calendario", "tarefa", "estudo", "nao_coube"];
  return out.sort((a, b) => {
    if (a.at != null && b.at != null) return a.at - b.at || (a.end ?? 0) - (b.end ?? 0);
    if (a.at != null) return -1;
    if (b.at != null) return 1;
    return order.indexOf(a.kind) - order.indexOf(b.kind);
  });
}
