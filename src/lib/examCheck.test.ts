import { test } from "node:test";
import assert from "node:assert/strict";
import { examAdvice, examEnd, pendingExamChecks } from "./examCheck";
import type { Assessment, RoutineBlock, Subject } from "./types";

// 14/10/2026 é uma quarta-feira (weekday 3)
const A = (p: Partial<Assessment>): Assessment => ({ id: "p1", subject_id: "s", name: "P1", kind: "prova", date: "2026-10-14", time: null, weight: 1, grade: null, predicted: null,
  sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null, ...p });
const B = (start: string, end: string, p: Partial<RoutineBlock> = {}): RoutineBlock => ({ id: start, weekday: 3, start_time: start, end_time: end, kind: "aula", subject_id: "s", label: "", ...p });
const SUB: Subject = { id: "s", name: "Estática", code: "", professor: "", semester: "", credits: null, hours: null, color: "#000", min_avg: 7, schedule: "", notes: "", traits: {},
  exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false, study_pref: null, recovery: "sub", sub_replace_lower: false };
const at = (h: number, m = 0, day = 14) => new Date(2026, 9, day, h, m);

test("sem horário na prova, usa a aula da rotina (horários seguidos viram um bloco)", () => {
  const e = examEnd(A({}), [B("08:20", "09:10"), B("09:10", "10:00"), B("13:30", "15:10", { subject_id: "outra" })]);
  assert.equal(e.start, 500);
  assert.equal(e.end, 600);
  assert.match(e.why, /horário da aula da rotina \(08:20–10:00\)/);
});

test("com horário, termina no fim da aula; fora da aula, conta 2 h; sem nada, 18h", () => {
  assert.equal(examEnd(A({ time: "08:00" }), [B("08:20", "10:00")]).end, 600);
  assert.equal(examEnd(A({ time: "19:00" }), [B("08:20", "10:00")]).end, 21 * 60);
  assert.equal(examEnd(A({}), []).end, 18 * 60);
});

test("só pergunta depois que a prova acabou, até 7 dias, sem nota e sem resposta", () => {
  const blocks = [B("08:20", "10:00")];
  assert.equal(pendingExamChecks({ assessments: [A({})], blocks, now: at(9, 30) }).length, 0);
  const ok = pendingExamChecks({ assessments: [A({})], blocks, now: at(10, 5) });
  assert.equal(ok.length, 1);
  assert.equal(ok[0].when, "hoje às 08:20");
  assert.equal(pendingExamChecks({ assessments: [A({ grade: 6 })], blocks, now: at(11) }).length, 0);
  assert.equal(pendingExamChecks({ assessments: [A({ felt: 2 })], blocks, now: at(11) }).length, 0);
  assert.equal(pendingExamChecks({ assessments: [A({ felt: 0 })], blocks, now: at(11) }).length, 0);
  assert.equal(pendingExamChecks({ assessments: [A({})], blocks, now: at(11), answered: { p1: 3 } }).length, 0);
  assert.equal(pendingExamChecks({ assessments: [A({ kind: "trabalho" })], blocks, now: at(11) }).length, 0);
  assert.equal(pendingExamChecks({ assessments: [A({ status: "cancelado" })], blocks, now: at(11) }).length, 0);
  assert.equal(pendingExamChecks({ assessments: [A({})], blocks, now: at(11, 0, 15) })[0].when, "ontem");
  assert.equal(pendingExamChecks({ assessments: [A({})], blocks, now: at(11, 0, 22) }).length, 0);
  assert.equal(pendingExamChecks({ assessments: [A({ date: "2026-10-20" })], blocks, now: at(11) }).length, 0);
});

test("foi mal: recomenda revisão antes da próxima prova, sem passar da véspera", () => {
  const p2 = A({ id: "p2", name: "P2", date: "2026-11-11" });
  const a = examAdvice({ exam: A({}), felt: 1, assessments: [A({}), p2], subjects: [SUB], steps: [1, 3, 7], today: "2026-10-14" });
  assert.equal(a.strong, true);
  assert.equal(a.next?.id, "p2");
  assert.equal(a.due, "2026-10-15");
  assert.match(a.text, /revisar antes de partir para a próxima prova/);
  assert.match(a.text, /A próxima é P2 em 28 dias \(11\/11\)/);
  assert.match(a.title, /Revisar P1 de Estática/);
  // próxima prova amanhã: revisão hoje
  const perto = examAdvice({ exam: A({}), felt: 2, assessments: [A({}), A({ id: "p2", date: "2026-10-15" })], subjects: [SUB], steps: [1], today: "2026-10-14" });
  assert.equal(perto.due, "2026-10-14");
});

test("mais ou menos oferece sem insistir; bem não oferece revisão", () => {
  const meio = examAdvice({ exam: A({}), felt: 3, assessments: [A({})], subjects: [SUB], steps: [1], today: "2026-10-14" });
  assert.equal(meio.strong, false);
  assert.equal(meio.offer, true);
  assert.equal(meio.next, null);
  const bem = examAdvice({ exam: A({}), felt: 5, assessments: [A({})], subjects: [SUB], steps: [1], today: "2026-10-14" });
  assert.equal(bem.offer, false);
});
