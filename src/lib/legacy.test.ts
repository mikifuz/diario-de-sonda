import { test } from "node:test";
import assert from "node:assert/strict";
import { convertLegacy, isLegacyExport } from "./legacy";

let n = 0;
const ids = () => `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`;

const legacy = {
  app: "diario-de-sonda", version: 1,
  data: {
    subjects: [{
      id: "sabc", name: "Mecânica dos Fluidos", code: "MFL", prof: "Prof. X", color: "#e0864a", minAvg: 7, archived: false,
      topics: [{ id: "t2", name: "Bernoulli", parentId: "t1" }, { id: "t1", name: "Escoamento", parentId: null }],
      grading: { items: [{ id: "g1", name: "Prova 1", kind: "prova", date: "2026-09-20", weight: 3, grade: 7.5, pred: 8, sim: { e: 7 } }, { id: "g2", name: "", weight: 1 }],
        exam: { enabled: true, wAvg: 1, wExam: 1, minFinal: 5, minTake: "" } },
    }],
    sessions: [
      { id: "e1", subjectId: "sabc", topicId: "t2", activity: "exercicios", start: Date.UTC(2026, 9, 9, 14), durMin: 50, questions: 10, correct: 7, ev: { conf: 4, result: "parcial", auto: "sozinho", diff: 2 } },
      { id: "e2", subjectId: "inexistente", durMin: 30, start: 1 },
      { id: "e3", subjectId: "sabc", activity: "x", start: Date.UTC(2026, 9, 8), durMin: 20, questions: 2, correct: 5, ev: { conf: 9 } },
    ],
    events: [{ id: "v1", title: "Entrega", type: "entrega", subjectId: "sabc", date: "2026-10-19", time: "23:59" }, { id: "v2", title: "Sem data" }],
  },
  prefs: { skin: "caderno", weeklyGoalH: 20, profile: { name: "Micael", uni: "UDESC", minAvg: 7 } },
};

test("reconhece o formato antigo", () => {
  assert.ok(isLegacyExport(legacy));
  assert.ok(!isLegacyExport({ data: {} }));
});

test("converte com novos ids e mantém relações", () => {
  const r = convertLegacy(legacy, ids);
  assert.equal(r.subjects.length, 1);
  const sid = r.subjects[0].id;
  assert.equal(r.subjects[0].exam_enabled, true);
  assert.equal(r.subjects[0].recovery, "exame");
  assert.equal(r.subjects[0].exam_min_take, null);
  // pai inserido antes do filho
  assert.equal(r.topics[0].name, "Escoamento");
  assert.equal(r.topics[1].parent_id, r.topics[0].id);
  assert.equal(r.assessments.length, 1);
  assert.equal(r.assessments[0].sim_e, 7);
  assert.equal(r.sessions.length, 2);
  assert.equal(r.sessions[0].subject_id, sid);
  assert.equal(r.sessions[0].topic_id, r.topics[1].id);
  // valores inválidos viram nulos/padrão em vez de quebrar a importação
  assert.equal(r.sessions[1].activity, "exercicios");
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].subject_id, sid);
  assert.equal(r.skipped, 3);
  assert.equal(r.profile.university, "UDESC");
  assert.equal(r.profile.skin, "caderno");
});
