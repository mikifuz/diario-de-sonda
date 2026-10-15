// Alertas do painel: o que pede ação agora, com o motivo. Função pura e testada.
// Confiança e acerto continuam separados: cada alerta diz qual dos dois está baixo.
import { addDays, daysBetween, dkey, nf, pct, stats, qt } from "./calc";
import { itemState, topicsForExam } from "./plan";
import { mastery, topicFamily, type MasteryCfg } from "./mastery";
import { easyReminders, isTrivial } from "./effort";
import type { Assessment, Mistake, ReviewItem, ReviewLog, Session, Subject, Topic } from "./types";

export type Level = "bad" | "warn" | "info";
/** `text` é a frase completa; a tela usa a forma curta: `head` (prova · disciplina), `when` e `short`. */
export interface Alert {
  key: string; level: Level; text: string; why?: string; action?: { label: string; href: string }; days?: number;
  head?: string; when?: string; short?: string; group?: string;
}
export interface AlertInput {
  today: string; subjects: Subject[]; topics: Topic[]; sessions: Session[]; assessments: Assessment[];
  items: ReviewItem[]; logs: ReviewLog[]; mistakes: Mistake[]; cfg?: MasteryCfg;
}

const HORIZON = 14;
const emDias = (n: number) => (n === 0 ? "é hoje" : n === 1 ? "é amanhã" : `é em ${n} dias`);
const quando = (n: number) => (n === 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`);
const ORD: Record<string, number> = { primeira: 1, segunda: 2, terceira: 3, quarta: 4, quinta: 5, sexta: 6, primeiro: 1, segundo: 2, terceiro: 3, quarto: 4, quinto: 5 };

/** "2ª Avaliação – Análise de estruturas" → "Avaliação 2"; "Segunda prova" → "Prova 2"; o resto sem a descrição depois do travessão. */
export function shortExam(name: string): string {
  const n = name.trim();
  const word = (w: string) => (/^prova/i.test(w) ? "Prova" : /^exame/i.test(w) ? "Exame" : "Avaliação");
  let m = n.match(/(\d+)\s*(?:ª|º|°|a|o)?\.?\s*(avalia[cç][aã]o|prova|exame)\b/i);
  if (m) return `${word(m[2])} ${m[1]}`;
  m = n.match(/\b(avalia[cç][aã]o|prova)\s*(\d+)\b/i);
  if (m) return `${word(m[1])} ${m[2]}`;
  m = n.match(/\b(primeir[ao]|segund[ao]|terceir[ao]|quart[ao]|quint[ao]|sexta)\s+(avalia[cç][aã]o|prova)\b/i);
  if (m) return `${word(m[2])} ${ORD[m[1].toLowerCase()]}`;
  const cut = n.split(/\s+[–—-]\s+|:\s+/)[0].trim();
  return (cut || n).length > 28 ? `${(cut || n).slice(0, 27)}…` : cut || n;
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);
const study = (s: string, t?: string | null) => `/sala?disciplina=${s}${t ? `&conteudo=${t}` : ""}&atividade=exercicios`;

export function buildAlerts(p: AlertInput): Alert[] {
  const out: Alert[] = [];
  const active = p.subjects.filter((s) => !s.archived);
  const mIn = { sessions: p.sessions, logs: p.logs, items: p.items, mistakes: p.mistakes, today: p.today, cfg: p.cfg };
  const isExam = (a: Assessment) => (a.kind === "prova" || a.kind === "sub") && a.grade == null && a.status !== "cancelado" && !!a.date && a.date >= p.today;

  // matéria extremamente fácil: sem alertas de preparo; só o aviso na véspera e no dia da prova
  for (const r of easyReminders(p.today, p.subjects, p.assessments))
    out.push({ key: r.key, level: "warn", head: `${shortExam(r.exam.name)} · ${r.subject.name}`, when: r.when, short: r.text, text: r.text, why: r.why, days: r.when === "hoje" ? 0 : 1, group: `exam-${r.exam.id}` });

  for (const s of active) {
    const exams = isTrivial(s) ? [] : p.assessments.filter((a) => a.subject_id === s.id && isExam(a)).sort((a, b) => a.date!.localeCompare(b.date!));
    const ts = p.topics.filter((t) => t.subject_id === s.id);
    for (const a of exams) {
      const d = daysBetween(p.today, a.date!);
      if (d > HORIZON) break;
      // conteúdos da prova: marcados, pelos subconteúdos ou pela data da aula; os de provas passadas ficam de fora
      const inSet = topicsForExam(a, ts, p.assessments, exams[0].id);
      const ids = new Set(inSet.map((t) => t.id));
      const tops = inSet.filter((t) => !t.parent_id || !ids.has(t.parent_id));
      const fragile: { t: Topic; score: number; why: string }[] = [], building: { t: Topic; score: number; why: string }[] = [], nodata: Topic[] = [], lowconf: { t: Topic; conf: number }[] = [];
      for (const t of tops) {
        // num assunto, só os subconteúdos que caem nesta prova
        const fam = new Set([...topicFamily(p.topics, t.id)].filter((id) => ids.has(id)));
        const m = mastery(fam, mIn);
        if (m.score == null) nodata.push(t);
        else if (m.band === "fragil") fragile.push({ t, score: m.score, why: `${m.why} ${m.formula}` });
        else if (m.band === "construcao" && d <= 7) building.push({ t, score: m.score, why: `${m.why} ${m.formula}` });
        const recent = p.sessions.filter((x) => x.topic_id && fam.has(x.topic_id) && daysBetween(dkey(x.started_at), p.today) <= 30);
        const st = stats(recent);
        if (st.conf != null && st.conf <= 2.5 && m.band !== "fragil") lowconf.push({ t, conf: st.conf });
      }
      const when = `${a.name} de ${s.name} ${emDias(d)}`;
      const ex = { head: `${shortExam(a.name)} · ${s.name}`, when: quando(d), group: a.id };
      const nomes = (xs: string[]) => list(xs.slice(0, 3)) + (xs.length > 3 ? ` e mais ${xs.length - 3}` : "");
      if (fragile.length) {
        fragile.sort((x, y) => x.score - y.score);
        out.push({
          key: `fr-${a.id}`, level: "bad", days: d, ...ex,
          short: `Frágil: ${nomes(fragile.map((f) => f.t.name))}.`,
          text: `${when}: ${list(fragile.map((f) => `${f.t.name} (domínio ${f.score})`))} ${fragile.length > 1 ? "estão frágeis" : "está frágil"}. Faça exercícios ${fragile.length > 1 ? "desses conteúdos" : "desse conteúdo"}.`,
          why: fragile[0].why, action: { label: `Exercícios de ${fragile[0].t.name}`, href: study(s.id, fragile[0].t.id) },
        });
      }
      if (building.length) {
        building.sort((x, y) => x.score - y.score);
        out.push({
          key: `bd-${a.id}`, level: "warn", days: d, ...ex,
          short: `Em construção: ${nomes(building.map((b) => b.t.name))}.`,
          text: `${when}: ${list(building.map((b) => `${b.t.name} (domínio ${b.score})`))} ainda ${building.length > 1 ? "estão" : "está"} em construção. Priorize exercícios ${building.length > 1 ? "desses conteúdos" : "desse conteúdo"}.`,
          why: building[0].why, action: { label: `Exercícios de ${building[0].t.name}`, href: study(s.id, building[0].t.id) },
        });
      }
      for (const l of lowconf.slice(0, 2)) {
        out.push({
          key: `lc-${a.id}-${l.t.id}`, level: "warn", days: d, ...ex,
          short: `Confiança baixa em ${l.t.name} (${nf(l.conf)}/5): confira com exercícios.`,
          text: `${when} e você marcou confiança baixa em ${l.t.name} (média ${nf(l.conf)}/5). Faça exercícios e confira o resultado: é falta de domínio ou só insegurança?`,
          why: "Confiança é o que você sentiu; não conta como acerto. Só o resultado conferido mostra se a insegurança tem fundamento.",
          action: { label: `Exercícios de ${l.t.name}`, href: study(s.id, l.t.id) },
        });
      }
      if (nodata.length && d <= 7) {
        out.push({
          key: `nd-${a.id}`, level: "warn", days: d, ...ex,
          short: `Sem resultado conferido: ${nomes(nodata.map((t) => t.name))}.`,
          text: `${when} e ${nodata.length === 1 ? `${nodata[0].name} ainda não tem` : `${nodata.length} conteúdos ainda não têm`} resultado conferido suficiente${nodata.length > 1 ? ` (${list(nodata.slice(0, 4).map((t) => t.name))}${nodata.length > 4 ? "…" : ""})` : ""}. Faça exercícios e anote quantos acertou.`,
          why: "Sem resultados conferidos não dá para saber o domínio; o app não chuta.",
          action: { label: "Fazer exercícios", href: study(s.id, nodata[0].id) },
        });
      }
      if (!tops.length && d <= 7 && !p.sessions.some((x) => x.subject_id === s.id && dkey(x.started_at) >= addDays(p.today, -14))) {
        out.push({
          key: `ne-${a.id}`, level: "warn", days: d, ...ex,
          short: "Nenhum estudo registrado nos últimos 14 dias.",
          text: `${when} e não há estudo de ${s.name} registrado nos últimos 14 dias.`,
          why: "Cadastre os conteúdos da prova na disciplina para alertas mais precisos.", action: { label: "Estudar agora", href: study(s.id) },
        });
      }
    }
    // confiança × resultado nos últimos 30 dias (métricas separadas)
    const s30 = stats(p.sessions.filter((x) => x.subject_id === s.id && daysBetween(dkey(x.started_at), p.today) <= 30));
    if (s30.accN >= 3 && s30.conf != null && s30.acc != null) {
      if (s30.conf >= 4 && s30.acc < 0.6) out.push({ key: `cal-${s.id}`, level: "warn", head: s.name, short: `Confiança ${nf(s30.conf)}/5, mas acertou ${pct(s30.acc)} do que conferiu (30 dias).`, text: `Em ${s.name} você se avalia com confiança ${nf(s30.conf)}/5, mas acertou ${pct(s30.acc)} do que conferiu nos últimos 30 dias.`, why: `${qt(s30.accN, "registro conferido", "registros conferidos")}.` });
      if (s30.conf <= 2.5 && s30.acc >= 0.8) out.push({ key: `cal2-${s.id}`, level: "info", head: s.name, short: `Acertou ${pct(s30.acc)}: melhor do que a confiança (${nf(s30.conf)}/5) sugere.`, text: `Em ${s.name} seus resultados (${pct(s30.acc)}) estão melhores do que sua confiança (${nf(s30.conf)}/5) sugere.`, why: `${qt(s30.accN, "registro conferido", "registros conferidos")}.` });
    }
  }

  const late = p.items.filter((i) => i.due < p.today && active.some((s) => s.id === i.subject_id) && itemState(i, p.assessments, p.today).open);
  if (late.length) out.push({ key: "late", level: late.length >= 5 ? "warn" : "info", text: `${late.length === 1 ? "1 revisão atrasada" : `${late.length} revisões atrasadas`}.`, action: { label: "Ver revisões", href: "/hoje?aba=revisoes" } });

  const rank: Record<Level, number> = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || (a.days ?? 99) - (b.days ?? 99));
}

