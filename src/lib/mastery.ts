// Índice de domínio por conteúdo (0–100) com metodologia aberta e configurável.
// Confiança NÃO entra: só acerto conferido, autonomia, prática recente e erros em aberto.
import { daysBetween, dkey, pct, verified, qt } from "./calc";
import type { Autonomy, Mistake, ReviewItem, ReviewLog, Session, Topic } from "./types";

export interface MasteryCfg {
  /** pesos em pontos (a soma não precisa dar 100; a conta normaliza) */
  w_acc: number; w_auto: number; w_rec: number; w_err: number;
  /** dias sem praticar até a parte "prática recente" zerar */
  decay_days: number;
  /** mínimo de registros conferidos para dar uma nota */
  min_n: number;
}
export const DEFAULT_MASTERY: MasteryCfg = { w_acc: 50, w_auto: 25, w_rec: 15, w_err: 10, decay_days: 30, min_n: 3 };

/** Junta a configuração salva com o padrão, descartando valores inválidos */
export function masteryCfg(raw: unknown): MasteryCfg {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (k: keyof MasteryCfg, min: number, max: number) => {
    const v = Number(o[k]);
    return Number.isFinite(v) && v >= min && v <= max ? v : DEFAULT_MASTERY[k];
  };
  const c = { w_acc: num("w_acc", 0, 100), w_auto: num("w_auto", 0, 100), w_rec: num("w_rec", 0, 100), w_err: num("w_err", 0, 100), decay_days: num("decay_days", 7, 180), min_n: num("min_n", 1, 20) };
  return c.w_acc + c.w_auto + c.w_rec + c.w_err > 0 ? c : DEFAULT_MASTERY;
}

export type Band = "fragil" | "construcao" | "dominado";
export const BAND: Record<Band, [string, string]> = { fragil: ["frágil", "bad"], construcao: ["em construção", "warn"], dominado: ["dominado", "ok"] };
export const bandOf = (score: number): Band => (score < 40 ? "fragil" : score < 70 ? "construcao" : "dominado");

export interface Part { key: "acc" | "auto" | "rec" | "err"; label: string; v: number | null; w: number; why: string }
export interface Mastery {
  score: number | null;
  band: Band | null;
  /** registros conferidos (sessões e revisões) */
  n: number;
  parts: Part[];
  /** conta por extenso */
  formula: string;
  why: string;
}

const AUTO_V: Record<Autonomy, number> = { sozinho: 1, anotacoes: 0.6, ajuda: 0.3, resolucao: 0 };
const RES_V = { certo: 1, parcial: 0.5, errado: 0 } as const;
/** meia-vida do peso de cada registro, em dias: o recente vale mais */
const HALF_LIFE = 14;
const ERR_FULL = 3;

interface Ev { day: string; v: number | null; autonomy: Autonomy | null }

/** Conteúdo e todos os subconteúdos */
export function topicFamily(topics: Topic[], id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) { grew = false; for (const t of topics) if (t.parent_id && ids.has(t.parent_id) && !ids.has(t.id)) { ids.add(t.id); grew = true; } }
  return ids;
}

export interface MasteryInput { sessions: Session[]; logs: ReviewLog[]; items: ReviewItem[]; mistakes: Mistake[]; today: string; cfg?: MasteryCfg }

