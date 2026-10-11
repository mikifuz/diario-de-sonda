import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, reportWeek } from "./report";
import type { Assessment, Mistake, Session, Subject } from "./types";

const S = (day: number, p: Partial<Session> = {}): Session => ({ id: Math.random().toString(), subject_id: "s", topic_id: null, activity: "exercicios", started_at: new Date(2026, 9, day, 10).toISOString(), duration_min: 60,
  questions: null, correct: null, notes: "", confidence: null, result: null, autonomy: null, difficulty: null, comprehension: null, ...p });
const SUB: Subject = { id: "s", name: "Cálculo III", code: "", professor: "", semester: "", credits: null, hours: null, color: "#4f86f7", min_avg: 7, schedule: "", notes: "",
  traits: {}, exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false, study_pref: null, recovery: "sub", sub_replace_lower: false };
const A = (p: Partial<Assessment>): Assessment => ({ id: "p", subject_id: "s", name: "P2", kind: "prova", date: "2026-10-13", time: null, weight: 1, grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null, ...p });

test("o relatório sai no domingo de manhã e cobre de domingo a sábado", () => {
  assert.deepEqual(reportWeek("2026-10-11", 8), { week: "2026-10-11", from: "2026-10-04", to: "2026-10-10" });
  assert.equal(reportWeek("2026-10-11", 6).week, "2026-10-04"); // domingo antes das 7h: ainda o anterior
  assert.equal(reportWeek("2026-10-14", 12).week, "2026-10-11"); // no meio da semana: o deste domingo
});

test("relatório com horas, comparação, acerto e confiança separados e provas da semana que vem", () => {
  const sessions = [S(5, { questions: 10, correct: 8, confidence: 2 }), S(7, { result: "errado", confidence: 4 }), S(28), S(1)];
  const mistakes: Mistake[] = [{ id: "m", subject_id: "s", topic_id: null, session_id: null, category: "sinal", description: "x", correction: "", source: "", occurred_on: "2026-10-06" }];
  const r = buildReport({ week: "2026-10-11", sessions, subjects: [SUB], assessments: [A({}), A({ id: "x", date: "2026-10-30" })], mistakes, logs: [], items: [] })!;
  assert.equal(r.title, "Relatório da semana 04/10 a 10/10");
  assert.equal(r.data.minutes, 120); // dias 5 e 7
  assert.equal(r.data.prevMinutes, 60); // dia 1
  assert.equal(r.data.acc, 0.4); // (0,8 + 0) ÷ 2
  assert.equal(r.data.conf, 3); // confiança à parte
  assert.deepEqual(r.data.mistakes, [{ cat: "Sinal", n: 1 }]);
  assert.deepEqual(r.data.exams.map((e) => e.name), ["P2"]);
  assert.match(r.body, /Você estudou 2h em 2 sessão\(ões\), em 2 dia\(s\); \+1h em relação à semana anterior; acerto conferido de 40%/);
  assert.match(r.body, /Na semana que vem: P2 de Cálculo III \(13\/10\)/);
});

test("sem nenhuma sessão até a semana, não manda relatório vazio", () => {
  assert.equal(buildReport({ week: "2026-10-11", sessions: [S(20)], subjects: [SUB], assessments: [], mistakes: [], logs: [], items: [] }), null);
  const vazio = buildReport({ week: "2026-10-11", sessions: [S(1)], subjects: [SUB], assessments: [], mistakes: [], logs: [], items: [] })!;
  assert.match(vazio.body, /Nenhuma sessão registrada nesta semana/);
});
