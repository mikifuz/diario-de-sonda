import { test } from "node:test";
import assert from "node:assert/strict";
import { courseState, creditsUpTo, fillSlots, forecast, fromTemplate, nextTerm, requiresAll, studentPhase, summary, termOf, unlocksAll, type Forecast } from "./curriculum";
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

/* ============ Previsão de formatura ============ */

const OUT = new Date(2026, 9, 11); // 2026/2

/** confere uma previsão: limite de créditos, pré-requisitos antes (correquisito pode junto) e regra dos 70% */
function check(cs: Course[], f: Forecast) {
  const when = new Map<string, number>();
  cs.forEach((c) => { if (c.status === "aprovada" || c.status === "dispensada" || c.status === "cursando") when.set(c.id, -1); });
  f.terms.forEach((t, i) => t.items.forEach((it) => when.set(it.id, i)));
  for (const [i, t] of f.terms.entries()) {
    const soEstagio = t.items.every((x) => { const k = cs.find((c) => c.id === x.id)?.kind; return k === "estagio" || k === "tcc"; });
    assert.ok(soEstagio || t.credits <= f.cap, `${t.term}: ${t.credits} créditos`);
    for (const it of t.items) {
      const c = cs.find((x) => x.id === it.id)!;
      if (c.kind === "vaga") continue;
      for (const p of c.prereqs) {
        const w = when.get(p.id);
        assert.ok(w != null && (p.co ? w <= i : w < i), `${c.name} em ${t.term} antes de ${cs.find((x) => x.id === p.id)?.name}`);
      }
    }
  }
  const all = cs.filter((c) => c.kind !== "optativa" && c.kind !== "complementar" && !(c.kind === "extensao" && c.phase == null));
  for (const c of all) assert.ok(when.has(c.id) || (c.kind === "vaga"), `${c.name} ficou de fora`);
}

test("semestres letivos", () => {
  assert.equal(termOf(OUT), "2026/2");
  assert.equal(termOf(new Date(2027, 2, 1)), "2027/1");
  assert.equal(nextTerm("2026/2"), "2027/1");
  assert.equal(nextTerm("2027/1"), "2027/2");
});

test("previsão conservadora, equilibrada e otimista no caso do dono (3ª fase, Geologia Geral e Química Orgânica II pendentes)", () => {
  const cs = grade();
  assert.equal(studentPhase(cs), 3);
  const con = forecast(cs, OUT, "conservadora"), oti = forecast(cs, OUT, "otimista");
  check(cs, con);
  check(cs, oti);
  assert.equal(con.stuck.length, 0);
  assert.equal(oti.stuck.length, 0);
  // conservadora: até 20 créditos (só o semestre do estágio passa disso)
  assert.equal(con.heavy.length, 0);
  assert.ok(con.terms.every((t) => t.credits <= 20 || t.items.every((x) => /Estágio|Conclusão/.test(x.name))));
  assert.equal(con.finish, "2031/2");
  // equilibrada: adianta sem semestre puxado (24 ou mais)
  const eq = forecast(cs, OUT, "equilibrada");
  check(cs, eq);
  assert.equal(eq.heavy.length, 0);
  assert.ok(eq.terms.length < con.terms.length && eq.terms.length >= oti.terms.length);
  // otimista: a data mais cedo (adianta e faz estágio junto com Projeto Integrado III), com semestres puxados
  assert.equal(oti.finish, "2030/1");
  assert.ok(oti.heavy.length > 0);
  assert.ok(oti.together);
  assert.equal(con.terms[0].term, "2027/1");
  // pendências da 3ª fase entram logo no próximo semestre
  const first = con.terms[0].items.map((x) => x.name);
  assert.ok(first.includes("Geologia Geral") && first.includes("Química Orgânica II"));
  // estágio e TCC no último semestre
  assert.deepEqual(con.terms[con.terms.length - 1].items.map((x) => x.name).sort(), ["Estágio Curricular Supervisionado", "Projeto de Conclusão de Curso"]);
  assert.match(con.why, /não reprova/);
  assert.ok(con.notes.some((n) => /atividades complementares/.test(n)));
});

test("previsão: tudo feito forma neste semestre; optativa aprovada ocupa a vaga", () => {
  const cs = grade().map((c) => ({ ...c, status: c.kind === "optativa" ? c.status : ("aprovada" as const) }));
  const f = forecast(cs, OUT, "conservadora");
  assert.equal(f.terms.length, 0);
  assert.equal(f.finish, "2026/2");
  const quase = grade().map((c) => (c.name === "Geoestatística" ? { ...c, status: "aprovada" as const } : c));
  const g = forecast(quase, OUT, "otimista");
  const optativas = g.terms.flatMap((t) => t.items).filter((x) => /Optativa/.test(x.name));
  assert.equal(optativas.length, 3);
});
