import { holidayOf, easter } from "./holidays";
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotRanges, anchorFor, freeStudy, freeWindows, noClass, studyHint, planDay, planWeek, whereNext, type PlanInput, type Task } from "./plan";
import type { Assessment, CalEvent, RoutineBlock, Session, Subject, Topic } from "./types";

const TODAY = "2026-10-19"; // segunda-feira
const A = (p: Partial<Assessment>): Assessment => ({
  id: "p", subject_id: "s", name: "P2", kind: "prova", date: null, time: null, weight: 1,
  grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null, ...p,
});
const SUB = (p: Partial<Subject> = {}): Subject => ({
  id: "s", name: "Cálculo III", code: "", professor: "", semester: "", credits: null, hours: null, color: "#4f86f7", min_avg: 7, schedule: "", notes: "",
  traits: {}, exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false,
  study_pref: null, recovery: "sub", sub_replace_lower: false, ...p,
});
const T = (p: Partial<Topic>): Topic => ({ id: "t", subject_id: "s", parent_id: null, name: "Integrais triplas", position: 0, taught_on: null, assessment_id: null, ...p });
const B = (p: Partial<RoutineBlock>): RoutineBlock => ({ id: Math.random().toString(), weekday: 1, start_time: "14:00", end_time: "16:00", kind: "estudo", subject_id: null, label: "", ...p });
/** tarefa de estudo de prova (como as do planejamento reverso) */
const P = (p: Partial<Task>): Task => ({ key: "p" + Math.random(), kind: "preparar", title: "Estudar", subject_id: "s", topic_id: null, minutes: 30, why: "", rank: [0.5, 5, 0, 0, 0, 0], ...p });
const E = (p: Partial<CalEvent>): CalEvent => ({ id: "e", subject_id: null, title: "Médico", type: "pessoal", date: TODAY, time: null, priority: "media", status: "pendente", description: "", ...p });
const S = (p: Partial<Session>): Session => ({
  id: "x", subject_id: "s", topic_id: null, activity: "exercicios", started_at: new Date(2026, 9, 19, 9).toISOString(), duration_min: 30,
  notes: "", ...p,
});
const input = (p: Partial<PlanInput>): PlanInput => ({ today: TODAY, nowMin: 7 * 60, pref: "depois", blocks: [], events: [], subjects: [SUB()], topics: [], sessions: [], assessments: [], ...p });

test("prova de um conteúdo: a marcada ou a próxima da disciplina", () => {
  const as = [A({ id: "p1", name: "P1", date: "2026-10-08", grade: 6 }), A({ id: "p2", name: "P2", date: "2026-11-17" }), A({ id: "p3", name: "P3", date: "2026-12-08" })];
  assert.equal(anchorFor("s", T({ assessment_id: "p3" }), as, TODAY)?.a.id, "p3");
  assert.equal(anchorFor("s", T({}), as, TODAY)?.a.id, "p2");
  assert.equal(anchorFor("outra", null, as, TODAY), null);
});

test("compromissos do calendário tiram blocos de estudo", () => {
  const blocks = [B({ start_time: "09:00", end_time: "10:00" }), B({ start_time: "14:00", end_time: "16:00" }), B({ weekday: 2 })];
  assert.equal(freeStudy(blocks, [], TODAY).blocks.length, 2);
  assert.equal(freeStudy(blocks, [E({ time: "14:30" })], TODAY).blocks.length, 1);
  assert.equal(freeStudy(blocks, [E({ type: "indisponivel" })], TODAY).blocks.length, 0);
  assert.equal(freeStudy(blocks, [E({ type: "indisponivel", status: "cancelado" })], TODAY).blocks.length, 2);
});

test("plano do dia: prioridade, encaixe nos blocos e o que não coube", () => {
  const extra = [P({ key: "longe", title: "Longe", rank: [0.5, 30, 0, 0, 0, 0] }), P({ key: "perto", title: "Perto", rank: [0, 2, 0, 0, 0, 0] })];
  const p = planDay(input({ blocks: [B({ start_time: "14:00", end_time: "15:00" })], extra }));
  assert.equal(p.capacity, 60);
  assert.deepEqual(p.slots[0].placed.map((x) => x.task.title), ["Perto", "Longe"]);
  assert.equal(p.slots[0].placed[1].start, 14 * 60 + 30);
  assert.equal(p.overflow.length, 0);
  const cheio = planDay(input({ blocks: [B({ start_time: "14:00", end_time: "14:40" })], extra }));
  assert.deepEqual(cheio.overflow.map((x) => x.title), ["Longe"]);
});

