"use client";
// Estado do usuário logado: carrega as tabelas privadas, mantém em memória,
// grava de forma otimista e escuta mudanças feitas em outros aparelhos.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sb, friendlyError } from "./supabase";
import type { DemoData } from "./demo";
import { autoStop, forgotten, rollover } from "./timer";
import type { Assessment, CalEvent, Mistake, Profile, ReviewItem, ReviewLog, RoutineBlock, Session, Social, Subject, Timer, Todo, Topic, AppNotification, Course, Habit, HabitCheck } from "./types";

export type Table = "subjects" | "topics" | "study_sessions" | "assessments" | "events" | "routine_blocks" | "mistakes" | "review_items" | "review_logs" | "tasks" | "notifications" | "curriculum" | "habits" | "habit_checks";
type Key = "subjects" | "topics" | "sessions" | "assessments" | "events" | "blocks" | "mistakes" | "reviews" | "reviewLogs" | "todos" | "notes" | "courses" | "habits" | "habitChecks";
const KEY: Record<Table, Key> = {
  subjects: "subjects", topics: "topics", study_sessions: "sessions", assessments: "assessments", events: "events",
  routine_blocks: "blocks", mistakes: "mistakes", review_items: "reviews", review_logs: "reviewLogs", tasks: "todos", notifications: "notes", curriculum: "courses", habits: "habits", habit_checks: "habitChecks",
};
type RowOf = {
  subjects: Subject; topics: Topic; study_sessions: Session; assessments: Assessment; events: CalEvent;
  routine_blocks: RoutineBlock; mistakes: Mistake; review_items: ReviewItem; review_logs: ReviewLog; tasks: Todo; notifications: AppNotification; curriculum: Course; habits: Habit; habit_checks: HabitCheck;
};
export const TABLES = Object.keys(KEY) as Table[];

interface Data {
  profile: Profile | null; subjects: Subject[]; topics: Topic[]; sessions: Session[]; assessments: Assessment[]; events: CalEvent[];
  blocks: RoutineBlock[]; mistakes: Mistake[]; reviews: ReviewItem[]; reviewLogs: ReviewLog[]; todos: Todo[]; notes: AppNotification[]; courses: Course[]; habits: Habit[]; habitChecks: HabitCheck[];
}
const EMPTY: Data = { profile: null, subjects: [], topics: [], sessions: [], assessments: [], events: [], blocks: [], mistakes: [], reviews: [], reviewLogs: [], todos: [], notes: [], courses: [], habits: [], habitChecks: [] };

export interface Store extends Data {
  uid: string;
  /** modo demonstração: dados só na memória, nada vai para o banco */
  demo: boolean;
  email: string;
  ready: boolean;
  save: <T extends Table>(table: T, row: RowOf[T]) => Promise<boolean>;
  saveMany: <T extends Table>(table: T, rows: RowOf[T][]) => Promise<boolean>;
  remove: (table: Table, id: string) => Promise<boolean>;
  updateProfile: (patch: Partial<Profile>) => Promise<boolean>;
  reload: (table?: Table | "profiles") => Promise<void>;
  toast: (msg: string) => void;
  evalId: string | null;
  setEvalId: (id: string | null) => void;
  startTimer: (subject_id: string, topic_id: string | null, activity: Timer["activity"], social: Social) => void;
  setSocial: (social: Social) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => Promise<void>;
  discardTimer: () => void;
}

const Ctx = createContext<Store | null>(null);
export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fora do DataProvider");
  return s;
}

