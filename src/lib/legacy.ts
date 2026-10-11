// Converte a cópia (JSON) exportada da primeira versão do Diário de Sonda — a página
// publicada no Claude — para as linhas das tabelas novas. Função pura, testada.
import type { Activity, Assessment, AssessmentKind, Autonomy, CalEvent, Comprehension, EventType, Priority, Result, Session, Status, Subject, Topic } from "./types";
import { dkey } from "./calc";

type Any = Record<string, any>;
export interface LegacyRows {
  subjects: Subject[];
  topics: Topic[];
  sessions: Session[];
  assessments: Assessment[];
  events: CalEvent[];
  profile: { name?: string; course?: string; university?: string; current_semester?: string; default_min_avg?: number; weekly_goal_h?: number | null; skin?: string };
  skipped: number;
}

const ACT: Activity[] = ["aula", "leitura", "exercicios", "revisao", "simulado", "resumo", "teorico", "pratico"];
const RES: Result[] = ["certo", "parcial", "errado", "nao"];
const AUT: Autonomy[] = ["sozinho", "anotacoes", "ajuda", "resolucao"];
const COMP: Comprehension[] = ["total", "parcial", "duvidas", "nao"];
const KIND: AssessmentKind[] = ["prova", "trabalho", "apresentacao", "entrega"];
const EVT: EventType[] = [...KIND, "aula", "atividade", "simulado", "estudo", "revisao", "pessoal", "indisponivel"];
const PRIO: Priority[] = ["baixa", "media", "alta"];
const STAT: Status[] = ["pendente", "concluido", "cancelado"];

const pick = <T extends string>(v: unknown, list: readonly T[], d: T | null): T | null => (list.includes(v as T) ? (v as T) : d);
const num = (v: unknown): number | null => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
const grade = (v: unknown) => { const n = num(v); return n != null && n >= 0 && n <= 10 ? n : null; };
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
const color = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#4f86f7");

export function isLegacyExport(j: unknown): j is Any {
  return !!j && typeof j === "object" && (j as Any).app === "diario-de-sonda" && !!(j as Any).data && (j as Any).version === 1;
}

