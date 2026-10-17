import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict, type VerdictInput } from "./verdict";
import type { Assessment, Session, Subject } from "./types";

const TODAY = "2026-10-21";
const SUB: Subject = { id: "s", name: "Cálculo III", code: "", professor: "", semester: "", credits: null, hours: null, color: "#000", min_avg: 7, schedule: "", notes: "", traits: {},
  exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false, study_pref: null, recovery: "sub", sub_replace_lower: false };
const S = (daysAgo: number, min = 60, p: Partial<Session> = {}): Session => ({ id: Math.random().toString(), subject_id: "s", topic_id: null, activity: "exercicios",
  started_at: new Date(2026, 9, 21 - daysAgo, 10).toISOString(), duration_min: min, notes: "", ...p });
const A = (p: Partial<Assessment>): Assessment => ({ id: "p", subject_id: "s", name: "P2", kind: "prova", date: "2026-10-24", time: null, weight: 1, grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null, priority: "alta", status: "pendente", description: "", sub_id: null, ...p });
const inp = (p: Partial<VerdictInput>): VerdictInput => ({ today: TODAY, sessions: [], subjects: [SUB], assessments: [], weeklyGoalH: null, ...p });

test("sem nenhum registro, não diz nada (o guia de primeiros passos cuida)", () => {
  assert.equal(verdict(inp({})), null);
});

test("sumiu há 7+ dias e parado há 3+ dias, sempre com a data do último estudo", () => {
  const sumiu = verdict(inp({ sessions: [S(9)] }))!;
  assert.equal(sumiu.kind, "sumiu");
  assert.match(sumiu.why, /Último estudo registrado: 12\/10 \(9 dias atrás\)/);
  assert.equal(verdict(inp({ sessions: [S(4)] }))!.kind, "parado");
});

test("prova chegando: estudo disparou ('bateu água') ou estudo baixo", () => {
  const antes = [8, 15, 22].map((d) => S(d, 60)); // ~1 h por semana antes
  const agora = [0, 1, 2, 3, 4].map((d) => S(d, 90)); // 7h30 na semana
  const agua = verdict(inp({ sessions: [...antes, ...agora], assessments: [A({})] }))!;
  assert.equal(agua.kind, "agua");
  assert.match(agua.why, /P2 de Cálculo III em 3 dias/);
  const pouco = verdict(inp({ sessions: [S(1, 30)], assessments: [A({})], weeklyGoalH: 15 }))!;
  assert.equal(pouco.kind, "prova_pouco");
  assert.match(pouco.why, /30min nos últimos 7 dias \(meta: 15h\)/);
});

test("notas abaixo da média pedem mudar a estratégia", () => {
  const sessions = [0, 1, 2, 3, 4].map((d) => S(d, 60));
  const v = verdict(inp({ sessions, assessments: [A({ date: "2026-10-01", grade: 4 })], weeklyGoalH: 5 }))!;
  assert.equal(v.kind, "notas");
  assert.match(v.why, /Cálculo III \(4,0 de 7,0\)/);
});

test("pouco estudo em relação à meta; indo bem; e a frase não muda durante o dia", () => {
  assert.equal(verdict(inp({ sessions: [S(1, 60)], weeklyGoalH: 15 }))!.kind, "pouco");
  const bom = [0, 1, 2, 3, 4, 5].map((d) => S(d, 120));
  assert.equal(verdict(inp({ sessions: bom, weeklyGoalH: 10 }))!.kind, "voando");
  assert.equal(verdict(inp({ sessions: [S(1, 60)], weeklyGoalH: 15 }))!.title, verdict(inp({ sessions: [S(1, 60)], weeklyGoalH: 15 }))!.title);
});

test("day off hoje: o Geralzão não chama de parado", () => {
  const v = verdict(inp({ sessions: [S(4, 60)], off: true }))!;
  assert.equal(v.kind, "folga");
  assert.match(v.why, /day off hoje/);
});