test("plano do dia: só o que sobra do dia conta", () => {
  const p = planDay(input({ nowMin: 15 * 60 + 30, blocks: [B({})], extra: [P({ minutes: 45 })] }));
  assert.equal(p.capacity, 30);
  assert.equal(p.overflow.length, 1);
});

test("aulas: consolidar depois da aula ou adiantar a de amanhã, conforme a preferência", () => {
  const blocks = [B({ kind: "aula", subject_id: "s", start_time: "08:20", end_time: "10:00" }), B({ start_time: "09:00", end_time: "12:00" })];
  const depois = planDay(input({ blocks }));
  const c = depois.slots[0].placed[0];
  assert.equal(c.task.kind, "consolidar");
  assert.equal(c.start, 10 * 60); // só depois do fim da aula
  // já estudou a disciplina depois da aula: não sugere de novo
  assert.equal(dayTasksCount(input({ blocks, sessions: [S({ started_at: new Date(2026, 9, 19, 10, 30).toISOString() })] })), 0);
  const amanha = [B({ kind: "aula", subject_id: "s", weekday: 2, start_time: "08:20", end_time: "10:00" }), B({})];
  const topics = [T({ id: "t2", name: "Teorema de Green", taught_on: "2026-10-20" })];
  const antes = planDay(input({ pref: "antes", blocks: amanha, topics }));
  assert.equal(antes.slots[0].placed[0].task.title, "Adiantar Cálculo III: Teorema de Green");
  assert.equal(planDay(input({ pref: "depois", blocks: amanha })).slots[0].placed.length, 0);
  // preferência da disciplina vence a do perfil
  assert.equal(planDay(input({ pref: "depois", subjects: [SUB({ study_pref: "ambos" })], blocks: amanha })).slots[0].placed.length, 1);
});
function dayTasksCount(p: PlanInput) { const d = planDay(p); return d.slots.reduce((a, s) => a + s.placed.length, 0) + d.overflow.length; }

test("horários de aula seguidos viram um bloco só", () => {
  const S4 = [{ start: "08:20", end: "10:10" }, { start: "10:20", end: "12:00" }, { start: "13:30", end: "15:10" }, { start: "15:20", end: "17:00" }];
  assert.deepEqual(slotRanges([1, 0], S4), [{ start: "08:20", end: "12:00" }]);
  assert.deepEqual(slotRanges([0, 2, 3], S4), [{ start: "08:20", end: "10:10" }, { start: "13:30", end: "17:00" }]);
  assert.deepEqual(slotRanges([], S4), []);
});

test("cronograma: aula mais recente e aula remarcada empurra as seguintes", async () => {
  const { lastTaught, pushLessons } = await import("./plan");
  const ts = [T({ id: "a", taught_on: "2026-10-19" }), T({ id: "b", taught_on: "2026-10-22" }), T({ id: "c", taught_on: "2026-10-26" }), T({ id: "z", subject_id: "outra", taught_on: "2026-10-27" })];
  assert.equal(lastTaught(ts, "s", "2026-10-23")?.id, "b");
  assert.equal(lastTaught(ts, "s", "2026-10-08"), null);
  // aula de segunda (12/10) cancelada → vai para quinta (15/10); as seguintes andam uma aula (seg/qui)
  const r = pushLessons(ts, "a", "2026-10-22", [1, 4]);
  assert.deepEqual(r.map((x) => `${x.id}:${x.taught_on}`), ["a:2026-10-22", "b:2026-10-26", "c:2026-10-29"]);
  // sem rotina, usa os dias da semana dos próprios conteúdos (seg e qui)
  assert.deepEqual(pushLessons(ts, "a", "2026-10-22", []).map((x) => x.taught_on), ["2026-10-22", "2026-10-26", "2026-10-29"]);
  // antecipar não mexe nas outras
  assert.equal(pushLessons(ts, "b", "2026-10-20", [1, 4]).length, 1);
});

test("matéria difícil para o aluno: mais tempo no plano, com o motivo", () => {
  const blocks = [B({ kind: "aula", subject_id: "s", start_time: "08:20", end_time: "10:00" }), B({ start_time: "09:00", end_time: "12:00" })];
  const normal = planDay(input({ blocks })).slots[0].placed[0];
  assert.equal(normal.task.minutes, 30);
  const dificil = planDay(input({ blocks, subjects: [SUB({ traits: { esforco: "dificil" } })] })).slots[0].placed[0];
  assert.equal(dificil.task.minutes, 45); // 30 × 1,5
  assert.match(dificil.task.why, /difícil para você: o plano reserva 50% a mais/);
});

