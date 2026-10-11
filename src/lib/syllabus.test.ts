import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, classify, docxCells, findDate, guessYear, pdfText, rowsFromPdf, rowsFromTable, rowsFromText, xlsxCells, type Entry } from "./syllabus";
import type { PdfItem } from "./siga";

// Texto e posições de cronogramas reais de 2026/2 (e um Word de 2024/2), sem nomes nem e-mails de professores
const pdfs: Record<string, [number, string, number, number, number][]> = JSON.parse(readFileSync(new URL("./fixtures/cronogramas-pdf.json", import.meta.url), "utf8"));
const tables: { excel: string[][]; word: string[][] } = JSON.parse(readFileSync(new URL("./fixtures/cronogramas-tabela.json", import.meta.url), "utf8"));
const items = (k: string): PdfItem[] => pdfs[k].map(([p, s, x, y, w]) => ({ p, s, x, y, w }));
const fromPdf = (k: string) => { const it = items(k); return classify(rowsFromPdf(it, guessYear(pdfText(it), 2026))); };
const line = (e: Entry) => `${e.date} ${e.kind} ${e.parent ? `[${e.parent}] ` : ""}${e.name}`;
const find = (es: Entry[], date: string) => es.find((e) => e.date === date)!;

test("datas em vários formatos", () => {
  assert.equal(findDate("04/08/2026", 2026)?.date, "2026-08-04");
  assert.equal(findDate("03/AGO SEG", 2026)?.date, "2026-08-03");
  assert.equal(findDate("07.08", 2024)?.date, "2024-08-07");
  assert.equal(findDate("25/26 30/OUT", 2026)?.date, "2026-10-30"); // "25/26" (número da aula) não é data
  assert.equal(findDate("4. Ed. Rio de Janeiro, 2012", 2026), null);
  assert.equal(guessYear("Semestre: 2026/2 ... ISBN 2016. 2 v.", 2020), 2026);
});

test("PDF simples (Cálculo): aulas, provas e SUB", () => {
  const es = fromPdf("calculo");
  assert.equal(line(es[0]), "2026-08-04 aula Funções vetoriais e curvas espaciais"); // tira "Apresentação da disciplina / Plano de Ensino"
  assert.equal(line(find(es, "2026-09-10")), "2026-09-10 prova Prova 1");
  assert.equal(line(find(es, "2026-12-08")), "2026-12-08 sub SUB");
  assert.equal(find(es, "2026-09-08").kind, "exercicios");
  const p = buildPlan(es);
  assert.equal(p.exams.map((x) => x.name).join(","), "Prova 1,Prova 2,Prova 3,SUB");
  // "(parte 1)" e "(parte 2)" viram o mesmo conteúdo, com duas datas
  const rot = p.topics.find((t) => t.name === "Rotacional e Divergente")!;
  assert.deepEqual(rot.dates, ["2026-09-01", "2026-09-03"]);
  assert.equal(rot.exam, p.exams[0].key);
  assert.equal(p.topics.find((t) => t.name === "Teorema de Green")!.exam, p.exams[1].key);
});

test("PDF com data depois do conteúdo e linhas quebradas (Física)", () => {
  const es = fromPdf("fisica");
  assert.equal(es[0].date, "2026-08-06"); // a aula 1 é só apresentação; a bibliografia não vira data
  assert.equal(line(find(es, "2026-08-18")), "2026-08-18 aula [Oscilações] Oscilador amortecido, oscilação forçada/ressonância");
  assert.equal(line(find(es, "2026-11-24")), "2026-11-24 aula [Termodinâmica] Segunda Lei, Entropia");
  assert.equal(find(es, "2026-10-22").kind, "sub");
  assert.equal(find(es, "2026-12-01").name, "Avaliação parcial A4");
  assert.ok(es.every((e) => e.date >= "2026-08-01" && e.date <= "2026-12-31"));
});

test("PDF com seções, datas 03/AGO e células centralizadas (Estática)", () => {
  const es = fromPdf("estatica");
  assert.equal(line(es[0]), "2026-08-03 aula [Sistemas de forças] Decomposição de forças no plano, Forças concorrentes, Princípio da transmissibilidade, Momento de uma força no plano, Teorema de Varignon");
  assert.equal(line(find(es, "2026-08-17")), "2026-08-17 aula [Sistemas de forças] Momento de uma força em relação a um eixo arbitrário; Binário e Resultantes no Espaço, Exercícios");
  assert.equal(find(es, "2026-08-12").kind, "sem_aula");
  assert.equal(find(es, "2026-09-07").kind, "sem_aula");
  const p3 = find(es, "2026-11-09");
  assert.equal(p3.kind, "prova");
  assert.equal(p3.weight, 2);
  assert.equal(line(find(es, "2026-10-30")), "2026-10-30 aula [Cargas distribuidas sobre vigas / cabos flexíveis] Confecção de pontes treliçadas");
  assert.equal(find(es, "2026-11-11").parent, "Momentos de inércia"); // seção no pé da página 2 vale na página 3
  assert.equal(es.filter((e) => e.kind === "prova").length, 5);
});

test("Excel (Linguagem de Programação): datas do Excel e feriados", () => {
  const es = classify(rowsFromTable(tables.excel, 2026));
  assert.equal(line(es[0]), "2026-08-06 aula Princípios de sistemas de computação");
  assert.equal(find(es, "2026-09-03").kind, "prova");
  assert.equal(find(es, "2026-09-07").kind, "sem_aula");
  const p = buildPlan(es);
  assert.deepEqual(p.exams.map((x) => `${x.name}:${x.kind}`), ["Avaliação 1:prova", "Avaliação 2:prova", "Apresentação do Trabalho Final:trabalho"]);
  assert.equal(p.topics.find((t) => t.name === "Estruturas de controle")!.dates.length, 9);
});

test("Word (Química): datas 07.08, unidades e continuação", () => {
  const es = classify(rowsFromTable(tables.word, 2024));
  assert.equal(es[0].parent, "Conceitos Fundamentais e Unidades de Medida");
  const cont = find(es, "2024-09-04");
  assert.equal(cont.kind, "aula");
  assert.equal(cont.parent, "Estequiometria"); // "Continuação" é mais uma aula do conteúdo anterior
  assert.equal(find(es, "2024-09-18").name, "Avaliação 1 (Unidade 1 a 4)");
  assert.ok(!es.some((e) => /finaliza/i.test(e.name) && e.kind !== "sem_aula"));
});

test("texto colado, uma aula por linha", () => {
  const es = classify(rowsFromText("14/10 – Integrais triplas\n16/10 - Teorema de Green\nsem data aqui\n21/10 Prova 2", 2026));
  assert.deepEqual(es.map(line), ["2026-10-14 aula Integrais triplas", "2026-10-16 aula Teorema de Green", "2026-10-21 prova Prova 2"]);
});

test("células de Excel e Word a partir do XML", () => {
  const sheet = '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>46237</v></c><c r="C2" t="inlineStr"><is><t>Vetores</t></is></c></row></sheetData>';
  assert.deepEqual(xlsxCells(sheet, "<sst><si><t>Data</t></si><si><t>Conteúdo</t></si></sst>"), [["Data", "", "Conteúdo"], ["46237", "", "Vetores"]]);
  assert.deepEqual(docxCells("<w:tbl><w:tr><w:tc><w:p><w:r><w:t>07.08</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Uni</w:t></w:r><w:r><w:t>dade 1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>"), [["07.08", "Unidade 1"]]);
});
