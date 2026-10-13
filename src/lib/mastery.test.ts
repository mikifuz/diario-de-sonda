import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MASTERY, mastery, masteryCfg, topicFamily } from "./mastery";
import { buildAlerts, shortExam, type AlertInput } from "./alerts";
import type { Assessment, Mistake, ReviewItem, ReviewLog, Session, Subject, Topic } from "./types";

const TODAY = "2026-10-12";
const at = (daysAgo: number, h = 10) => new Date(2026, 9, 12 - daysAgo, h).toISOString();
const S = (p: Partial<Session>): Session => ({
  id: Math.random().toString(), subject_id: "s", topic_id: "t", activity: "exercicios", started_at: at(1), duration_min: 30,
  questions: null, correct: null, notes: "", confidence: null, result: null, autonomy: null, difficulty: null, comprehension: null, ...p,
});
const T = (p: Partial<Topic>): Topic => ({ id: "t", subject_id: "s", parent_id: null, name: "Integrais triplas", position: 0, taught_on: null, assessment_id: null, ...p });
const M = (p: Partial<Mistake>): Mistake => ({ id: "m", subject_id: "s", topic_id: "t", session_id: null, category: "sinal", description: "x", correction: "", source: "", occurred_on: TODAY, ...p });
const R = (p: Partial<ReviewItem>): ReviewItem => ({ id: "r", subject_id: "s", topic_id: "t", mistake_id: "m", assessment_id: null, title: "x", step: 0, due: TODAY, est_min: 15, active: true, last_reviewed_at: null, ...p });
const L = (p: Partial<ReviewLog>): ReviewLog => ({ id: Math.random().toString(), item_id: "r", reviewed_at: at(0), result: "certo", autonomy: "sozinho", confidence: null, prev_step: 0, new_step: 1, prev_due: TODAY, new_due: TODAY, ...p });
const base = { logs: [] as ReviewLog[], items: [] as ReviewItem[], mistakes: [] as Mistake[], today: TODAY };
const one = new Set(["t"]);

test("sem dados suficientes não há nota", () => {
  const m = mastery(one, { ...base, sessions: [S({ result: "certo" }), S({ result: "nao", confidence: 5 })] });
  assert.equal(m.score, null);
  assert.equal(m.n, 1); // "ainda não conferi" não conta
  assert.match(m.why, /faltam 2/);
});

test("conta aberta: acerto, autonomia, prática e erros", () => {
  const sessions = [S({ questions: 10, correct: 7, autonomy: "sozinho" }), S({ result: "certo", autonomy: "sozinho" }), S({ result: "errado", autonomy: "resolucao" })];
  const m = mastery(one, { ...base, sessions });
  // mesmo dia: pesos iguais → acerto (0,7+1+0)/3; autonomia (1+1+0)/3; prática 100%; erros 100%
  const exp = Math.round((100 * (50 * (1.7 / 3) + 25 * (2 / 3) + 15 * 1 + 10 * 1)) / 100);
  assert.equal(m.score, exp);
  assert.equal(m.score, 70);
  assert.equal(m.band, "dominado");
  assert.match(m.formula, /acerto 57% × 50/);
});

test("confiança não muda o índice", () => {
  const a = [S({ result: "certo" }), S({ result: "parcial" }), S({ result: "errado" })];
  const b = a.map((s) => ({ ...s, confidence: 5 }));
  assert.equal(mastery(one, { ...base, sessions: a }).score, mastery(one, { ...base, sessions: b }).score);
});

test("registros recentes pesam mais e prática antiga desconta", () => {
  const velho = [S({ result: "errado", started_at: at(28) }), S({ result: "errado", started_at: at(28) }), S({ result: "certo", started_at: at(0) })];
  const m = mastery(one, { ...base, sessions: velho });
  assert.ok((m.parts[0].v ?? 0) > 1 / 3); // o acerto de hoje vale mais que os erros antigos
  const parado = mastery(one, { ...base, sessions: [1, 2, 3].map(() => S({ result: "certo", started_at: at(40) })) });
  assert.equal(parado.parts[2].v, 0);
});

