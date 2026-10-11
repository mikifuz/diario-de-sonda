import { holidayOf, easter } from "./holidays";
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotRanges, anchorFor, examLoads, firstDue, freeStudy, itemState, noClass, nextReview, studyHint, parseSteps, planDay, type PlanInput } from "./plan";
import type { Assessment, CalEvent, ReviewItem, RoutineBlock, Session, Subject, Topic } from "./types";

const STEPS = [1, 3, 7, 14, 30];
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
const R = (p: Partial<ReviewItem>): ReviewItem => ({ id: "r", subject_id: "s", topic_id: null, mistake_id: null, assessment_id: null, title: "Revisar", step: 0, due: TODAY, est_min: 15, active: true, last_reviewed_at: null, ...p });
const E = (p: Partial<CalEvent>): CalEvent => ({ id: "e", subject_id: null, title: "Médico", type: "pessoal", date: TODAY, time: null, priority: "media", status: "pendente", description: "", ...p });
const S = (p: Partial<Session>): Session => ({
  id: "x", subject_id: "s", topic_id: null, activity: "exercicios", started_at: new Date(2026, 9, 19, 9).toISOString(), duration_min: 30,
  questions: null, correct: null, notes: "", confidence: null, result: null, autonomy: null, difficulty: null, comprehension: null, ...p,
});
const input = (p: Partial<PlanInput>): PlanInput => ({ today: TODAY, nowMin: 7 * 60, pref: "depois", blocks: [], events: [], subjects: [SUB()], topics: [], sessions: [], assessments: [], items: [], mistakes: [], ...p });

test("escada: resultado conferido e autonomia decidem, confiança não entra", () => {
  const base = { step: 1, steps: STEPS, today: TODAY };
  assert.equal(nextReview({ ...base, result: "certo", autonomy: "sozinho" }).step, 2);
  assert.equal(nextReview({ ...base, result: "certo", autonomy: "sozinho" }).due, "2026-10-26");
  assert.equal(nextReview({ ...base, result: "certo", autonomy: "anotacoes" }).step, 1);
  assert.equal(nextReview({ ...base, result: "certo", autonomy: "resolucao" }).step, 0);
  assert.equal(nextReview({ ...base, result: "parcial", autonomy: "sozinho" }).step, 0);
  assert.equal(nextReview({ ...base, step: 4, result: "errado", autonomy: "sozinho" }).step, 0);
  const nao = nextReview({ ...base, result: "nao", autonomy: null });
  assert.equal(nao.keep, true);
  assert.equal(nao.step, 1);
});

test("escada para no último degrau e sem prova fica em até 14 dias", () => {
  const r = nextReview({ step: 4, steps: STEPS, result: "certo", autonomy: "sozinho", today: TODAY });
  assert.equal(r.step, 4);
  assert.equal(r.due, "2026-11-02");
  assert.match(r.why, /14 dias/);
});

test("revisão não passa da véspera da prova e encerra perto dela", () => {
  const r = nextReview({ step: 2, steps: STEPS, result: "certo", autonomy: "sozinho", today: TODAY, exam: { date: "2026-10-27", name: "P2" } });
  assert.equal(r.due, "2026-10-26");
  assert.match(r.why, /véspera de P2/);
  const fim = nextReview({ step: 0, steps: STEPS, result: "certo", autonomy: "sozinho", today: TODAY, exam: { date: "2026-10-20", name: "P2" } });
  assert.equal(fim.due, null);
  assert.match(fim.why, /última revisão/);
  assert.equal(firstDue(STEPS, TODAY, "2026-10-20"), TODAY);
  assert.equal(firstDue(STEPS, TODAY, "2026-12-07"), "2026-10-20");
});

test("intervalos configuráveis", () => {
  assert.deepEqual(parseSteps("1, 2, 5"), [1, 2, 5]);
  assert.equal(typeof parseSteps("3, 1"), "string");
  assert.equal(typeof parseSteps("0"), "string");
});

