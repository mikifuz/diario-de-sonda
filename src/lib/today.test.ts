import { test } from "node:test";
import assert from "node:assert/strict";
import { MOTTOS, dayCards, firstName, greeting, motto } from "./today";
import type { DayPlan, Task } from "./plan";
import type { CalEvent, RoutineBlock, Subject, Todo } from "./types";

test("saudação pelo horário e primeiro nome", () => {
  assert.equal(greeting(7), "Bom dia");
  assert.equal(greeting(13), "Boa tarde");
  assert.equal(greeting(22), "Boa noite");
  assert.equal(greeting(3), "Boa noite");
  assert.equal(firstName("  Maria Clara Souza "), "Maria");
  assert.equal(firstName(""), "");
});

test("frase do dia: fixa no dia, muda no seguinte", () => {
  assert.equal(motto("2026-10-16"), motto("2026-10-16"));
  assert.notEqual(motto("2026-10-16"), motto("2026-10-17"));
  assert.ok(MOTTOS.includes(motto("1999-01-01")));
});

const S = (id: string, name: string): Subject => ({ id, name } as Subject);
const B = (x: Partial<RoutineBlock>): RoutineBlock => ({ id: "b", weekday: 5, start_time: "08:20", end_time: "10:00", kind: "aula", subject_id: null, label: "", ...x });
const task: Task = { key: "k1", kind: "revisao", title: "Integrais", subject_id: "c", topic_id: null, minutes: 30, why: "vencida", rank: [] };

test("quadrados de hoje: aula, compromisso, estudo encaixado, o que não coube e tarefa, na ordem", () => {
  const day = "2026-10-16"; // sexta
  const blocks = [B({ id: "a", subject_id: "c" }), B({ id: "w", kind: "trabalho", start_time: "18:00", end_time: "20:00" }), B({ id: "z", weekday: 1 })];
  const study = B({ id: "e", kind: "estudo", start_time: "14:00", end_time: "16:00" });
  const plan: DayPlan = { slots: [{ block: study, start: 840, end: 960, placed: [{ task, start: 840, end: 870 }] }], overflow: [{ ...task, key: "k2", title: "Green" }], capacity: 120, need: 60, notes: [], hasStudyBlocks: true };
  const ev = { id: "x", src: "event" as const, title: "Dentista", type: "pessoal" as const, subject_id: null, date: day, time: "11:00", priority: "media" as const, status: "pendente" as const, description: "" };
  const todos: Todo[] = [{ id: "t", title: "Lista 4", subject_id: "c", due: day, done: false, done_at: null }, { id: "u", title: "Depois", subject_id: null, due: "2026-10-20", done: false, done_at: null }];
  const cards = dayCards({ day, nowMin: 12 * 60, blocks: [...blocks, study], events: [], agenda: [ev], subjects: [S("c", "Cálculo III")], plan, todos });
  assert.deepEqual(cards.map((c) => c.kind), ["aula", "calendario", "estudo", "rotina", "tarefa", "nao_coube"]);
  assert.equal(cards[0].title, "Cálculo III");
  assert.equal(cards[0].past, true);
  assert.equal(cards[2].tag, "Revisão");
  assert.equal(cards[2].past, false);
  assert.equal(cards[4].tag, "Tarefa · prazo hoje");
});

test("quadrados de hoje: aula cancelada aparece como sem aula", () => {
  const day = "2026-10-12"; // feriado, segunda
  const off: CalEvent[] = [];
  const plan: DayPlan = { slots: [], overflow: [], capacity: 0, need: 0, notes: [], hasStudyBlocks: false };
  const cards = dayCards({ day, nowMin: 0, blocks: [B({ weekday: 1, subject_id: "c" })], events: off, agenda: [], subjects: [S("c", "Cálculo III")], plan, todos: [] });
  assert.equal(cards[0].kind, "sem_aula");
});
