import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_REPEAT, defaultUntil, repeatDates } from "./repeat";

test("repetir: semanas", () => {
  assert.deepEqual(repeatDates("2026-10-16", "semana", "2026-11-06"), ["2026-10-16", "2026-10-23", "2026-10-30", "2026-11-06"]);
  assert.deepEqual(repeatDates("2026-10-16", "2semanas", "2026-11-13"), ["2026-10-16", "2026-10-30", "2026-11-13"]);
  assert.deepEqual(repeatDates("2026-10-16", "3semanas", "2026-12-01"), ["2026-10-16", "2026-11-06", "2026-11-27"]);
});

test("repetir: todo mês, dia 31 vira o último dia do mês; vira o ano", () => {
  assert.deepEqual(repeatDates("2026-10-31", "mes", "2027-03-01"), ["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28"]);
});

test("repetir: sem repetição, sem data final ou final antes do início = só o dia", () => {
  assert.deepEqual(repeatDates("2026-10-16", "", "2026-12-01"), ["2026-10-16"]);
  assert.deepEqual(repeatDates("2026-10-16", "semana", ""), ["2026-10-16"]);
  assert.deepEqual(repeatDates("2026-10-16", "semana", "2026-10-01"), ["2026-10-16"]);
});

test("repetir: teto de repetições", () => {
  assert.equal(repeatDates("2026-01-01", "semana", "2030-01-01").length, MAX_REPEAT);
});

test("repetir: padrão até o fim do semestre", () => {
  assert.equal(defaultUntil("2026-10-16"), "2026-12-20");
  assert.equal(defaultUntil("2026-03-02"), "2026-07-15");
  assert.equal(defaultUntil("2026-12-28"), "2027-07-15");
});
