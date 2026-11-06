import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { byChapter, examProgress, fixAccents, itemsOf, listStats, nameFromFile, nextQuestionN, parseBookList, parseListPdf, plainQuestions, questionsOf } from "./exercises";
import type { PdfItem } from "./siga";
import type { ExerciseList } from "./types";

// Texto e posições de 5 listas reais de 2026/2 (Cálculo III, Álgebra Linear, Física 1, Programação e os exercícios sugeridos
// do Halliday de Física 2, por capítulo), sem nome de professor
const fx: Record<"calculo3" | "algebra" | "fisica" | "programacao" | "halliday", PdfItem[]> = JSON.parse(readFileSync(new URL("./fixtures/listas-exercicios.json", import.meta.url), "utf8"));

const read = (k: keyof typeof fx) => parseListPdf(fx[k], k + ".pdf");
const shape = (k: keyof typeof fx) => read(k).questions.map((q) => (q.parts > 1 ? `${q.n}:${q.parts}` : q.n)).join(" ");

describe("leitura das listas (PDFs reais, sem nomes)", () => {
  it("Cálculo III: duas colunas, letras de cada questão (a 4 continua na outra coluna)", () => {
    const r = read("calculo3");
    assert.equal(r.name, "Lista 2 - Cálculo Diferencial e Integral III");
    assert.equal(shape("calculo3"), "1:4 2:2 3:3 4:2 5:4 6 7 8:3 9:2 10 11:3 12:4 13:4");
    assert.equal(itemsOf(r.questions).length, 34);
    assert.deepEqual(itemsOf(r.questions).slice(0, 5), ["1a", "1b", "1c", "1d", "2a"]);
  });
  it("Álgebra Linear: ignora os parênteses das fórmulas, como T(1, 0)", () => {
    assert.equal(read("algebra").name, "Lista 10 - Álgebra Linear");
    assert.equal(shape("algebra"), "1:3 2:2 3 4 5 6 7 8 9:2 10 11");
    assert.equal(itemsOf(read("algebra").questions).length, 15);
  });
  it("Física: números com ponto, sem letras; junta os acentos do LaTeX no nome", () => {
    assert.equal(read("fisica").name, "Lista 4 - Física 1");
    assert.equal(shape("fisica"), "1 2 3 4 5 6 7 8 9 10 11 12");
  });
  it("Programação: 24 questões; descarta números soltos no meio do texto (\"50.\", \"1)\")", () => {
    const r = read("programacao");
    assert.deepEqual(r.questions.map((q) => q.n), Array.from({ length: 24 }, (_, k) => String(k + 1)));
    assert.equal(itemsOf(r.questions).length, 24);
  });
  it("Física 2: exercícios sugeridos do livro por capítulo (\"CAPÍTULO 18\" + \"1, 3, 7…\"), com palavras e números cortados no PDF", () => {
    const r = parseListPdf(fx.halliday, "Exercicios_sugeridos_-_Temp_Calor_1a_Lei_Transm_Calor_-_Halliday.pdf");
    assert.equal(r.book, true);
    assert.equal(r.name, "Exercicios sugeridos - Temp Calor 1a Lei Transm Calor - Halliday");
    const items = itemsOf(r.questions);
    assert.equal(items.length, 61); // 25 + 18 + 18
    assert.deepEqual(items.slice(0, 3), ["18.1", "18.3", "18.7"]);
    assert.ok(items.includes("18.105") && items.includes("19.43") && items.includes("20.15")); // "19,43" e "1" + "5" no PDF
    assert.deepEqual(byChapter(items)?.map((g) => [g.ch, g.items.length]), [["18", 25], ["19", 18], ["20", 18]]);
  });
  it("livro por capítulo: na mesma linha, intervalos e \"e\"", () => {
    const L = (s: string, y: number) => ({ p: 1, s, x: 50, y, w: 200 });
    const qs = parseBookList([L("Cap. 2: 1, 4–6 e 9", 700), L("Capítulo 3", 680), L("Problemas: 10, 12", 660), L("Bons estudos!", 640), L("1, 2, 3", 620)]);
    assert.deepEqual(qs.map((q) => q.n), ["2.1", "2.4", "2.5", "2.6", "2.9", "3.10", "3.12"]);
  });
  it("listas comuns continuam lidas como antes (não viram livro)", () => {
    for (const k of ["calculo3", "algebra", "fisica", "programacao"] as const) assert.notEqual(read(k).book, true);
  });
  it("PDF sem texto (foto): nenhuma questão, nome do arquivo", () => {
    assert.deepEqual(parseListPdf([], "Lista_3___Fisica.pdf"), { name: "Lista 3 Fisica", questions: [] });
  });
});

