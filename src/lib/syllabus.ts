// Lê o cronograma de uma disciplina (Excel, Word, PDF ou texto colado) e transforma em
// aulas com data, provas e dias sem aula. Funções puras e testadas; abrir o arquivo
// fica em syllabusFile.ts. Nada é gravado sem a prévia ser confirmada.
import type { PdfItem } from "./siga";

/* ============ Linhas brutas (data + texto) ============ */
export interface RawRow { date: string | null; text: string; section: string | null }

const MONTHS: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);
// 04/08/2026 · 04/08/26 · 04/08 · 07.08 · 03/AGO
const DATE_RE = /(?<![\d/.])(\d{1,2})[/.](\d{1,2}|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:[/.](\d{4}|\d{2}))?(?![\d/]|\.\d)/gi;
const TIME_RE = /\b\d{1,2}\s*[:h]\s*\d{2}\s*(?:-|–|às|a)\s*\d{1,2}\s*[:h]\s*\d{2}\b|\b\d{1,2}:\d{2}\b/gi;
const WEEKDAY_RE = /\b(segunda|ter[cç]a|quarta|quinta|sexta)-feira\b|(?<![\wÀ-ú])(SEG|TER|QUA|QUI|SEX|SAB|SÁB|DOM)(?![\wÀ-ú])/gi;

/** Encontra uma data no texto; devolve a data ISO e o trecho encontrado */
export function findDate(text: string, year: number): { date: string; match: string } | null {
  for (const m of text.matchAll(DATE_RE)) {
    const d = Number(m[1]);
    const mon = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS[m[2].toLowerCase()];
    let y = year;
    if (m[3]) y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const date = iso(y, mon, d);
    if (date) return { date, match: m[0] };
  }
  return null;
}

