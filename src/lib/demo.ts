// Modo demonstração: um semestre de exemplo, montado na memória a partir da data de hoje.
// Nada aqui vai para o banco; tudo some ao sair. Determinístico (mesma data → mesmos dados).
import { addDays, dkey, keyDate, todayKey } from "./calc";
import { buildReport, reportWeek } from "./report";
import type {
  AppNotification, Assessment, CalEvent, DailyTotal, Friend, Mistake, Profile, ReviewItem, ReviewLog, RoomMember, RoutineBlock, Session, StudyGroup,
  Subject, Todo, Topic, GroupMember,
} from "./types";

export const DEMO_FLAG = "ds-demo";
export const DEMO_UID = "demo-voce";

export interface DemoData {
  profile: Profile; subjects: Subject[]; topics: Topic[]; sessions: Session[]; assessments: Assessment[]; events: CalEvent[];
  blocks: RoutineBlock[]; mistakes: Mistake[]; reviews: ReviewItem[]; reviewLogs: ReviewLog[]; todos: Todo[]; notes: AppNotification[];
}
export interface DemoRoom { members: RoomMember[]; groups: StudyGroup[]; memberships: GroupMember[]; totals: DailyTotal[]; friends: Friend[] }

/** gerador pseudoaleatório com semente fixa (mulberry32) */
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const at = (day: string, h: number, m = 0) => { const d = keyDate(day); d.setHours(h, m, 0, 0); return d.toISOString(); };

const SUBJ: [string, string, string, number[]][] = [
  // nome, código, cor, dias de aula (getDay)
  ["Cálculo Diferencial e Integral III", "3CALCDIII72", "#4f86f7", [2, 4]],
  ["Física II", "3FIS272", "#e0864a", [2, 4]],
  ["Estática", "3ESTA72", "#3fae7a", [1, 3]],
  ["Linguagem de Programação I", "3LINGPROGI72", "#9a7be0", [1, 4]],
];
const TOPICS: string[][] = [
  ["Funções vetoriais e curvas espaciais", "Derivadas parciais", "Campos vetoriais e conservativos", "Integrais de linha", "Teorema de Green", "Integrais de superfície", "Teorema de Stokes", "Teorema do Divergente"],
  ["Oscilador harmônico", "Pêndulo simples e físico", "Ondas estacionárias", "Efeito Doppler", "Gravitação", "Estática dos fluidos", "Dinâmica dos fluidos", "Calor e temperatura"],
  ["Momento de uma força", "Binário e resultantes", "Equilíbrio no plano", "Equilíbrio no espaço", "Treliças: método dos nós", "Treliças: método das seções", "Centroides", "Cargas distribuídas"],
  ["Lógica de programação", "Elementos básicos", "Estruturas de controle", "Laços de repetição", "Vetores e matrizes", "Funções", "Implementação de algoritmos", "Aplicações"],
];

