import { test } from "node:test";
import assert from "node:assert/strict";
import { effortOf, paceOf, scaleMin } from "./effort";
import type { Session } from "./types";

const S = (subject_id: string, duration_min: number, questions: number | null): Session => ({
  id: Math.random().toString(), subject_id, topic_id: null, activity: "exercicios", started_at: new Date(2026, 9, 1).toISOString(), duration_min,
  questions, correct: null, notes: "", confidence: null, result: null, autonomy: null, difficulty: null, comprehension: null,
});
const fis = { id: "f", name: "Física II", traits: {} };

test("marcado pelo aluno vale mais que os registros", () => {
  const e = effortOf({ ...fis, traits: { esforco: "muito" } }, []);
  assert.equal(e.factor, 1.8);
  assert.equal(e.source, "marcado");
  assert.match(e.why, /muito difícil para você: o plano reserva 80% a mais/);
  assert.equal(effortOf({ ...fis, traits: { esforco: "media" } }, []).why, "");
  assert.equal(effortOf({ ...fis, traits: { esforco: "facil" } }, []).factor, 0.8);
});

test("sem marcação: estima pelos minutos por questão, só com dados suficientes", () => {
  // Física: 120 min por 2 questões (60/questão); outras: 30 min por 3 (10/questão)
  const lenta = [S("f", 120, 2), S("f", 120, 2), S("f", 120, 2)];
  const outras = [S("c", 30, 3), S("c", 30, 3), S("c", 30, 3)];
  assert.deepEqual(paceOf("f", [...lenta, ...outras]), { mine: 60, others: 10, n: 3, nOthers: 3 });
  const e = effortOf(fis, [...lenta, ...outras]);
  assert.equal(e.factor, 1.8); // limitado a 1,8
  assert.equal(e.source, "registros");
  assert.match(e.why, /60 min por questão em Física II e 10 nas outras/);
  // poucos registros: não chuta
  assert.equal(effortOf(fis, [lenta[0], ...outras]).factor, 1);
  // ritmo parecido: não mexe
  assert.equal(effortOf(fis, [S("f", 33, 3), S("f", 33, 3), S("f", 33, 3), ...outras]).factor, 1);
  // sessões sem número de questões não contam
  assert.equal(paceOf("f", [S("f", 60, null)]).mine, null);
});

test("minutos ajustados de 5 em 5", () => {
  assert.equal(scaleMin(30, 1.4), 40);
  assert.equal(scaleMin(120, 1.8), 215);
  assert.equal(scaleMin(30, 0.8), 25);
});