test("erros em aberto descontam até serem resolvidos sozinho na revisão", () => {
  const sessions = [1, 2, 3].map(() => S({ result: "certo", autonomy: "sozinho" }));
  const aberto = mastery(one, { ...base, sessions, mistakes: [M({})], items: [R({})] });
  assert.ok(Math.abs((aberto.parts[3].v ?? 0) - 2 / 3) < 1e-9);
  const ok = mastery(one, { ...base, sessions, mistakes: [M({})], items: [R({})], logs: [L({})] });
  assert.equal(ok.parts[3].v, 1);
});

test("subconteúdos entram no conteúdo-pai e configuração inválida volta ao padrão", () => {
  const ts = [T({}), T({ id: "f", parent_id: "t" }), T({ id: "n", parent_id: "f" })];
  assert.deepEqual([...topicFamily(ts, "t")].sort(), ["f", "n", "t"]);
  assert.deepEqual(masteryCfg({ w_acc: -3, decay_days: 2 }), DEFAULT_MASTERY);
  assert.equal(masteryCfg({ w_acc: 70 }).w_acc, 70);
});

/* ============ Alertas ============ */
const SUB: Subject = {
  id: "s", name: "Cálculo III", code: "", professor: "", semester: "", credits: null, hours: null, color: "#4f86f7", min_avg: 7, schedule: "", notes: "",
  traits: {}, exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false, study_pref: null, recovery: "sub", sub_replace_lower: false,
};
const A = (p: Partial<Assessment>): Assessment => ({ id: "p2", subject_id: "s", name: "P2", kind: "prova", date: "2026-10-17", time: null, weight: 1, grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null, ...p });
const inp = (p: Partial<AlertInput>): AlertInput => ({ today: TODAY, subjects: [SUB], topics: [T({})], sessions: [], assessments: [A({})], items: [], logs: [], mistakes: [], ...p });

test("alerta: prova chegando com conteúdo frágil sugere exercícios", () => {
  const sessions = [1, 2, 3].map(() => S({ result: "errado", autonomy: "resolucao" }));
  const [a] = buildAlerts(inp({ sessions }));
  assert.equal(a.level, "bad");
  assert.match(a.text, /P2 de Cálculo III é em 5 dias: Integrais triplas \(domínio \d+\) está frágil/);
  assert.equal(a.action?.href, "/sala?disciplina=s&conteudo=t&atividade=exercicios");
});

test("alerta: confiança baixa perto da prova, sem misturar com acerto", () => {
  const sessions = [S({ confidence: 2 }), S({ confidence: 2 })];
  const al = buildAlerts(inp({ sessions }));
  assert.ok(al.some((a) => a.level === "warn" && /confiança baixa em Integrais triplas \(média 2,0\/5\)/.test(a.text)));
  assert.ok(al.some((a) => /sem resultado conferido|ainda não tem resultado/.test(a.text)));
});

test("alerta: nada a dizer quando a prova está longe ou o conteúdo vai bem", () => {
  const sessions = [1, 2, 3].map(() => S({ result: "certo", autonomy: "sozinho" }));
  assert.equal(buildAlerts(inp({ sessions })).length, 0);
  assert.equal(buildAlerts(inp({ assessments: [A({ date: "2026-12-01" })] })).length, 0);
});

test("alerta: conteúdo marcado para outra prova não entra", () => {
  const sessions = [1, 2, 3].map(() => S({ result: "errado" }));
  const al = buildAlerts(inp({ sessions, topics: [T({ assessment_id: "p3" })], assessments: [A({}), A({ id: "p3", name: "P3", date: "2026-12-01" })] }));
  assert.ok(!al.some((a) => a.level === "bad"));
});