/** Índice de um conjunto de conteúdos (normalmente um conteúdo e seus filhos) */
export function mastery(topicIds: Set<string>, p: MasteryInput): Mastery {
  const cfg = p.cfg || DEFAULT_MASTERY;
  const itemTopic = new Map(p.items.map((i) => [i.id, i.topic_id]));
  const evs: Ev[] = [];
  let lastPractice: string | null = null;
  const seen = (d: string) => { if (!lastPractice || d > lastPractice) lastPractice = d; };
  for (const s of p.sessions) {
    if (!s.topic_id || !topicIds.has(s.topic_id)) continue;
    const day = dkey(s.started_at);
    seen(day);
    const v = verified(s);
    if (v != null) evs.push({ day, v, autonomy: s.autonomy });
  }
  for (const l of p.logs) {
    const tid = itemTopic.get(l.item_id);
    if (!tid || !topicIds.has(tid)) continue;
    const day = dkey(l.reviewed_at);
    seen(day);
    if (l.result !== "nao") evs.push({ day, v: RES_V[l.result], autonomy: l.autonomy });
  }
  const n = evs.length;
  const wOf = (e: Ev) => Math.pow(0.5, Math.max(0, daysBetween(e.day, p.today)) / HALF_LIFE);

  // acerto conferido, com os registros recentes valendo mais
  let sw = 0, sv = 0;
  for (const e of evs) { const w = wOf(e); sw += w; sv += w * (e.v as number); }
  const acc = sw ? sv / sw : null;
  // autonomia
  let aw = 0, av = 0, an = 0;
  for (const e of evs) if (e.autonomy) { const w = wOf(e); aw += w; av += w * AUTO_V[e.autonomy]; an++; }
  const auto = aw ? av / aw : null;
  // prática recente
  const age = lastPractice ? Math.max(0, daysBetween(lastPractice, p.today)) : null;
  const rec = age == null ? null : age <= 7 ? 1 : age >= cfg.decay_days ? 0 : 1 - (age - 7) / (cfg.decay_days - 7);
  // erros em aberto: sem uma revisão resolvida sozinho depois deles
  const open = p.mistakes.filter((m) => {
    if (!m.topic_id || !topicIds.has(m.topic_id)) return false;
    const its = new Set(p.items.filter((i) => i.mistake_id === m.id).map((i) => i.id));
    return !p.logs.some((l) => its.has(l.item_id) && l.result === "certo" && l.autonomy === "sozinho");
  }).length;
  const err = Math.max(0, 1 - open / ERR_FULL);

  const parts: Part[] = [
    { key: "acc", label: "acerto", v: acc, w: cfg.w_acc, why: acc == null ? "nenhum resultado conferido" : `${pct(acc)} em ${qt(n, "registro conferido", "registros conferidos")}, os recentes valem mais` },
    { key: "auto", label: "autonomia", v: auto, w: cfg.w_auto, why: auto == null ? "autonomia não informada" : `${pct(auto)} (sozinho = 100%, anotações = 60%, ajuda = 30%, resolução = 0%) em ${qt(an, "registro", "registros")}` },
    { key: "rec", label: "prática", v: rec, w: cfg.w_rec, why: age == null ? "nunca praticado" : age === 0 ? "praticou hoje" : `última prática há ${qt(age, "dia", "dias")}; zera com ${cfg.decay_days} dias` },
    { key: "err", label: "erros", v: err, w: cfg.w_err, why: open ? `${qt(open, "erro", "erros")} em aberto (cada um desconta ${Math.round(100 / ERR_FULL)}%)` : "nenhum erro em aberto" },
  ];
  if (n < cfg.min_n) {
    const falta = cfg.min_n - n;
    return { score: null, band: null, n, parts, formula: "", why: n ? `Dados insuficientes: ${qt(n, "registro conferido", "registros conferidos")}; faltam ${falta} para calcular.` : `Sem resultados conferidos ainda; são necessários ${cfg.min_n}.` };
  }
  const used = parts.filter((x) => x.v != null && x.w > 0);
  const W = used.reduce((a, x) => a + x.w, 0);
  const score = Math.round((100 * used.reduce((a, x) => a + x.w * (x.v as number), 0)) / W);
  const formula = `${score} = (${used.map((x) => `${x.label} ${pct(x.v)} × ${x.w}`).join(" + ")}) ÷ ${W}`;
  const skipped = parts.filter((x) => x.v == null && x.w > 0).map((x) => x.label);
  const band = bandOf(score);
  return { score, band, n, parts, formula, why: `Domínio ${score} (${BAND[band][0]}).${skipped.length ? ` Sem dados de ${skipped.join(", ")}: ficou fora da conta.` : ""}` };
}
