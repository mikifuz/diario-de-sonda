// Relatório semanal (chega no domingo de manhã, como notificação). Função pura e testada.
// Só fatos do período; confiança e acerto conferido aparecem separados.
import { addDays, daysBetween, dkey, fmtMin, keyDate, nf, pct, stats } from "./calc";
import { itemState } from "./plan";
import { MISTAKE } from "./constants";
import type { Assessment, Mistake, MistakeCategory, ReviewItem, ReviewLog, Session, Subject } from "./types";

/** Hora do domingo a partir da qual o relatório da semana sai */
export const REPORT_HOUR = 7;

/** Domingo do relatório mais recente já liberado (a semana vai do domingo anterior até o sábado) */
export function reportWeek(today: string, hour: number): { week: string; from: string; to: string } {
  const wd = keyDate(today).getDay();
  const sunday = wd === 0 && hour >= REPORT_HOUR ? today : addDays(today, -(wd === 0 ? 7 : wd));
  return { week: sunday, from: addDays(sunday, -7), to: addDays(sunday, -1) };
}

export interface ReportData {
  week: string; from: string; to: string;
  minutes: number; prevMinutes: number; sessions: number; days: number;
  bySubject: { name: string; minutes: number }[];
  acc: number | null; accN: number; conf: number | null; confN: number;
  reviews: number; late: number;
  mistakes: { cat: string; n: number }[];
  exams: { name: string; subject: string; date: string }[];
}
export interface ReportInput { week: string; sessions: Session[]; subjects: Subject[]; assessments: Assessment[]; mistakes: Mistake[]; logs: ReviewLog[]; items: ReviewItem[] }

const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;

export function buildReport(p: ReportInput): { title: string; body: string; data: ReportData } | null {
  const from = addDays(p.week, -7), to = addDays(p.week, -1);
  const inWeek = (k: string) => k >= from && k <= to;
  // sem nenhuma sessão até o fim da semana, ainda não há o que relatar
  if (!p.sessions.some((s) => dkey(s.started_at) <= to)) return null;
  const ses = p.sessions.filter((s) => inWeek(dkey(s.started_at)));
  const prev = p.sessions.filter((s) => { const k = dkey(s.started_at); return k >= addDays(from, -7) && k < from; });
  const st = stats(ses);
  const subName = (id: string) => p.subjects.find((s) => s.id === id)?.name || "Disciplina removida";
  const by = new Map<string, number>();
  for (const s of ses) by.set(s.subject_id, (by.get(s.subject_id) || 0) + s.duration_min);
  const cats = new Map<string, number>();
  for (const m of p.mistakes) if (inWeek(m.occurred_on)) cats.set(m.category, (cats.get(m.category) || 0) + 1);
  const active = new Set(p.subjects.filter((s) => !s.archived).map((s) => s.id));
  const data: ReportData = {
    week: p.week, from, to,
    minutes: st.min, prevMinutes: prev.reduce((a, s) => a + s.duration_min, 0), sessions: ses.length,
    days: new Set(ses.map((s) => dkey(s.started_at))).size,
    bySubject: [...by.entries()].map(([id, minutes]) => ({ name: subName(id), minutes })).sort((a, b) => b.minutes - a.minutes),
    acc: st.acc, accN: st.accN, conf: st.conf, confN: st.confN,
    reviews: p.logs.filter((l) => inWeek(dkey(l.reviewed_at))).length,
    late: p.items.filter((i) => i.due < p.week && active.has(i.subject_id) && itemState(i, p.assessments, p.week).open).length,
    mistakes: [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => ({ cat: MISTAKE[c as MistakeCategory] || c, n })),
    exams: p.assessments.filter((a) => active.has(a.subject_id) && a.kind !== "trabalho" && a.grade == null && a.status !== "cancelado" && a.date && a.date >= p.week && daysBetween(p.week, a.date) <= 6)
      .sort((a, b) => a.date!.localeCompare(b.date!)).map((a) => ({ name: a.name, subject: subName(a.subject_id), date: a.date! })),
  };
  const diff = data.minutes - data.prevMinutes;
  const parts = [
    data.minutes ? `Você estudou ${fmtMin(data.minutes)} em ${data.sessions} sessão(ões), em ${data.days} dia(s)` : "Nenhuma sessão registrada nesta semana",
    data.prevMinutes || data.minutes ? `${diff >= 0 ? "+" : "−"}${fmtMin(Math.abs(diff))} em relação à semana anterior` : "",
    data.accN ? `acerto conferido de ${pct(data.acc)} (${data.accN} registro(s))` : "",
    data.confN ? `confiança média ${nf(data.conf)}/5` : "",
  ].filter(Boolean);
  const body = parts.join("; ") + "." + (data.exams.length ? ` Na semana que vem: ${data.exams.map((e) => `${e.name} de ${e.subject} (${dm(e.date)})`).join(", ")}.` : "");
  return { title: `Relatório da semana ${dm(from)} a ${dm(to)}`, body, data };
}
