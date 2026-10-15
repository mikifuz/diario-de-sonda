import { test } from "node:test";
import assert from "node:assert/strict";
import { mistakeCats, mistakeText, mistakeTitle } from "./mistakes";

test("assinalar monta descrição e como evitar, sem digitar nada", () => {
  assert.equal(mistakeText([]), null);
  const r = mistakeText(["sinal", "aritmetico"])!;
  assert.equal(r.category, "aritmetico"); // segue a ordem da lista
  assert.equal(r.description, "Conta errada; Sinal trocado");
  assert.match(r.correction, /^Refazer as contas.*\. Desenhar o sistema de referência.*\.$/);
});

test("ao editar, volta o que estava assinalado (inclusive registros antigos escritos à mão)", () => {
  const r = mistakeText(["sinal", "unidade"])!;
  assert.deepEqual(mistakeCats(r), ["sinal", "unidade"]);
  assert.deepEqual(mistakeCats({ category: "conceitual", description: "esqueci o jacobiano" }), ["conceitual"]);
});

test("título da revisão diz o tipo de erro e onde", () => {
  assert.equal(mistakeTitle(["sinal", "aritmetico"], "Integrais de linha"), "Erro: aritmético e sinal · Integrais de linha");
  assert.equal(mistakeTitle(["tempo"], ""), "Erro: tempo insuficiente");
});