test("prova da revisão: a do conteúdo ou a próxima da disciplina", () => {
  const as = [A({ id: "p1", name: "P1", date: "2026-10-08", grade: 6 }), A({ id: "p2", name: "P2", date: "2026-11-17" }), A({ id: "p3", name: "P3", date: "2026-12-08" })];
  assert.equal(anchorFor("s", T({ assessment_id: "p3" }), as, TODAY)?.a.id, "p3");
  assert.equal(anchorFor("s", T({}), as, TODAY)?.a.id, "p2");
  assert.equal(anchorFor("outra", null, as, TODAY), null);
});

test("revisão encerra depois da prova", () => {
  const as = [A({ id: "p", name: "P1", date: "2026-10-17" })];
  const st = itemState(R({ assessment_id: "p" }), as, TODAY);
  assert.equal(st.open, false);
  assert.match(st.why, /P1 já foi realizada em 17\/10/);
  assert.equal(itemState(R({ assessment_id: "p" }), [A({ id: "p", date: "2026-10-27" })], TODAY).open, true);
  assert.equal(itemState(R({ active: false }), [], TODAY).open, false);
});

test("compromissos do calendário tiram blocos de estudo", () => {
  const blocks = [B({ start_time: "09:00", end_time: "10:00" }), B({ start_time: "14:00", end_time: "16:00" }), B({ weekday: 2 })];
  assert.equal(freeStudy(blocks, [], TODAY).blocks.length, 2);
  assert.equal(freeStudy(blocks, [E({ time: "14:30" })], TODAY).blocks.length, 1);
  assert.equal(freeStudy(blocks, [E({ type: "indisponivel" })], TODAY).blocks.length, 0);
  assert.equal(freeStudy(blocks, [E({ type: "indisponivel", status: "cancelado" })], TODAY).blocks.length, 2);
});

test("plano do dia: prioridade, encaixe nos blocos e o que não coube", () => {
  const assessments = [A({ id: "perto", name: "P2", date: "2026-10-21", weight: 2 }), A({ id: "longe", name: "P3", date: "2026-11-27", weight: 3 })];
  const items = [
    R({ id: "a", title: "Longe", assessment_id: "longe", est_min: 30 }),
    R({ id: "b", title: "Perto", assessment_id: "perto", est_min: 30 }),
    R({ id: "c", title: "Amanhã", due: "2026-10-20" }),
    R({ id: "d", title: "Encerrada", assessment_id: "perto", active: false }),
  ];
  const p = planDay(input({ blocks: [B({ start_time: "14:00", end_time: "15:00" })], assessments, items }));
  assert.equal(p.capacity, 60);
  assert.deepEqual(p.slots[0].placed.map((x) => x.task.title), ["Perto", "Longe"]);
  assert.equal(p.slots[0].placed[1].start, 14 * 60 + 30);
  assert.equal(p.overflow.length, 0);
  assert.match(p.slots[0].placed[0].task.why, /P2 em 2 dias/);
  const cheio = planDay(input({ blocks: [B({ start_time: "14:00", end_time: "14:40" })], assessments, items }));
  assert.deepEqual(cheio.overflow.map((x) => x.title), ["Longe"]);
});

test("plano do dia: só o que sobra do dia conta", () => {
  const p = planDay(input({ nowMin: 15 * 60 + 30, blocks: [B({})], items: [R({ est_min: 45 })] }));
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

test("carga até a prova avisa quando não cabe", () => {
  const assessments = [A({ id: "p", name: "P2", date: "2026-10-21" })];
  const items = [R({ assessment_id: "p", est_min: 60 }), R({ id: "r2", assessment_id: "p", est_min: 60 })];
  const blocks = [B({ weekday: 1, start_time: "14:00", end_time: "15:00" }), B({ weekday: 2, start_time: "14:00", end_time: "14:30" })];
  const [l] = examLoads({ today: TODAY, blocks, events: [], assessments, items, subjects: [SUB()] });
  assert.equal(l.need, 120);
  assert.equal(l.capacity, 90);
  assert.equal(l.tight, true);
});

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
  assert.equal(dificil.task.minutes, 40); // 30 × 1,4 = 42 → 40
  assert.match(dificil.task.why, /difícil para você: o plano reserva 40% a mais/);
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