/** Ano do cronograma: o que mais aparece em datas completas ou em "2026/2"; senão o ano dado */
export function guessYear(text: string, fallback: number): number {
  const count = new Map<number, number>();
  for (const m of text.matchAll(/\b(20\d{2})\s*\/\s*[12]\b|\b\d{1,2}\/\d{1,2}\/(20\d{2})\b/g)) {
    const y = Number(m[1] || m[2]);
    count.set(y, (count.get(y) || 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

/** Excel guarda datas como número de dias desde 30/12/1899 */
export const excelDate = (n: number) => {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** Tabela (Excel ou Word) → linhas. Usa o cabeçalho "Data" / "Conteúdo|Assunto|Atividades" quando existe. */
export function rowsFromTable(cells: string[][], year: number): RawRow[] {
  const isHead = (r: string[]) => r.some((c) => /^\s*data\s*$/i.test(c)) && r.some((c) => /conte[uú]do|assunto|atividade|t[oó]pico|tema/i.test(c));
  const hi = cells.findIndex(isHead);
  const head = hi >= 0 ? cells[hi] : null;
  const dateCol = head ? head.findIndex((c) => /^\s*data\s*$/i.test(c)) : -1;
  const textCol = head ? head.findIndex((c) => /conte[uú]do|assunto|atividade|t[oó]pico|tema/i.test(c)) : -1;
  const out: RawRow[] = [];
  for (const r of cells.slice(hi + 1)) {
    if (!r.some((c) => c && c.trim())) continue;
    let date: string | null = null;
    const dc = dateCol >= 0 ? (r[dateCol] || "").trim() : "";
    if (/^\d{5}(\.\d+)?$/.test(dc)) date = excelDate(Number(dc));
    else if (dc) date = findDate(dc, year)?.date ?? null;
    if (!date && dateCol < 0) for (const c of r) { const f = /^\d{5}$/.test(c.trim()) ? excelDate(Number(c)) : findDate(c, year)?.date; if (f) { date = f; break; } }
    const text = textCol >= 0 ? (r[textCol] || "") : [...r].filter((c) => !findDate(c, year)).sort((a, b) => b.length - a.length)[0] || "";
    if (text.trim()) out.push({ date, text: clean(text), section: null });
  }
  return out;
}

/** PDF → linhas: junta os pedaços de texto por altura, acha a data de cada linha e
 *  junta as linhas de continuação à aula certa (acima ou abaixo da data, como na tabela). */
export function rowsFromPdf(items: PdfItem[], year: number): RawRow[] {
  const out: RawRow[] = [];
  let section: string | null = null;
  for (const page of [...new Set(items.map((i) => i.p))]) {
    const built = pdfLines(items.filter((i) => i.p === page));
    type Row = RawRow & { y: number; own: boolean; extra: { y: number; t: string }[] };
    const rows: Row[] = [];
    const loose: { y: number; t: string }[] = [];
    const heads: { y: number; t: string }[] = [];
    for (const l of built) {
      if (isHeader(l.text)) continue;
      const f = findDate(l.text, year);
      if (f) {
        const rest = stripRow(l.text.replace(f.match, " "));
        rows.push({ date: f.date, text: rest, section: null, y: l.y, own: !!rest, extra: [] });
      } else if (isHeading(l.text)) { if (!DOC_HEAD.test(l.text)) heads.push({ y: l.y, t: l.text }); }
      else loose.push({ y: l.y, t: stripRow(l.text) });
    }
    if (!rows.length) continue;
    const gap = median(rows.slice(1).map((r, i) => rows[i].y - r.y)) || 14;
    for (const l of loose) {
      if (!l.t) continue;
      const below = rows.find((r) => r.y < l.y), above = [...rows].reverse().find((r) => r.y > l.y);
      const dA = above ? above.y - l.y : Infinity, dB = below ? l.y - below.y : Infinity;
      if (Math.min(dA, dB) > gap * 1.2) continue; // longe da tabela (ementa, rodapé…)
      let to: Row | undefined;
      if (above && /^[a-zà-ú(]/.test(l.t) && dA <= gap * 1.2) to = above; // continuação de frase
      else if (above && below && !above.own !== !below.own && Math.abs(dA - dB) < gap * 0.6) to = !above.own ? above : below; // célula centralizada
      else to = dA < dB ? above : below;
      to?.extra.push({ y: l.y, t: l.t });
    }
    let prevY = rows[0].y + gap * 2.5;
    const lastY = rows[rows.length - 1].y;
    for (const r of rows) {
      // título de seção entre a linha anterior e esta (ou logo acima da primeira)
      const sec = heads.filter((h) => h.y < prevY && h.y > r.y).sort((a, b) => a.y - b.y)[0];
      if (sec) section = sentence(sec.t);
      prevY = r.y;
      const all = [...r.extra, ...(r.text ? [{ y: r.y, t: r.text }] : [])].sort((a, b) => b.y - a.y).map((x) => x.t);
      out.push({ date: r.date, text: clean(all.join(" ")), section });
    }
    // título no pé da página vale para as linhas da página seguinte
    const tail = heads.filter((h) => h.y < lastY && h.y > lastY - gap * 2.5).sort((a, b) => b.y - a.y)[0];
    if (tail) section = sentence(tail.t);
  }
  // datas soltas fora do período do cronograma (ex.: bibliografia) ficam de fora
  const ds = out.map((r) => r.date!).sort();
  const mid = ds[Math.floor(ds.length / 2)];
  return mid ? out.filter((r) => Math.abs(new Date(r.date!).getTime() - new Date(mid).getTime()) < 200 * 864e5) : out;
}

/** Junta os pedaços de texto do PDF em linhas (de cima para baixo) */
function pdfLines(items: PdfItem[]): { y: number; text: string }[] {
  const groups: { y: number; parts: PdfItem[] }[] = [];
  for (const it of items) {
    const g = groups.find((x) => Math.abs(x.y - it.y) <= 2);
    if (g) g.parts.push(it); else groups.push({ y: it.y, parts: [it] });
  }
  return groups.map((g) => {
    let s = "", end = -1e9;
    for (const p of g.parts.sort((a, b) => a.x - b.x)) { s += (s && p.x - end > 1.5 ? " " : "") + p.s; end = p.x + p.w; }
    return { y: g.y, text: s.replace(/\s+/g, " ").trim() };
  }).sort((a, b) => b.y - a.y);
}

/** Texto do PDF linha a linha (para achar o ano do cronograma) */
export function pdfText(items: PdfItem[]): string {
  return [...new Set(items.map((i) => i.p))].flatMap((p) => pdfLines(items.filter((i) => i.p === p)).map((l) => l.text)).join("\n");
}

/** Texto do Word sem marcação (para achar o ano) */
export const docxText = (xml: string) => (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map((p) => [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("")).join("\n");

/** Texto colado: uma aula por linha, com a data em algum lugar da linha */
export function rowsFromText(text: string, year: number): RawRow[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).flatMap((l) => {
    const f = findDate(l, year);
    if (!f) return [];
    const t = stripRow(l.replace(f.match, " ")).replace(/^[\s\-–—:|]+/, "");
    return t ? [{ date: f.date, text: clean(t), section: null }] : [];
  });
}

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
/** tira número da aula, dia da semana, horário e carga horária que ficam em volta do conteúdo */
function stripRow(s: string) {
  let t = s.replace(TIME_RE, " ").replace(WEEKDAY_RE, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^(?:\d{1,2}(?:\/\d{1,2})?(?:\s+|$))+/, "");
  return t.trim();
}
const isHeading = (s: string) => s.length > 3 && /[A-ZÀ-Ú]{3}/.test(s) && !/[a-zà-ú]/.test(s) && !/\d/.test(s);
/** linha de cabeçalho da tabela ("Aula Data Conteúdo…") */
const isHeader = (s: string) => /\bdata\b/i.test(s) && /conte[uú]do|assunto|atividade/i.test(s);
/** títulos de seção do documento que não são assuntos */
const DOC_HEAD = /cronograma|ementa|objetivo|bibliografia|metodologia|avalia[cç][aã]o|plano de ensino|universidade|crit[eé]rio|refer[eê]ncias/i;
const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
function median(xs: number[]) { const a = xs.filter((x) => x > 0).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : 0; }

/* ============ Classificação ============ */
export type EntryKind = "aula" | "prova" | "sub" | "trabalho" | "exercicios" | "sem_aula";
export const KIND_LABEL: Record<EntryKind, string> = { aula: "Conteúdo", prova: "Prova", sub: "SUB", trabalho: "Trabalho", exercicios: "Exercícios/revisão", sem_aula: "Sem aula" };
export interface Entry { date: string; raw: string; kind: EntryKind; name: string; parent: string | null; weight: number | null }

const ADMIN = /apresenta[cç][aã]o da disciplinas?|plano de ensino|cronograma|revis[aã]o de (matem[aá]tica b[aá]sica|conceitos b[aá]sicos)|conceitos b[aá]sicos/gi;
const NO_CLASS = /feriado|recesso|n[aã]o haver[aá]|sem aula|reuni[aã]o|consuni|finaliza[cç][aã]o das notas|exames finais|semana acad[eê]mica/i;
const SUB_RE = /\bsub\b|substitutiva|subsitutiva/i;
const EXAM_RE = /\bavalia[cç][aã]o\b|\bprova\b|^\s*[pa]\s?\d\b|\bexame\b/i;
const WORK_RE = /trabalho final|apresenta[cç][aã]o do trabalho|entrega d[oe]|semin[aá]rio/i;
const EXERC_RE = /^(aula de |resolu[cç][aã]o de |lista de )?exerc[ií]cios\.?$|^d[uú]vidas|recupera[cç][aã]o de aprendizagem|^revis[aã]o\b/i;

/** "1ª AVALIAÇÃO – EQUILÍBRIO – PESO 2" → nome legível e peso */
function examName(s: string) {
  const w = s.match(/peso\s*(\d+(?:[.,]\d+)?)/i);
  let n = s.replace(/[–\-—]?\s*peso\s*\d+(?:[.,]\d+)?/i, "").replace(/\s+[–\-—]\s*$/, "").trim();
  if (!/[a-zà-ú]/.test(n) && n.length > 5) n = sentence(n);
  return { name: n.slice(0, 120), weight: w ? Number(w[1].replace(",", ".")) : null };
}

export function classify(rows: RawRow[]): Entry[] {
  const out: Entry[] = [];
  for (const r of rows) {
    if (!r.date) continue;
    const raw = r.text;
    if (!raw) continue;
    if (NO_CLASS.test(raw)) { out.push({ date: r.date, raw, kind: "sem_aula", name: raw, parent: null, weight: null }); continue; }
    if (SUB_RE.test(raw)) { const e = examName(raw); out.push({ date: r.date, raw, kind: "sub", name: e.name, parent: null, weight: null }); continue; }
    if (EXAM_RE.test(raw)) { const e = examName(raw); out.push({ date: r.date, raw, kind: "prova", name: e.name, parent: null, weight: e.weight }); continue; }
    if (WORK_RE.test(raw)) { const e = examName(raw); out.push({ date: r.date, raw, kind: "trabalho", name: e.name, parent: null, weight: e.weight }); continue; }
    let t = raw.replace(ADMIN, " ").replace(/^[\s/.,;:\-–]+|[\s/,;:\-–]+$/g, "").replace(/\s*\/\s*\/\s*/g, " / ").replace(/^\s*\/\s*/, "").trim();
    t = t.replace(/^unidade\s*\d+\s*[:\-–]\s*/i, "");
    if (!t || /^[./\s]*$/.test(t)) continue; // só apresentação da disciplina
    t = t.replace(/^(?:e|de|da|do|[/.,;\s])+(?=\s|$)/i, "").trim();
    if (!t) continue;
    let parent: string | null = r.section;
    // "Oscilações: Pêndulo simples" → conteúdo dentro de "Oscilações" (quando o documento não tem seções próprias)
    const c = r.section ? null : t.match(/^([^:]{2,60}):\s*(.+)$/);
    if (c) { parent = c[1].trim(); t = c[2].trim(); }
    t = t.replace(/\((continua[cç][aã]o|parte \d+)\)/gi, "").replace(/[\s.]+$/, "").trim();
    if (/^continua[cç][aã]o\.?$/i.test(t)) {
      // "Continuação": mais uma aula do último conteúdo (do mesmo assunto, se houver)
      const prev = [...out].reverse().find((e) => e.kind === "aula" && (!parent || e.parent === parent));
      if (prev) out.push({ ...prev, date: r.date, raw });
      continue;
    }
    const kind: EntryKind = EXERC_RE.test(t) ? "exercicios" : "aula";
    if (!/[a-zà-ú]/.test(t) && t.length > 4) t = sentence(t);
    out.push({ date: r.date, raw, kind, name: t.slice(0, 200), parent: parent ? parent.slice(0, 120) : null, weight: null });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ============ Plano de importação ============ */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export interface PlanTopic { key: string; name: string; parent: string | null; first: string; dates: string[]; exam: string | null }
export interface PlanExam { key: string; name: string; kind: "prova" | "sub" | "trabalho"; date: string; weight: number | null }

/** Conteúdos únicos (com a primeira data e a prova seguinte) e avaliações únicas */
export function buildPlan(entries: Entry[]): { topics: PlanTopic[]; exams: PlanExam[] } {
  const exams: PlanExam[] = [];
  for (const e of entries) {
    if (e.kind !== "prova" && e.kind !== "sub" && e.kind !== "trabalho") continue;
    const key = norm(e.name);
    if (!exams.some((x) => x.key === key)) exams.push({ key, name: e.name, kind: e.kind, date: e.date, weight: e.weight });
  }
  const provas = exams.filter((x) => x.kind === "prova").sort((a, b) => a.date.localeCompare(b.date));
  const topics: PlanTopic[] = [];
  for (const e of entries) {
    if (e.kind !== "aula") continue;
    const key = `${norm(e.parent || "")}|${norm(e.name)}`;
    const t = topics.find((x) => x.key === key);
    if (t) { t.dates.push(e.date); continue; }
    topics.push({ key, name: e.name, parent: e.parent, first: e.date, dates: [e.date], exam: provas.find((p) => p.date >= e.date)?.key ?? null });
  }
  return { topics, exams };
}

/* ============ Arquivos compactados (Excel e Word) ============ */
const xmlText = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Planilha do Excel (XML da aba + textos compartilhados) → células */
export function xlsxCells(sheetXml: string, sharedXml: string): string[][] {
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, "")));
  const col = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  return [...sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/r="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const t = c[1].match(/t="(\w+)"/)?.[1];
      const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const inline = c[2]?.match(/<is>([\s\S]*?)<\/is>/)?.[1];
      row[col(ref)] = inline != null ? xmlText(inline) : t === "s" ? shared[Number(v)] ?? "" : xmlText(v);
    }
    return Array.from(row, (x) => x ?? "");
  });
}

/** Documento do Word (XML) → células de todas as tabelas */
export function docxCells(docXml: string): string[][] {
  const out: string[][] = [];
  for (const tbl of docXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [])
    for (const tr of tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [])
      out.push((tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map((tc) =>
        (tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map((p) => [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("")).join(" ").trim()));
  return out;
}