export function buildDemo(today = todayKey()): { data: DemoData; room: DemoRoom } {
  const r = rng(20262);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const subjects: Subject[] = SUBJ.map(([name, code, color], i) => ({
    id: `d-s${i}`, name, code, professor: "", semester: "2026.2", credits: 4, hours: 72, color, min_avg: 7, schedule: "", notes: "", traits: {},
    exam_enabled: false, exam_w_avg: 1, exam_w_exam: 1, exam_min_final: 5, exam_min_take: null, archived: false,
    study_pref: i === 1 ? "antes" : null, recovery: i === 2 ? "nenhuma" : "sub", sub_replace_lower: false,
  }));

  // provas: P1 já feita (há ~3 semanas), P2 em breve, P3 no fim; SUB depois (Física com duas)
  const assessments: Assessment[] = [];
  const A = (p: Partial<Assessment> & { id: string; subject_id: string; name: string }): Assessment => ({
    kind: "prova", date: null, time: null, weight: 1, grade: null, predicted: null, sim_c: null, sim_e: null, sim_o: null,
    priority: "alta", status: "pendente", description: "", sub_id: null, ...p,
  });
  const offs = [[-20, 4, 34], [-16, 9, 30], [-18, 6, 38], [-22, 12, 40]];
  const p1 = [5.5, 7.5, 6.8, 8.5];
  subjects.forEach((s, i) => {
    const [o1, o2, o3] = offs[i];
    const ids = [`d-a${i}1`, `d-a${i}2`, `d-a${i}3`];
    if (i === 1) {
      assessments.push(
        A({ id: `d-a${i}s1`, subject_id: s.id, name: "SUB A1/A2", kind: "sub", date: addDays(today, 16) }),
        A({ id: `d-a${i}s2`, subject_id: s.id, name: "SUB A3/A4", kind: "sub", date: addDays(today, 45) }),
        A({ id: ids[0], subject_id: s.id, name: "A1", date: addDays(today, o1), grade: p1[i], predicted: 8, status: "concluido", weight: 2, sub_id: `d-a${i}s1` }),
        A({ id: ids[1], subject_id: s.id, name: "A2", date: addDays(today, o2), weight: 1, sub_id: `d-a${i}s1`, sim_e: 7 }),
        A({ id: ids[2], subject_id: s.id, name: "A3", date: addDays(today, o3), weight: 1, sub_id: `d-a${i}s2` }),
      );
      return;
    }
    const sub = s.recovery === "sub" ? `d-a${i}s` : null;
    if (sub) assessments.push(A({ id: sub, subject_id: s.id, name: "SUB", kind: "sub", date: addDays(today, 45) }));
    assessments.push(
      A({ id: ids[0], subject_id: s.id, name: "P1", date: addDays(today, o1), grade: p1[i], predicted: i === 0 ? 7.5 : 7, status: "concluido", weight: 1, sub_id: sub }),
      A({ id: ids[1], subject_id: s.id, name: "P2", date: addDays(today, o2), weight: 1, sub_id: sub }),
      A({ id: ids[2], subject_id: s.id, name: i === 3 ? "Trabalho final" : "P3", kind: i === 3 ? "trabalho" : "prova", date: addDays(today, o3), weight: i === 3 ? 2 : 1, sub_id: i === 3 ? null : sub }),
    );
  });

  // conteúdos: duas aulas por semana, de 5 semanas atrás até 4 semanas à frente
  const topics: Topic[] = [];
  subjects.forEach((s, i) => {
    const days: string[] = [];
    for (let d = -36; d <= 30 && days.length < TOPICS[i].length; d++) if (SUBJ[i][3].includes(keyDate(addDays(today, d)).getDay()) && (d % 2 === 0 || days.length % 2 === 1)) days.push(addDays(today, d));
    TOPICS[i].forEach((name, k) => {
      const taught = days[k] ?? addDays(today, 30 + k);
      const exams = assessments.filter((a) => a.subject_id === s.id && (a.kind === "prova" || a.kind === "trabalho") && a.date).sort((a, b) => a.date!.localeCompare(b.date!));
      const exam = exams.find((a) => a.date! >= taught);
      topics.push({ id: `d-t${i}${k}`, subject_id: s.id, parent_id: null, name, position: k, taught_on: taught, assessment_id: exam?.id ?? null });
    });
  });

  // sessões dos últimos 30 dias, só em conteúdos já dados; alguns padrões de propósito:
  // Integrais de superfície: confiança alta e acerto baixo; Gravitação: pouca confiança e bom acerto
  const sessions: Session[] = [];
  let n = 0;
  for (let d = -30; d <= 0; d++) {
    const day = addDays(today, d);
    if (r() < 0.25) continue;
    const per = 1 + Math.floor(r() * 2);
    for (let j = 0; j < per; j++) {
      const s = pick(subjects);
      const ts = topics.filter((t) => t.subject_id === s.id && t.taught_on && t.taught_on <= day);
      if (!ts.length) continue;
      const t = pick(ts);
      const hard = t.name === "Integrais de superfície", shy = t.name === "Gravitação";
      const q = 6 + Math.floor(r() * 7);
      const c = Math.max(0, Math.min(q, Math.round(q * (hard ? 0.3 : shy ? 0.85 : 0.5 + r() * 0.45))));
      const conf = hard ? 4 + Math.round(r()) : shy ? 2 : 2 + Math.floor(r() * 3);
      const hasQ = r() < 0.7;
      sessions.push({
        id: `d-se${n++}`, subject_id: s.id, topic_id: t.id, activity: pick(["exercicios", "exercicios", "leitura", "revisao", "resumo"] as const),
        started_at: at(day, 19 + j, Math.floor(r() * 4) * 10), duration_min: 25 + Math.floor(r() * 7) * 10,
        questions: hasQ ? q : null, correct: hasQ ? c : null, notes: "", confidence: conf,
        result: hasQ ? null : c / q >= 0.75 ? "certo" : c / q >= 0.4 ? "parcial" : "errado",
        autonomy: hard ? pick(["resolucao", "ajuda"] as const) : pick(["sozinho", "sozinho", "anotacoes", "ajuda"] as const),
        difficulty: null, comprehension: null,
      });
    }
  }

  // erros registrados e suas revisões
  type MistakeCat = Mistake["category"];
  const M: [number, MistakeCat, string, string, number][] = [
    [0, "conceitual", "Esqueci o jacobiano ao trocar para coordenadas cilíndricas", "dV = r dr dθ dz", -6],
    [0, "sinal", "Troquei o sinal da orientação da superfície", "Normal para fora: conferir pela regra da mão direita", -3],
    [1, "unidade", "Usei g em cm/s² com distância em metros", "Converter tudo para SI antes de substituir", -9],
    [2, "algebrico", "Errei a soma de momentos em relação ao ponto B", "Escolher o ponto que elimina mais incógnitas", -4],
    [2, "interpretacao", "Considerei apoio fixo onde era móvel", "Ler o desenho dos vínculos com calma", -11],
    [3, "atencao", "Laço com condição de parada errada (<= em vez de <)", "Testar com n = 0 e n = 1", -2],
  ];
  const mistakes: Mistake[] = M.map(([si, cat, desc, corr, d], k) => {
    const t = topics.filter((x) => x.subject_id === subjects[si].id && x.taught_on! <= addDays(today, d)).pop() ?? null;
    return { id: `d-m${k}`, subject_id: subjects[si].id, topic_id: t?.id ?? null, session_id: null, category: cat, description: desc, correction: corr, source: pick(["Lista 3", "Lista 4", "P1", "Exercícios do livro"]), occurred_on: addDays(today, d) };
  });
  const reviews: ReviewItem[] = mistakes.map((m, k) => {
    const t = topics.find((x) => x.id === m.topic_id);
    return { id: `d-r${k}`, subject_id: m.subject_id, topic_id: m.topic_id, mistake_id: m.id, assessment_id: t?.assessment_id ?? null,
      title: m.description.slice(0, 80), step: k % 3, due: addDays(today, [-1, 0, 2, 0, 5, 1][k]), est_min: 15, active: true, last_reviewed_at: null };
  });
  const reviewLogs: ReviewLog[] = [
    { id: "d-l0", item_id: "d-r2", reviewed_at: at(addDays(today, -4), 20), result: "parcial", autonomy: "anotacoes", confidence: 3, prev_step: 0, new_step: 0, prev_due: addDays(today, -4), new_due: addDays(today, -3) },
    { id: "d-l1", item_id: "d-r4", reviewed_at: at(addDays(today, -2), 21), result: "certo", autonomy: "sozinho", confidence: 4, prev_step: 0, new_step: 1, prev_due: addDays(today, -2), new_due: addDays(today, 1) },
  ];

  // rotina: aulas (como no comprovante do SIGA) e blocos de estudo à noite
  const blocks: RoutineBlock[] = [];
  const cls: [number, number, string, string, string][] = [
    [3, 1, "08:20", "10:00", "Laboratório de Informática I"], [2, 1, "10:20", "12:00", "Sala 33"], [2, 3, "08:20", "10:00", "Sala 26"],
    [1, 2, "10:20", "12:00", "Sala 26"], [0, 2, "15:20", "17:00", "Sala 33"], [3, 4, "08:20", "10:00", "Laboratório de Informática I"],
    [0, 4, "10:20", "12:00", "Sala 27"], [1, 4, "13:30", "15:10", "Sala 26"],
  ];
  cls.forEach(([si, wd, a, b, label], k) => blocks.push({ id: `d-b${k}`, weekday: wd, start_time: a, end_time: b, kind: "aula", subject_id: subjects[si].id, label }));
  [1, 2, 3, 4, 0].forEach((wd, k) => blocks.push({ id: `d-e${k}`, weekday: wd, start_time: "19:00", end_time: "21:00", kind: "estudo", subject_id: null, label: wd === 0 ? "Revisão da semana" : "" }));
  blocks.push({ id: "d-e9", weekday: 6, start_time: "09:00", end_time: "12:00", kind: "estudo", subject_id: null, label: "Biblioteca" });
  blocks.push({ id: "d-w0", weekday: 5, start_time: "14:00", end_time: "18:00", kind: "trabalho", subject_id: null, label: "Estágio" });

  const events: CalEvent[] = [{ id: "d-ev0", subject_id: null, title: "Consulta médica", type: "pessoal", date: addDays(today, 3), time: "19:30", priority: "media", status: "pendente", description: "" }];
  const todos: Todo[] = [
    { id: "d-td0", title: "Entregar lista 4 de Cálculo", subject_id: "d-s0", due: addDays(today, 2), done: false, done_at: null },
    { id: "d-td1", title: "Imprimir resumo de Estática", subject_id: "d-s2", due: addDays(today, 1), done: false, done_at: null },
    { id: "d-td2", title: "Baixar slides de Física", subject_id: "d-s1", due: null, done: true, done_at: at(addDays(today, -1), 10) },
  ];
  const profile: Profile = {
    id: DEMO_UID, name: "Demonstração", course: "Engenharia de Petróleo", university: "UDESC", current_semester: "2026.2", default_min_avg: 7,
    weekly_goal_h: 15, skin: "sonda", timer: null, study_pref: "depois", review_steps: [1, 3, 7, 14, 30], mastery_cfg: null,
  };

  const notes: AppNotification[] = [
    { id: "d-n0", kind: "chamado", title: "Bia: Bora estudar?", body: "", data: { msg: "bora" }, from_user: "demo-bia", created_at: at(today, 18, 40), read_at: null },
  ];
  const rw = reportWeek(today, 12);
  const rep = buildReport({ week: rw.week, sessions, subjects, assessments, mistakes, logs: reviewLogs, items: reviews });
  if (rep) notes.push({ id: "d-n1", kind: "relatorio", title: rep.title, body: rep.body, data: rep.data as unknown as Record<string, unknown>, from_user: null, created_at: at(rw.week, 7), read_at: null });

  // sala: um grupo com três colegas de exemplo e uma amiga
  const mk = (id: string, nick: string, p: Partial<RoomMember> = {}): RoomMember => ({ user_id: id, nick, share_subject: true, studying: false, paused: false, since: null, accum_ms: 0, subject: "", updated_at: new Date().toISOString(), friend_code: id.slice(-8).toUpperCase(), accept_nudges: true, ...p });
  const members = [
    mk(DEMO_UID, "Você (demo)", { friend_code: "DEMO1234" }),
    mk("demo-bia", "Bia", { studying: true, since: new Date(Date.now() - 34 * 60000).toISOString(), subject: "Física II" }),
    mk("demo-leo", "Leo", { paused: true, accum_ms: 18 * 60000, subject: "" }),
    mk("demo-ana", "Ana"),
  ];
  const totals: DailyTotal[] = [];
  for (let d = -20; d <= 0; d++) {
    const day = addDays(today, d);
    for (const [id, base] of [["demo-bia", 110], ["demo-leo", 70], ["demo-ana", 90]] as [string, number][]) if (r() < 0.75) totals.push({ user_id: id, day, minutes: Math.round(base * (0.4 + r())) });
    const mine = sessions.filter((s) => dkey(s.started_at) === day).reduce((a, s) => a + s.duration_min, 0);
    if (mine) totals.push({ user_id: DEMO_UID, day, minutes: mine });
  }
  const room: DemoRoom = {
    members, totals,
    groups: [{ code: "PETRO7", name: "Turma 2024.2", created_by: "demo-ana" }],
    memberships: members.map((m) => ({ code: "PETRO7", user_id: m.user_id })),
    friends: [{ id: "d-f0", other: "demo-bia", nick: "Bia", status: "aceito", incoming: false }],
  };
  return { data: { profile, subjects, topics, sessions, assessments, events, blocks, mistakes, reviews, reviewLogs, todos, notes }, room };
}
