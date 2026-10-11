// Meu curso: matriz curricular, pré-requisitos e situação de cada disciplina. Funções puras, testadas.
// A matriz é informada pelo aluno (modelo transcrito do documento oficial que ele enviou, editável).
import { norm } from "./syllabus";
import type { Course, CourseKind, CourseStatus, Prereq, Subject } from "./types";

/* ============ Modelo: Engenharia de Petróleo — UDESC, matriz da reforma 2024 ============ */
// Transcrito de "Nova matriz curricular — Engenharia de Petróleo — 2024" (créditos e pré-requisitos)
// e conferido com o "Fluxograma de disciplinas e pré-requisitos 2025/2".
// Pré-requisitos: chaves separadas por espaço; "*" no fim = correquisito (pode ser cursado junto).
// Regra "70% dos créditos anteriores (fases 1 a N)": número N.
type Row = [key: string, name: string, credits: number, prereqs?: string, upTo?: number, kind?: CourseKind];
const PHASES: Row[][] = [
  [["ga", "Geometria Analítica", 2], ["qg", "Química Geral", 2], ["qe1", "Química Experimental I", 4], ["c1", "Cálculo Diferencial e Integral I", 6],
    ["iep", "Introdução à Engenharia de Petróleo", 4], ["dt", "Desenho Técnico", 4]],
  [["f1", "Física I", 4, "c1"], ["al", "Álgebra Linear", 4, "ga"], ["c2", "Cálculo Diferencial e Integral II", 4, "c1"], ["qo1", "Química Orgânica I", 2],
    ["qe2", "Química Experimental II", 4, "qe1"], ["fe1", "Física Experimental I", 4, "f1*"], ["est", "Estatística Descritiva", 2], ["cm", "Ciência dos Materiais", 4]],
  [["f2", "Física II", 4, "f1"], ["fe2", "Física Experimental II", 4, "f2* fe1"], ["gg", "Geologia Geral", 3, "iep"], ["c3", "Cálculo Diferencial e Integral III", 4, "c2"],
    ["esta", "Estática", 4, "f1"], ["lp1", "Linguagem de Programação I", 4], ["qo2", "Química Orgânica II", 2, "qo1"]],
  [["f3", "Física III", 4, "f1 c2"], ["fe3", "Física Experimental III", 4, "f3* fe1"], ["gp", "Geologia do Petróleo", 5, "gg"], ["ed", "Equações Diferenciais", 4, "c3"],
    ["rm", "Resistência dos Materiais", 4, "esta"], ["ifq", "Introdução à Físico-Química", 2, "qg"], ["gl", "Gestão e Liderança", 2, "", 3], ["mn1", "Métodos Numéricos I", 4, "al lp1 c2"]],
  [["geof", "Geofísica", 4, "gp"], ["mn2", "Métodos Numéricos II", 4, "mn1 ed"], ["mf", "Mecânica dos Fluidos", 4, "c3"], ["geom", "Geomecânica", 4, "gp rm"],
    ["tap", "Termodinâmica Aplicada ao Petróleo", 4, "ifq mn1"], ["imp", "Instrumentação e Medição de Petróleo", 2, "", 4], ["fer", "Fundamentos em Energias Renováveis", 2, "", 4],
    ["ucea", "Unidade Curricular de Extensão A (UCEA)", 2, "", undefined, "extensao"]],
  [["er1", "Engenharia de Reservatórios I", 4, "tap"], ["ep1", "Engenharia de Poço I", 4, "mf geom"], ["tc", "Transferência de Calor", 4, "tap"], ["mfx", "Máquinas de Fluxo", 4, "mf"],
    ["es", "Engenharia Submarina", 2, "", 5], ["em", "Escoamento Multifásico", 4, "es* tap"], ["egc", "Estudo Geológico de Campo", 4, "gp"],
    ["opt1", "Optativa I", 2, "", undefined, "vaga"], ["uceb", "Unidade Curricular de Extensão B (UCEB)", 2, "", undefined, "extensao"]],
  [["ep2", "Engenharia de Poço II", 4, "ep1"], ["er2", "Engenharia de Reservatórios II", 4, "er1"], ["tm", "Transferência de Massa", 2, "tc"], ["mel", "Métodos de Elevação", 4, "em"],
    ["sca", "Sistemas de Controle e Automação", 4, "imp"], ["pi1", "Projeto Integrado I", 2, "ep2*"], ["gpj", "Gestão de Projetos", 4, "", 6], ["ecp", "Economia do Petróleo", 2, "", 6],
    ["opt2", "Optativa II", 2, "", undefined, "vaga"]],
  [["tp", "Testes de Poços", 4, "er2"], ["sr", "Simulação de Reservatórios", 4, "er2"], ["ep3", "Engenharia de Poço III", 4, "ep2"], ["ppp", "Processamento Primário de Petróleo", 2, "mel"],
    ["iaog", "Impactos Ambientais da Indústria de Óleo e Gás", 2, "", 7], ["ge", "Garantia de Escoamento", 4, "mel"], ["pi2", "Projeto Integrado II", 4, "pi1 er2"],
    ["li", "Logística Integrada", 2, "", 7], ["opt3", "Optativa III", 2, "", undefined, "vaga"]],
  [["fra", "Fundamentos em Recuperação Avançada", 2, "tp"], ["pog", "Processamento de Óleo e Gás", 2, "ppp"], ["apog", "Avaliação de Projetos de Óleo e Gás", 4, "ecp"],
    ["sst", "Saúde e Segurança no Trabalho", 4, "", 8], ["gra", "Gerenciamento de Riscos Ambientais", 2, "", 8], ["pi3", "Projeto Integrado III", 4, "pi2 ge"],
    ["opt4", "Optativa IV", 2, "", undefined, "vaga"]],
  [["ecs", "Estágio Curricular Supervisionado", 20, "", undefined, "estagio"], ["pcc", "Projeto de Conclusão de Curso", 5, "", undefined, "tcc"]],
];
const OTHERS: Row[] = [
  ["ac", "Atividades complementares", 6, "", undefined, "complementar"],
  ["ucenv", "Extensão não vinculada (UCE-NV)", 3, "", undefined, "extensao"],
];
const ELECTIVES: Row[] = [
  ["o-fil", "Filosofia e Ética na Engenharia", 2], ["o-met", "Metodologia da Pesquisa Científica", 2], ["o-lp2", "Linguagem de Programação II", 2, "lp1"],
  ["o-f4", "Física IV", 2, "f3"], ["o-pol", "Polímeros aplicados à Engenharia", 2], ["o-cgn", "Compressão de Gás Natural", 2, "mfx"],
  ["o-tce", "Tecnologia de Conversão de Energia", 2], ["o-idg", "Integração de Dados Geofísicos", 2], ["o-geoe", "Geoestatística", 2],
  ["o-ftc", "Fenômeno de Transporte Computacional", 2], ["o-ia", "Introdução à Inteligência Artificial", 2, "est"], ["o-geot", "Geotérmica", 2],
  ["o-cac", "Captura e Armazenamento de Carbono", 2], ["o-cor", "Corrosão", 2], ["o-egn", "Engenharia de Gás Natural", 2],
  ["o-te1", "Tópicos Especiais I", 2], ["o-te2", "Tópicos Especiais II", 2], ["o-te3", "Tópicos Especiais III", 2],
  ["o-te4", "Tópicos Especiais IV", 2], ["o-te5", "Tópicos Especiais V", 2], ["o-te6", "Tópicos Especiais VI", 2], ["o-lib", "Libras", 2],
];

