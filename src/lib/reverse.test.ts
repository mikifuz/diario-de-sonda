import { test } from "node:test";
import assert from "node:assert/strict";
import { reversePlan, todayTasks, type RevInput } from "./reverse";
import { planDay } from "./plan";
import type { Assessment, RoutineBlock, Session, Subject, Topic } from "./types";

const TODAY = "2026-10-12"; // segunda
const SUB = (p: Partial<Subject> = {}): Subject => ({
  id: "s", name: "Cálculo III", code: "", professor: "", semester: "", credits: null, hours: null, color: "#4f86f7", min_avg: 7, schedule: "", notes: "",
  traits: {}, exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false, study_pref: null, recovery: "sub", sub_replace_lower: false, ...p,
});
const A = (p: Partial<Assessment>): Assessment => ({ id: "p2", subject_id: "s", name: "P2", kind: "prova", date: "2026-10-17", time: null, weight: 1, grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null, ...p });
const T = (p: Partial<Topic>): Topic => ({ id: "t", subject_id: "s", parent_id: null, name: "Integrais triplas", position: 0, taught_on: "2026-10-01", assessment_id: "p2", ...p });
const B = (wd: number, start = "14:00", end = "16:00"): RoutineBlock => ({ id: `b${wd}${start}`, weekday: wd, start_time: start, end_time: end, kind: "estudo", subject_id: null, label: "" });
const S = (p: Partial<Session>): Session => ({ id: Math.random().toString(), subject_id: "s", topic_id: "t", activity: "exercicios", started_at: new Date(2026, 9, 10, 10).toISOString(), duration_min: 30,
  questions: null, correct: null, notes: "", confidence: null, result: null, autonomy: null, difficulty: null, comprehension: null, ...p });
const every = [0, 1, 2, 3, 4, 5, 6].map((d) => B(d)); // 2 h por dia → 96 min úteis (20% de reserva)
const inp = (p: Partial<RevInput>): RevInput => ({ today: TODAY, nowMin: 8 * 60, blocks: every, events: [], subjects: [SUB()], topics: [T({})], sessions: [], assessments: [A({})], items: [], logs: [], mistakes: [], ...p });

test("conteúdo sem dados recebe a meta cheia, em pedaços espaçados, e a véspera tem revisão geral", () => {
  const [pl] = reversePlan(inp({}));
  assert.equal(pl.topics[0].target, 120);
  assert.equal(pl.topics[0].need, 120);
  const c = pl.chunks.filter((x) => !x.final);
  assert.deepEqual(c.map((x) => `${x.day}:${x.minutes}`), ["2026-10-12:45", "2026-10-13:45", "2026-10-14:30"]); // um pedaço por dia
  const f = pl.chunks.find((x) => x.final)!;
  assert.equal(f.day, "2026-10-16");
  assert.equal(pl.missing, 0);
});

test("o que já foi estudado desconta e conteúdo dominado pede menos", () => {
  const sessions = [1, 2, 3].map(() => S({ result: "certo", autonomy: "sozinho" }));
  const [pl] = reversePlan(inp({ sessions }));
  assert.equal(pl.topics[0].band, "dominado");
  assert.equal(pl.topics[0].target, 30);
  assert.equal(pl.topics[0].done, 90);
  assert.equal(pl.topics[0].need, 0);
  assert.equal(pl.chunks.filter((x) => !x.final).length, 0);
});

test("conteúdo ainda não dado só entra a partir da aula", () => {
  const [pl] = reversePlan(inp({ topics: [T({ taught_on: "2026-10-14" })] }));
  assert.ok(pl.chunks.filter((x) => !x.final).every((x) => x.day >= "2026-10-14"));
});

test("sem tempo suficiente, avisa quanto falta em vez de esconder", () => {
  const topics = ["a", "b", "c", "d"].map((id) => T({ id, name: id }));
  const [pl] = reversePlan(inp({ topics, blocks: [B(1, "14:00", "15:00")], assessments: [A({ date: "2026-10-14" })] }));
  assert.ok(pl.missing > 0);
  assert.match(pl.notes.join(" "), /Faltam \d+ min de estudo antes da P2/);
});

test("prova mais cedo usa o tempo primeiro e as tarefas de hoje vão para o plano do dia", () => {
  const subjects = [SUB(), SUB({ id: "f", name: "Física II" })];
  const assessments = [A({}), A({ id: "f1", subject_id: "f", name: "A3", date: "2026-10-14" })];
  const topics = [T({}), T({ id: "u", subject_id: "f", name: "Fluidos", assessment_id: "f1" })];
  const plans = reversePlan(inp({ subjects, assessments, topics }));
  assert.equal(plans[0].exam.id, "f1");
  const tasks = todayTasks(plans, TODAY);
  assert.ok(tasks.length >= 1 && tasks[0].kind === "preparar");
  const day = planDay({ today: TODAY, nowMin: 8 * 60, pref: "depois", blocks: every, events: [], subjects, topics, sessions: [], assessments, items: [], mistakes: [], extra: tasks });
  assert.ok(day.slots[0].placed.some((x) => x.task.kind === "preparar"));
  assert.match(day.slots[0].placed[0].task.why, /A3 de Física II/);
});

test("sem conteúdos ligados, explica o que fazer", () => {
  const [pl] = reversePlan(inp({ topics: [] }));
  assert.match(pl.notes[0], /Nenhum conteúdo ligado/);
});

test("quando não cabe tudo: recomenda o que priorizar, com o motivo e o que fazer", () => {
  const topics = [T({ id: "a", name: "Integrais duplas" }), T({ id: "b", name: "Teorema de Green" }), T({ id: "c", name: "Rotacional" })];
  const sessions = [S({ topic_id: "b", confidence: 2 }), S({ topic_id: "b", confidence: 2 })];
  const mistakes = [1, 2].map((i) => ({ id: `m${i}`, subject_id: "s", topic_id: "c", session_id: null, category: "sinal" as const, description: "x", correction: "", source: "", occurred_on: "2026-10-10" }));
  const pouco = [B(1, "14:00", "15:00")]; // só 1 h na segunda
  const [pl] = reversePlan(inp({ topics, sessions, mistakes, blocks: pouco }));
  assert.ok(pl.missing > 0);
  assert.deepEqual(pl.priority.map((x) => x.topic.name), ["Rotacional", "Teorema de Green", "Integrais duplas"]);
  assert.match(pl.priority[0].why, /2 erros registrados/);
  assert.match(pl.priority[0].how, /refaça os exercícios em que errou/);
  assert.match(pl.priority[1].why, /confiança baixa \(2,0\/5\)/);
  // o tempo que existe vai primeiro para o mais urgente
  assert.equal(pl.chunks.find((c) => !c.final)?.topicId, "c");
  // com tempo de sobra, não há recomendação
  assert.equal(reversePlan(inp({ topics: topics.slice(0, 1) }))[0].priority.length, 0);
});