describe("rótulos", () => {
  it("letras viram 8a, 8b…; sem letra fica só o número; ida e volta", () => {
    const qs = [{ n: "1", parts: 3 }, { n: "2", parts: 1 }, { n: "3", parts: 2 }];
    const items = itemsOf(qs);
    assert.deepEqual(items, ["1a", "1b", "1c", "2", "3a", "3b"]);
    assert.deepEqual(questionsOf(items), qs);
  });
  it("capítulo.exercício: ida e volta, próxima questão", () => {
    const qs = [{ n: "18.1", parts: 1 }, { n: "18.3", parts: 2 }];
    assert.deepEqual(questionsOf(itemsOf(qs)), qs);
    assert.equal(nextQuestionN(qs), "18.4");
    assert.equal(nextQuestionN([{ n: "1", parts: 2 }, { n: "12", parts: 1 }]), "13");
    assert.equal(byChapter(["1", "2"]), null);
  });
  it("livro: quadradinhos de 1 a N", () => {
    assert.deepEqual(itemsOf(plainQuestions(5)), ["1", "2", "3", "4", "5"]);
    assert.equal(nameFromFile("Lista_de_Exerc_cios_5.pdf"), "Lista de Exerc cios 5");
    assert.equal(fixAccents("Educa¸c˜ao"), "Educação");
  });
});

const L = (p: Partial<ExerciseList>): ExerciseList => ({
  id: "l", subject_id: "s", assessment_id: "a", event_id: null, name: "Lista", kind: "lista", items: [], done: {}, position: 0, created_at: "2026-10-01T10:00:00Z", ...p,
});

describe("progresso", () => {
  it("conta feitos e diz a próxima", () => {
    const s = listStats(L({ items: ["1a", "1b", "2"], done: { "1a": "2026-10-10" } }));
    assert.deepEqual({ total: s.total, done: s.done, left: s.left, next: s.next }, { total: 3, done: 1, left: 2, next: "1b" });
  });
  it("ritmo baixo: avisa com a conta", () => {
    const items = Array.from({ length: 100 }, (_, k) => String(k + 1));
    const done = Object.fromEntries(items.slice(0, 14).map((it, k) => [it, `2026-10-${String(12 + (k % 7)).padStart(2, "0")}`]));
    const p = examProgress([L({ items, done })], "2026-10-28", "2026-10-18");
    assert.equal(p.left, 86);
    assert.equal(p.perDay, 9);
    assert.deepEqual(p.pace, { days: 7, done: 14, perDay: 2 });
    assert.equal(p.warn, "Nos últimos 7 dias você fez 14 (2 por dia). Nesse ritmo, chega à prova com uns 66 por fazer.");
  });
  it("lista cadastrada há menos de 3 dias: não mede o ritmo (seria chute)", () => {
    const p = examProgress([L({ items: ["1", "2"], created_at: "2026-10-17T10:00:00Z" })], "2026-10-28", "2026-10-18");
    assert.equal(p.pace, null);
    assert.equal(p.warn, null);
    assert.equal(p.why, "Faltam 2 em 10 dias até a prova: 1 por dia.");
  });
  it("tudo feito", () => {
    const p = examProgress([L({ items: ["1"], done: { 1: "2026-10-18" } })], "2026-10-28", "2026-10-18");
    assert.equal(p.perDay, null);
    assert.match(p.why, /estão feitos/);
  });
});