export const TEMPLATES = [
  { id: "udesc-epet-2024", name: "Engenharia de Petróleo — UDESC (matriz 2024)", note: "Transcrita da nova matriz curricular (reforma 2024) e conferida com o fluxograma 2025/2. Confira e corrija o que tiver mudado." },
] as const;

/** Cria as linhas da matriz para o aluno: fases anteriores à atual como aprovadas e as disciplinas
 *  que ele já cursa no app (mesmo nome) como "cursando", ligadas à disciplina. */
export function fromTemplate(currentPhase: number, subjects: Subject[], newId: () => string = () => crypto.randomUUID()): Course[] {
  const ids = new Map<string, string>();
  const all: { r: Row; phase: number | null }[] = [
    ...PHASES.flatMap((rows, i) => rows.map((r) => ({ r, phase: i + 1 }))),
    ...OTHERS.map((r) => ({ r, phase: null })),
    ...ELECTIVES.map((r) => ({ r: [r[0], r[1], r[2], r[3], r[4], "optativa"] as Row, phase: null })),
  ];
  for (const { r } of all) ids.set(r[0], newId());
  const live = subjects.filter((s) => !s.archived);
  return all.map(({ r: [key, name, credits, pre, upTo, kind], phase }, position) => {
    const subject = live.find((s) => norm(s.name) === norm(name));
    const k = kind || "obrigatoria";
    const before = phase != null && phase < currentPhase && k !== "vaga";
    return {
      id: ids.get(key)!, name, code: "", phase, credits, kind: k,
      prereqs: (pre || "").split(/\s+/).filter(Boolean).map((p): Prereq => (p.endsWith("*") ? { id: ids.get(p.slice(0, -1))!, co: true } : { id: ids.get(p)! })),
      min_pct: upTo ? 70 : null, min_phase: upTo ?? null,
      status: subject ? "cursando" : before ? "aprovada" : "pendente", grade: null, term: "", subject_id: subject?.id ?? null, position,
    };
  });
}

