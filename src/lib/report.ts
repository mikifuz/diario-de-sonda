// Relatório semanal (chega no domingo de manhã, como notificação). Função pura e testada.
// Só fatos do período.
import { addDays, daysBetween, dkey, fmtMin, keyDate, stats, qt } from "./calc";
import type { Assessment, Session, Subject } from "./types";

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
  exams: { name: string; subject: string; date: string }[];
}
export interface ReportInput { week: string; sessions: Session[]; subjects: Subject[]; assessments: Assessment[] }

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
  const active = new Set(p.subjects.filter((s) => !s.archived).map((s) => s.id));
  const data: ReportData = {
    week: p.week, from, to,
    minutes: st.min, prevMinutes: prev.reduce((a, s) => a + s.duration_min, 0), sessions: ses.length,
    days: new Set(ses.map((s) => dkey(s.started_at))).size,
    bySubject: [...by.entries()].map(([id, minutes]) => ({ name: subName(id), minutes })).sort((a, b) => b.minutes - a.minutes),
    exams: p.assessments.filter((a) => active.has(a.subject_id) && a.kind !== "trabalho" && a.grade == null && a.status !== "cancelado" && a.date && a.date >= p.week && daysBetween(p.week, a.date) <= 6)
      .sort((a, b) => a.date!.localeCompare(b.date!)).map((a) => ({ name: a.name, subject: subName(a.subject_id), date: a.date! })),
  };
  const diff = data.minutes - data.prevMinutes;
  const parts = [
    data.minutes ? `Você estudou ${fmtMin(data.minutes)} em ${qt(data.sessions, "sessão", "sessões")}, em ${qt(data.days, "dia", "dias")}` : "Nenhuma sessão registrada nesta semana",
    data.prevMinutes || data.minutes ? `${diff >= 0 ? "+" : "−"}${fmtMin(Math.abs(diff))} em relação à semana anterior` : "",
  ].filter(Boolean);
  const body = parts.join("; ") + "." + (data.exams.length ? ` Na semana que vem: ${data.exams.map((e) => `${e.name} de ${e.subject} (${dm(e.date)})`).join(", ")}.` : "");
  return { title: `Relatório da semana ${dm(from)} a ${dm(to)}`, body, data };
}