export function convertLegacy(j: Any, newId: () => string = () => crypto.randomUUID()): LegacyRows {
  const d = j.data || {};
  const out: LegacyRows = { subjects: [], topics: [], sessions: [], assessments: [], events: [], profile: {}, skipped: 0 };
  const subMap = new Map<string, string>(), topMap = new Map<string, string>();

  for (const s of (d.subjects || []) as Any[]) {
    if (!s || !str(s.name).trim()) { out.skipped++; continue; }
    const id = newId();
    subMap.set(String(s.id), id);
    const ex = (s.grading && s.grading.exam) || {};
    const minAvg = grade(s.minAvg) ?? 7;
    out.subjects.push({
      id, name: str(s.name, 200).trim(), code: str(s.code, 50), professor: str(s.prof, 200), semester: str(s.semester, 20),
      credits: num(s.credits), hours: num(s.hours), color: color(s.color), min_avg: minAvg, schedule: str(s.schedule, 200),
      notes: str(s.notes), traits: s.traits && typeof s.traits === "object" ? s.traits : {},
      exam_enabled: !!ex.enabled, exam_w_avg: num(ex.wAvg) && num(ex.wAvg)! > 0 ? num(ex.wAvg)! : 1,
      exam_w_exam: num(ex.wExam) && num(ex.wExam)! > 0 ? num(ex.wExam)! : 1, exam_min_final: grade(ex.minFinal) ?? 5,
      exam_min_take: grade(ex.minTake), archived: !!s.archived,
      study_pref: null, recovery: ex.enabled ? "exame" : "nenhuma", sub_replace_lower: false,
    });
    // conteúdos: pais antes dos filhos
    const ts = ((s.topics || []) as Any[]).filter((t) => t && str(t.name).trim());
    for (const t of ts) topMap.set(String(t.id), newId());
    const placed = new Set<string>();
    let guard = 0;
    while (placed.size < ts.length && guard++ < ts.length + 2) {
      ts.forEach((t, i) => {
        const key = String(t.id);
        if (placed.has(key)) return;
        const parentOk = !t.parentId || !topMap.has(String(t.parentId)) || placed.has(String(t.parentId));
        if (!parentOk) return;
        placed.add(key);
        out.topics.push({ id: topMap.get(key)!, subject_id: id, parent_id: t.parentId && topMap.has(String(t.parentId)) ? topMap.get(String(t.parentId))! : null, name: str(t.name, 200).trim(), position: i, taught_on: null, assessment_id: null });
      });
    }
    for (const i of ((s.grading && s.grading.items) || []) as Any[]) {
      if (!i || !str(i.name).trim() || !(num(i.weight)! > 0)) { out.skipped++; continue; }
      out.assessments.push({
        id: newId(), subject_id: id, name: str(i.name, 200).trim(), kind: pick(i.kind, KIND, "prova")!, date: isDate(i.date) ? i.date : null,
        time: isTime(i.time) ? i.time : null, weight: num(i.weight)!, grade: grade(i.grade), predicted: grade(i.pred),
        sim_c: grade(i.sim && i.sim.c), sim_e: grade(i.sim && i.sim.e), sim_o: grade(i.sim && i.sim.o),
        priority: pick(i.priority, PRIO, "alta")!, status: pick(i.status, STAT, "pendente")!, description: str(i.desc),
      });
    }
  }

  for (const s of (d.sessions || []) as Any[]) {
    const sid = s && subMap.get(String(s.subjectId));
    const dur = Math.round(Number(s && s.durMin));
    const start = Number(s && s.start);
    if (!sid || !(dur >= 1) || !(start > 0)) { out.skipped++; continue; }
    const ev = s.ev || {};
    let q = num(s.questions), c = num(s.correct);
    if (q != null && q < 0) q = null;
    if (c != null && (c < 0 || (q != null && c > q))) c = null;
    const conf = num(ev.conf), diff = num(ev.diff);
    out.sessions.push({
      id: newId(), subject_id: sid, topic_id: s.topicId && topMap.get(String(s.topicId)) || null,
      activity: pick(s.activity, ACT, "exercicios")!, started_at: new Date(start).toISOString(), duration_min: Math.min(dur, 1440),
      questions: q, correct: c, notes: str(s.notes), confidence: conf != null && conf >= 1 && conf <= 5 ? Math.round(conf) : null,
      result: pick(ev.result, RES, null), autonomy: pick(ev.auto, AUT, null),
      difficulty: diff != null && diff >= 0 && diff <= 4 ? Math.round(diff) : null, comprehension: pick(ev.comp, COMP, null),
    });
  }

  for (const e of (d.events || []) as Any[]) {
    if (!e || !str(e.title).trim() || !isDate(e.date)) { out.skipped++; continue; }
    out.events.push({
      id: newId(), subject_id: e.subjectId ? subMap.get(String(e.subjectId)) || null : null, title: str(e.title, 200).trim(),
      type: pick(e.type, EVT, "atividade")!, date: e.date, time: isTime(e.time) ? e.time : null,
      priority: pick(e.priority, PRIO, "media")!, status: pick(e.status, STAT, "pendente")!, description: str(e.desc),
    });
  }

  const p = (j.prefs && j.prefs.profile) || {};
  out.profile = {
    name: str(p.name, 100) || undefined, course: str(p.course, 100) || undefined, university: str(p.uni, 100) || undefined,
    current_semester: str(p.sem, 20) || undefined, default_min_avg: grade(p.minAvg) ?? undefined,
    weekly_goal_h: num(j.prefs && j.prefs.weeklyGoalH), skin: str(j.prefs && j.prefs.skin, 20) || undefined,
  };
  return out;
}

export { dkey };
