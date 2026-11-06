import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptSub, coveredBy, redoCopies, subAsks, subSince, trackedSubs } from "./subPrep";
import { reversePlan, type RevInput } from "./reverse";
import type { Assessment, ExerciseList, RoutineBlock, Session, Subject, Topic } from "./types";

const TODAY = "2026-11-06";
const S = (p: Partial<Subject> = {}): Subject => ({
  id: "s", name: "Cálculo III", code: "", professor: "", semester: "", credits: null, hours: null, color: "#4f86f7", min_avg: 7, schedule: "", notes: "",
  traits: {}, exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false, study_pref: null, recovery: "sub", sub_replace_lower: false, ...p,
});
const A = (p: Partial<Assessment>): Assessment => ({ id: "p1", subject_id: "s", name: "P1", kind: "prova", date: "2026-11-03", time: null, weight: 1, grade: 4.5, predicted: null,
  sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "concluido", description: "", sub_id: null, sub_prep: null, ...p });
const SUBA = (p: Partial<Assessment> = {}) => A({ id: "sub", name: "SUB", kind: "sub", date: "2026-11-27", grade: null, status: "pendente", ...p });

test("nota abaixo da média pergunta; nota boa, palpite no futuro, prova antiga ou já respondida não", () => {
  const ask = (as: Assessment[], subjects = [S()]) => subAsks({ assessments: as, subjects, today: TODAY }).map((x) => x.exam.id);
  assert.deepEqual(ask([A({})]), ["p1"]);
  assert.match(subAsks({ assessments: [A({})], subjects: [S()], today: TODAY })[0].why, /Nota 4,5 na P1; a média mínima de Cálculo III é 7/);
  assert.deepEqual(ask([A({ grade: 7 })]), []);
  assert.deepEqual(ask([A({ date: "2026-11-20" })]), []); // nota antes da prova = palpite
  assert.deepEqual(ask([A({ date: "2026-08-01" })]), []);
  assert.deepEqual(ask([A({ sub_prep: 0 })]), []);
  assert.deepEqual(subAsks({ assessments: [A({ sub_prep: 0 })], subjects: [S()], today: TODAY, all: true }).map((x) => x.exam.id), ["p1"]);
  assert.deepEqual(ask([A({ kind: "trabalho" })]), []);
  assert.deepEqual(ask([A({})], [S({ recovery: "exame" })]), []);
  assert.deepEqual(ask([A({})], [S({ traits: { esforco: "trivial" } })]), []);
  // SUB que já passou ou já tem nota: não dá mais para se preparar
  assert.deepEqual(ask([A({ sub_id: "sub" }), SUBA({ date: "2026-11-01" })]), []);
  assert.deepEqual(ask([A({ sub_id: "sub" }), SUBA({ grade: 8 })]), []);
  // SUB já acompanhada por outra prova: não pergunta de novo
  assert.deepEqual(ask([A({ sub_id: "sub", sub_prep: 1, id: "p0" }), A({ sub_id: "sub" }), SUBA()]), []);
});

test("aceitar sem SUB cria uma (ligada às provas sem SUB) e passa a disciplina para SUB", () => {
  const p2 = A({ id: "p2", name: "P2", date: "2026-12-01", grade: null });
  const pl = acceptSub({ exam: A({}), subject: S({ recovery: "nenhuma" }), assessments: [A({}), p2], date: "2026-12-10", today: TODAY, id: "n" });
  assert.equal(pl.subject?.recovery, "sub");
  assert.equal(pl.newSub?.kind, "sub");
  assert.equal(pl.newSub?.date, "2026-12-10");
  assert.deepEqual(pl.rows.map((r) => [r.id, r.sub_id, r.sub_prep ?? null]), [["p1", "n", 1], ["p2", "n", null]]);
  assert.deepEqual([...trackedSubs([...pl.rows, pl.newSub!])], ["n"]);
});