/* ============ Situação ============ */
const DONE: CourseStatus[] = ["aprovada", "dispensada"];
export const isDone = (c: Course) => DONE.includes(c.status);
export const STATUS_NAME: Record<CourseStatus, string> = { pendente: "Pendente", cursando: "Cursando", aprovada: "Aprovada", reprovada: "Reprovada", dispensada: "Dispensada (aproveitamento)" };
export type State = "aprovada" | "cursando" | "reprovada" | "liberada" | "bloqueada";

/** Vagas de optativa preenchidas pelas optativas aprovadas (ou em curso), na ordem das fases */
export function fillSlots(courses: Course[]): Map<string, Course> {
  const slots = courses.filter((c) => c.kind === "vaga").sort((a, b) => (a.phase ?? 99) - (b.phase ?? 99) || a.position - b.position);
  const opts = courses.filter((c) => c.kind === "optativa" && (isDone(c) || c.status === "cursando"))
    .sort((a, b) => Number(isDone(b)) - Number(isDone(a)) || a.position - b.position);
  const out = new Map<string, Course>();
  slots.forEach((s, i) => { if (opts[i]) out.set(s.id, opts[i]); });
  return out;
}

/** Linha com a situação efetiva (vaga herda a da optativa que a preenche) */
export function effective(c: Course, slots: Map<string, Course>): Course {
  if (c.kind !== "vaga") return c;
  const o = slots.get(c.id);
  return o ? { ...c, status: o.status, grade: o.grade, term: o.term } : c;
}

const inGrid = (c: Course) => c.kind !== "optativa";

/** Créditos aprovados e totais das fases 1 a N (para a regra dos 70%) */
export function creditsUpTo(courses: Course[], n: number, slots = fillSlots(courses)) {
  const rows = courses.filter((c) => inGrid(c) && c.phase != null && c.phase <= n);
  const total = rows.reduce((a, c) => a + c.credits, 0);
  const done = rows.filter((c) => isDone(effective(c, slots))).reduce((a, c) => a + c.credits, 0);
  return { done, total };
}

export interface CourseState { state: State; why: string; missing: string[]; together: string[] }