export const timerMs = (t: Timer | null | undefined, now = Date.now()) => (t ? (t.accum || 0) + (t.running ? now - t.since : 0) : 0);
const normTime = <T extends { time: string | null }>(r: T): T => ({ ...r, time: r.time ? r.time.slice(0, 5) : null });
const normBlock = (r: RoutineBlock): RoutineBlock => ({ ...r, start_time: r.start_time.slice(0, 5), end_time: r.end_time.slice(0, 5) });
const PROFILE_COLS = "id,name,course,university,current_semester,default_min_avg,weekly_goal_h,skin,timer,study_pref,review_steps,mastery_cfg";
const COLS: Record<Table, string> = {
  subjects: "id,name,code,professor,semester,credits,hours,color,min_avg,schedule,notes,traits,exam_enabled,exam_w_avg,exam_w_exam,exam_min_final,exam_min_take,archived,study_pref,recovery,sub_replace_lower",
  topics: "id,subject_id,parent_id,name,position,taught_on,assessment_id",
  study_sessions: "id,subject_id,topic_id,activity,started_at,duration_min,questions,correct,notes,confidence,result,autonomy,difficulty,comprehension",
  assessments: "id,subject_id,name,kind,date,time,weight,grade,predicted,sim_c,sim_e,sim_o,priority,status,description,sub_id,felt",
  events: "id,subject_id,title,type,date,time,priority,status,description",
  routine_blocks: "id,weekday,start_time,end_time,kind,subject_id,label",
  mistakes: "id,subject_id,topic_id,session_id,category,description,correction,source,occurred_on",
  review_items: "id,subject_id,topic_id,mistake_id,assessment_id,title,step,due,est_min,active,last_reviewed_at",
  review_logs: "id,item_id,reviewed_at,result,autonomy,confidence,prev_step,new_step,prev_due,new_due",
  tasks: "id,title,subject_id,due,done,done_at",
  notifications: "id,kind,title,body,data,from_user,created_at,read_at",
  curriculum: "id,name,code,phase,credits,kind,prereqs,min_pct,min_phase,status,grade,term,subject_id,position",
  habits: "id,name,position,active",
  habit_checks: "id,habit_id,day",
};

