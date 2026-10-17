import { test } from "node:test";
import assert from "node:assert/strict";
import { dayOffCheck, inSemester, weekOf } from "./dayoff";
import { planDay } from "./plan";
import { reversePlan } from "./reverse";
import type { Assessment, CalEvent, RoutineBlock, Subject, Topic } from "./types";

const EV = (p: Partial<CalEvent>): CalEvent => ({ id: Math.random().toString(), subject_id: null, title: "Day off", type: "folga", date: "2026-10-14", time: null, priority: "media", status: "pendente", description: "", ...p });
const SUB: Subject = { id: "s", name: "Cálculo III", code: "", professor: "", semester: "", credits: null, hours: null, color: "#4f86f7", min_avg: 7, schedule: "", notes: "",
  traits: {}, exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false, study_pref: null, recovery: "sub", sub_replace_lower: false };
const A = (p: Partial<Assessment>): Assessment => ({ id: "p2", subject_id: "s", name: "P2", kind: "prova", date: "2026-10-20", time: null, weight: 1, grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null, ...p });
const base = { events: [] as CalEvent[], assessments: [] as Assessment[], subjects: [SUB] };

test("semestre letivo e semana de segunda a domingo", () => {
  assert.ok(inSemester("2026-10-14"));
  assert.ok(!inSemester("2026-01-10"));
  assert.ok(!inSemester("2026-07-20"));
  assert.ok(!inSemester("2026-12-24"));
  assert.deepEqual(weekOf("2026-10-14"), ["2026-10-12", "2026-10-18"]); // quarta → seg 12, dom 18
  assert.deepEqual(weekOf("2026-10-18"), ["2026-10-12", "2026-10-18"]); // domingo fica na mesma semana
});

test("um day off por semana no semestre; nas férias, livre", () => {
  assert.equal(dayOffCheck({ ...base, today: "2026-10-14" }).ok, true);
  const used = dayOffCheck({ ...base, today: "2026-10-16", events: [EV({ date: "2026-10-13" })] });
  assert.equal(used.ok, false);
  assert.match(used.why, /já tirou day off nesta semana \(13\/10\)/);
  // semana seguinte libera
  assert.equal(dayOffCheck({ ...base, today: "2026-10-19", events: [EV({ date: "2026-10-13" })] }).ok, true);
  // folga cancelada não conta
  assert.equal(dayOffCheck({ ...base, today: "2026-10-16", events: [EV({ date: "2026-10-13", status: "cancelado" })] }).ok, true);
  // férias: sem limite
  assert.equal(dayOffCheck({ ...base, today: "2026-01-15", events: [EV({ date: "2026-01-13" })] }).ok, true);
  // hoje já é folga
  assert.ok(dayOffCheck({ ...base, today: "2026-10-14", events: [EV({})] }).already);
});

test("dia de prova: avisa qual é a prova (o app só pergunta, não proíbe)", () => {
  const c = dayOffCheck({ ...base, today: "2026-10-20", assessments: [A({})] });
  assert.equal(c.ok, true);
  assert.deepEqual(c.exams, ["P2 de Cálculo III"]);
});

test("no day off o plano do dia fica vazio e o estudo das provas vai para os outros dias", () => {
  const blocks: RoutineBlock[] = [0, 1, 2, 3, 4, 5, 6].map((wd) => ({ id: `b${wd}`, weekday: wd, start_time: "14:00", end_time: "16:00", kind: "estudo", subject_id: null, label: "" }));
  const topics: Topic[] = [{ id: "t", subject_id: "s", parent_id: null, name: "Integrais triplas", position: 0, taught_on: "2026-10-01", assessment_id: "p2" }];
  const inp = { today: "2026-10-14", nowMin: 8 * 60, blocks, events: [EV({})], subjects: [SUB], topics, sessions: [], assessments: [A({})] };
  const day = planDay({ ...inp, pref: "ambos" });
  assert.equal(day.off, true);
  assert.equal(day.slots.length, 0);
  assert.equal(day.need, 0);
  const [pl] = reversePlan(inp);
  assert.ok(pl.chunks.length > 0);
  assert.ok(pl.chunks.every((c) => c.day !== "2026-10-14"));
});
