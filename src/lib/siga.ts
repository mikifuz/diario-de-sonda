// Lê o "Comprovante de matrícula" do SIGA (UDESC) a partir do texto do PDF, com as
// posições de cada trecho. Função pura e testada; a extração do PDF fica em sigaPdf.ts.
// Nada é presumido: o que não for reconhecido vira aviso para a pessoa conferir.

export interface PdfItem { p: number; s: string; x: number; y: number; w: number }
export interface SigaSubject { code: string; name: string; hours: number | null; credits: number | null }
export interface SigaClass { code: string; weekday: number; start: string; end: string; label: string }
export interface SigaResult { period: string | null; subjects: SigaSubject[]; classes: SigaClass[]; warnings: string[] }

const DAYS: [RegExp, number][] = [[/^domingo/i, 0], [/^segunda/i, 1], [/^ter[cç]a/i, 2], [/^quarta/i, 3], [/^quinta/i, 4], [/^sexta/i, 5], [/^s[aá]bado/i, 6]];
const TIME = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/;
const CODE = /^[0-9][A-Z0-9]{3,}$/;
const EXTRA = /^(te[oó]rica|pr[aá]tica)$/i;
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const cx = (i: PdfItem) => i.x + i.w / 2;
/** Intervalo máximo entre dois horários seguidos da mesma disciplina para virarem um bloco só */
const JOIN_GAP = 20;