test("dia de prova não tem aula de conteúdo: nada de adiantar matéria nova nem consolidar a 'aula' da prova", () => {
  // prova na quarta (14/10); o cronograma marca "Centróides" no mesmo dia
  const topics = [T({ id: "c", name: "Centróides e baricentros", taught_on: "2026-10-21" })];
  const prova = A({ id: "p2", subject_id: "s", name: "P2", kind: "prova", date: "2026-10-21" });
  const terca = [B({ kind: "aula", subject_id: "s", weekday: 2, start_time: "08:20", end_time: "10:00" }), B({})];
  // segunda (12/10), aula amanhã (13/10): a próxima aula de conteúdo seria no dia da prova → não adianta
  assert.equal(planDay(input({ pref: "antes", blocks: terca, topics, assessments: [prova] })).slots[0].placed.length, 0);
  // sem a prova, adiantaria normalmente
  assert.equal(planDay(input({ pref: "antes", blocks: terca, topics })).slots[0].placed.length, 1);
  // no dia da prova, a "aula" foi a prova: não sugere consolidar
  const hoje = [B({ kind: "aula", subject_id: "s", start_time: "08:20", end_time: "10:00" }), B({ start_time: "09:00", end_time: "12:00" })];
  assert.equal(dayTasksCount(input({ blocks: hoje, assessments: [A({ id: "p", subject_id: "s", kind: "prova", date: "2026-10-19" })] })), 0);
});

test("feriado nacional: sem aula, e os horários de aula viram tempo de estudo", () => {
  assert.equal(holidayOf("2026-10-12"), "Nossa Senhora Aparecida");
  assert.equal(holidayOf("2026-04-03"), "Sexta-feira Santa"); // Páscoa 2026: 5/4
  assert.equal(easter(2027), "2027-03-28");
  assert.equal(holidayOf("2026-10-13"), null);
  const feriado = "2026-10-12"; // segunda
  const blocks = [B({ kind: "aula", subject_id: "s", weekday: 1, start_time: "08:20", end_time: "12:00" }), B({ weekday: 1, start_time: "19:00", end_time: "21:00" })];
  const f = freeStudy(blocks, [], feriado);
  assert.deepEqual(f.blocks.map((b) => `${b.start_time}-${b.end_time}`), ["08:20-12:00", "19:00-21:00"]);
  assert.match(f.notes[0], /Sem aula \(feriado de Nossa Senhora Aparecida\): o horário da aula virou tempo de estudo/);
  // no feriado não há aula para consolidar
  const d = planDay(input({ today: feriado, blocks }));
  assert.ok(!d.slots.flatMap((s) => s.placed).some((p) => p.task.kind === "consolidar"));
});

test("'Sem aula / feriado' no calendário: de todas as disciplinas ou só de uma", () => {
  const blocks = [B({ kind: "aula", subject_id: "s", start_time: "08:20", end_time: "10:00" }), B({ kind: "aula", subject_id: "x", start_time: "10:20", end_time: "12:00" })];
  const recesso = E({ type: "sem_aula", title: "Recesso", time: null });
  assert.equal(freeStudy(blocks, [recesso], TODAY).blocks.length, 2);
  const soCalculo = E({ type: "sem_aula", title: "Professor em congresso", subject_id: "s", time: null });
  const f = freeStudy(blocks, [soCalculo], TODAY);
  assert.deepEqual(f.blocks.map((b) => b.start_time), ["08:20"]);
  assert.match(f.notes[0], /Professor em congresso/);
  assert.equal(noClass(TODAY, [soCalculo]).all, null);
});

test("Sala: 'estudando para quê' respeita passado, hoje e futuro", () => {
  const p2 = { name: "P2", date: "2026-10-14" };
  // conteúdo de setembro estudado em 11/10 para a prova do dia 14
  assert.equal(studyHint("2026-09-16", p2, "2026-10-11"), "Estudando para a P2 (em 3 dias) · conteúdo dado na aula de 16/09.");
  assert.equal(studyHint("2026-10-11", p2, "2026-10-11"), "Estudando para a P2 (em 3 dias) · conteúdo da aula de hoje.");
  assert.equal(studyHint("2026-10-13", null, "2026-10-11"), "Adiantando a aula de 13/10.");
  assert.equal(studyHint("2026-09-16", { name: "P1", date: "2026-09-30" }, "2026-10-11"), "Conteúdo dado na aula de 16/09.");
  assert.equal(studyHint(null, null, "2026-10-11"), "");
});

test("plano da semana: cada dia com o estudo dele", () => {
  const days = ["2026-10-19", "2026-10-20", "2026-10-21"];
  const blocks = [0, 1, 2, 3, 4, 5, 6].map((w) => B({ weekday: w, start_time: "19:00", end_time: "20:00" }));
  const w = planWeek(input({ blocks }), days, (d) => (d === "2026-10-20" ? [P({ title: "Limites" })] : []));
  const titles = w.map((d) => d.plan.slots.flatMap((s) => s.placed.map((p) => p.task.title)));
  assert.deepEqual(titles, [[], ["Limites"], []]);
});

