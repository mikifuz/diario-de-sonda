import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemo } from "./demo";
import { dkey, gradeCalc } from "./calc";
import { buildAlerts } from "./alerts";
import { reversePlan, todayTasks } from "./reverse";
import { planDay } from "./plan";
import { tripImpacts } from "./trips";

const TODAY = "2026-10-12";
const { data: d, room } = buildDemo(TODAY);

test("demonstração: dados coerentes (nada no futuro, tudo ligado à disciplina certa)", () => {
  assert.ok(d.sessions.length > 15);
  assert.ok(d.sessions.every((s) => dkey(s.started_at) <= TODAY));
  for (const s of d.sessions) assert.equal(d.topics.find((t) => t.id === s.topic_id)!.subject_id, s.subject_id);
  for (const s of d.sessions) assert.ok(d.topics.find((t) => t.id === s.topic_id)!.taught_on! <= dkey(s.started_at)); // só estuda o que já foi dado
  for (const a of d.assessments.filter((x) => x.sub_id)) assert.equal(d.assessments.find((x) => x.id === a.sub_id)!.subject_id, a.subject_id);
  assert.deepEqual(buildDemo(TODAY).data.sessions.map((s) => s.id), d.sessions.map((s) => s.id)); // determinístico
  assert.ok(room.members.some((m) => m.studying));
});

test("demonstração: as telas principais têm o que mostrar", () => {
  const s0 = d.subjects[0];
  assert.ok(gradeCalc(s0, d.assessments.filter((a) => a.subject_id === s0.id)).partial != null);
  const alerts = buildAlerts({ today: TODAY, subjects: d.subjects, topics: d.topics, sessions: d.sessions, assessments: d.assessments });
  assert.ok(alerts.length > 0);
  const plans = reversePlan({ today: TODAY, nowMin: 8 * 60, blocks: d.blocks, events: d.events, subjects: d.subjects, topics: d.topics, sessions: d.sessions, assessments: d.assessments });
  assert.ok(plans.length > 0 && plans.some((p) => p.chunks.length > 0));
  const day = planDay({ today: TODAY, nowMin: 8 * 60, pref: "depois", blocks: d.blocks, events: d.events, subjects: d.subjects, topics: d.topics, sessions: d.sessions, assessments: d.assessments, extra: todayTasks(plans, TODAY) });
  assert.ok(day.slots.some((x) => x.placed.length > 0));
  assert.ok(d.notes.some((n) => n.kind === "relatorio"));
  const trips = tripImpacts({ today: TODAY, nowMin: 8 * 60, blocks: d.blocks, events: d.events, subjects: d.subjects, topics: d.topics, sessions: d.sessions, assessments: d.assessments });
  assert.equal(trips.length, 1);
  assert.ok(trips[0].lost > 0 && trips[0].why);
});
