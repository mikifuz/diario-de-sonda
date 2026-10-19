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
/** Quantidade com singular/plural certo: qt(1, "sessão", "sessões") → "1 sessão" */
export const qt = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
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

/* ============ Sessões ============ */
export interface Stats { min: number; n: number }
export function stats(list: Session[]): Stats {
  let min = 0;
  for (const s of list) min += Number(s.duration_min) || 0;
  return { min, n: list.length };
}

/* ============ Médias ============ */
export interface SubResult {
  id: string;
  name: string;
  /** provas marcadas com esta SUB */
  covered: number;
  /** prova de menor nota (entre as marcadas), a que a SUB substituiria */
  target: { id: string; name: string; value: number; weight: number } | null;
  /** média sem a SUB (final, ou projeção do cenário) */
  base: number | null;
  /** nota necessária na SUB para chegar à média mínima */
  need: number | null;
  /** nota da SUB (oficial ou simulada) */
  value: number | null;
  official: boolean;
  replaced: boolean;
  /** média com a SUB aplicada */
  final: number | null;
}
export interface GradeResult {
  W: number; Wk: number; Wr: number; Sk: number;
  min: number; max: number; nItems: number; nRem: number;
  partial: number | null;
  needed: number | null;
  final: number | null;
  proj: Record<Scenario, number | null>;
  exam: null | { wa: number; we: number; mf: number; minTake: number | null; base?: number; need?: number; eligible?: boolean };
  /** primeira SUB (atalho) e todas as SUBs da disciplina */
  sub: SubResult | null;
  subs: SubResult[];
  /** média com todas as SUBs que têm nota (oficial ou simulada) aplicadas */
  subFinal: number | null;
  subOfficial: boolean;
  /** conta com a simulação do cenário: nota oficial onde já tem, simulada onde não tem.
   *  needed = quanto precisa (média) nas que ainda não têm nem nota nem simulação; avg = média quando todas têm */
  sim: null | { simulated: string[]; left: string[]; needed: number | null; avg: number | null };
}
const has = (v: number | null | undefined): v is number => v != null && !isNaN(Number(v));
const simOf = (a: Assessment, k: Scenario) => (k === "c" ? a.sim_c : k === "e" ? a.sim_e : a.sim_o);

/** Provas e SUBs com nota lançada antes da data (ainda não aconteceram): quase sempre é palpite
 *  digitado em "Nota" em vez de "Simul.". O app trata nota como prova feita, então elas somem do plano. */
export const earlyGrades = (items: Assessment[], today: string) =>
  items.filter((a) => (a.kind === "prova" || a.kind === "sub") && has(a.grade) && a.status !== "cancelado" && !!a.date && a.date > today);

/** Tira a nota de uma prova que ainda não aconteceu: o palpite vira simulação (nos cenários vazios); 0 só é apagado */
export const gradeToSim = (a: Assessment): Assessment => {
  const g = Number(a.grade) > 0 ? Number(a.grade) : null;
  return { ...a, grade: null, status: "pendente", sim_c: a.sim_c ?? g, sim_e: a.sim_e ?? g, sim_o: a.sim_o ?? g };
};

type GradeRules = Pick<Subject, "min_avg" | "recovery" | "sub_replace_lower" | "exam_w_avg" | "exam_w_exam" | "exam_min_final" | "exam_min_take">;

/** Média ponderada Σ(peso × nota) ÷ Σpesos na escala 0–10.
 *  needed = média necessária nas avaliações sem nota para atingir a mínima.
 *  A SUB não entra nos pesos: ela substitui a menor nota entre as provas. */
export function gradeCalc(sub: GradeRules, items: Assessment[], scen?: Scenario): GradeResult {
  const valid = items.filter((i) => i.kind !== "sub" && Number(i.weight) > 0);
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
    sub: null,
    subs: [],
    subFinal: null,
    subOfficial: false,
    sim: null,
  };
  if (scen && rem.length) {
    const simd = rem.filter((i) => has(simOf(i, scen)));
    const left = rem.filter((i) => !has(simOf(i, scen)));
    const S = Sk + simd.reduce((a, i) => a + Number(i.weight) * Number(simOf(i, scen)), 0);
    const Wl = left.reduce((a, i) => a + Number(i.weight), 0);
    if (simd.length) r.sim = { simulated: simd.map((i) => i.name), left: left.map((i) => i.name), needed: Wl > 0 ? (min * W - S) / Wl : null, avg: Wl === 0 ? S / W : null };
  }
  const base = r.final != null ? r.final : scen && r.proj[scen] != null ? r.proj[scen] : null;
  if (sub.recovery === "exame") {
    const wa = Number(sub.exam_w_avg) || 1, we = Number(sub.exam_w_exam) || 1, mf = Number(sub.exam_min_final ?? 5);
    const minTake = has(sub.exam_min_take) ? Number(sub.exam_min_take) : null;
    r.exam = { wa, we, mf, minTake };
    if (base != null && base < min) {
      r.exam.base = base;
      r.exam.need = (mf * (wa + we) - wa * base) / we;
      r.exam.eligible = minTake == null || base >= minTake;
    }
  }
  if (sub.recovery === "sub") {
    // valor de cada prova: nota oficial, ou simulação do cenário quando ainda não há nota
    const val = (a: Assessment) => (has(a.grade) ? Number(a.grade) : scen && has(simOf(a, scen)) ? Number(simOf(a, scen)) : null);
    let gain = 0, anyValue = false, allOfficial = true;
    for (const s of items.filter((i) => i.kind === "sub")) {
      // cada prova diz se tem SUB (e qual); a SUB substitui a menor nota entre as provas marcadas com ela
      const covered = valid.filter((a) => a.kind === "prova" && a.sub_id === s.id);
      let target: SubResult["target"] = null;
      for (const a of covered) {
        const v = val(a);
        if (v == null) continue;
        // menor nota; no empate, a de maior peso (é a que mais pesa na média)
        if (!target || v < target.value || (v === target.value && Number(a.weight) > target.weight)) target = { id: a.id, name: a.name, value: v, weight: Number(a.weight) };
      }
      const value = val(s);
      const res: SubResult = { id: s.id, name: s.name, covered: covered.length, target, base, need: null, value, official: has(s.grade) && r.final != null, replaced: false, final: null };
      if (target && base != null && W) {
        if (base < min) res.need = target.value + ((min - base) * W) / target.weight;
        if (value != null) {
          res.replaced = value > target.value || (sub.sub_replace_lower && value !== target.value);
          const g = res.replaced ? ((value - target.value) * target.weight) / W : 0;
          res.final = base + g;
          gain += g; anyValue = true; if (!res.official) allOfficial = false;
        }
      }
      r.subs.push(res);
    }
    r.sub = r.subs[0] ?? null;
    if (anyValue && base != null) { r.subFinal = base + gain; r.subOfficial = allOfficial; }
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

/** Placar do mês (do dia 1 até hoje): minutos, dias com estudo, maior sequência e melhor dia */
export function monthStats(days: Record<string, number>, today = todayKey()) {
  let minutes = 0, active = 0, run = 0, bestStreak = 0, bestDay = 0, bestDayKey: string | null = null;
  for (let k = today.slice(0, 8) + "01"; k <= today; k = addDays(k, 1)) {
    const v = days[k] || 0;
    minutes += v;
    if (v > 0) { active++; run++; bestStreak = Math.max(bestStreak, run); } else run = 0;
    if (v > bestDay) { bestDay = v; bestDayKey = k; }
  }
  return { minutes, active, elapsed: Number(today.slice(8)), bestStreak, bestDay, bestDayKey };
}
