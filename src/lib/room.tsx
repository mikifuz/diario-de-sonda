"use client";
// Sala de estudos: presença ao vivo, grupos e placar. Só lê/escreve as tabelas
// compartilhadas (room_members, study_groups, group_members) e os totais agregados.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sb, friendlyError } from "./supabase";
import { useStore, timerMs } from "./store";
import { addDays, todayKey, weekStartKey } from "./calc";
import type { DailyTotal, GroupMember, RoomMember, StudyGroup } from "./types";

const CODE_CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newCode = () => Array.from({ length: 6 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join("");

interface Room {
  ready: boolean;
  members: RoomMember[];
  groups: StudyGroup[];
  memberships: GroupMember[];
  totals: Record<string, Record<string, number>>;
  me: RoomMember | null;
  myGroups: StudyGroup[];
  join: (nick: string, share: boolean) => Promise<void>;
  updateMe: (patch: Partial<Pick<RoomMember, "nick" | "share_subject">>) => Promise<void>;
  leave: () => Promise<void>;
  createGroup: (name: string) => Promise<string | null>;
  joinGroup: (code: string) => Promise<boolean>;
  leaveGroup: (code: string) => Promise<void>;
}
const Ctx = createContext<Room | null>(null);
export const useRoom = () => {
  const r = useContext(Ctx);
  if (!r) throw new Error("useRoom fora do RoomProvider");
  return r;
};

export const liveMs = (m: RoomMember, now = Date.now()) => (m.accum_ms || 0) + (m.studying && m.since ? now - new Date(m.since).getTime() : 0);
export function todayMin(m: RoomMember, days: Record<string, number> = {}) {
  return (days[todayKey()] || 0) + (m.studying || m.paused ? liveMs(m) / 60000 : 0);
}
export function weekMin(m: RoomMember, days: Record<string, number> = {}) {
  const a = weekStartKey(todayKey());
  let s = 0;
  for (const [k, v] of Object.entries(days)) if (k >= a) s += v;
  return s + (m.studying || m.paused ? liveMs(m) / 60000 : 0);
}

export function RoomProvider({ children }: { children: ReactNode }) {
  const st = useStore();
  const { uid, toast } = st;
  const [ready, setReady] = useState(false);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [memberships, setMemberships] = useState<GroupMember[]>([]);
  const [totalsRaw, setTotalsRaw] = useState<DailyTotal[]>([]);

  const load = useCallback(async (what: "members" | "groups" | "totals" | "all" = "all") => {
    const db = sb();
    try {
      if (what === "members" || what === "all") {
        const { data, error } = await db.from("room_members").select("user_id,nick,share_subject,studying,paused,since,accum_ms,subject,updated_at");
        if (error) throw error;
        setMembers((data || []) as RoomMember[]);
      }
      if (what === "groups" || what === "all") {
        const [g, gm] = await Promise.all([db.from("study_groups").select("code,name,created_by"), db.from("group_members").select("code,user_id")]);
        if (g.error) throw g.error;
        if (gm.error) throw gm.error;
        setGroups((g.data || []) as StudyGroup[]);
        setMemberships((gm.data || []) as GroupMember[]);
      }
      if (what === "totals" || what === "all") {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
        const { data, error } = await db.rpc("room_daily_totals", { p_days: 35, p_tz: tz });
        if (error) throw error;
        setTotalsRaw(((data || []) as DailyTotal[]).map((r) => ({ ...r, minutes: Number(r.minutes) })));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    load("all").then(() => alive && setReady(true));
    const ch = sb().channel("room")
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members" }, () => load("members"))
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => load("groups"))
      .on("postgres_changes", { event: "*", schema: "public", table: "study_groups" }, () => load("groups"))
      .subscribe();
    const iv = setInterval(() => load("totals"), 60000);
    return () => { alive = false; sb().removeChannel(ch); clearInterval(iv); };
  }, [load]);

  // totais mudam quando eu registro sessões
  const nSessions = st.sessions.length;
  const lastDur = st.sessions.reduce((a, s) => a + s.duration_min, 0);
  useEffect(() => { if (ready) load("totals"); }, [nSessions, lastDur, ready, load]);

  const me = members.find((m) => m.user_id === uid) || null;

  // presença acompanha o cronômetro
  const timer = st.profile?.timer || null;
  const subjName = timer ? st.subjects.find((s) => s.id === timer.subject_id)?.name || "" : "";
  const pushing = useRef(false);
  useEffect(() => {
    if (!me || pushing.current) return;
    const want = {
      studying: !!(timer && timer.running),
      paused: !!(timer && !timer.running),
      since: timer && timer.running ? new Date(timer.since).toISOString() : null,
      accum_ms: timer ? Math.round(timer.running ? timer.accum || 0 : timerMs(timer)) : 0,
      subject: me.share_subject && timer ? subjName.slice(0, 120) : "",
    };
    const same = want.studying === me.studying && want.paused === me.paused && want.accum_ms === Number(me.accum_ms) && want.subject === me.subject &&
      (want.since ? !!me.since && Math.abs(new Date(me.since).getTime() - new Date(want.since).getTime()) < 1000 : !me.since);
    if (same) return;
    pushing.current = true;
    setMembers((ms) => ms.map((m) => (m.user_id === uid ? { ...m, ...want } : m)));
    sb().from("room_members").update(want).eq("user_id", uid).then(({ error }) => {
      pushing.current = false;
      if (error) console.error(error);
    });
  }, [me, timer, subjName, uid]);

  const join = useCallback(async (nick: string, share: boolean) => {
    const { error } = await sb().from("room_members").upsert({ user_id: uid, nick: nick.trim().slice(0, 30), share_subject: share });
    if (error) { toast(friendlyError(error)); return; }
    await load("all");
    toast("Você entrou na sala.");
  }, [uid, load, toast]);

  const updateMe = useCallback(async (patch: Partial<Pick<RoomMember, "nick" | "share_subject">>) => {
    setMembers((ms) => ms.map((m) => (m.user_id === uid ? { ...m, ...patch } : m)));
    const { error } = await sb().from("room_members").update(patch).eq("user_id", uid);
    if (error) { toast(friendlyError(error)); load("members"); return; }
    toast("Presença atualizada.");
  }, [uid, load, toast]);

  const leave = useCallback(async () => {
    const { error } = await sb().from("room_members").delete().eq("user_id", uid);
    if (error) { toast(friendlyError(error)); return; }
    await load("all");
    toast("Você saiu da sala.");
  }, [uid, load, toast]);

  const createGroup = useCallback(async (name: string) => {
    for (let i = 0; i < 4; i++) {
      const code = newCode();
      const g = await sb().from("study_groups").insert({ code, name: name.trim().slice(0, 40), created_by: uid });
      if (g.error && g.error.code === "23505") continue; // código repetido: tenta outro
      if (g.error) { toast(friendlyError(g.error)); return null; }
      const m = await sb().from("group_members").insert({ code, user_id: uid });
      if (m.error) { toast(friendlyError(m.error)); return null; }
      await load("groups");
      return code;
    }
    toast("Não foi possível gerar um código. Tente de novo.");
    return null;
  }, [uid, load, toast]);

  const joinGroup = useCallback(async (code: string) => {
    const c = code.trim().toUpperCase();
    if (!groups.some((g) => g.code === c)) { toast("Nenhum grupo com esse código. Confira com quem criou."); return false; }
    const { error } = await sb().from("group_members").insert({ code: c, user_id: uid });
    if (error && error.code !== "23505") { toast(friendlyError(error)); return false; }
    await load("groups");
    return true;
  }, [groups, uid, load, toast]);

  const leaveGroup = useCallback(async (code: string) => {
    const { error } = await sb().from("group_members").delete().eq("code", code).eq("user_id", uid);
    if (error) { toast(friendlyError(error)); return; }
    await load("groups");
  }, [uid, load, toast]);

  const totals = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    const from = addDays(todayKey(), -34);
    for (const r of totalsRaw) if (r.day >= from) (out[r.user_id] ||= {})[r.day] = r.minutes;
    return out;
  }, [totalsRaw]);

  const myGroups = useMemo(() => {
    const codes = new Set(memberships.filter((m) => m.user_id === uid).map((m) => m.code));
    return groups.filter((g) => codes.has(g.code)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [groups, memberships, uid]);

  const value = useMemo<Room>(() => ({ ready, members, groups, memberships, totals, me, myGroups, join, updateMe, leave, createGroup, joinGroup, leaveGroup }),
    [ready, members, groups, memberships, totals, me, myGroups, join, updateMe, leave, createGroup, joinGroup, leaveGroup]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