export function courseState(c0: Course, courses: Course[], slots = fillSlots(courses), seen = new Set<string>()): CourseState {
  const c = effective(c0, slots);
  const byId = new Map(courses.map((x) => [x.id, effective(x, slots)]));
  if (isDone(c)) return { state: "aprovada", why: c.status === "dispensada" ? "Dispensada por aproveitamento." : `Aprovada${c.grade != null ? ` com ${String(c.grade).replace(".", ",")}` : ""}${c.term ? ` em ${c.term}` : ""}.`, missing: [], together: [] };
  if (c.status === "cursando") return { state: "cursando", why: "Você está cursando neste semestre.", missing: [], together: [] };
  const missing: string[] = [], together: string[] = [];
  for (const p of c.prereqs) {
    const r = byId.get(p.id);
    if (!r || isDone(r)) continue;
    if (p.co) {
      if (r.status === "cursando") continue;
      // correquisito pendente: dá para cursar junto se ele mesmo estiver liberado
      seen.add(c.id);
      if (!seen.has(r.id) && courseState(r, courses, slots, seen).state !== "bloqueada") together.push(r.name);
      else missing.push(`${r.name} (correquisito)`);
    } else missing.push(r.name);
  }
  if (c.min_pct && c.min_phase) {
    const { done, total } = creditsUpTo(courses, c.min_phase, slots);
    const need = Math.ceil((c.min_pct / 100) * total);
    if (done < need) missing.push(`${c.min_pct}% dos créditos das fases 1 a ${c.min_phase} (${done} de ${need})`);
  }
  if (missing.length) return { state: "bloqueada", why: `Falta: ${missing.join("; ")}.`, missing, together };
  const tg = together.length ? ` Cursar junto com ${together.join(" e ")}.` : "";
  if (c.status === "reprovada") return { state: "reprovada", why: `Reprovada${c.term ? ` em ${c.term}` : ""}: precisa cursar de novo. Os pré-requisitos estão cumpridos.${tg}`, missing, together };
  const rule = c.kind === "estagio" || c.kind === "tcc" ? " A matriz não traz pré-requisito; o curso costuma ter regras próprias (confira no PPC ou com a coordenação)." : "";
  return { state: "liberada", why: (c.prereqs.length || c.min_pct ? `Todos os pré-requisitos cumpridos.${tg}` : "A matriz não lista pré-requisito.") + rule, missing, together };
}

/* ============ Grafo ============ */
/** Tudo o que a disciplina exige, direta ou indiretamente */
export function requiresAll(id: string, courses: Course[]): Set<string> {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const out = new Set<string>(), stack = [id];
  while (stack.length) for (const p of byId.get(stack.pop()!)?.prereqs || []) if (!out.has(p.id) && p.id !== id) { out.add(p.id); stack.push(p.id); }
  return out;
}
/** Tudo o que a disciplina libera, direta ou indiretamente */
export function unlocksAll(id: string, courses: Course[]): Set<string> {
  const out = new Set<string>(), stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of courses) if (!out.has(c.id) && c.id !== id && c.prereqs.some((p) => p.id === cur)) { out.add(c.id); stack.push(c.id); }
  }
  return out;
}

export interface Summary {
  done: number; total: number; pct: number;
  optDone: number; optNeed: number;
  available: Course[];
  /** semestres que faltam no mínimo (depois do atual), pela cadeia de pré-requisitos e pelos créditos */
  minTerms: number; chain: string[]; termsWhy: string;
  bottlenecks: { c: Course; n: number }[];
}

/** Créditos por semestre usados na estimativa (a matriz tem fases de 20 a 30 créditos) */
export const MAX_CREDITS_TERM = 30;

