"use client";
// Estado do usuário logado: carrega as tabelas privadas, mantém em memória,
// grava de forma otimista e escuta mudanças feitas em outros aparelhos.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sb, friendlyError } from "./supabase";
import type { Assessment, CalEvent, Profile, Session, Subject, Timer, Topic } from "./types";

export type Table = "subjects" | "topics" | "study_sessions" | "assessments" | "events";
type Key = "subjects" | "topics" | "sessions" | "assessments" | "events";
const KEY: Record<Table, Key> = { subjects: "subjects", topics: "topics", study_sessions: "sessions", assessments: "assessments", events: "events" };
type RowOf = { subjects: Subject; topics: Topic; study_sessions: Session; assessments: Assessment; events: CalEvent };

interface Data { profile: Profile | null; subjects: Subject[]; topics: Topic[]; sessions: Session[]; assessments: Assessment[]; events: CalEvent[] }
const EMPTY: Data = { profile: null, subjects: [], topics: [], sessions: [], assessments: [], events: [] };

export interface Store extends Data {
  uid: string;
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
  startTimer: (subject_id: string, topic_id: string | null, activity: Timer["activity"]) => void;
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
const COLS: Record<Table, string> = {
  subjects: "id,name,code,professor,semester,credits,hours,color,min_avg,schedule,notes,traits,exam_enabled,exam_w_avg,exam_w_exam,exam_min_final,exam_min_take,archived",
  topics: "id,subject_id,parent_id,name,position",
  study_sessions: "id,subject_id,topic_id,activity,started_at,duration_min,questions,correct,notes,confidence,result,autonomy,difficulty,comprehension",
  assessments: "id,subject_id,name,kind,date,time,weight,grade,predicted,sim_c,sim_e,sim_o,priority,status,description",
  events: "id,subject_id,title,type,date,time,priority,status,description",
};

export function DataProvider({ uid, email, children, onToast }: { uid: string; email: string; children: ReactNode; onToast: (m: string) => void }) {
  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);
  const [evalId, setEvalId] = useState<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const toast = onToast;

  const fetchTable = useCallback(async (t: Table | "profiles") => {
    const db = sb();
    if (t === "profiles") {
      const { data: p, error } = await db.from("profiles").select("id,name,course,university,current_semester,default_min_avg,weekly_goal_h,skin,timer").eq("id", uid).maybeSingle();
      if (error) throw error;
      let prof = p as Profile | null;
      if (!prof) {
        const ins = await db.from("profiles").upsert({ id: uid }).select("id,name,course,university,current_semester,default_min_avg,weekly_goal_h,skin,timer").single();
        if (ins.error) throw ins.error;
        prof = ins.data as Profile;
      }
      setData((d) => ({ ...d, profile: prof }));
      return;
    }
    let q = db.from(t).select(COLS[t]);
    if (t === "study_sessions") q = q.order("started_at", { ascending: false }).limit(10000);
    const { data: rows, error } = await q;
    if (error) throw error;
    let list = (rows || []) as unknown as RowOf[typeof t][];
    if (t === "assessments" || t === "events") list = (list as (Assessment | CalEvent)[]).map(normTime) as typeof list;
    setData((d) => ({ ...d, [KEY[t]]: list }));
  }, [uid]);

  const reload = useCallback(async (t?: Table | "profiles") => {
    const all: (Table | "profiles")[] = t ? [t] : ["profiles", "subjects", "topics", "study_sessions", "assessments", "events"];
    try {
      await Promise.all(all.map(fetchTable));
    } catch (e) {
      toast(friendlyError(e as { message?: string }));
    }
  }, [fetchTable, toast]);

  // carga inicial + tempo real para os próprios dados (outros aparelhos)
  useEffect(() => {
    let alive = true;
    reload().then(() => alive && setReady(true));
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    const later = (t: Table | "profiles") => { clearTimeout(timers[t]); timers[t] = setTimeout(() => { if (alive) reload(t); }, 500); };
    const ch = sb().channel("own-" + uid);
    (["subjects", "topics", "study_sessions", "assessments", "events"] as Table[]).forEach((t) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `user_id=eq.${uid}` }, () => later(t)));
    ch.on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${uid}` }, () => later("profiles"));
    ch.subscribe();
    const onVis = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; sb().removeChannel(ch); document.removeEventListener("visibilitychange", onVis); Object.values(timers).forEach(clearTimeout); };
  }, [uid, reload]);

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
    const { error } = await sb().from(t).upsert(rows as never[]);
    if (error) { toast(friendlyError(error)); reload(t); return false; }
    return true;
  }, [reload, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(<T extends Table>(t: T, row: RowOf[T]) => saveMany(t, [row]), [saveMany]);

  const remove = useCallback(async (t: Table, id: string) => {
    setData((d) => ({ ...d, [KEY[t]]: (d[KEY[t]] as { id: string }[]).filter((x) => x.id !== id) }));
    const { error } = await sb().from(t).delete().eq("id", id);
    if (error) { toast(friendlyError(error)); reload(t); return false; }
    // cascatas do banco: atualiza tabelas dependentes
    if (t === "subjects") { reload("topics"); reload("study_sessions"); reload("assessments"); reload("events"); }
    if (t === "topics") { reload("topics"); reload("study_sessions"); }
    return true;
  }, [reload, toast]);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    setData((d) => (d.profile ? { ...d, profile: { ...d.profile, ...patch } } : d));
    const { error } = await sb().from("profiles").update(patch).eq("id", uid);
    if (error) { toast(friendlyError(error)); reload("profiles"); return false; }
    return true;
  }, [uid, reload, toast]);

  // cronômetro (guardado no perfil para continuar entre aparelhos)
  const startTimer = useCallback((subject_id: string, topic_id: string | null, activity: Timer["activity"]) => {
    if (dataRef.current.profile?.timer) { toast("Já existe uma sessão em andamento."); return; }
    const now = Date.now();
    updateProfile({ timer: { subject_id, topic_id, activity, since: now, started: now, accum: 0, running: true } });
  }, [toast, updateProfile]);
  const pauseTimer = useCallback(() => {
    const t = dataRef.current.profile?.timer; if (!t || !t.running) return;
    updateProfile({ timer: { ...t, accum: timerMs(t), running: false } });
  }, [updateProfile]);
  const resumeTimer = useCallback(() => {
    const t = dataRef.current.profile?.timer; if (!t || t.running) return;
    updateProfile({ timer: { ...t, since: Date.now(), running: true } });
  }, [updateProfile]);
  const discardTimer = useCallback(() => { updateProfile({ timer: null }); }, [updateProfile]);
  const stopTimer = useCallback(async () => {
    const t = dataRef.current.profile?.timer; if (!t) return;
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
  }, [save, toast, updateProfile]);

  const value = useMemo<Store>(() => ({
    ...data, uid, email, ready, save, saveMany, remove, updateProfile, reload, toast, evalId, setEvalId,
    startTimer, pauseTimer, resumeTimer, stopTimer, discardTimer,
  }), [data, uid, email, ready, save, saveMany, remove, updateProfile, reload, toast, evalId, startTimer, pauseTimer, resumeTimer, stopTimer, discardTimer]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
