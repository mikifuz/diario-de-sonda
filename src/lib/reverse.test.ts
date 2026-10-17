import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_BLOCKS_NOTE, reversePlan, todayTasks, type RevInput } from "./reverse";
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
  notes: "", ...p });
const every = [0, 1, 2, 3, 4, 5, 6].map((d) => B(d)); // 2 h por dia → 96 min úteis (20% de reserva)
const inp = (p: Partial<RevInput>): RevInput => ({ today: TODAY, nowMin: 8 * 60, blocks: every, events: [], subjects: [SUB()], topics: [T({})], sessions: [], assessments: [A({})], ...p });

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

test("o que já foi estudado desconta da meta; matéria difícil pede mais", () => {
  const sessions = [1, 2, 3].map(() => S({}));
  const [pl] = reversePlan(inp({ sessions }));
  assert.equal(pl.topics[0].target, 120);
  assert.equal(pl.topics[0].done, 90);
  assert.equal(pl.topics[0].need, 30);
  assert.equal(pl.chunks.filter((x) => !x.final).length, 1);
  assert.equal(reversePlan(inp({ subjects: [SUB({ traits: { esforco: "dificil" } })] }))[0].topics[0].target, 180); // 2 h × 1,5
  assert.equal(reversePlan(inp({ subjects: [SUB({ traits: { esforco: "muito" } })] }))[0].topics[0].target, 240); // 2 h × 2
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
  const day = planDay({ today: TODAY, nowMin: 8 * 60, pref: "depois", blocks: every, events: [], subjects, topics, sessions: [], assessments, extra: tasks });
  assert.ok(day.slots[0].placed.some((x) => x.task.kind === "preparar"));
  assert.match(day.slots[0].placed[0].task.why, /A3 de Física II/);
});

test("sem conteúdos ligados, explica o que fazer", () => {
  const [pl] = reversePlan(inp({ topics: [] }));
  assert.match(pl.notes[0], /Nenhum conteúdo ligado/);
});

test("quando não cabe tudo: o menos estudado vem primeiro e o app mostra horários livres para estudar a mais", () => {
  const topics = [T({ id: "b", name: "Teorema de Green" }), T({ id: "a", name: "Integrais duplas" }), T({ id: "c", name: "Rotacional", taught_on: "2026-10-05" })];
  const sessions = [S({ topic_id: "b" }), S({ topic_id: "b" })];
  const pouco = [B(1, "14:00", "15:00")]; // só 1 h na segunda
  const [pl] = reversePlan(inp({ topics, sessions, blocks: pouco }));
  assert.ok(pl.missing > 0);
  // nada estudado na frente (pela ordem das aulas), depois o que estudou menos
  assert.deepEqual(pl.priority.map((x) => x.topic.name), ["Integrais duplas", "Rotacional", "Teorema de Green"]);
  assert.match(pl.priority[0].why, /nada estudado ainda/);
  assert.match(pl.priority[2].why, /estudou 60 de 120 min da meta/);
  // o tempo que existe vai primeiro para o menos estudado
  assert.equal(pl.chunks.find((c) => !c.final)?.topicId, "a");
  // horários livres de verdade (8h–22h, fora da rotina), em dias diferentes, de até 2 h
  assert.equal(pl.suggest.length, 2);
  assert.ok(pl.suggest.every((w) => w.end - w.start <= 120 && w.day <= "2026-10-16"));
  assert.notEqual(pl.suggest[0].day, pl.suggest[1].day);
  // estudo extra marcado no calendário diminui o que falta
  const ev = { id: "x", subject_id: "s", title: "Estudo extra", type: "estudo" as const, date: "2026-10-13", time: "09:00", end_time: "11:00", priority: "alta" as const, status: "pendente" as const, description: "" };
  assert.ok(reversePlan(inp({ topics, sessions, blocks: pouco, events: [ev] }))[0].missing < pl.missing);
  // com tempo de sobra, não há recomendação
  assert.equal(reversePlan(inp({ topics: topics.slice(0, 1) }))[0].priority.length, 0);
  assert.equal(reversePlan(inp({ topics: topics.slice(0, 1) }))[0].suggest.length, 0);
});