export function parseSiga(items: PdfItem[]): SigaResult {
  const warnings: string[] = [];
  const all = items.filter((i) => i.s.trim()).map((i) => ({ ...i, s: i.s.trim() }));
  const period = all.map((i) => i.s.match(/COMPROVANTE DE MATR[IÍ]CULA\s+(\d{4}\/\d)/i)?.[1]).find(Boolean) || null;

  // ---- tabela de disciplinas (página 1, entre o cabeçalho "Código" e "TOTAL")
  const p1 = all.filter((i) => i.p === 1);
  const head = p1.find((i) => /^c[oó]digo$/i.test(i.s));
  const total = p1.find((i) => /^total$/i.test(i.s));
  const ch = p1.find((i) => /^c\.?h\.?$/i.test(i.s));
  const cred = p1.find((i) => /^cr[eé]ditos$/i.test(i.s));
  const turma = p1.find((i) => /^turma$/i.test(i.s));
  const subjects: SigaSubject[] = [];
  if (head && total) {
    const rows = p1.filter((i) => i.y < head.y - 2 && i.y > total.y + 2 && CODE.test(i.s) && Math.abs(cx(i) - cx(head)) < 40);
    for (const r of rows) {
      const line = p1.filter((i) => Math.abs(i.y - r.y) <= 3 && i !== r);
      const near = (h: PdfItem | undefined) => (h ? line.filter((i) => Math.abs(cx(i) - cx(h)) < 25 && /^\d+$/.test(i.s))[0] : undefined);
      // descrição: o texto à direita do código e antes da coluna "Turma"
      const name = line.filter((i) => i.x > r.x + r.w && (!turma || i.x < turma.x - 20) && !/^\d+$/.test(i.s)).sort((a, b) => a.x - b.x).map((i) => i.s).join(" ").trim();
      if (!name) { warnings.push(`Não encontrei o nome da disciplina de código ${r.s}.`); continue; }
      subjects.push({ code: r.s, name, hours: near(ch) ? Number(near(ch)!.s) : null, credits: near(cred) ? Number(near(cred)!.s) : null });
    }
  }
  if (!subjects.length) warnings.push("Não encontrei a tabela de disciplinas. Confira se o arquivo é o comprovante de matrícula do SIGA.");

  // ---- grade de horários (só a página onde estão os horários)
  const classes: SigaClass[] = [];
  const cells: { code: string; weekday: number; start: string; end: string; label: string }[] = [];
  for (const page of [...new Set(all.map((i) => i.p))]) {
    const pg = all.filter((i) => i.p === page);
    const cols = pg.flatMap((i) => { const d = DAYS.find(([re]) => re.test(i.s)); return d ? [{ wd: d[1], c: cx(i), y: i.y }] : []; });
    const times = pg.flatMap((i) => { const m = i.s.match(TIME); return m ? [{ start: m[1], end: m[2], y: i.y }] : []; });
    if (cols.length < 5 || !times.length) continue;
    const headY = Math.min(...cols.map((c) => c.y));
    const codes = pg.filter((i) => CODE.test(i.s) && i.y < headY);
    const colOf = (i: PdfItem) => cols.reduce((b, c) => (Math.abs(c.c - cx(i)) < Math.abs(b.c - cx(i)) ? c : b));
    for (const c of codes) {
      // a célula vai do topo até a linha do horário (o rótulo do horário fica no meio da célula)
      const row = times.filter((t) => t.y <= c.y + 3).sort((a, b) => b.y - a.y)[0];
      if (!row) continue;
      const col = colOf(c);
      // sala: linhas abaixo do código, na mesma coluna, até o próximo código
      const below = codes.filter((o) => colOf(o) === col && o.y < c.y - 3).sort((a, b) => b.y - a.y)[0];
      const floor = Math.max(c.y - 45, below ? below.y + 3 : -Infinity);
      const lines = pg.filter((i) => i !== c && colOf(i) === col && i.y < c.y - 3 && i.y > floor && !CODE.test(i.s) && !TIME.test(i.s))
        .sort((a, b) => b.y - a.y).map((i) => i.s);
      const kind = lines.find((l) => EXTRA.test(l));
      const room = lines.filter((l) => !EXTRA.test(l)).join(" ").replace(/\s+-\s*$/, "").replace(/\s+/g, " ").trim();
      cells.push({ code: c.s, weekday: col.wd, start: row.start, end: row.end, label: [room, kind ? `(${kind.toLowerCase()})` : ""].filter(Boolean).join(" ").slice(0, 80) });
    }
  }
  // horários seguidos da mesma disciplina no mesmo dia viram um bloco só
  const key = (c: { code: string; weekday: number }) => `${c.weekday}|${c.code}`;
  const groups = new Map<string, typeof cells>();
  for (const c of cells) groups.set(key(c), [...(groups.get(key(c)) || []), c]);
  for (const g of groups.values()) {
    g.sort((a, b) => toMin(a.start) - toMin(b.start));
    for (const c of g) {
      const last = classes[classes.length - 1];
      if (last && key(last) === key(c) && toMin(c.start) - toMin(last.end) <= JOIN_GAP && toMin(c.start) >= toMin(last.start)) {
        if (toMin(c.end) > toMin(last.end)) last.end = c.end;
        if (!last.label && c.label) last.label = c.label;
      } else classes.push({ ...c });
    }
  }
  classes.sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || toMin(a.start) - toMin(b.start));
  if (subjects.length && !classes.length) warnings.push("Não encontrei a grade de horários no arquivo.");

  // códigos da grade costumam vir completos e os da tabela, cortados (ex.: 3LINGPROGI72 × 3LINGPROGI)
  for (const c of classes) {
    const s = matchSubject(subjects, c.code);
    if (!s) warnings.push(`O horário de ${c.code} não corresponde a nenhuma disciplina da tabela; ele não será importado.`);
    else if (c.code.length > s.code.length) s.code = c.code;
  }
  return { period, subjects, classes: classes.filter((c) => matchSubject(subjects, c.code)), warnings: [...new Set(warnings)] };
}

export function matchSubject<T extends { code: string }>(subjects: T[], code: string): T | undefined {
  return subjects.find((s) => s.code === code) || subjects.find((s) => code.startsWith(s.code) || s.code.startsWith(code));
}

/** Compara nomes sem acento, caixa ou espaços extras */
export const sameName = (a: string, b: string) => {
  const n = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return n(a) === n(b);
};