test("alerta: conteúdo em construção com prova em até 7 dias", () => {
  const sessions = [S({ result: "parcial", autonomy: "anotacoes" }), S({ result: "parcial", autonomy: "anotacoes" }), S({ result: "errado", autonomy: "sozinho" })];
  const al = buildAlerts(inp({ sessions }));
  assert.ok(al.some((a) => a.level === "warn" && /em construção/.test(a.text)));
  assert.ok(!buildAlerts(inp({ sessions, assessments: [A({ date: "2026-10-22" })] })).some((a) => /em construção/.test(a.text)));
});

test("alerta: conteúdo de prova que já passou não é cobrado na próxima (caso do dono)", () => {
  // Física: P1 já foi; P2 daqui a 4 dias. "Oscilações" é um assunto do cronograma, sem prova marcada,
  // com aulas ligadas à P1; "Amortecimento" não tem prova marcada, mas a aula foi antes da P1.
  const p1 = A({ id: "p1", name: "P1", date: "2026-09-20", grade: 6, sub_id: "sub" });
  const p2 = A({ id: "p2", name: "P2", date: "2026-10-16" });
  const sub = A({ id: "sub", name: "SUB", kind: "sub", date: "2026-10-20" });
  const topics = [
    T({ id: "osc", name: "Oscilações" }),
    T({ id: "mhs", name: "MHS", parent_id: "osc", taught_on: "2026-08-20", assessment_id: "p1" }),
    T({ id: "amort", name: "Amortecimento", parent_id: "osc", taught_on: "2026-09-01" }),
    T({ id: "ondas", name: "Ondas", taught_on: "2026-10-01" }),
    T({ id: "grav", name: "Gravitação", taught_on: "2026-10-05", assessment_id: "p2" }),
  ];
  const nomes = (al: ReturnType<typeof buildAlerts>) => al.map((a) => a.text).join(" | ");
  const al = nomes(buildAlerts(inp({ topics, assessments: [p1, p2] })));
  assert.match(al, /P2 de Cálculo III é em 4 dias/);
  assert.match(al, /Ondas/);
  assert.match(al, /Gravitação/);
  assert.doesNotMatch(al, /Oscilações|MHS|Amortecimento/);
  // na SUB (que substitui a P1) os conteúdos da P1 voltam
  const comSub = buildAlerts(inp({ today: "2026-10-17", topics, assessments: [p1, { ...p2, grade: 7 }, sub] }));
  assert.match(nomes(comSub), /SUB de Cálculo III/);
  assert.match(nomes(comSub), /MHS|Oscilações/);
  assert.doesNotMatch(nomes(comSub), /Ondas|Gravitação/);
});

test("alerta curto para o celular: título com a prova e a disciplina, uma linha por problema", () => {
  assert.equal(shortExam("2ª Avaliação – Análise de estruturas"), "Avaliação 2");
  assert.equal(shortExam("Segunda avaliação"), "Avaliação 2");
  assert.equal(shortExam("1ª PROVA"), "Prova 1");
  assert.equal(shortExam("Prova 3 - Termodinâmica"), "Prova 3");
  assert.equal(shortExam("P2"), "P2");
  assert.equal(shortExam("SUB"), "SUB");
  const sessions = [S({ result: "parcial", autonomy: "anotacoes" }), S({ result: "parcial", autonomy: "anotacoes" }), S({ result: "errado", autonomy: "sozinho" })];
  const al = buildAlerts(inp({ sessions, assessments: [A({ name: "2ª Avaliação – Análise de estruturas", date: "2026-10-13" })] }));
  const b = al.find((a) => a.key.startsWith("bd-"))!;
  assert.equal(b.head, "Avaliação 2 · Cálculo III");
  assert.equal(b.when, "amanhã");
  assert.equal(b.short, "Em construção: Integrais triplas.");
  assert.ok(al.filter((a) => a.group).every((a) => a.group === "p2"));
});