// Caso real (amiga do dono): prova de matéria difícil na semana que vem e o plano do dia só
// mandava consolidar/adiantar aulas das outras matérias.
test("prova sem conteúdos cadastrados ganha tempo para a matéria toda, maior se a matéria é difícil", () => {
  const [pl] = reversePlan(inp({ topics: [], subjects: [SUB({ traits: { esforco: "dificil" } })], assessments: [A({ date: "2026-10-20" })] }));
  const whole = pl.chunks.filter((c) => c.whole);
  assert.ok(whole.length > 0);
  assert.equal(whole[0].day, TODAY);
  assert.equal(whole.reduce((a, c) => a + c.minutes, 0), 360); // 4 h × 1,5 (difícil)
  assert.equal(pl.missing, 0);
  assert.match(pl.notes.join(" "), /Nenhum conteúdo ligado a esta prova: o app reserva 6 h para a matéria toda/);
  assert.equal(todayTasks([pl], TODAY)[0].title, "Estudar Cálculo III para a P2");
});

test("prova cadastrada só no calendário também entra no plano (sem duplicar a que está em Notas)", () => {
  const ev = { id: "e1", subject_id: "s", title: "P1", type: "prova" as const, date: "2026-10-17", time: null, priority: "alta" as const, status: "pendente" as const, description: "" };
  const only = reversePlan(inp({ assessments: [], topics: [T({ assessment_id: null })], events: [ev] }));
  assert.equal(only.length, 1);
  assert.equal(only[0].exam.id, "e1");
  assert.equal(only[0].topics.length, 1);
  assert.equal(reversePlan(inp({ events: [{ ...ev, id: "e2" }] })).length, 1);
});

test("preparar a prova vem antes de consolidar/adiantar aulas de outras matérias", () => {
  const subjects = [SUB({ id: "q", name: "Físico-Química", traits: { esforco: "dificil" } }), SUB({ id: "f", name: "Física" }), SUB({ id: "e", name: "Estática" })];
  const blocks: RoutineBlock[] = [1, 2].flatMap((d) => [
    { id: `a${d}`, weekday: d, start_time: "08:20", end_time: "10:00", kind: "aula" as const, subject_id: "f", label: "" },
    { id: `b${d}`, weekday: d, start_time: "10:20", end_time: "12:00", kind: "aula" as const, subject_id: "e", label: "" },
    B(d, "19:00", "21:00")]);
  const input = inp({ subjects, blocks, nowMin: 7 * 60, assessments: [A({ id: "q1", subject_id: "q", name: "P1", date: "2026-10-20" })],
    topics: [T({ subject_id: "q", name: "Gases", assessment_id: "q1" }), T({ id: "u", subject_id: "q", name: "Termoquímica", assessment_id: "q1" })] });
  const plan = planDay({ ...input, pref: "ambos", extra: todayTasks(reversePlan(input), TODAY) });
  const placed = plan.slots.flatMap((s) => s.placed.map((x) => x.task));
  assert.deepEqual(placed.slice(0, 2).map((t) => t.kind), ["preparar", "preparar"]);
  assert.ok(placed.every((t) => t.kind !== "preparar" || t.subject_id === "q"));
  assert.ok(plan.overflow.every((t) => t.kind !== "preparar"));
});

// Caso real (mesma amiga, depois da correção anterior): sem horários de estudo na rotina, o plano não
// sugeria nada para a prova; só um aviso de quanto faltava.
test("sem nenhum bloco de estudo na rotina, o plano supõe 2 h por dia e avisa", () => {
  const aula: RoutineBlock = { id: "a", weekday: 1, start_time: "08:20", end_time: "10:00", kind: "aula", subject_id: "s", label: "" };
  const trip = { id: "v", subject_id: null, title: "Viagem", type: "viagem" as const, date: "2026-10-13", end_date: "2026-10-13", time: null, priority: "media" as const, status: "pendente" as const, description: "" };
  const [pl] = reversePlan(inp({ blocks: [aula], nowMin: 18 * 60, events: [trip], topics: [T({}), T({ id: "u", name: "Green" })] }));
  assert.equal(pl.notes[0], NO_BLOCKS_NOTE);
  assert.equal(pl.chunks.filter((c) => c.day === TODAY && !c.final).length, 2);
  assert.equal(pl.chunks.filter((c) => c.day === "2026-10-13").length, 0); // viagem
  assert.equal(pl.missing, 0);
  const plan = planDay({ ...inp({ blocks: [aula], nowMin: 18 * 60 }), pref: "depois", extra: todayTasks([pl], TODAY) });
  assert.equal(plan.hasStudyBlocks, false);
  assert.equal(plan.overflow[0].kind, "preparar");
});