test("aceitar com SUB existente só liga e acerta a data", () => {
  const pl = acceptSub({ exam: A({ sub_id: "sub" }), subject: S(), assessments: [A({ sub_id: "sub" }), SUBA({ date: null })], date: "2026-11-27", today: TODAY, id: "n" });
  assert.equal(pl.subject, null);
  assert.equal(pl.newSub, null);
  assert.deepEqual(pl.rows.map((r) => [r.id, r.date]), [["p1", "2026-11-03"], ["sub", "2026-11-27"]]);
  // prova sem "Tem SUB?" marcado, mas a disciplina tem uma SUB só: usa ela
  const pl2 = acceptSub({ exam: A({}), subject: S(), assessments: [A({}), SUBA()], date: "2026-11-27", today: TODAY, id: "n" });
  assert.equal(pl2.sub.id, "sub");
  assert.equal(pl2.rows[0].sub_id, "sub");
  assert.equal(pl2.rows.length, 1);
});

test("estudo para a SUB conta a partir do dia seguinte à prova; listas copiadas zeradas", () => {
  const as = [A({ sub_id: "sub" }), A({ id: "p2", date: "2026-10-01", grade: 9, sub_id: "sub" }), SUBA()];
  assert.equal(subSince(SUBA(), as, TODAY), "2026-11-03");
  assert.deepEqual(coveredBy(SUBA(), as).map((a) => a.id), ["p2", "p1"]);
  const l: ExerciseList = { id: "l", subject_id: "s", assessment_id: "p1", event_id: null, name: "Lista 2", kind: "lista", items: ["1a", "1b"], done: { "1a": "2026-10-30" }, position: 0 };
  let n = 0;
  const [c] = redoCopies([l], SUBA(), 3, "2026-11-06T10:00:00Z", () => `x${n++}`);
  assert.deepEqual([c.id, c.assessment_id, c.name, c.items, c.done, c.position], ["x0", "sub", "Refazer: Lista 2", ["1a", "1b"], {}, 3]);
});

test("planejamento reverso: SUB só entra com acompanhamento, com os conteúdos da prova e sem contar o estudo de antes", () => {
  const B = (wd: number): RoutineBlock => ({ id: `b${wd}`, weekday: wd, start_time: "14:00", end_time: "16:00", kind: "estudo", subject_id: null, label: "" });
  const topics: Topic[] = [{ id: "t", subject_id: "s", parent_id: null, name: "Integrais triplas", position: 0, taught_on: "2026-10-20", assessment_id: "p1" },
    { id: "t2", subject_id: "s", parent_id: null, name: "Teorema de Stokes", position: 1, taught_on: "2026-11-10", assessment_id: "p2" }];
  const sessions: Session[] = [
    { id: "a", subject_id: "s", topic_id: "t", activity: "exercicios", started_at: new Date(2026, 10, 1, 10).toISOString(), duration_min: 90, notes: "" }, // antes da P1: não conta
    { id: "b", subject_id: "s", topic_id: "t", activity: "exercicios", started_at: new Date(2026, 10, 5, 10).toISOString(), duration_min: 30, notes: "" },
  ];
  const inp = (as: Assessment[]): RevInput => ({ today: TODAY, nowMin: 8 * 60, blocks: [0, 1, 2, 3, 4, 5, 6].map(B), events: [], subjects: [S()], topics, sessions, assessments: as });
  assert.equal(reversePlan(inp([A({ sub_id: "sub" }), SUBA()])).length, 0);
  const p2 = A({ id: "p2", name: "P2", date: "2026-11-25", grade: null, status: "pendente", sub_id: "sub" }); // P2 ainda vai acontecer: o conteúdo dela fica no plano da P2
  const pls = reversePlan(inp([A({ sub_id: "sub", sub_prep: 1 }), p2, SUBA({ date: "2026-12-20" })])); // 44 dias: entra (até 60)
  assert.deepEqual(pls.map((x) => x.exam.id), ["p2", "sub"]);
  const pl = pls[1];
  assert.equal(pl.sub, true);
  assert.deepEqual(pl.topics.map((t) => [t.topic.id, t.done, t.need]), [["t", 30, 90]]);
  assert.ok(pl.chunks.some((c) => c.final));
  assert.ok(pl.notes.some((n) => /Acompanhamento para a SUB: entram os conteúdos da P1, e só conta o estudo depois de 03\/11/.test(n)));
  assert.equal(reversePlan(inp([A({ sub_id: "sub", sub_prep: 1 }), SUBA({ date: "2027-01-20" })])).length, 0); // mais de 60 dias
});
