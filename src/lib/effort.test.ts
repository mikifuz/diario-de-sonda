import { test } from "node:test";
import assert from "node:assert/strict";
import { easyReminders, effortOf, isTrivial, scaleMin } from "./effort";
import { reversePlan } from "./reverse";
import { planDay } from "./plan";
import { buildAlerts } from "./alerts";
import type { Assessment, RoutineBlock, Subject as Sub, Topic } from "./types";

const fis = { id: "f", name: "Física II", traits: {} };

test("dificuldade marcada pelo aluno muda o tempo", () => {
  const e = effortOf({ ...fis, traits: { esforco: "muito" } });
  assert.equal(e.factor, 2);
  assert.match(e.why, /muito difícil para você: o plano reserva 100% a mais/);
  assert.equal(effortOf({ ...fis, traits: { esforco: "dificil" } }).factor, 1.5);
  assert.equal(effortOf({ ...fis, traits: { esforco: "media" } }).why, "");
  assert.equal(effortOf({ ...fis, traits: { esforco: "facil" } }).factor, 0.8);
  // sem marcação: média
  assert.equal(effortOf(fis).factor, 1);
});

test("minutos ajustados de 5 em 5", () => {
  assert.equal(scaleMin(30, 1.4), 40);
  assert.equal(scaleMin(120, 1.8), 215);
  assert.equal(scaleMin(30, 0.8), 25);
});

/* ============ Extremamente fácil ============ */

const ESUB = (p: Partial<Sub> = {}): Sub => ({
  id: "e", name: "Ética", code: "", professor: "", semester: "", credits: null, hours: null, color: "#888", min_avg: 7, schedule: "", notes: "",
  traits: { esforco: "trivial" }, exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false, study_pref: "ambos", recovery: "nenhuma", sub_replace_lower: false, ...p,
});
const EX = (p: Partial<Assessment> = {}): Assessment => ({ id: "pe", subject_id: "e", name: "P1", kind: "prova", date: "2026-10-16", time: "10:20", weight: 1, grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null, ...p });
const ET: Topic = { id: "et", subject_id: "e", parent_id: null, name: "Código de ética", position: 0, taught_on: "2026-10-01", assessment_id: "pe" };
const EB: RoutineBlock[] = [0, 1, 2, 3, 4, 5, 6].flatMap((wd) => [
  { id: `s${wd}`, weekday: wd, start_time: "14:00", end_time: "18:00", kind: "estudo" as const, subject_id: null, label: "" },
  { id: `a${wd}`, weekday: wd, start_time: "08:20", end_time: "10:00", kind: "aula" as const, subject_id: "e", label: "" },
]);

test("extremamente fácil: sem tempo no plano (nem aula, nem planejamento da prova)", () => {
  const s = ESUB();
  assert.ok(isTrivial(s));
  assert.equal(effortOf(s).factor, 0);
  assert.match(effortOf(s).why, /não reserva tempo/);
  const base = { today: "2026-10-12", nowMin: 0, blocks: EB, events: [], subjects: [s], topics: [ET], sessions: [], assessments: [EX({ date: "2026-10-20" })] };
  assert.equal(reversePlan(base).length, 0);
  const day = planDay({ ...base, pref: "ambos" });
  assert.equal(day.need, 0);
  // a mesma matéria marcada como fácil ganha tempo
  assert.ok(reversePlan({ ...base, subjects: [ESUB({ traits: { esforco: "facil" } })] }).length === 1);
});

test("extremamente fácil: aviso só na véspera e no dia da prova", () => {
  const s = ESUB();
  assert.equal(easyReminders("2026-10-14", [s], [EX()]).length, 0);
  const eve = easyReminders("2026-10-15", [s], [EX()]);
  assert.equal(eve.length, 1);
  assert.match(eve[0].text, /é amanhã às 10:20: dê uma estudada rápida hoje/);
  assert.match(easyReminders("2026-10-16", [s], [EX()])[0].text, /é hoje/);
  assert.equal(easyReminders("2026-10-16", [s], [EX({ grade: 9 })]).length, 0);
  assert.equal(easyReminders("2026-10-15", [ESUB({ traits: {} })], [EX()]).length, 0);
  // no painel vira um alerta, sem os alertas de preparo da prova
  const alerts = buildAlerts({ today: "2026-10-15", subjects: [s], topics: [ET], sessions: [], assessments: [EX()] });
  assert.deepEqual(alerts.map((a) => a.key), ["easy-pe"]);
});
