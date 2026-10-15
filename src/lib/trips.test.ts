import { test } from "node:test";
import assert from "node:assert/strict";
import type { RevInput } from "./reverse";
import { tripImpact, tripImpacts, upcomingTrips } from "./trips";
import { freeStudy, planDay } from "./plan";
import type { Assessment, CalEvent, RoutineBlock, Subject, Topic } from "./types";

const TODAY = "2026-10-12"; // segunda
const SUB = (p: Partial<Subject> = {}): Subject => ({
  id: "s", name: "Cálculo III", code: "", professor: "", semester: "", credits: null, hours: null, color: "#4f86f7", min_avg: 7, schedule: "", notes: "",
  traits: {}, exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false, study_pref: null, recovery: "sub", sub_replace_lower: false, ...p,
});
const A = (p: Partial<Assessment> = {}): Assessment => ({ id: "p2", subject_id: "s", name: "P2", kind: "prova", date: "2026-10-22", time: null, weight: 1, grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null, ...p });
const T = (i: number): Topic => ({ id: "t" + i, subject_id: "s", parent_id: null, name: "Conteúdo " + i, position: i, taught_on: "2026-10-01", assessment_id: "p2" });
const B = (wd: number, start = "14:00", end = "16:00"): RoutineBlock => ({ id: `b${wd}${start}`, weekday: wd, start_time: start, end_time: end, kind: "estudo", subject_id: null, label: "" });
const V = (p: Partial<CalEvent> = {}): CalEvent => ({ id: "v", subject_id: null, title: "Casa dos pais", type: "viagem", date: "2026-10-16", end_date: "2026-10-19", time: null, priority: "media", status: "pendente", description: "", ...p });
const every = [0, 1, 2, 3, 4, 5, 6].map((d) => B(d)); // 2 h por dia
const inp = (n: number, p: Partial<RevInput> = {}): RevInput => ({
  today: TODAY, nowMin: 8 * 60, blocks: every, events: [V()], subjects: [SUB()], topics: Array.from({ length: n }, (_, i) => T(i)),
  sessions: [], assessments: [A()], items: [], logs: [], mistakes: [], ...p,
});

test("nos dias da viagem a rotina não tem estudo; no dia da ida, só o que acaba antes da saída", () => {
  const blocks = [B(5, "08:00", "10:00"), B(5, "14:00", "16:00"), B(6)];
  assert.equal(freeStudy(blocks, [V()], "2026-10-17").blocks.length, 0);
  assert.match(freeStudy(blocks, [V()], "2026-10-17").notes[0], /Viagem \(Casa dos pais\)/);
  const ida = freeStudy(blocks, [V({ time: "12:00" })], "2026-10-16");
  assert.deepEqual(ida.blocks.map((b) => b.start_time), ["08:00"]);
  assert.match(ida.notes[0], /saída às 12:00/);
  // viagem cancelada não tira nada
  assert.equal(freeStudy(blocks, [V({ status: "cancelado" })], "2026-10-17").blocks.length, 1);
  // o plano do dia não sugere nada num dia de viagem
  const plan = planDay({ today: "2026-10-17", nowMin: 0, pref: "depois", blocks, events: [V()], subjects: [SUB()], topics: [T(0)], sessions: [], assessments: [A()], items: [], mistakes: [] });
  assert.equal(plan.capacity, 0);
});

test("viagem que aperta a prova: diz quanto falta, quanto é da viagem, quanto estudar a mais por dia e o quê", () => {
  const r = tripImpact(inp(6), V());
  assert.equal(r.lost, 8 * 60); // 4 dias × 2 h
  assert.equal(r.level, "apertado");
  assert.ok(r.missing > 0 && r.fromTrip > 0 && r.fromTrip <= r.missing);
  assert.equal(r.exams.length, 1);
  assert.ok(r.makeUp);
  assert.equal(r.makeUp!.until, "2026-10-21");
  assert.equal(r.makeUp!.days, 6); // 12–15 e 20–21 (os 4 dias da viagem ficam de fora)
  assert.equal(r.makeUp!.before, 4);
  assert.ok(r.makeUp!.perDay * r.makeUp!.days >= r.missing);
  assert.ok(r.focus.length > 0 && r.focus[0].p.why && r.focus[0].p.how);
  assert.match(r.why, /a mais por dia/);
  // sem a viagem, a mesma prova cabia
  const noTrip = tripImpact(inp(6, { events: [] }), V({ id: "outra" }));
  assert.ok(noTrip.missing < r.missing);
});

test("viagem que não aperta: o plano cabe nos outros dias e o motivo diz isso", () => {
  const r = tripImpact(inp(3), V());
  assert.equal(r.level, "cabe");
  assert.equal(r.missing, 0);
  assert.equal(r.makeUp, null);
  assert.match(r.why, /cabe nos outros dias/);
});

test("sem prova até 2 semanas depois da volta, só informa o tempo perdido", () => {
  const r = tripImpact(inp(6, { assessments: [A({ date: "2026-11-10" })] }), V());
  assert.equal(r.level, "sem_prova");
  assert.match(r.why, /Não há prova cadastrada/);
});

test("prova durante a viagem aparece como aviso", () => {
  const r = tripImpact(inp(2, { assessments: [A({ date: "2026-10-17" })] }), V());
  assert.deepEqual(r.during.map((a) => a.id), ["p2"]);
});

test("só viagens que ainda não acabaram e começam em até 30 dias", () => {
  const evs = [V({ id: "a", date: "2026-10-01", end_date: "2026-10-05" }), V({ id: "b" }), V({ id: "c", date: "2026-12-20", end_date: "2026-12-30" }), V({ id: "d", date: "2026-10-10", end_date: "2026-10-13" })];
  assert.deepEqual(upcomingTrips(evs, TODAY).map((e) => e.id), ["d", "b"]);
  assert.equal(tripImpacts(inp(1, { events: evs })).length, 2);
});
