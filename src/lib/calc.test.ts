import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, gradeCalc, parseNum, periodRange, signal, stats, streak, verified, weekStartKey, fmtMin } from "./calc";
import type { Assessment, Session } from "./types";

const A = (p: Partial<Assessment>): Assessment => ({
  id: Math.random().toString(), subject_id: "s", name: "x", kind: "prova", date: null, time: null, weight: 1,
  grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", ...p,
});
const sub = (p = {}) => ({ min_avg: 7, exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, ...p });
const S = (p: Partial<Session>): Session => ({
  id: "x", subject_id: "s", topic_id: null, activity: "exercicios", started_at: new Date().toISOString(), duration_min: 30,
  questions: null, correct: null, notes: "", confidence: null, result: null, autonomy: null, difficulty: null, comprehension: null, ...p,
});

test("média ponderada e nota necessária", () => {
  const r = gradeCalc(sub(), [A({ weight: 3, grade: 6 }), A({ weight: 3, grade: 8 }), A({ weight: 4, sim_e: 7.5 })], "e");
  assert.equal(r.partial, 7);
  assert.equal(r.needed, 7); // (7×10 − 42) ÷ 4
  assert.ok(Math.abs((r.proj.e ?? 0) - 7.2) < 1e-9);
  assert.equal(r.proj.c, null); // cenário sem simulação preenchida
});

test("média final e exame", () => {
  const r = gradeCalc(sub({ exam_enabled: true }), [A({ grade: 4 }), A({ grade: 5 })]);
  assert.equal(r.final, 4.5);
  assert.equal(r.exam?.need, 5.5); // (5×2 − 4,5) ÷ 1
  assert.equal(r.exam?.eligible, true);
  const r2 = gradeCalc(sub({ exam_enabled: true, exam_min_take: 5 }), [A({ grade: 4 })]);
  assert.equal(r2.exam?.eligible, false);
});

test("pesos zerados são ignorados e média já garantida", () => {
  const r = gradeCalc(sub(), [A({ weight: 0, grade: 0 }), A({ weight: 9, grade: 10 }), A({ weight: 1 })]);
  assert.equal(r.nItems, 2);
  assert.ok((r.needed ?? 1) <= 0);
});

test("sem avaliações", () => {
  const r = gradeCalc(sub(), []);
  assert.equal(r.partial, null);
  assert.equal(r.needed, null);
  assert.equal(r.final, null);
});

test("acerto conferido separa resultado de confiança", () => {
  assert.equal(verified(S({ questions: 10, correct: 7 })), 0.7);
  assert.equal(verified(S({ result: "parcial" })), 0.5);
  assert.equal(verified(S({ result: "nao", confidence: 5 })), null);
  const st = stats([S({ confidence: 4, result: "certo", autonomy: "sozinho" }), S({ duration_min: 20, questions: 4, correct: 1, confidence: 5, autonomy: "ajuda" })]);
  assert.equal(st.min, 50);
  assert.equal(st.conf, 4.5);
  assert.equal(st.acc, 0.625);
  assert.equal(st.solo, 0.5);
});

test("leitura do conteúdo detecta confiança acima do resultado", () => {
  const list = [S({ confidence: 5, result: "errado" }), S({ confidence: 4, result: "parcial" })];
  assert.equal(signal(stats(list)).t, "Confiança acima do resultado");
  assert.equal(signal(stats([S({ confidence: 3 })])).t, "Poucos dados conferidos");
  assert.equal(signal(stats([])).t, "Não estudado");
});

test("datas e períodos", () => {
  assert.equal(weekStartKey("2026-10-10"), "2026-10-05");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.deepEqual(periodRange("mes", "2026-10-10"), ["2026-10-01", "2026-10-10"]);
  assert.equal(fmtMin(135), "2h 15min");
  assert.equal(parseNum("7,5"), 7.5);
  assert.equal(parseNum(""), null);
});

test("sequência de dias", () => {
  const d = { "2026-10-10": 30, "2026-10-09": 20, "2026-10-07": 10 };
  assert.equal(streak(d, false, "2026-10-10"), 2);
  assert.equal(streak({ "2026-10-09": 20 }, false, "2026-10-10"), 1);
  assert.equal(streak({}, true, "2026-10-10"), 1);
});
