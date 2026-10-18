// Progresso pré-prova: listas de exercícios ligadas a uma prova, cada exercício um quadradinho.
// Lê a lista do professor (PDF com texto) e conta as questões sem IA: "Questão 1.", "1.", "1)" e as
// letras a), b), c)… de cada questão (cada letra = um exercício; questão sem letra = um exercício).
import type { PdfItem } from "./siga";
import type { ExerciseList } from "./types";
import { addDays, daysBetween } from "./calc";

/** Uma questão da lista: número e quantas partes (letras) ela tem; 1 = sem letras */
export interface Question { n: string; parts: number }
export interface ParsedList { name: string; questions: Question[] }

/** Máximo de exercícios numa lista (o banco também limita) */
export const MAX_ITEMS = 400;
export const MAX_PARTS = 26;

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
/** "Questão 3.", "Exercício 3", "Problema 3" */
const WORD_Q = /^\s*(?:Quest(?:ão|ao|ões)|Exerc[ií]cio|Problema|Ex\.)\s*(\d{1,3})\b/i;
/** "3.", "3)", "3 -" no começo da linha (o número não pode ser seguido de outro algarismo ou de vírgula: "1, 5t²") */
const NUM_Q = /^\s*(\d{1,3})\s*(?:[.)]|\s[-–])(?!\d)/;
const LETTER = /^\s*\(?([a-z])\)/;
const ACCENT: Record<string, string> = { "´": "́", "`": "̀", "ˆ": "̂", "˜": "̃", "¨": "̈", "¸": "̧" };

