import { test } from "node:test";
import assert from "node:assert/strict";
import { courseState, creditsUpTo, fillSlots, fromTemplate, requiresAll, summary, unlocksAll } from "./curriculum";
import type { Course, Subject } from "./types";

const sub = (id: string, name: string): Subject => ({
  id, name, code: "", professor: "", semester: "", credits: null, hours: null, color: "#000", min_avg: 7, schedule: "", notes: "", traits: {},
  exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false, study_pref: null, recovery: "sub", sub_replace_lower: false,
});
let n = 0;
const ids = () => `c${n++}`;
// caso do dono: 3ª fase, cursando Cálculo III, Física II, Estática e Linguagem de Programação I
const NOW = [sub("s1", "Cálculo Diferencial e Integral III"), sub("s2", "Física II"), sub("s3", "ESTÁTICA"), sub("s4", "Linguagem de Programação I")];
const grade = () => fromTemplate(3, NOW, ids);
const by = (cs: Course[], name: string) => cs.find((c) => c.name === name)!;

test("matriz 2024: 270 créditos, 4 vagas de optativa e pré-requisitos todos ligados", () => {
  const cs = grade();
  const grid = cs.filter((c) => c.kind !== "optativa");
  assert.equal(grid.reduce((a, c) => a + c.credits, 0), 270);
  assert.equal(cs.filter((c) => c.kind === "vaga").length, 4);
  assert.equal(cs.filter((c) => c.kind === "optativa").length, 22);
  const all = new Set(cs.map((c) => c.id));
  for (const c of cs) for (const p of c.prereqs) assert.ok(all.has(p.id), `${c.name}: pré-requisito sem disciplina`);
  // créditos por fase conferidos com a matriz
  const fase = (k: number) => cs.filter((c) => c.phase === k).reduce((a, c) => a + c.credits, 0);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(fase), [22, 28, 25, 29, 26, 30, 28, 28, 20, 25]);
});

test("fases anteriores aprovadas e disciplinas do app como cursando (pelo nome, sem acento/maiúscula)", () => {
  const cs = grade();
  assert.equal(by(cs, "Física I").status, "aprovada");
  assert.equal(by(cs, "Estática").status, "cursando");
  assert.equal(by(cs, "Estática").subject_id, "s3");
  assert.equal(by(cs, "Geologia Geral").status, "pendente");
});

test("pré-requisito, correquisito e regra dos 70%", () => {
  const cs = grade();
  // Física Experimental II: Física II (correquisito) está sendo cursada e Física Exp. I aprovada
  assert.equal(courseState(by(cs, "Física Experimental II"), cs).state, "liberada");
  // Equações Diferenciais precisa de Cálculo III, que ainda está em curso
  const ed = courseState(by(cs, "Equações Diferenciais"), cs);
  assert.equal(ed.state, "bloqueada");
  assert.deepEqual(ed.missing, ["Cálculo Diferencial e Integral III"]);
  // Gestão e Liderança: 70% das fases 1 a 3 (75 créditos → 53); aprovados 50
  assert.deepEqual(creditsUpTo(cs, 3), { done: 50, total: 75 });
  assert.match(courseState(by(cs, "Gestão e Liderança"), cs).why, /70% dos créditos das fases 1 a 3 \(50 de 53\)/);
  // Física III exige Física I e Cálculo II (ambos aprovados)
  assert.equal(courseState(by(cs, "Física III"), cs).state, "liberada");
  // Física Exp. III: correquisito Física III pendente mas liberada → cursar junto
  const fe3 = courseState(by(cs, "Física Experimental III"), cs);
  assert.equal(fe3.state, "liberada");
  assert.deepEqual(fe3.together, ["Física III"]);
});

test("cadeias: o que exige e o que libera", () => {
  const cs = grade();
  const c3 = by(cs, "Cálculo Diferencial e Integral III");
  const names = (s: Set<string>) => [...s].map((id) => cs.find((c) => c.id === id)!.name);
  assert.deepEqual(names(requiresAll(c3.id, cs)).sort(), ["Cálculo Diferencial e Integral I", "Cálculo Diferencial e Integral II"]);
  const lib = names(unlocksAll(c3.id, cs));
  assert.ok(lib.includes("Equações Diferenciais") && lib.includes("Mecânica dos Fluidos") && lib.includes("Engenharia de Poço III"));
  assert.ok(!lib.includes("Geofísica"));
});

test("optativas aprovadas preenchem as vagas na ordem das fases", () => {
  const cs = grade().map((c) => (c.name === "Geoestatística" ? { ...c, status: "aprovada" as const } : c));
  const slots = fillSlots(cs);
  assert.equal(slots.get(by(cs, "Optativa I").id)?.name, "Geoestatística");
  assert.equal(slots.size, 1);
  const s = summary(cs);
  assert.equal(s.optDone, 2);
  assert.equal(s.optNeed, 8);
});

test("resumo: créditos, liberadas, gargalos e semestres que faltam, com o motivo", () => {
  const cs = grade();
  const s = summary(cs);
  assert.equal(s.done, 50);
  assert.equal(s.total, 270);
  const av = s.available.map((c) => c.name);
  assert.ok(av.includes("Geologia Geral") && av.includes("Física III") && !av.includes("Equações Diferenciais"));
  assert.ok(s.bottlenecks.length > 0);
  assert.ok(s.minTerms >= 6 && s.minTerms <= 8, `estimativa ${s.minTerms}`);
  assert.match(s.termsWhy, /sem reprovações/);
  // tudo aprovado: não falta nada
  const fim = summary(cs.map((c) => ({ ...c, status: "aprovada" as const })));
  assert.equal(fim.minTerms, 0);
  assert.equal(fim.pct, 1);
});
