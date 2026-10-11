import { test } from "node:test";
import assert from "node:assert/strict";
import { autoStop, deskState, forgotten, MAX_RUN_MS } from "./timer";
import type { Timer } from "./types";

const H = 3600_000;
const T = (p: Partial<Timer>): Timer => ({ subject_id: "s", topic_id: null, activity: "exercicios", since: 0, started: 0, accum: 0, running: true, ...p });

test("cronômetro esquecido: só depois de 20 h seguidas sem pausa", () => {
  const now = 100 * H;
  assert.equal(forgotten(T({ since: now - 19 * H }), now), false);
  assert.equal(forgotten(T({ since: now - MAX_RUN_MS - 1 }), now), true);
  // pausado não conta, por mais tempo que fique
  assert.equal(forgotten(T({ since: now - 30 * H, running: false, accum: 2 * H }), now), false);
  // pausas zeram a contagem: 15 h antes da pausa + 6 h agora = só 6 h seguidas
  assert.equal(forgotten(T({ since: now - 6 * H, accum: 15 * H }), now), false);
  assert.equal(forgotten(null, now), false);
});

test("desligar sozinho guarda só o tempo antes da última retomada", () => {
  assert.deepEqual(autoStop(T({ since: 5, accum: 90 * 60000 })), { keepMs: 90 * 60000, lostSince: 5, minutes: 90 });
  assert.equal(autoStop(T({ since: 5, accum: 0 })).minutes, 0);
});

test("mesinha: acesa, cinza por 1 h e depois some", () => {
  const now = Date.parse("2026-10-11T15:00:00Z");
  const at = (min: number) => new Date(now - min * 60000).toISOString();
  assert.equal(deskState({ studying: true, paused: false, updated_at: at(600) }, false, now), "estudando");
  assert.equal(deskState({ studying: false, paused: true, updated_at: at(20) }, false, now), "parou");
  assert.equal(deskState({ studying: false, paused: true, updated_at: at(61) }, true, now), null);
  assert.equal(deskState({ studying: false, paused: false, updated_at: at(10) }, true, now), "parou");
  // só trocou o apelido, sem estudo salvo: nada aparece
  assert.equal(deskState({ studying: false, paused: false, updated_at: at(10) }, false, now), null);
});