/** Junta os acentos que o LaTeX separa da letra ("F´ısica" → "Física", "Educa¸c˜ao" → "Educação") */
export function fixAccents(s: string): string {
  return s.replace(/([´`ˆ˜¨¸])\s*([a-zA-Zı])/g, (_, a: string, b: string) => (b === "ı" ? "i" : b) + ACCENT[a]).normalize("NFC");
}

/** Nome a partir do arquivo: "Lista_2___Calc_III.pdf" → "Lista 2 Calc III" */
export function nameFromFile(file: string): string {
  return file.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").replace(/\s*-\s*/g, " - ").replace(/\s+/g, " ").trim().slice(0, 120) || "Lista";
}

/** Colunas da página: onde começam as questões ("Questão N" ou "N."), alinhadas em pelo menos duas */
function columnStarts(items: PdfItem[]): number[] {
  const xs = items.filter((i) => WORD_Q.test(i.s) || /^\s*\d{1,3}\.(?!\d)/.test(i.s)).map((i) => i.x).sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const x of xs) {
    const g = groups[groups.length - 1];
    if (g && x - g[g.length - 1] <= 15) g.push(x); else groups.push([x]);
  }
  const starts = groups.filter((g) => g.length >= 2).map((g) => g[0]);
  return starts.length ? starts : [Math.min(...items.map((i) => i.x))];
}

/** Lê os itens de texto do PDF (pdf.js) e devolve o nome da lista e as questões com as letras */
export function parseListPdf(items: PdfItem[], fileName = ""): ParsedList {
  const all = items.filter((i) => i.s.trim());
  if (!all.length) return { name: nameFromFile(fileName), questions: [] };
  const starts = columnStarts(all);
  const colOf = (x: number) => { let c = 0; starts.forEach((s, k) => { if (x >= s - 10) c = k; }); return c; };
  const ordered = all.map((i) => ({ ...i, c: colOf(i.x) }))
    .sort((a, b) => a.p - b.p || a.c - b.c || b.y - a.y || a.x - b.x);
  const near = (i: { x: number; c: number }, tol: number) => i.x >= starts[i.c] - 8 && i.x <= starts[i.c] + tol;

  // números de questão candidatos, na ordem de leitura; fica a maior sequência 1, 2, 3… (descarta "50." solto no meio do texto)
  const cands: { idx: number; n: number }[] = [];
  ordered.forEach((i, idx) => {
    const m = i.s.match(WORD_Q) || (near(i, 30) ? i.s.match(NUM_Q) : null);
    if (m && near(i, 30)) cands.push({ idx, n: Number(m[1]) });
  });
  const best: number[] = cands.map(() => 1);
  const prev: number[] = cands.map(() => -1);
  cands.forEach((c, k) => {
    for (let j = 0; j < k; j++) {
      if (cands[j].n === c.n - 1 && best[j] + 1 > best[k]) { best[k] = best[j] + 1; prev[k] = j; }
    }
  });
  let end = -1;
  // a maior sequência; empate: a que começa no 1
  cands.forEach((c, k) => {
    if (end < 0 || best[k] > best[end] || (best[k] === best[end] && c.n - best[k] + 1 === 1 && cands[end].n - best[end] + 1 !== 1)) end = k;
  });
  const chain: { idx: number; n: number }[] = [];
  for (let k = end; k >= 0; k = prev[k]) chain.unshift(cands[k]);

  // letras a), b), c)… no começo da linha, em sequência, entre uma questão e a seguinte
  const questions: Question[] = chain.map((q, k) => {
    const stop = k + 1 < chain.length ? chain[k + 1].idx : ordered.length;
    let parts = 0;
    for (let i = q.idx + 1; i < stop; i++) {
      const m = near(ordered[i], 40) ? ordered[i].s.match(LETTER) : null;
      if (m && m[1] === LETTERS[parts]) parts++;
    }
    return { n: String(q.n), parts: Math.max(1, parts) };
  });

  // nome: a linha mais alta da 1ª página que fala em "Lista"; senão, o nome do arquivo
  const first = all.filter((i) => i.p === Math.min(...all.map((x) => x.p)));
  const title = first.filter((i) => /lista/i.test(i.s)).sort((a, b) => b.y - a.y)[0];
  let name = "";
  if (title) {
    const line = first.filter((i) => Math.abs(i.y - title.y) <= 2).sort((a, b) => a.x - b.x);
    name = fixAccents(line.map((i, k) => (k && i.x - (line[k - 1].x + line[k - 1].w) > 2 ? " " : "") + i.s).join(""))
      .replace(/\s+/g, " ").trim();
  }
  return { name: (name || nameFromFile(fileName)).slice(0, 120), questions };
}

/** Os exercícios (quadradinhos) de cada questão: "1a", "1b"… ou só "6" quando não tem letras */
export function labelsOf(q: Question): string[] {
  return q.parts <= 1 ? [q.n] : Array.from({ length: Math.min(q.parts, MAX_PARTS) }, (_, k) => q.n + LETTERS[k]);
}
export const itemsOf = (qs: Question[]) => qs.flatMap(labelsOf).slice(0, MAX_ITEMS);

/** Volta dos rótulos para as questões (para editar uma lista já salva) */
export function questionsOf(items: string[]): Question[] {
  const out: Question[] = [];
  for (const it of items) {
    const m = it.match(/^(\d+)([a-z])$/);
    const n = m ? m[1] : it;
    const last = out[out.length - 1];
    if (m && last?.n === n) last.parts++;
    else out.push({ n, parts: 1 });
  }
  return out;
}

/** "Livro: 50 exercícios", sem questão com nome: quadradinhos 1 a N */
export const plainQuestions = (total: number): Question[] =>
  Array.from({ length: Math.max(1, Math.min(MAX_ITEMS, Math.round(total))) }, (_, k) => ({ n: String(k + 1), parts: 1 }));

export interface ListStats { total: number; done: number; left: number; pct: number; next: string | null }
export function listStats(l: ExerciseList): ListStats {
  const total = l.items.length;
  const done = l.items.filter((it) => l.done[it]).length;
  return { total, done, left: total - done, pct: total ? done / total : 0, next: l.items.find((it) => !l.done[it]) ?? null };
}

export interface ExamProgress {
  total: number; done: number; left: number; pct: number;
  /** exercícios por dia para terminar até a véspera (null = já terminou ou a prova é hoje) */
  perDay: number | null;
  /** ritmo dos últimos dias (null = poucos dias de lista para medir) */
  pace: { days: number; done: number; perDay: number } | null;
  /** frase de aviso quando o ritmo não chega lá, sempre com a conta */
  warn: string | null;
  why: string;
}

const PACE_DAYS = 7;
/** dias mínimos de lista cadastrada para medir o ritmo (antes disso, a conta enganaria) */
const PACE_MIN = 3;
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("pt-BR");

/** Progresso das listas de uma prova: total, quanto falta por dia e o ritmo dos últimos dias */
export function examProgress(lists: ExerciseList[], examDate: string, today: string): ExamProgress {
  const total = lists.reduce((s, l) => s + l.items.length, 0);
  const done = lists.reduce((s, l) => s + listStats(l).done, 0);
  const left = total - done;
  const days = daysBetween(today, examDate);
  const perDay = left > 0 && days > 0 ? Math.ceil(left / days) : null;
  // ritmo: só com dias marcados de verdade, desde que a primeira lista existe (até 7 dias)
  const created = lists.map((l) => (l.created_at || "").slice(0, 10)).filter(Boolean).sort()[0] || today;
  const window = Math.min(PACE_DAYS, daysBetween(created, today) + 1);
  const from = addDays(today, -(window - 1));
  const recent = lists.reduce((s, l) => s + Object.values(l.done).filter((d) => d >= from && d <= today).length, 0);
  const pace = window >= PACE_MIN ? { days: window, done: recent, perDay: recent / window } : null;
  let warn: string | null = null;
  if (pace && perDay && pace.perDay < perDay) {
    const short = Math.max(0, Math.round(left - pace.perDay * days));
    warn = `Nos últimos ${window} dias você fez ${recent} (${fmt1(pace.perDay)} por dia). Nesse ritmo, chega à prova com uns ${short} por fazer.`;
  }
  const why = left === 0 ? "Todos os exercícios cadastrados para esta prova estão feitos."
    : days <= 0 ? `Faltam ${left}; a prova é hoje.`
    : `Faltam ${left} em ${days} ${days === 1 ? "dia" : "dias"} até a prova: ${perDay} por dia.`;
  return { total, done, left, pct: total ? done / total : 0, perDay, pace, warn, why };
}
