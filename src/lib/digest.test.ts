import { test } from "node:test";
import assert from "node:assert/strict";
import { brDay, morningDigest, type DigestInput } from "./digest";
import type { Assessment, ReviewItem } from "./types";

const A = (p: Partial<Assessment>): Assessment => ({ id: "p", subject_id: "s", name: "P2", kind: "prova", date: "2026-10-13", time: null, weight: 1, grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null, ...p });
const R = (p: Partial<ReviewItem>): ReviewItem => ({ id: Math.random().toString(), subject_id: "s", topic_id: null, mistake_id: null, assessment_id: null, title: "Integrais", step: 0, due: "2026-10-12", est_min: 20, active: true, last_reviewed_at: null, ...p });
const base: DigestInput = { today: "2026-10-12", subjects: [{ id: "s", name: "Cálculo III", archived: false }], assessments: [], items: [], todos: [], lastStudy: "2026-10-11" };

test("prova perto vira o título; revisões e tarefas vão no texto", () => {
  const d = morningDigest({ ...base, assessments: [A({}), A({ id: "x", name: "P3", date: "2026-10-20" })], items: [R({}), R({ due: "2026-10-10" }), R({ due: "2026-10-13" })], todos: [{ done: false, due: "2026-10-12" }, { done: true, due: "2026-10-12" }, { done: false, due: null }] })!;
  assert.equal(d.title, "P2 de Cálculo III amanhã");
  assert.equal(d.body, "2 revisões para hoje (1 atrasada) · 1 tarefa com prazo até hoje");
  assert.equal(d.url, "/hoje?aba=provas");
});

test("prova em 3 dias mostra a data; mais longe, de outra disciplina arquivada ou já com nota fica de fora", () => {
  const d = morningDigest({ ...base, assessments: [A({ date: "2026-10-15" }), A({ id: "b", date: "2026-10-16" }), A({ id: "c", date: "2026-10-12", grade: 7 }), A({ id: "d", subject_id: "z", date: "2026-10-12" })] })!;
  assert.equal(d.title, "P2 de Cálculo III em 3 dias (15/10)");
  assert.equal(d.body, "Toque para ver o plano do dia.");
});

test("revisão de prova que já passou não conta", () => {
  const d = morningDigest({ ...base, assessments: [A({ id: "old", date: "2026-10-10" })], items: [R({ assessment_id: "old", due: "2026-10-09" }), R({ active: false })] });
  assert.equal(d, null);
});

test("lembra dias sem estudar só a partir de 3 dias", () => {
  assert.equal(morningDigest({ ...base, lastStudy: "2026-10-10" }), null);
  assert.equal(morningDigest({ ...base, lastStudy: "2026-10-08" })!.title, "Sem estudar há 4 dias");
  assert.equal(morningDigest({ ...base, lastStudy: null }), null); // quem nunca estudou não recebe bronca
});

test("dia no horário de Brasília, mesmo com o servidor em UTC", () => {
  assert.equal(brDay("2026-10-12T02:00:00Z"), "2026-10-11"); // 23h de domingo em Brasília
  assert.equal(brDay("2026-10-12T10:00:00Z"), "2026-10-12");
});
