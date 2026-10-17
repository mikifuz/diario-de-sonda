// "Geralzão" do Painel: uma frase direta (com um pingo de ironia, pedido do dono) sobre como anda o estudo.
// Toda frase vem com o fato que a justifica; nada é inventado. A versão da frase muda por dia, não a cada abertura.
import { addDays, daysBetween, dkey, fmtMin, gradeCalc, nf } from "./calc";
import type { Assessment, Session, Subject } from "./types";
import { isTrivial } from "./effort";

export type VerdictKind = "folga" | "sumiu" | "parado" | "agua" | "prova_pouco" | "notas" | "pouco" | "voando" | "normal";
export interface Verdict { kind: VerdictKind; level: "bad" | "warn" | "ok" | "info"; title: string; why: string; action?: { label: string; href: string } }

const LINES: Record<VerdictKind, string[]> = {
  folga: [
    "Day off, é? Aproveita, porque amanhã a sonda volta a perfurar.",
    "Hoje é folga. Descansa direitinho, mas não acostuma.",
    "Sonda em manutenção programada. Amanhã volta a operar.",
    "Folga merecida (assim esperamos). Amanhã tem plano.",
  ],
  sumiu: [
    "Eita, meu filho… pra que você usa esse sistema?",
    "Tudo bem que você quer ser engenheiro de petróleo, mas já chegar no fundo do poço antes de se formar?",
    "Sonda parada há dias. Nem a Petrobras deixa equipamento tanto tempo sem uso.",
    "Alô? Tem alguém aí? O app sente sua falta.",
    "Esse poço tá seco: nenhum estudo registrado faz tempo.",
    "Depois não vai chorar na prova, hein?",
    "O caderno tá pegando poeira e o cronômetro esqueceu seu nome.",
    "Produção zerada. Se fosse um campo de petróleo, já tinham abandonado.",
  ],
  parado: [
    "Tem tempo que você não estuda, hein?",
    "Uns dias de folga… a prova não tira folga.",
    "A pressão do reservatório tá caindo. Bora reinjetar estudo?",
    "Sumiu, né? Bora voltar antes que acumule.",
    "Parou de perfurar no meio do poço? Assim não chega no óleo.",
    "Três dias sem estudar já é tendência, não acidente.",
  ],
  agua: [
    "Bateu água na bunda, é? 😏",
    "Ah, agora que a prova chegou o estudo apareceu.",
    "Olha só quem lembrou que tem prova!",
    "Kick no poço: a vazão de estudo disparou do nada. Prova chegando, né?",
    "Modo desespero ativado. Pelo menos tá ativado.",
    "Estudando em ritmo de véspera… e a véspera é longa.",
  ],
  prova_pouco: [
    "Prova chegando e o estudo de férias?",
    "Eita, meu filho, depois não vai chorar na prova.",
    "A prova tá logo ali e o cronômetro tá parado.",
    "Vai na fé ou vai estudar?",
    "Plano de contingência: abrir o caderno. Agora.",
    "Nem engenheiro é e já tá no fundo do poço? Bora estudar pra essa prova.",
  ],
  notas: [
    "Notas baixas. O que tá acontecendo?",
    "As notas estão pedindo socorro.",
    "Hora de mudar a estratégia: o resultado não tá vindo.",
    "O reservatório tá com baixa recuperação. Talvez seja o método, não o tempo.",
    "Estudar mais do mesmo jeito não vai salvar. Muda a abordagem.",
  ],
  pouco: [
    "Tá estudando pouco, vamos se esforçar mais.",
    "Ritmo de tartaruga essa semana.",
    "Dá pra mais que isso, hein?",
    "Vazão de estudo abaixo do esperado. Hora de abrir a válvula.",
    "Com esse ritmo, a formatura vira previsão conservadora… bem conservadora.",
    "A meta tá olhando pra você com cara de decepção.",
  ],
  voando: [
    "Tá voando, hein? Continua assim.",
    "Que fase! Estudando acima do seu ritmo.",
    "Assim dá gosto de ver o app.",
    "Jorrando conhecimento. Poço produtivo!",
    "Isso aqui é campo do pré-sal: produção alta e de qualidade.",
  ],
  normal: [
    "Semana dentro do esperado. Segue o plano.",
    "Tudo nos trilhos. Bora manter.",
    "Ritmo ok. Constância é o que vence.",
    "Produção estável. Nada de pressa, nada de pausa.",
  ],
};

/** Escolhe a versão da frase pelo dia (estável durante o dia) */
const pick = (k: VerdictKind, today: string) => { const xs = LINES[k]; let h = 0; for (const c of today + k) h = (h * 31 + c.charCodeAt(0)) >>> 0; return xs[h % xs.length]; };

export interface VerdictInput { today: string; sessions: Session[]; subjects: Subject[]; assessments: Assessment[]; weeklyGoalH: number | null; /** day off marcado hoje */ off?: boolean }