export function summary(courses: Course[]): Summary {
  const slots = fillSlots(courses);
  const grid = courses.filter(inGrid).map((c) => effective(c, slots));
  const total = grid.reduce((a, c) => a + c.credits, 0);
  const done = grid.filter(isDone).reduce((a, c) => a + c.credits, 0);
  const vagas = courses.filter((c) => c.kind === "vaga");
  const optNeed = vagas.reduce((a, c) => a + c.credits, 0);
  const optDone = vagas.filter((v) => isDone(effective(v, slots))).reduce((a, c) => a + c.credits, 0);
  const st = new Map(courses.map((c) => [c.id, courseState(c, courses, slots)]));
  // só obrigatórias: optativas, extensão, estágio e TCC aparecem nos quadros deles
  const available = courses.filter((c) => c.kind === "obrigatoria" && (st.get(c.id)!.state === "liberada" || st.get(c.id)!.state === "reprovada"))
    .sort((a, b) => (a.phase ?? 99) - (b.phase ?? 99) || a.position - b.position);

  // cadeia mais longa entre o que falta (cursando termina neste semestre; correquisito vai no mesmo semestre)
  const left = new Map(grid.filter((c) => !isDone(c) && c.status !== "cursando" && c.kind !== "vaga" && c.kind !== "complementar").map((c) => [c.id, c]));
  const memo = new Map<string, { n: number; path: string[] }>();
  const level = (id: string, seen: Set<string>): { n: number; path: string[] } => {
    if (memo.has(id)) return memo.get(id)!;
    const c = left.get(id)!;
    let best = { n: 1, path: [c.name] };
    seen.add(id);
    for (const p of c.prereqs) {
      if (!left.has(p.id) || seen.has(p.id)) continue;
      const l = level(p.id, seen);
      const n = l.n + (p.co ? 0 : 1);
      if (n > best.n) best = { n, path: [...l.path, c.name] };
    }
    seen.delete(id);
    memo.set(id, best);
    return best;
  };
  let chain: string[] = [], byChain = 0;
  for (const id of left.keys()) { const l = level(id, new Set()); if (l.n > byChain) { byChain = l.n; chain = l.path; } }
  const leftCredits = [...left.values()].reduce((a, c) => a + c.credits, 0) + (optNeed - optDone);
  const byCredits = Math.ceil(leftCredits / MAX_CREDITS_TERM);
  const minTerms = Math.max(byChain, byCredits);
  const termsWhy = !left.size && optDone >= optNeed ? "Não falta nenhuma disciplina da matriz além das que você está cursando."
    : `${byChain >= byCredits ? `A maior cadeia de pré-requisitos que falta ocupa ${byChain} ${byChain === 1 ? "semestre" : "semestres em sequência"} (${chain.join(" → ")}; correquisito vai no mesmo semestre)` : `Faltam ${leftCredits} créditos e uma fase tem no máximo uns ${MAX_CREDITS_TERM}`}. Conta sem reprovações, sem contar as que você está cursando agora e sem a regra dos 70%.`;

  // gargalos: o que falta e mais libera (direta ou indiretamente)
  const bottlenecks = [...left.values()].filter((c) => c.kind === "obrigatoria")
    .map((c) => ({ c, n: [...unlocksAll(c.id, courses)].filter((id) => left.has(id)).length }))
    .filter((x) => x.n >= 3).sort((a, b) => b.n - a.n || (a.c.phase ?? 99) - (b.c.phase ?? 99)).slice(0, 3);

  return { done, total, pct: total ? done / total : 0, optDone, optNeed, available, minTerms: left.size || optDone < optNeed ? minTerms : 0, chain, termsWhy, bottlenecks };
}

/** Disciplina do app que corresponde a uma da matriz (pelo nome) */
export const matchSubject = (c: Course, subjects: Subject[]) => (c.subject_id ? subjects.find((s) => s.id === c.subject_id) : subjects.find((s) => !s.archived && norm(s.name) === norm(c.name))) ?? null;

/* ============ Previsão de formatura ============ */
/** Semestre letivo de uma data: jan–jun = /1, jul–dez = /2 */
export const termOf = (d: Date) => `${d.getFullYear()}/${d.getMonth() < 6 ? 1 : 2}`;
export const nextTerm = (t: string) => { const [y, s] = t.split("/").map(Number); return s === 1 ? `${y}/2` : `${y + 1}/1`; };

/** Fase em que o aluno está: a mais alta entre as obrigatórias que ele cursa; sem nenhuma, a anterior à primeira pendente */
export function studentPhase(courses: Course[]): number {
  const req = courses.filter((c) => c.kind === "obrigatoria" && c.phase != null);
  const now = req.filter((c) => c.status === "cursando").map((c) => c.phase!);
  if (now.length) return Math.max(...now);
  const pend = req.filter((c) => !isDone(c)).map((c) => c.phase!);
  return pend.length ? Math.min(...pend) - 1 : Math.max(0, ...req.map((c) => c.phase!));
}

/** Acima disto o semestre é "puxado" (as fases da matriz têm de 20 a 30 créditos; quase todas até 28) */
export const HEAVY = 28;
export const SCENARIOS = {
  conservadora: { cap: 30, ahead: false, name: "Conservadora" },
  otimista: { cap: 36, ahead: true, name: "Otimista" },
} as const;
export type Scenario = keyof typeof SCENARIOS;