test("aula que não coube hoje volta amanhã (consolidar a de ontem) e o quadrado diz quando", () => {
  // segunda: aula 08:20–10:00 e só 20 min de estudo; terça: bloco das 14h livre
  const blocks = [B({ kind: "aula", subject_id: "s", start_time: "08:20", end_time: "10:00" }), B({ start_time: "10:00", end_time: "10:20" }), B({ weekday: 2, start_time: "14:00", end_time: "16:00" })];
  const base = input({ blocks });
  const hoje = planDay(base);
  assert.deepEqual(hoje.overflow.map((t) => t.kind), ["consolidar"]);
  const terca = planDay({ ...base, today: "2026-10-20", nowMin: 0 });
  assert.equal(terca.slots[0].placed[0].task.title, "Consolidar a aula de ontem de Cálculo III");
  const m = whereNext(base, hoje.overflow, () => []);
  assert.deepEqual(m.get(hoje.overflow[0].key), { day: "2026-10-20", start: 14 * 60, label: "amanhã, no bloco das 14:00" });
  // já estudou a matéria depois da aula: não volta
  assert.equal(planDay({ ...base, today: "2026-10-20", nowMin: 0, sessions: [S({ started_at: new Date(2026, 9, 19, 20).toISOString() })] }).slots[0].placed.length, 0);
});

test("estudo das provas que não coube vai para o próximo bloco livre; sem nenhum, diz que não tem", () => {
  const blocks = [B({ start_time: "14:00", end_time: "14:30" }), B({ weekday: 3, start_time: "19:00", end_time: "20:00" })];
  const extra = [P({ key: "a", title: "A" }), P({ key: "b", title: "B", rank: [0.6, 5, 0, 0, 0, 0] })];
  const base = input({ blocks, extra });
  const hoje = planDay(base);
  assert.deepEqual(hoje.overflow.map((t) => t.key), ["b"]);
  const m = whereNext(base, hoje.overflow, () => []);
  assert.equal(m.get("b")?.label, "quarta (21/10), no bloco das 19:00");
  // tarefa maior que qualquer bloco dos próximos 7 dias: não tem para onde ir
  assert.equal(whereNext(input({ blocks: [blocks[0]] }), [P({ key: "g", minutes: 60 })], () => []).get("g"), null);
});

test("adiantar a aula de hoje só antes de ela começar", () => {
  // aula hoje às 13:30, bloco de estudo das 10h às 11h
  const blocks = [B({ kind: "aula", subject_id: "s", start_time: "13:30", end_time: "15:10" }), B({ start_time: "10:00", end_time: "11:00" })];
  const p = planDay(input({ pref: "antes", blocks }));
  assert.equal(p.slots[0].placed[0].task.kind, "adiantar");
  assert.match(p.slots[0].placed[0].task.why, /Aula hoje às 13:30/);
  // bloco só depois da aula: não sugere
  assert.equal(dayTasksCount(input({ pref: "antes", blocks: [blocks[0], B({ start_time: "16:00", end_time: "17:00" })] })), 0);
});

test("estudo extra marcado no calendário (com início e fim) vira horário de estudo", () => {
  const extra = E({ type: "estudo", title: "Estudo extra", time: "09:00", end_time: "11:00" });
  const f = freeStudy([], [extra], TODAY);
  assert.deepEqual(f.blocks.map((b) => `${b.start_time}-${b.end_time}`), ["09:00-11:00"]);
  assert.equal(planDay(input({ events: [extra] })).hasStudyBlocks, true);
  // sem fim, é só um lembrete
  assert.equal(freeStudy([], [E({ type: "estudo", time: "09:00" })], TODAY).blocks.length, 0);
});

test("horários livres: 8h às 22h, sem nada da rotina nem do calendário", () => {
  const blocks = [B({ kind: "aula", subject_id: "s", start_time: "08:20", end_time: "12:00" }), B({ start_time: "14:00", end_time: "16:00" })];
  const w = freeWindows(blocks, [E({ time: "19:00" })], TODAY);
  assert.deepEqual(w.map((x) => `${x.start / 60}-${x.end / 60}`), ["12-14", "16-19", "20-22"]);
  // feriado: a aula não ocupa o horário
  assert.equal(freeWindows(blocks, [], "2026-10-12")[0].start, 8 * 60);
  // viagem ou day off: nenhum
  assert.deepEqual(freeWindows(blocks, [E({ type: "folga" })], TODAY), []);
});
