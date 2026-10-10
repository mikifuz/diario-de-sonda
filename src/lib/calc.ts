// Regras de cálculo puras: sem acesso a banco ou interface, cobertas por testes.
import type { Assessment, Scenario, Session, Subject } from "./types";

/* ============ Datas (fuso local do navegador) ============ */
export const pad = (n: number) => String(n).padStart(2, "0");
export const dkey = (d: Date | number | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const todayKey = () => dkey(Date.now());
export const keyDate = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const daysBetween = (a: string, b: string) => Math.round((keyDate(b).getTime() - keyDate(a).getTime()) / 864e5);
export const addDays = (k: string, n: number) => {
  const d = keyDate(k);
  d.setDate(d.getDate() + n);
  return dkey(d);
};
/** Segunda-feira da semana de k */
export const weekStartKey = (k: string) => {
  const d = keyDate(k);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dkey(d);
};

export type Period = "semana" | "mes" | "7" | "30" | "semestre" | "tudo";
export function periodRange(p: Period, today = todayKey()): [string, string] {
  if (p === "semana") return [weekStartKey(today), today];
  if (p === "mes") return [today.slice(0, 8) + "01", today];
  if (p === "7") return [addDays(today, -6), today];
  if (p === "30") return [addDays(today, -29), today];
  if (p === "semestre") return [addDays(today, -182), today];
  return ["0000-01-01", "9999-12-31"];
}
export const inRange = (s: Pick<Session, "started_at">, [a, b]: [string, string]) => {
  const k = dkey(s.started_at);
  return k >= a && k <= b;
};

/* ============ Formatação pt-BR ============ */
export const nf = (n: number | null | undefined, d = 1) =>
  n == null || isNaN(n) ? "–" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (v: number | null | undefined) => (v == null ? "–" : Math.round(v * 100) + "%");
export function fmtMin(m: number) {
  m = Math.round(m || 0);
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h ${pad(r)}min` : `${h}h`) : `${r}min`;
}
export function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
export function parseNum(v: unknown): number | null {
  if (v == null) return null;
  const t = String(v).trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return isNaN(n) ? null : n;
}

/* ============ Confiança × resultado ============ */
/** Acerto conferido (0–1): questões certas/feitas quando informado; senão o resultado declarado.
 *  "Ainda não conferi" e ausência de dados retornam null e não entram em médias. */
export function verified(s: Pick<Session, "questions" | "correct" | "result">): number | null {
  const q = Number(s.questions) || 0;
  if (q > 0 && s.correct != null) return Math.max(0, Math.min(1, Number(s.correct) / q));
  if (s.result === "certo") return 1;
  if (s.result === "parcial") return 0.5;
  if (s.result === "errado") return 0;
  return null;
}

export interface Stats {
  min: number; n: number;
  conf: number | null; confN: number;
  acc: number | null; accN: number;
  solo: number | null; auN: number;
}
export function stats(list: Session[]): Stats {
  let min = 0, cs = 0, cn = 0, as = 0, an = 0, solo = 0, auN = 0;
  for (const s of list) {
    min += Number(s.duration_min) || 0;
    if (s.confidence) { cs += s.confidence; cn++; }
    const v = verified(s);
    if (v != null) { as += v; an++; }
    if (s.autonomy) { auN++; if (s.autonomy === "sozinho") solo++; }
  }
  return { min, n: list.length, conf: cn ? cs / cn : null, confN: cn, acc: an ? as / an : null, accN: an, solo: auN ? solo / auN : null, auN };
}

export type SignalKind = "" | "ok" | "warn" | "bad" | "acc";
/** Leitura de um conteúdo com regras explícitas; confiança e resultado nunca se misturam. */
export function signal(st: Stats): { k: SignalKind; t: string; why: string } {
  if (!st.n) return { k: "", t: "Não estudado", why: "Nenhuma sessão registrada neste conteúdo." };
  if (st.accN < 2 || st.acc == null)
    return { k: "", t: "Poucos dados conferidos", why: `Há ${st.accN} resultado(s) conferido(s); são necessários pelo menos 2 para uma leitura.` };
  if (st.conf != null && st.conf >= 4 && st.acc < 0.6)
    return { k: "bad", t: "Confiança acima do resultado", why: `Confiança média ${nf(st.conf)} de 5, mas acerto conferido de ${pct(st.acc)}.` };
  if (st.conf != null && st.conf <= 2.5 && st.acc >= 0.8)
    return { k: "acc", t: "Resultado acima da confiança", why: `Acerto conferido de ${pct(st.acc)} com confiança média de ${nf(st.conf)} de 5.` };
  if (st.acc >= 0.8 && (st.solo == null || st.solo >= 0.5))
    return { k: "ok", t: "Bom resultado", why: `Acerto conferido de ${pct(st.acc)}${st.solo != null ? `, ${pct(st.solo)} resolvido sozinho` : ""}.` };
  if (st.acc < 0.5) return { k: "bad", t: "Revisar", why: `Acerto conferido de ${pct(st.acc)} em ${st.accN} registro(s).` };
  return { k: "warn", t: "Em desenvolvimento", why: `Acerto conferido de ${pct(st.acc)} em ${st.accN} registro(s).` };
}

/* ============ Médias ============ */
export interface GradeResult {
  W: number; Wk: number; Wr: number; Sk: number;
  min: number; max: number; nItems: number; nRem: number;
  partial: number | null;
  needed: number | null;
  final: number | null;
  proj: Record<Scenario, number | null>;
  exam: null | { wa: number; we: number; mf: number; minTake: number | null; base?: number; need?: number; eligible?: boolean };
}
const has = (v: number | null | undefined): v is number => v != null && !isNaN(Number(v));
const simOf = (a: Assessment, k: Scenario) => (k === "c" ? a.sim_c : k === "e" ? a.sim_e : a.sim_o);

/** Média ponderada Σ(peso × nota) ÷ Σpesos na escala 0–10.
 *  needed = média necessária nas avaliações sem nota para atingir a mínima. */
export function gradeCalc(sub: Pick<Subject, "min_avg" | "exam_enabled" | "exam_w_avg" | "exam_w_exam" | "exam_min_final" | "exam_min_take">, items: Assessment[], scen?: Scenario): GradeResult {
  const valid = items.filter((i) => Number(i.weight) > 0);
  const min = Number(sub.min_avg ?? 7), max = 10;
  const W = valid.reduce((a, i) => a + Number(i.weight), 0);
  const known = valid.filter((i) => has(i.grade));
  const Wk = known.reduce((a, i) => a + Number(i.weight), 0);
  const Sk = known.reduce((a, i) => a + Number(i.weight) * Number(i.grade), 0);
  const rem = valid.filter((i) => !has(i.grade));
  const Wr = W - Wk;
  const proj = (k: Scenario) => {
    if (!W) return null;
    let s = Sk;
    for (const i of rem) {
      const v = simOf(i, k);
      if (!has(v)) return null;
      s += Number(i.weight) * Number(v);
    }
    return s / W;
  };
  const r: GradeResult = {
    W, Wk, Wr, Sk, min, max, nItems: valid.length, nRem: rem.length,
    partial: Wk ? Sk / Wk : null,
    needed: Wr > 0 ? (min * W - Sk) / Wr : null,
    final: Wr === 0 && W ? Sk / W : null,
    proj: { c: proj("c"), e: proj("e"), o: proj("o") },
    exam: null,
  };
  if (sub.exam_enabled) {
    const wa = Number(sub.exam_w_avg) || 1, we = Number(sub.exam_w_exam) || 1, mf = Number(sub.exam_min_final ?? 5);
    const minTake = has(sub.exam_min_take) ? Number(sub.exam_min_take) : null;
    r.exam = { wa, we, mf, minTake };
    const base = r.final != null ? r.final : scen && r.proj[scen] != null ? r.proj[scen] : null;
    if (base != null && base < min) {
      r.exam.base = base;
      r.exam.need = (mf * (wa + we) - wa * base) / we;
      r.exam.eligible = minTake == null || base >= minTake;
    }
  }
  return r;
}

/* ============ Sala ============ */
export function streak(days: Record<string, number>, studyingNow: boolean, today = todayKey()) {
  let n = 0, k = today;
  if (!(days[k] > 0) && !studyingNow) k = addDays(k, -1);
  while (days[k] > 0 || (k === today && studyingNow)) { n++; k = addDays(k, -1); }
  return n;
}
