import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, gradeCalc, parseNum, periodRange, signal, stats, streak, verified, weekStartKey, fmtMin, qt } from "./calc";
import type { Assessment, Session } from "./types";

const A = (p: Partial<Assessment>): Assessment => ({
  id: Math.random().toString(), subject_id: "s", name: "x", kind: "prova", date: null, time: null, weight: 1,
  grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null, ...p,
});
const sub = (p = {}) => ({ min_avg: 7, recovery: "nenhuma" as const, sub_replace_lower: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, ...p });
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
  const r = gradeCalc(sub({ recovery: "exame" }), [A({ grade: 4 }), A({ grade: 5 })]);
  assert.equal(r.final, 4.5);
  assert.equal(r.exam?.need, 5.5); // (5×2 − 4,5) ÷ 1
  assert.equal(r.exam?.eligible, true);
  const r2 = gradeCalc(sub({ recovery: "exame", exam_min_take: 5 }), [A({ grade: 4 })]);
  assert.equal(r2.exam?.eligible, false);
});

test("SUB substitui a menor nota entre as provas marcadas, só se for maior", () => {
  const items = [A({ id: "p1", name: "P1", weight: 1, grade: 3, sub_id: "S" }), A({ id: "p2", name: "P2", weight: 1, grade: 8, sub_id: "S" }), A({ id: "t", kind: "trabalho", weight: 1, grade: 2 })];
  const r = gradeCalc(sub({ recovery: "sub" }), [...items, A({ id: "S", kind: "sub", grade: 7 })]);
  assert.ok(Math.abs((r.final ?? 0) - 13 / 3) < 1e-9); // SUB fora dos pesos
  assert.equal(r.sub?.target?.id, "p1"); // trabalho (nota 2) não é substituído
  assert.ok(r.sub?.replaced);
  assert.ok(Math.abs((r.sub?.final ?? 0) - 17 / 3) < 1e-9); // (7 + 8 + 2) ÷ 3
  assert.ok(Math.abs((r.subFinal ?? 0) - 17 / 3) < 1e-9);
  assert.equal(r.subOfficial, true);
  assert.ok(Math.abs((r.sub?.need ?? 0) - 11) < 1e-9); // 3 + (7 − 13/3) × 3 ÷ 1
  const menor = gradeCalc(sub({ recovery: "sub" }), [...items, A({ id: "S", kind: "sub", grade: 1 })]);
  assert.equal(menor.sub?.replaced, false);
  assert.ok(Math.abs((menor.sub?.final ?? 0) - 13 / 3) < 1e-9);
  const prof = gradeCalc(sub({ recovery: "sub", sub_replace_lower: true }), [...items, A({ id: "S", kind: "sub", grade: 1 })]);
  assert.equal(prof.sub?.replaced, true); // regra do professor: substitui mesmo menor
  assert.ok(Math.abs((prof.sub?.final ?? 0) - 11 / 3) < 1e-9);
  // prova sem SUB marcada não é substituída
  const so2 = gradeCalc(sub({ recovery: "sub" }), [A({ id: "p1", grade: 3 }), A({ id: "p2", grade: 8, sub_id: "S" }), A({ id: "S", kind: "sub", grade: 9 })]);
  assert.equal(so2.sub?.target?.id, "p2");
  assert.equal(so2.sub?.covered, 1);
});

test("duas SUBs (A1/A2 e A3/A4): cada uma vale só para as suas provas", () => {
  const items = [
    A({ id: "a1", name: "A1", grade: 4, sub_id: "S1" }), A({ id: "a2", name: "A2", grade: 8, sub_id: "S1" }),
    A({ id: "a3", name: "A3", grade: 5, sub_id: "S2" }), A({ id: "a4", name: "A4", grade: 9, sub_id: "S2" }),
    A({ id: "S1", name: "SUB A1/A2", kind: "sub", grade: 7 }), A({ id: "S2", name: "SUB A3/A4", kind: "sub", grade: 8 }),
  ];
  const r = gradeCalc(sub({ recovery: "sub" }), items);
  assert.deepEqual(r.subs.map((x) => x.target?.id), ["a1", "a3"]);
  assert.equal(r.final, 6.5);
  assert.ok(Math.abs((r.subFinal ?? 0) - (7 + 8 + 8 + 9) / 4) < 1e-9); // as duas aplicadas
});

test("SUB com simulação e sem provas marcadas", () => {
  const r = gradeCalc(sub({ recovery: "sub" }), [A({ weight: 2, grade: 6, sub_id: "S" }), A({ id: "p2", weight: 1, sim_e: 4, sub_id: "S" }), A({ id: "S", kind: "sub", sim_e: 9 })], "e");
  assert.equal(r.sub?.target?.id, "p2"); // usa a simulação enquanto não há nota
  assert.equal(r.sub?.official, false);
  assert.ok(Math.abs((r.sub?.final ?? 0) - 7) < 1e-9); // (12 + 9) ÷ 3
  const sem = gradeCalc(sub({ recovery: "sub" }), [A({ grade: 5 }), A({ id: "S", kind: "sub" })]);
  assert.equal(sem.sub?.covered, 0);
  assert.equal(sem.sub?.target, null);
  assert.equal(gradeCalc(sub({ recovery: "sub" }), [A({ grade: 5 })]).sub, null);
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

test("singular e plural sem \"(s)\"", () => {
  assert.equal(qt(1, "sessão", "sessões"), "1 sessão");
  assert.equal(qt(0, "sessão", "sessões"), "0 sessões");
  assert.equal(qt(3, "revisão feita", "revisões feitas"), "3 revisões feitas");
});
