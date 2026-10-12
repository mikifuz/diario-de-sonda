import { test } from "node:test";
import assert from "node:assert/strict";
import { autoStop, deskState, forgotten, liveFrom, MAX_RUN_MS, nextMidnight, rollover } from "./timer";
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

// horários locais (o app usa o fuso do aparelho)
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

test("virada do dia: pausada ontem encerra a sessão com o tempo de ontem", () => {
  // caso da Marcele: 7 h ontem, pausou às 22:00, abriu hoje de manhã
  const t = T({ started: at(11, 14), since: at(11, 19), accum: 7 * H, running: false, paused_at: at(11, 22) });
  assert.deepEqual(rollover(t, at(12, 8)), { kind: "pausada", keepMs: 7 * H, startedAt: at(11, 14), next: null });
  // pausada hoje: nada muda
  assert.equal(rollover({ ...t, paused_at: at(12, 7) }, at(12, 8)), null);
  // sessões antigas, sem paused_at: usa o último "retomar"
  assert.equal(rollover({ ...t, paused_at: undefined }, at(12, 8))?.kind, "pausada");
  assert.equal(rollover(null, at(12, 8)), null);
});

test("virada do dia: ligado à meia-noite divide a sessão e segue contando", () => {
  const t = T({ started: at(11, 22), since: at(11, 23), accum: 30 * 60000 });
  const r = rollover(t, at(12, 0, 40))!;
  assert.equal(r.kind, "meia-noite");
  assert.equal(r.keepMs, 90 * 60000); // 30 min antes da pausa + 23:00–24:00
  assert.equal(r.startedAt, at(11, 22));
  assert.deepEqual(r.next, { ...t, started: at(12, 0), since: at(12, 0), accum: 0, run_since: at(11, 23) });
  // já dividido: nada a fazer até a próxima meia-noite
  assert.equal(rollover(r.next, at(12, 2)), null);
  // a regra das 20 h segue contando do início do trecho sem pausa
  assert.equal(forgotten(r.next, at(11, 23) + MAX_RUN_MS + 1), true);
  assert.equal(autoStop(r.next!).lostSince, at(11, 23));
  assert.equal(nextMidnight(at(11, 23, 59)), at(12, 0));
});

test("sala: o cronômetro ao vivo só conta no dia em que foi feito", () => {
  const today = at(12, 0), now = at(12, 9);
  const iso = (ms: number) => new Date(ms).toISOString();
  // pausada ontem com 7 h e ainda não abriu o app: não conta hoje
  assert.equal(liveFrom({ studying: false, paused: true, since: null, accum_ms: 7 * H, updated_at: iso(at(11, 22)) }, today, now), 0);
  assert.equal(liveFrom({ studying: false, paused: true, since: null, accum_ms: H, updated_at: iso(at(12, 8)) }, today, now), H);
  // ligada desde ontem: só a parte de hoje
  assert.equal(liveFrom({ studying: true, paused: false, since: iso(at(11, 23)), accum_ms: H, updated_at: iso(at(11, 23)) }, today, now), 9 * H);
  assert.equal(liveFrom({ studying: true, paused: false, since: iso(at(12, 8)), accum_ms: H, updated_at: iso(at(12, 8)) }, today, now), 2 * H);
  assert.equal(liveFrom({ studying: false, paused: false, since: null, accum_ms: 0, updated_at: iso(at(12, 8)) }, today, now), 0);
});
