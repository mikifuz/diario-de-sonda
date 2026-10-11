export type Skin = "sonda" | "caderno" | "blueprint" | "terminal" | "moderno";
export type Activity = "aula" | "leitura" | "exercicios" | "revisao" | "simulado" | "resumo" | "teorico" | "pratico";
export type Result = "certo" | "parcial" | "errado" | "nao";
export type Autonomy = "sozinho" | "anotacoes" | "ajuda" | "resolucao";
export type Comprehension = "total" | "parcial" | "duvidas" | "nao";
export type Priority = "baixa" | "media" | "alta";
export type Status = "pendente" | "concluido" | "cancelado";
export type AssessmentKind = "prova" | "trabalho" | "apresentacao" | "entrega" | "sub";
export type StudyPref = "antes" | "depois" | "ambos";
export type Recovery = "nenhuma" | "sub" | "exame";
export type BlockKind = "aula" | "estudo" | "trabalho" | "deslocamento" | "pessoal" | "descanso";
export type MistakeCategory = "conceitual" | "algebrico" | "aritmetico" | "interpretacao" | "unidade" | "sinal" | "formula" | "metodo" | "atencao" | "tempo";
export type EventType = AssessmentKind | "aula" | "atividade" | "simulado" | "estudo" | "revisao" | "pessoal" | "indisponivel";
export type Scenario = "c" | "e" | "o";

export interface Timer {
  subject_id: string;
  topic_id: string | null;
  activity: Activity;
  /** ms epoch do último "retomar" */
  since: number;
  /** ms epoch do início da sessão */
  started: number;
  /** ms acumulados antes do último "retomar" */
  accum: number;
  running: boolean;
  /** como a sessão aparece na sala: com a matéria, sem a matéria ou só para mim (ausente = sessões antigas) */
  social?: Social;
}
export type Social = "materia" | "anonimo" | "sozinho";

export interface Profile {
  id: string;
  name: string;
  course: string;
  university: string;
  current_semester: string;
  default_min_avg: number;
  weekly_goal_h: number | null;
  skin: Skin;
  timer: Timer | null;
  study_pref: StudyPref;
  /** degraus da revisão espaçada, em dias */
  review_steps: number[];
  /** pesos do índice de domínio (null = padrão) */
  mastery_cfg: Record<string, number> | null;
}

export interface Traits {
  discursiva?: boolean;
  detalhada?: boolean;
  teoria?: boolean;
  calculos?: boolean;
  unidades?: boolean;
  algarismos?: boolean;
  metodos?: string;
  nivel?: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  professor: string;
  semester: string;
  credits: number | null;
  hours: number | null;
  color: string;
  min_avg: number;
  schedule: string;
  notes: string;
  traits: Traits;
  exam_enabled: boolean;
  exam_w_avg: number;
  exam_w_exam: number;
  exam_min_final: number;
  exam_min_take: number | null;
  archived: boolean;
  /** null = segue a preferência do perfil */
  study_pref: StudyPref | null;
  recovery: Recovery;
  /** a SUB substitui a menor nota de prova mesmo se for menor que ela */
  sub_replace_lower: boolean;
}

export interface Topic {
  id: string;
  subject_id: string;
  parent_id: string | null;
  name: string;
  position: number;
  /** data da aula em que o conteúdo é (ou foi) dado */
  taught_on: string | null;
  /** prova em que o conteúdo cai */
  assessment_id: string | null;
}

export interface Session {
  id: string;
  subject_id: string;
  topic_id: string | null;
  activity: Activity;
  started_at: string;
  duration_min: number;
  questions: number | null;
  correct: number | null;
  notes: string;
  confidence: number | null;
  result: Result | null;
  autonomy: Autonomy | null;
  difficulty: number | null;
  comprehension: Comprehension | null;
}

export interface Assessment {
  id: string;
  subject_id: string;
  name: string;
  kind: AssessmentKind;
  date: string | null;
  time: string | null;
  weight: number;
  grade: number | null;
  predicted: number | null;
  sim_c: number | null;
  sim_e: number | null;
  sim_o: number | null;
  priority: Priority;
  status: Status;
  description: string;
  /** prova: SUB que pode substituí-la (null = não tem SUB) */
  sub_id: string | null;
}

export interface CalEvent {
  id: string;
  subject_id: string | null;
  title: string;
  type: EventType;
  date: string;
  time: string | null;
  priority: Priority;
  status: Status;
  description: string;
}

export interface RoomMember {
  user_id: string;
  nick: string;
  share_subject: boolean;
  studying: boolean;
  paused: boolean;
  since: string | null;
  accum_ms: number;
  subject: string;
  updated_at: string;
  /** código para adicionar como amigo */
  friend_code?: string;
  accept_nudges?: boolean;
}

export interface StudyGroup {
  code: string;
  name: string;
  created_by: string | null;
}

export interface GroupMember {
  code: string;
  user_id: string;
}

export interface DailyTotal {
  user_id: string;
  day: string;
  minutes: number;
}

export interface RoutineBlock {
  id: string;
  /** 0 = domingo … 6 = sábado (como Date.getDay) */
  weekday: number;
  start_time: string;
  end_time: string;
  kind: BlockKind;
  subject_id: string | null;
  label: string;
}

export interface Mistake {
  id: string;
  subject_id: string;
  topic_id: string | null;
  session_id: string | null;
  category: MistakeCategory;
  description: string;
  correction: string;
  source: string;
  occurred_on: string;
}

export interface ReviewItem {
  id: string;
  subject_id: string;
  topic_id: string | null;
  mistake_id: string | null;
  /** prova em que a revisão se encerra */
  assessment_id: string | null;
  title: string;
  step: number;
  due: string;
  est_min: number;
  active: boolean;
  last_reviewed_at: string | null;
}

export interface ReviewLog {
  id: string;
  item_id: string;
  reviewed_at: string;
  result: Result;
  autonomy: Autonomy | null;
  confidence: number | null;
  prev_step: number;
  new_step: number;
  prev_due: string;
  new_due: string | null;
}

/** Tarefa da lista de tarefas (to-do) */
export interface Todo {
  id: string;
  title: string;
  subject_id: string | null;
  due: string | null;
  done: boolean;
  done_at: string | null;
}

export type NotificationKind = "relatorio" | "amizade" | "chamado" | "aviso";
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown>;
  from_user: string | null;
  created_at: string;
  read_at: string | null;
}

/** Amizade vista por mim (vem da função my_friendships) */
export interface Friend {
  id: string;
  other: string;
  nick: string;
  status: "pendente" | "aceito";
  incoming: boolean;
}

/* ============ Meu curso (matriz curricular informada pelo aluno) ============ */
/** obrigatoria; vaga = lugar de uma optativa na grade; optativa = disciplina do catálogo de optativas */
export type CourseKind = "obrigatoria" | "vaga" | "optativa" | "estagio" | "tcc" | "extensao" | "complementar";
export type CourseStatus = "pendente" | "cursando" | "aprovada" | "reprovada" | "dispensada";
/** pré-requisito; co = correquisito (pode ser cursado junto) */
export interface Prereq { id: string; co?: boolean }
export interface Course {
  id: string;
  name: string;
  code: string;
  /** fase da matriz (1ª, 2ª…); null = fora das fases (optativas do catálogo, atividades complementares) */
  phase: number | null;
  credits: number;
  kind: CourseKind;
  prereqs: Prereq[];
  /** regra "X% dos créditos anteriores (fases 1 a N)" */
  min_pct: number | null;
  min_phase: number | null;
  status: CourseStatus;
  grade: number | null;
  term: string;
  subject_id: string | null;
  position: number;
}