export function DataProvider({ uid, email, children, onToast, demo }: { uid: string; email: string; children: ReactNode; onToast: (m: string) => void; demo?: DemoData }) {
  const [data, setData] = useState<Data>(() => (demo ? { ...EMPTY, ...demo } : EMPTY));
  const [ready, setReady] = useState(!!demo);
  const isDemo = !!demo;
  const [evalId, setEvalId] = useState<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const toast = onToast;

  const fetchTable = useCallback(async (t: Table | "profiles") => {
    const db = sb();
    if (t === "profiles") {
      const { data: p, error } = await db.from("profiles").select(PROFILE_COLS).eq("id", uid).maybeSingle();
      if (error) throw error;
      let prof = p as Profile | null;
      if (!prof) {
        const ins = await db.from("profiles").upsert({ id: uid }).select(PROFILE_COLS).single();
        if (ins.error) throw ins.error;
        prof = ins.data as Profile;
      }
      setData((d) => ({ ...d, profile: prof }));
      return;
    }
    let q = db.from(t).select(COLS[t]);
    if (t === "study_sessions") q = q.order("started_at", { ascending: false }).limit(10000);
    if (t === "review_logs") q = q.order("reviewed_at", { ascending: false }).limit(10000);
    if (t === "notifications") q = q.order("created_at", { ascending: false }).limit(200);
    if (t === "habit_checks") q = q.order("day", { ascending: false }).limit(5000);
    let { data: rows, error } = await q;
    // banco ainda sem a coluna "felt" (migration de "Como foi a prova?" não rodada): carrega sem ela
    if (error && t === "assessments" && /felt/.test(error.message || "")) ({ data: rows, error } = await db.from(t).select(COLS[t].replace(",felt", "")));
    if (error) throw error;
    let list = (rows || []) as unknown as RowOf[typeof t][];
    if (t === "assessments" || t === "events") list = (list as (Assessment | CalEvent)[]).map(normTime) as typeof list;
    if (t === "routine_blocks") list = (list as RoutineBlock[]).map(normBlock) as typeof list;
    setData((d) => ({ ...d, [KEY[t]]: list }));
  }, [uid]);

  const reload = useCallback(async (t?: Table | "profiles") => {
    if (isDemo) return;
    const all: (Table | "profiles")[] = t ? [t] : ["profiles", ...TABLES];
    try {
      await Promise.all(all.map(fetchTable));
    } catch (e) {
      toast(friendlyError(e as { message?: string }));
    }
  }, [fetchTable, toast, isDemo]);

  // carga inicial + tempo real para os próprios dados (outros aparelhos)
  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    reload().then(() => alive && setReady(true));
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    const later = (t: Table | "profiles") => { clearTimeout(timers[t]); timers[t] = setTimeout(() => { if (alive) reload(t); }, 500); };
    const ch = sb().channel("own-" + uid);
    TABLES.forEach((t) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `user_id=eq.${uid}` }, () => later(t)));
    ch.on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${uid}` }, () => later("profiles"));
    ch.subscribe();
    const onVis = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; sb().removeChannel(ch); document.removeEventListener("visibilitychange", onVis); Object.values(timers).forEach(clearTimeout); };
  }, [uid, reload, isDemo]);

  const localPut = <T extends Table>(t: T, rows: RowOf[T][]) =>
    setData((d) => {
      const k = KEY[t];
      const arr = [...(d[k] as unknown as RowOf[T][])];
      for (const row of rows) {
        const i = arr.findIndex((x) => x.id === row.id);
        if (i >= 0) arr[i] = row; else arr.unshift(row);
      }
      return { ...d, [k]: arr };
    });

  const saveMany = useCallback(async <T extends Table>(t: T, rows: RowOf[T][]) => {
    if (!rows.length) return true;
    localPut(t, rows);
    if (isDemo) return true;
    const { error } = await sb().from(t).upsert(rows as never[]);
    if (error) { toast(friendlyError(error)); reload(t); return false; }
    return true;
  }, [reload, toast, isDemo]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(<T extends Table>(t: T, row: RowOf[T]) => saveMany(t, [row]), [saveMany]);

  const remove = useCallback(async (t: Table, id: string) => {
    setData((d) => ({ ...d, [KEY[t]]: (d[KEY[t]] as { id: string }[]).filter((x) => x.id !== id) }));
    if (isDemo) { setData((d) => demoCascade(d, t, id)); return true; }
    const { error } = await sb().from(t).delete().eq("id", id);
    if (error) { toast(friendlyError(error)); reload(t); return false; }
    // cascatas do banco: atualiza tabelas dependentes
    const deps: Partial<Record<Table, Table[]>> = {
      subjects: ["topics", "study_sessions", "assessments", "events", "routine_blocks", "mistakes", "review_items", "review_logs", "tasks", "curriculum"],
      topics: ["topics", "study_sessions", "mistakes", "review_items"],
      assessments: ["topics", "review_items"],
      study_sessions: ["mistakes"],
      mistakes: ["review_items", "review_logs"],
      review_items: ["review_logs"],
      habits: ["habit_checks"],
    };
    deps[t]?.forEach((x) => reload(x));
    return true;
  }, [reload, toast, isDemo]);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    setData((d) => (d.profile ? { ...d, profile: { ...d.profile, ...patch } } : d));
    if (isDemo) return true;
    const { error } = await sb().from("profiles").update(patch).eq("id", uid);
    if (error) { toast(friendlyError(error)); reload("profiles"); return false; }
    return true;
  }, [uid, reload, toast, isDemo]);

  // cronômetro (guardado no perfil para continuar entre aparelhos)
  const startTimer = useCallback((subject_id: string, topic_id: string | null, activity: Timer["activity"], social: Social) => {
    if (dataRef.current.profile?.timer) { toast("Já existe uma sessão em andamento."); return; }
    const now = Date.now();
    updateProfile({ timer: { subject_id, topic_id, activity, since: now, started: now, accum: 0, running: true, social } });
  }, [toast, updateProfile]);
  const setSocial = useCallback((social: Social) => {
    const t = dataRef.current.profile?.timer; if (!t) return;
    updateProfile({ timer: { ...t, social } });
  }, [updateProfile]);
  const pauseTimer = useCallback(() => {
    const t = dataRef.current.profile?.timer; if (!t || !t.running) return;
    updateProfile({ timer: { ...t, accum: timerMs(t), running: false, paused_at: Date.now() } });
  }, [updateProfile]);
  /** grava um pedaço do cronômetro como sessão (no dia em que começou); devolve o id ou null */
  const saveTimerPart = useCallback(async (t: Timer, ms: number, startedAt: number, notes: string) => {
    const minutes = Math.round(ms / 60000);
    if (minutes < 1 || !dataRef.current.subjects.some((x) => x.id === t.subject_id)) return null;
    const s: Session = {
      id: crypto.randomUUID(), subject_id: t.subject_id, topic_id: t.topic_id || null, activity: t.activity,
      started_at: new Date(startedAt).toISOString(), duration_min: Math.min(1440, minutes),
      questions: null, correct: null, notes, confidence: null, result: null, autonomy: null, difficulty: null, comprehension: null,
    };
    return (await save("study_sessions", s)) ? s.id : null;
  }, [save]);
  const resumeTimer = useCallback(async () => {
    const t = dataRef.current.profile?.timer; if (!t || t.running) return;
    const now = Date.now();
    const r = rollover(t, now);
    if (r) {
      // pausada num dia anterior: aquela sessão fica no dia dela e começa uma nova hoje
      await saveTimerPart(t, r.keepMs, r.startedAt, "Sessão pausada encerrada na virada do dia.");
      toast("A sessão pausada de outro dia foi salva; começando uma sessão nova hoje.");
      updateProfile({ timer: { subject_id: t.subject_id, topic_id: t.topic_id, activity: t.activity, since: now, started: now, accum: 0, running: true, social: t.social } });
      return;
    }
    updateProfile({ timer: { ...t, since: now, running: true } });
  }, [updateProfile, saveTimerPart, toast]);
  const discardTimer = useCallback(() => { updateProfile({ timer: null }); }, [updateProfile]);
  const stopTimer = useCallback(async () => {
    let t = dataRef.current.profile?.timer; if (!t) return;
    const r = rollover(t);
    if (r?.next) {
      // passou da meia-noite ligado e a virada ainda não tinha sido feita: o pedaço de ontem fica em ontem
      await saveTimerPart(t, r.keepMs, r.startedAt, "Parte de antes da meia-noite; a sessão continuou no dia seguinte.");
      t = r.next;
    }
    const ms = timerMs(t);
    const s: Session = {
      id: crypto.randomUUID(), subject_id: t.subject_id, topic_id: t.topic_id || null, activity: t.activity,
      started_at: new Date(t.started || Date.now() - ms).toISOString(), duration_min: Math.min(1440, Math.max(1, Math.round(ms / 60000))),
      questions: null, correct: null, notes: "", confidence: null, result: null, autonomy: null, difficulty: null, comprehension: null,
    };
    const exists = dataRef.current.subjects.some((x) => x.id === t.subject_id);
    await updateProfile({ timer: null });
    if (!exists) { toast("A disciplina desta sessão foi excluída; o tempo não foi salvo."); return; }
    if (await save("study_sessions", s)) setEvalId(s.id);
  }, [save, saveTimerPart, toast, updateProfile]);

  // cronômetro esquecido: mais de 20 h seguidas sem pausa → desliga sozinho e avisa
  const autoStopping = useRef(false);
  useEffect(() => {
    if (!ready) return;
    const check = async () => {
      const t = dataRef.current.profile?.timer;
      if (!t || autoStopping.current) return;
      if (!forgotten(t)) {
        const r = rollover(t);
        if (!r) return;
        autoStopping.current = true;
        const day = new Date(r.startedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        if (r.next) {
          // atravessou a meia-noite ligado: o pedaço de ontem vira sessão e o cronômetro segue
          await updateProfile({ timer: r.next });
          await saveTimerPart(t, r.keepMs, r.startedAt, "Parte de antes da meia-noite; a sessão continuou no dia seguinte.");
        } else {
          // pausada desde um dia anterior: encerra e salva no dia em que foi feita
          await updateProfile({ timer: null });
          const id = await saveTimerPart(t, r.keepMs, r.startedAt, "Sessão pausada encerrada na virada do dia.");
          if (id) {
            toast(`A sessão pausada de ${day} foi encerrada e salva nesse dia. Para continuar, comece uma nova.`);
            setEvalId(id);
          }
        }
        autoStopping.current = false;
        return;
      }
      autoStopping.current = true;
      const { keepMs, lostSince, minutes } = autoStop(t);
      const subj = dataRef.current.subjects.find((x) => x.id === t.subject_id);
      await updateProfile({ timer: null });
      if (minutes >= 1 && subj) {
        await save("study_sessions", {
          id: crypto.randomUUID(), subject_id: t.subject_id, topic_id: t.topic_id || null, activity: t.activity,
          started_at: new Date(t.started || lostSince - keepMs).toISOString(), duration_min: Math.min(1440, minutes),
          questions: null, correct: null, notes: "Cronômetro desligado sozinho após 20 h sem pausa; salvo só o tempo até a última pausa.",
          confidence: null, result: null, autonomy: null, difficulty: null, comprehension: null,
        });
      }
      const from = new Date(lostSince).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const body = `O cronômetro${subj ? ` de ${subj.name}` : ""} ficou ligado mais de 20 h sem pausa (desde ${from}) e foi desligado sozinho. ` +
        "Esse trecho não foi salvo, porque não dá para saber quando você parou de verdade" +
        (minutes >= 1 ? `; os ${minutes} min de antes da última pausa foram salvos. ` : ". ") +
        (t.run_since ? "O que foi até a meia-noite já tinha sido salvo como sessão do dia anterior; se não estudou nesse tempo, apague essa sessão no histórico da Sala. " : "") +
        "Se estudou nesse período, registre o tempo certo em Sala → Registrar manualmente.";
      toast("Cronômetro desligado sozinho: ficou mais de 20 h ligado sem pausa.");
      await save("notifications", { id: crypto.randomUUID(), kind: "aviso", title: "Cronômetro desligado sozinho", body, data: {}, from_user: null, created_at: new Date().toISOString(), read_at: null });
      autoStopping.current = false;
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [ready, updateProfile, save, saveTimerPart, toast]);

  const value = useMemo<Store>(() => ({
    ...data, uid, email, ready, demo: isDemo, save, saveMany, remove, updateProfile, reload, toast, evalId, setEvalId,
    startTimer, setSocial, pauseTimer, resumeTimer, stopTimer, discardTimer,
  }), [data, uid, email, ready, isDemo, save, saveMany, remove, updateProfile, reload, toast, evalId, startTimer, setSocial, pauseTimer, resumeTimer, stopTimer, discardTimer]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Demonstração: imita as cascatas do banco ao apagar (só na memória) */
function demoCascade(d: Data, t: Table, id: string): Data {
  const x = { ...d };
  if (t === "subjects") {
    const keep = <R extends { subject_id?: string | null }>(rs: R[]) => rs.filter((r) => r.subject_id !== id);
    Object.assign(x, { topics: keep(x.topics), sessions: keep(x.sessions), assessments: keep(x.assessments), events: keep(x.events), blocks: keep(x.blocks), mistakes: keep(x.mistakes), reviews: keep(x.reviews), todos: keep(x.todos) });
  }
  if (t === "subjects") x.courses = x.courses.map((c) => (c.subject_id === id ? { ...c, subject_id: null } : c));
  if (t === "topics") {
    const un = <R extends { topic_id: string | null }>(rs: R[]) => rs.map((r) => (r.topic_id === id ? { ...r, topic_id: null } : r));
    Object.assign(x, { sessions: un(x.sessions), mistakes: un(x.mistakes), reviews: un(x.reviews), topics: x.topics.map((tp) => (tp.parent_id === id ? { ...tp, parent_id: null } : tp)) });
  }
  if (t === "assessments") Object.assign(x, { topics: x.topics.map((tp) => (tp.assessment_id === id ? { ...tp, assessment_id: null } : tp)), reviews: x.reviews.map((r) => (r.assessment_id === id ? { ...r, assessment_id: null } : r)), assessments: x.assessments.map((a) => (a.sub_id === id ? { ...a, sub_id: null } : a)) });
  if (t === "habits") x.habitChecks = x.habitChecks.filter((c) => c.habit_id !== id);
  if (t === "mistakes") x.reviews = x.reviews.filter((r) => r.mistake_id !== id);
  const items = new Set(x.reviews.map((r) => r.id));
  x.reviewLogs = x.reviewLogs.filter((l) => items.has(l.item_id));
  return x;
}

/* ============ Seletores ============ */
export const activeSubjects = (s: Subject[], all = false) => s.filter((x) => all || !x.archived).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
export const topicName = (topics: Topic[], id: string | null) => (id ? topics.find((t) => t.id === id)?.name || "" : "");

export interface AgendaItem {
  id: string; src: "event" | "item"; title: string; type: CalEvent["type"]; subject_id: string | null; date: string; time: string | null;
  priority: CalEvent["priority"]; status: CalEvent["status"]; description: string; weight?: number; grade?: number | null;
}
export function agenda(subjects: Subject[], assessments: Assessment[], events: CalEvent[]): AgendaItem[] {
  const active = new Set(subjects.filter((s) => !s.archived).map((s) => s.id));
  const out: AgendaItem[] = events.map((e) => ({ ...e, src: "event" as const }));
  for (const a of assessments) {
    if (!a.date || !active.has(a.subject_id)) continue;
    out.push({ id: a.id, src: "item", title: a.name, type: a.kind, subject_id: a.subject_id, date: a.date, time: a.time, priority: a.priority,
      status: a.grade != null ? "concluido" : a.status, description: a.description, weight: a.weight, grade: a.grade });
  }
  return out.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
}
