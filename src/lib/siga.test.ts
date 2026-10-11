import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSiga, sameName, type PdfItem } from "./siga";

// Texto e posições extraídos de um comprovante real de 2026/2 (sem nome, matrícula e código de autenticidade)
const items: PdfItem[] = JSON.parse(readFileSync(new URL("./fixtures/siga-comprovante.json", import.meta.url), "utf8"));

test("comprovante do SIGA: disciplinas da tabela", () => {
  const r = parseSiga(items);
  assert.equal(r.period, "2026/2");
  assert.deepEqual(r.subjects.map((s) => s.name), ["Cálculo Diferencial e Integral III", "Estática", "Física II", "Física Experimental II", "Linguagem de Programação I"]);
  assert.equal(r.subjects[0].hours, 72);
  assert.equal(r.subjects[0].credits, 4);
  // o código cortado na tabela é completado pelo da grade
  assert.equal(r.subjects.find((s) => s.name.startsWith("Linguagem"))!.code, "3LINGPROGI72");
  assert.deepEqual(r.warnings, []);
});

test("comprovante do SIGA: grade vira blocos de aula", () => {
  const r = parseSiga(items);
  const name = (code: string) => r.subjects.find((s) => s.code === code)!.name;
  const got = r.classes.map((c) => `${c.weekday} ${c.start}-${c.end} ${name(c.code)}`);
  assert.deepEqual(got, [
    "1 08:20-10:00 Linguagem de Programação I",
    "1 10:20-12:00 Estática",
    "1 15:20-17:00 Física Experimental II",
    "2 10:20-12:00 Física II",
    "2 15:20-17:00 Cálculo Diferencial e Integral III",
    "3 08:20-10:00 Estática",
    "4 08:20-10:00 Linguagem de Programação I",
    "4 10:20-12:00 Cálculo Diferencial e Integral III",
    "4 13:30-15:10 Física II",
    "4 15:20-17:00 Física Experimental II",
  ]);
  assert.equal(r.classes[0].label, "Laboratório de Informática I - Nova Esperança (prática)");
  assert.equal(r.classes[1].label, "Sala de Aula 33 - Nova Esperança (teórica)");
});

test("arquivo que não é comprovante gera aviso, não dados inventados", () => {
  const r = parseSiga([{ p: 1, s: "Outro documento qualquer", x: 10, y: 700, w: 100 }]);
  assert.equal(r.subjects.length, 0);
  assert.equal(r.classes.length, 0);
  assert.ok(r.warnings.length > 0);
});

test("nomes comparados sem acento e caixa", () => {
  assert.ok(sameName("Física  II", "fisica ii"));
  assert.ok(!sameName("Física I", "Física II"));
});