export interface TermPlan { term: string; phase: number; items: { id: string; name: string; credits: number }[]; credits: number; heavy: boolean }
export interface Forecast { kind: Scenario; cap: number; terms: TermPlan[]; finish: string | null; heavy: TermPlan[]; stuck: string[]; why: string; notes: string[]; together: boolean }

interface Unit { id: string; name: string; credits: number; phase: number; prereqs: Prereq[]; min_pct: number | null; min_phase: number | null; final: boolean }

/** Monta os próximos semestres até a formatura.
 *  conservadora: segue a ordem da matriz (não adianta disciplina de fase seguinte), até 30 créditos;
 *  otimista: adianta tudo o que os pré-requisitos deixam, até 36 créditos, priorizando as cadeias mais longas.
 *  As duas: passa no que está cursando agora, sem reprovação; estágio e TCC por último. */
export function forecast(courses: Course[], today: Date, kind: Scenario, capOverride?: number): Forecast {
  const sc0 = SCENARIOS[kind];
  if (kind === "otimista" && capOverride == null) {
    // só aperta o quanto for preciso: a menor carga que dá a formatura mais cedo
    const tries = [HEAVY, 30, 32, 34, sc0.cap].map((c) => forecast(courses, today, kind, c));
    const best = Math.min(...tries.map((f) => (f.stuck.length ? 99 : f.terms.length)));
    return tries.find((f) => (f.stuck.length ? 99 : f.terms.length) === best) ?? tries[tries.length - 1];
  }
  const sc = { ...sc0, cap: capOverride ?? sc0.cap };
  let together = false;
  const slots = fillSlots(courses);
  const eff = new Map(courses.map((c) => [c.id, effective(c, slots)]));
  // o que está cursando conta como feito no fim deste semestre
  const done = new Set(courses.filter((c) => { const e = eff.get(c.id)!; return isDone(e) || e.status === "cursando"; }).map((c) => c.id));
  const grid = courses.filter(inGrid);
  const units: Unit[] = grid
    .filter((c) => !done.has(c.id) && c.kind !== "complementar" && !(c.kind === "extensao" && c.phase == null))
    .map((c) => ({
      id: c.id, name: c.kind === "vaga" ? `${c.name} (qualquer do catálogo)` : c.name, credits: c.credits, phase: c.phase ?? 99,
      prereqs: c.kind === "vaga" ? [] : c.prereqs, min_pct: c.min_pct, min_phase: c.min_phase, final: c.kind === "estagio" || c.kind === "tcc",
    }));
  const byId = new Map(units.map((u) => [u.id, u]));
  // altura: quantos semestres em sequência dependem dela (prioriza as cadeias longas)
  const height = new Map<string, number>();
  const h = (id: string, seen: Set<string>): number => {
    if (height.has(id)) return height.get(id)!;
    seen.add(id);
    let best = 1;
    for (const u of units) if (!seen.has(u.id)) for (const p of u.prereqs) if (p.id === id) best = Math.max(best, h(u.id, seen) + (p.co ? 0 : 1));
    seen.delete(id);
    height.set(id, best);
    return best;
  };
  units.forEach((u) => h(u.id, new Set()));
  const credOk = (u: Unit) => {
    if (!u.min_pct || !u.min_phase) return true;
    const rows = grid.filter((c) => c.phase != null && c.phase <= u.min_phase!);
    const total = rows.reduce((a, c) => a + c.credits, 0);
    return rows.filter((c) => done.has(c.id)).reduce((a, c) => a + c.credits, 0) >= Math.ceil((u.min_pct / 100) * total);
  };
  // pré-requisito cumprido, inexistente (apagado) ou correquisito no mesmo semestre
  const prereqOk = (u: Unit, chosen: Set<string>) => u.prereqs.every((p) => done.has(p.id) || (!byId.has(p.id) && !grid.some((c) => c.id === p.id)) || (p.co && chosen.has(p.id)));

  let left = units.filter((u) => !u.final);
  const finals = units.filter((u) => u.final);
  const done0 = new Set(done), phase0 = studentPhase(courses) + 1;
  let term = nextTerm(termOf(today)), phase = phase0;
  const terms: TermPlan[] = [];
  for (let k = 0; k < 24 && (left.length || finals.length); k++) {
    const chosen = new Set<string>();
    let cr = 0;
    if (!left.length) {
      // estágio e TCC no último semestre, depois das demais (como na 10ª fase da matriz)
      if (!sc.ahead && phase < Math.min(...finals.map((f) => f.phase))) { terms.push({ term, phase, items: [], credits: 0, heavy: false }); term = nextTerm(term); phase++; continue; }
      finals.forEach((f) => chosen.add(f.id));
      cr = finals.reduce((a, f) => a + f.credits, 0);
      finals.length = 0;
    } else {
      const order = left.filter((u) => sc.ahead || u.phase <= phase)
        .sort((a, b) => sc.ahead ? height.get(b.id)! - height.get(a.id)! || a.phase - b.phase : a.phase - b.phase || height.get(b.id)! - height.get(a.id)!);
      for (const u of order) {
        if (chosen.has(u.id) || !credOk(u)) continue;
        // correquisitos pendentes entram junto, se der
        const co = u.prereqs.filter((p) => p.co && !done.has(p.id) && !chosen.has(p.id)).map((p) => byId.get(p.id));
        if (co.some((c) => !c || c.final || !credOk(c) || !prereqOk(c, chosen))) continue;
        const add = [...(co as Unit[]), u];
        const extra = add.reduce((a, x) => a + x.credits, 0);
        if (cr + extra > sc.cap) continue;
        const tmp = new Set([...chosen, ...add.map((x) => x.id)]);
        if (!prereqOk(u, tmp)) continue;
        add.forEach((x) => chosen.add(x.id));
        cr += extra;
      }
      if (!chosen.size) {
        // nada coube: na conservadora pode ser só a ordem da matriz; senão travou
        if (!sc.ahead && left.some((u) => u.phase > phase)) { terms.push({ term, phase, items: [], credits: 0, heavy: false }); term = nextTerm(term); phase++; continue; }
        break;
      }
      left = left.filter((u) => !chosen.has(u.id));
      // otimista: estágio e TCC junto com as últimas disciplinas, se couber
      if (sc.ahead && !left.length && finals.length && cr + finals.reduce((a, f) => a + f.credits, 0) <= sc.cap) {
        finals.forEach((f) => chosen.add(f.id));
        cr += finals.reduce((a, f) => a + f.credits, 0);
        finals.length = 0;
        together = true;
      }
    }
    const items = [...chosen].map((id) => byId.get(id)!).sort((a, b) => a.phase - b.phase).map((u) => ({ id: u.id, name: u.name, credits: u.credits }));
    terms.push({ term, phase, items, credits: cr, heavy: cr > HEAVY });
    chosen.forEach((id) => done.add(id));
    term = nextTerm(term);
    phase++;
  }
  // semestres vazios no fim não contam
  while (terms.length && !terms[terms.length - 1].items.length) terms.pop();

  // confere um plano inteiro (ids por semestre): carga, ordem da matriz, pré e correquisitos, 70%, estágio/TCC no fim
  const valid = (plan: string[][]) => {
    const at = new Map<string, number>();
    plan.forEach((t, i) => t.forEach((id) => at.set(id, i)));
    const lastRegular = Math.max(-1, ...plan.flatMap((t, i) => (t.some((id) => !byId.get(id)!.final) ? [i] : [])));
    for (let i = 0; i < plan.length; i++) {
      const us = plan[i].map((id) => byId.get(id)!);
      if (us.reduce((a, u) => a + u.credits, 0) > sc.cap) return false;
      for (const u of us) {
        if (!sc.ahead && u.phase !== 99 && u.phase > phase0 + i) return false;
        if (u.final) { if (lastRegular > i || (!sc.ahead && us.some((x) => !x.final))) return false; continue; }
        for (const p of u.prereqs) {
          if (done0.has(p.id)) continue;
          const w = at.get(p.id);
          if (w == null) { if (byId.has(p.id)) return false; continue; }
          if (p.co ? w > i : w >= i) return false;
        }
        if (u.min_pct && u.min_phase) {
          const rows = grid.filter((c) => c.phase != null && c.phase <= u.min_phase!);
          const total = rows.reduce((a, c) => a + c.credits, 0);
          const got = rows.filter((c) => done0.has(c.id) || (at.get(c.id) ?? 99) < i).reduce((a, c) => a + c.credits, 0);
          if (got < Math.ceil((u.min_pct / 100) * total)) return false;
        }
      }
    }
    return true;
  };
  // equilíbrio: tira disciplinas dos semestres puxados para os mais leves, sem mudar a data nem quebrar regra
  const plan = terms.map((t) => t.items.map((x) => x.id));
  const cred = (t: string[]) => t.reduce((a, id) => a + byId.get(id)!.credits, 0);
  if (!left.length && !finals.length && valid(plan)) {
    for (let guard = 0; guard < 300; guard++) {
      let moved = false;
      for (let hI = 0; hI < plan.length && !moved; hI++) {
        if (cred(plan[hI]) <= HEAVY) continue;
        // mexe primeiro no que é menos crítico e de fase mais adiantada (atrasadas ficam onde estão, se der)
        const cands = plan[hI].filter((id) => !byId.get(id)!.final).sort((a, b) => height.get(a)! - height.get(b)! || byId.get(b)!.phase - byId.get(a)!.phase);
        for (const id of cands) {
          const u = byId.get(id)!;
          const targets = plan.map((_, j) => j).filter((j) => j !== hI && Math.abs(j - hI) <= 2 && cred(plan[j]) + u.credits <= HEAVY).sort((a, b) => Math.abs(a - hI) - Math.abs(b - hI) || cred(plan[a]) - cred(plan[b]));
          for (const j of targets) {
            const next = plan.map((t) => [...t]);
            next[hI] = next[hI].filter((x) => x !== id);
            next[j].push(id);
            if (valid(next)) { plan.splice(0, plan.length, ...next); moved = true; break; }
          }
          if (moved) break;
        }
      }
      if (!moved) break;
    }
    plan.forEach((ids, i) => {
      const us = ids.map((id) => byId.get(id)!).sort((a, b) => a.phase - b.phase);
      const credits = cred(ids);
      terms[i] = { ...terms[i], items: us.map((u) => ({ id: u.id, name: u.name, credits: u.credits })), credits, heavy: credits > HEAVY };
    });
  }
  const stuck = [...left, ...finals].map((u) => u.name);
  const heavy = terms.filter((t) => t.heavy);
  const notes: string[] = [];
  const outside = courses.filter((c) => (c.kind === "complementar" || (c.kind === "extensao" && c.phase == null)) && !isDone(c));
  if (outside.length) notes.push(`Faltam ${outside.map((c) => `${c.credits} créditos de ${c.name.toLowerCase()}`).join(" e ")}: são feitos fora das disciplinas, ao longo do curso.`);
  if (together) notes.push("Estágio e TCC no mesmo semestre das últimas disciplinas: confira com a coordenação se o curso permite.");
  if (stuck.length) notes.push(`Não consegui encaixar: ${stuck.join(", ")}. Confira os pré-requisitos dessas disciplinas.`);
  const why = (sc.ahead
    ? `Adiantando tudo o que os pré-requisitos permitem, começando pelas cadeias mais longas, com até ${sc.cap} créditos por semestre (a menor carga que dá a formatura mais cedo).`
    : `Seguindo a ordem da matriz (sem adiantar disciplina de fase seguinte, recuperando primeiro o que ficou para trás), até ${sc.cap} créditos por semestre, o máximo de uma fase da matriz.`)
    + ` Considera que você passa no que está cursando agora e não reprova; estágio e TCC ${sc.ahead ? "no fim" : "sozinhos no último semestre"}. Não sabe de choque de horário nem se a disciplina é oferecida naquele semestre (isso é com o SIGA).`;
  return { kind, cap: sc.cap, together, terms, finish: stuck.length || !terms.length ? (terms.length ? null : termOf(today)) : terms[terms.length - 1].term, heavy, stuck, why, notes };
}
