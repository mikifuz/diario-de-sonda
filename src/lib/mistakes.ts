// Registro de erro sem digitar (pedido do dono): a pessoa só assinala o que aconteceu e o app
// monta a descrição e a dica de como evitar. Funções puras, testadas em mistakes.test.ts.
import { MISTAKE, MISTAKE_D } from "./constants";
import type { Mistake, MistakeCategory } from "./types";

/** Ordem da lista (do mais comum em exatas para o menos) */
export const MISTAKE_ORDER: MistakeCategory[] = ["conceitual", "formula", "metodo", "algebrico", "aritmetico", "sinal", "unidade", "interpretacao", "atencao", "tempo"];

/** Como evitar, por tipo de erro (vira a "correção" do registro) */
export const MISTAKE_FIX: Record<MistakeCategory, string> = {
  conceitual: "rever a teoria e um exemplo resolvido antes de voltar aos exercícios",
  algebrico: "fazer a álgebra passo a passo, sem pular etapas, e conferir cada linha",
  aritmetico: "refazer as contas no fim ou conferir com a calculadora",
  interpretacao: "ler o enunciado duas vezes e anotar o que é dado e o que é pedido",
  unidade: "escrever as unidades em cada passo e converter tudo para o SI antes de calcular",
  sinal: "desenhar o sistema de referência e conferir os sinais antes de substituir",
  formula: "anotar quando cada fórmula vale (hipóteses) e conferir antes de usar",
  metodo: "antes de começar, escrever o plano de resolução e conferir se responde ao que foi pedido",
  atencao: "resolver com calma e revisar a resposta no fim",
  tempo: "treinar com tempo marcado e começar pelas questões que você domina",
};

/** Lugares de onde o erro pode ter vindo (escolha, sem digitar) */
export const MISTAKE_SOURCES = ["Lista de exercícios", "Livro", "Prova antiga", "Prova", "Simulado", "Exemplo da aula"];

/** Assinalados → categoria principal, descrição e como evitar */
export function mistakeText(cats: MistakeCategory[]): { category: MistakeCategory; description: string; correction: string } | null {
  const sel = MISTAKE_ORDER.filter((c) => cats.includes(c));
  if (!sel.length) return null;
  return {
    category: sel[0],
    description: sel.map((c) => MISTAKE_D[c]).join("; "),
    correction: sel.map((c) => MISTAKE_FIX[c].charAt(0).toUpperCase() + MISTAKE_FIX[c].slice(1)).join(". ") + ".",
  };
}

/** O que estava assinalado num erro já salvo (a categoria e o que a descrição montada cita) */
export function mistakeCats(m: Pick<Mistake, "category" | "description">): MistakeCategory[] {
  const parts = m.description.split(";").map((x) => x.trim());
  return MISTAKE_ORDER.filter((c) => c === m.category || parts.includes(MISTAKE_D[c]));
}

/** Título da revisão do erro: "Erro de sinal e conta · Integrais de linha" */
export function mistakeTitle(cats: MistakeCategory[], where: string): string {
  const sel = MISTAKE_ORDER.filter((c) => cats.includes(c)).map((c) => MISTAKE[c].toLowerCase());
  const txt = sel.length <= 1 ? sel.join("") : `${sel.slice(0, -1).join(", ")} e ${sel[sel.length - 1]}`;
  return `Erro: ${txt}${where ? ` · ${where}` : ""}`;
}
