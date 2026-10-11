import { test } from "node:test";
import assert from "node:assert/strict";
import { habitStats } from "./habits";

const C = (day: string, habit_id = "h") => ({ id: `${habit_id}-${day}`, habit_id, day });

test("hábito: hoje, semana e sequência", () => {
  const checks = [C("2026-10-11"), C("2026-10-10"), C("2026-10-09"), C("2026-10-06"), C("2026-10-01"), C("2026-10-11", "outro")];
  const s = habitStats("h", checks, "2026-10-11");
  assert.equal(s.today?.day, "2026-10-11");
  assert.equal(s.week, 4); // 05 a 11/10
  assert.equal(s.streak, 3);
});

test("hábito: ainda não marcado hoje mantém a sequência até ontem", () => {
  const s = habitStats("h", [C("2026-10-10"), C("2026-10-09")], "2026-10-11");
  assert.equal(s.today, null);
  assert.equal(s.streak, 2);
  assert.equal(habitStats("h", [C("2026-10-08")], "2026-10-11").streak, 0);
});