export function verdict(p: VerdictInput): Verdict | null {
  if (!p.sessions.length) return null; // primeiro acesso: o guia de primeiros passos cuida disso
  const day = (s: Session) => dkey(s.started_at);
  const last = p.sessions.reduce((a, s) => (day(s) > a ? day(s) : a), "");
  const idle = daysBetween(last, p.today);
  const lastTxt = `Último estudo registrado: ${last.slice(8, 10)}/${last.slice(5, 7)} (${idle === 1 ? "ontem" : `${idle} dias atrás`}).`;
  const go = { label: "Estudar agora", href: "/sala" };
  const v = (kind: VerdictKind, level: Verdict["level"], why: string, action?: Verdict["action"]): Verdict => ({ kind, level, title: pick(kind, p.today), why, action });

  if (p.off) return v("folga", "info", "Você marcou day off hoje na Sala. O plano de estudo de hoje foi para os outros dias.", { label: "Ver o plano", href: "/hoje" });
  if (idle >= 7) return v("sumiu", "bad", lastTxt, go);
  if (idle >= 3) return v("parado", "warn", lastTxt, go);

  const inRange = (s: Session, from: string, to: string) => day(s) >= from && day(s) <= to;
  const week = p.sessions.filter((s) => inRange(s, addDays(p.today, -6), p.today));
  const weekMin = week.reduce((a, s) => a + s.duration_min, 0);
  const before = p.sessions.filter((s) => inRange(s, addDays(p.today, -27), addDays(p.today, -7)));
  const avgBefore = before.reduce((a, s) => a + s.duration_min, 0) / 3;
  const active = new Set(p.subjects.filter((s) => !s.archived).map((s) => s.id));
  // matéria extremamente fácil não conta aqui: não pede estudo antes da prova
  const studyFor = new Set(p.subjects.filter((s) => !s.archived && !isTrivial(s)).map((s) => s.id));
  const exam = p.assessments
    .filter((a) => studyFor.has(a.subject_id) && (a.kind === "prova" || a.kind === "sub") && a.grade == null && a.status !== "cancelado" && a.date && a.date >= p.today && daysBetween(p.today, a.date) <= 7)
    .sort((a, b) => a.date!.localeCompare(b.date!))[0];
  const examTxt = exam ? `${exam.name} de ${p.subjects.find((s) => s.id === exam.subject_id)?.name ?? ""} ${daysBetween(p.today, exam.date!) === 0 ? "hoje" : daysBetween(p.today, exam.date!) === 1 ? "amanhã" : `em ${daysBetween(p.today, exam.date!)} dias`}` : "";

  if (exam && weekMin >= 300 && avgBefore > 0 && weekMin >= 1.5 * avgBefore)
    return v("agua", "info", `${examTxt}. Nos últimos 7 dias: ${fmtMin(weekMin)}; nas 3 semanas antes, ${fmtMin(Math.round(avgBefore))} por semana em média. Bom que acordou: mantém o ritmo depois da prova também.`, { label: "Ver plano da prova", href: "/hoje?aba=provas" });
  const goal = p.weeklyGoalH ? p.weeklyGoalH * 60 : null;
  if (exam && weekMin < (goal ? goal * 0.5 : 180))
    return v("prova_pouco", "bad", `${examTxt} e você estudou ${fmtMin(weekMin)} nos últimos 7 dias${goal ? ` (meta: ${fmtMin(goal)})` : ""}.`, { label: "Ver plano da prova", href: "/hoje?aba=provas" });

  // notas abaixo da média mínima
  const low = p.subjects.filter((s) => active.has(s.id)).map((s) => ({ s, g: gradeCalc(s, p.assessments.filter((a) => a.subject_id === s.id)).partial }))
    .filter((x) => x.g != null && x.g < x.s.min_avg);
  if (low.length)
    return v("notas", "bad", `Abaixo da média: ${low.map((x) => `${x.s.name} (${nf(x.g)} de ${nf(x.s.min_avg)})`).join(", ")}.`, { label: "Ver disciplinas", href: "/disciplinas" });

  const ref = goal ?? (avgBefore > 0 ? avgBefore : null);
  if (ref && weekMin < ref * 0.4)
    return v("pouco", "warn", `${fmtMin(weekMin)} nos últimos 7 dias${goal ? `; sua meta é ${fmtMin(goal)} por semana` : `; nas semanas anteriores você fazia ${fmtMin(Math.round(ref))}`}.`, go);
  if (ref && weekMin >= ref)
    return v("voando", "ok", `${fmtMin(weekMin)} nos últimos 7 dias${goal ? ` (meta: ${fmtMin(goal)})` : `; nas semanas anteriores você fazia ${fmtMin(Math.round(ref))}`}.`);
  return v("normal", "info", `${fmtMin(weekMin)} nos últimos 7 dias${goal ? ` de ${fmtMin(goal)} da meta` : ""}.`);
}
