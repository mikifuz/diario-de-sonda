// Alertas do painel: o que pede ação agora, com o motivo. Função pura e testada.
import { addDays, daysBetween, dkey } from "./calc";
import { topicsForExam } from "./plan";
import { easyReminders, isTrivial } from "./effort";
import type { Assessment, Session, Subject, Topic } from "./types";

export type Level = "bad" | "warn" | "info";
/** `text` é a frase completa; a tela usa a forma curta: `head` (prova · disciplina), `when` e `short`. */
export interface Alert {
  key: string; level: Level; text: string; why?: string; action?: { label: string; href: string }; days?: number;
  head?: string; when?: string; short?: string; group?: string;
}
export interface AlertInput {
  today: string; subjects: Subject[]; topics: Topic[]; sessions: Session[]; assessments: Assessment[];
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
      // conteúdos sem nenhum estudo registrado (nem nos subconteúdos que caem nesta prova) nas 6 semanas antes da prova
      const from = addDays(a.date!, -45);
      const nostudy = tops.filter((t) => {
        const fam = new Set([t.id]);
        for (let grew = true; grew; ) { grew = false; for (const x of inSet) if (x.parent_id && fam.has(x.parent_id) && !fam.has(x.id)) { fam.add(x.id); grew = true; } }
        return !p.sessions.some((x) => x.topic_id && fam.has(x.topic_id) && dkey(x.started_at) >= from);
      });
      const when = `${a.name} de ${s.name} ${emDias(d)}`;
      const ex = { head: `${shortExam(a.name)} · ${s.name}`, when: quando(d), group: a.id };
      const nomes = (xs: string[]) => list(xs.slice(0, 3)) + (xs.length > 3 ? ` e mais ${xs.length - 3}` : "");
      if (nostudy.length) {
        out.push({
          key: `ns-${a.id}`, level: d <= 7 ? "bad" : "warn", days: d, ...ex,
          short: `Ainda não estudou: ${nomes(nostudy.map((t) => t.name))}.`,
          text: `${when} e ${nostudy.length === 1 ? `${nostudy[0].name} ainda não tem` : `${nostudy.length} conteúdos ainda não têm`} nenhum estudo registrado${nostudy.length > 1 ? ` (${nomes(nostudy.map((t) => t.name))})` : ""}. Comece pelos exercícios do básico.`,
          why: "Pelas suas sessões de estudo: nenhuma nesse conteúdo nas 6 semanas antes da prova.",
          action: { label: `Estudar ${nostudy[0].name}`, href: study(s.id, nostudy[0].id) },
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
  }

  const rank: Record<Level, number> = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || (a.days ?? 99) - (b.days ?? 99));
}

