"use client";
// Sala de estudos: presença ao vivo, grupos e placar. Só lê/escreve as tabelas
// compartilhadas (room_members, study_groups, group_members) e os totais agregados.
// O banco só devolve quem divide algum grupo comigo (migration sala_por_grupos).
// Criar e entrar em grupo, pedir e bloquear amigos passam por funções do banco, que limitam
// as tentativas com código errado (migration seguranca).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sb, friendlyError } from "./supabase";
import { useStore, timerMs } from "./store";
import { addDays, keyDate, todayKey, weekStartKey } from "./calc";
import { deskState, liveFrom, type Desk } from "./timer";
import { flushPush } from "./pushClient";
import type { DailyTotal, Friend, GroupMember, RoomMember, StudyGroup } from "./types";

interface Room {
  ready: boolean;
  members: RoomMember[];
  groups: StudyGroup[];
  memberships: GroupMember[];
  totals: Record<string, Record<string, number>>;
  me: RoomMember | null;
  myGroups: StudyGroup[];
  join: (nick: string, share: boolean) => Promise<boolean>;
  updateMe: (patch: Partial<Pick<RoomMember, "nick" | "share_subject">>) => Promise<void>;
  leave: () => Promise<void>;
  createGroup: (name: string) => Promise<string | null>;
  joinGroup: (code: string) => Promise<boolean>;
  leaveGroup: (code: string) => Promise<void>;
  friends: Friend[];
  sendFriend: (code: string) => Promise<boolean>;
  acceptFriend: (id: string) => Promise<void>;
  removeFriend: (id: string) => Promise<void>;
  /** recusa ou desfaz e impede novos pedidos da pessoa */
  blockFriend: (id: string) => Promise<void>;
  blocks: Blocked[];
  unblock: (userId: string) => Promise<void>;
  nudge: (to: string, msg: NudgeKey) => Promise<boolean>;
  setAcceptNudges: (v: boolean) => Promise<void>;
}
export interface Blocked { blocked: string; nick: string }
export type NudgeKey = "bora" | "sala" | "revisao" | "prova";
/** Mensagens prontas (o banco só aceita estas) */
export const NUDGES: Record<NudgeKey, string> = { bora: "Bora estudar?", sala: "Tô na sala, vem estudar comigo!", revisao: "Bora revisar junto hoje?", prova: "Prova chegando: bora estudar?" };
const Ctx = createContext<Room | null>(null);
export const useRoom = () => {
  const r = useContext(Ctx);
  if (!r) throw new Error("useRoom fora do RoomProvider");
  return r;
};

export const liveMs = (m: RoomMember, now = Date.now()) => (m.accum_ms || 0) + (m.studying && m.since ? now - new Date(m.since).getTime() : 0);
export function todayMin(m: RoomMember, days: Record<string, number> = {}) {
  const t = todayKey();
  return (days[t] || 0) + liveFrom(m, keyDate(t).getTime()) / 60000;
}
export function weekMin(m: RoomMember, days: Record<string, number> = {}) {
  const a = weekStartKey(todayKey());
  let s = 0;
  for (const [k, v] of Object.entries(days)) if (k >= a) s += v;
  return s + liveFrom(m, keyDate(a).getTime()) / 60000;
}

/** Minutos por dia com o cronômetro ao vivo de hoje somado (para o placar do mês e as sequências) */
export function withLive(m: RoomMember, days: Record<string, number> = {}) {
  const t = todayKey();
  return { ...days, [t]: todayMin(m, days) };
}

/** Mesinha de cada pessoa: acesa, cinza (parou há menos de 1 h) ou nada */
/** De folga hoje (day off marcado na Sala) */
export const isOffToday = (m: RoomMember) => !!m.off_day && m.off_day === todayKey();

export function memberDesk(m: RoomMember, days: Record<string, number> = {}, now = Date.now()): Desk {
  const t = todayKey();
  return deskState(m, (days[t] || 0) > 0 || (days[addDays(t, -1)] || 0) > 0, now);
}

export function RoomProvider({ children }: { children: ReactNode }) {
  const st = useStore();
  const { uid, toast } = st;
  const [ready, setReady] = useState(false);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [memberships, setMemberships] = useState<GroupMember[]>([]);
  const [totalsRaw, setTotalsRaw] = useState<DailyTotal[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [blocks, setBlocks] = useState<Blocked[]>([]);

  // Cada mudança na sala dispara uma nova leitura; as respostas podem chegar fora de ordem.
  // Só vale a resposta da leitura mais recente, senão uma lista velha chegava depois da nova e a
  // pessoa piscava (estudando / parado) até a próxima leitura.
  const seq = useRef({ members: 0, totals: 0 });
  const load = useCallback(async (what: "members" | "groups" | "totals" | "friends" | "all" = "all") => {
    const db = sb();
    try {
      if (what === "members" || what === "all") {
        const n = ++seq.current.members;
        const cols = "user_id,nick,share_subject,studying,paused,since,accum_ms,subject,updated_at,friend_code,accept_nudges,off_day";
        let { data, error } = await db.from("room_members").select(cols);
        // banco ainda sem a coluna off_day (migration de day off não rodada): carrega sem ela
        if (error && /off_day/.test(error.message || "")) ({ data, error } = await db.from("room_members").select(cols.replace(",off_day", "")));
        if (error) throw error;
        if (n === seq.current.members) setMembers((data || []) as RoomMember[]);
      }
      if (what === "groups" || what === "all") {
        const [g, gm] = await Promise.all([db.from("study_groups").select("code,name,created_by"), db.from("group_members").select("code,user_id")]);
        if (g.error) throw g.error;
        if (gm.error) throw gm.error;
        setGroups((g.data || []) as StudyGroup[]);
        setMemberships((gm.data || []) as GroupMember[]);
      }
      if (what === "friends" || what === "all") {
        const { data, error } = await db.rpc("my_friendships");
        if (error) throw error;
        setFriends((data || []) as Friend[]);
        const b = await db.rpc("my_blocks");
        if (b.error) throw b.error;
        setBlocks((b.data || []) as Blocked[]);
      }
      if (what === "totals" || what === "all") {
        const n = ++seq.current.totals;
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
        const { data, error } = await db.rpc("room_daily_totals", { p_days: 35, p_tz: tz });
        if (error) throw error;
        if (n === seq.current.totals) setTotalsRaw(((data || []) as DailyTotal[]).map((r) => ({ ...r, minutes: Number(r.minutes) })));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    load("all").then(() => alive && setReady(true));
    // várias mudanças seguidas (de várias pessoas) viram uma leitura só
    const tm: Record<string, ReturnType<typeof setTimeout>> = {};
    const soon = (w: "members" | "groups" | "all") => { clearTimeout(tm[w]); tm[w] = setTimeout(() => { if (alive) load(w); }, 300); };
    const ch = sb().channel("room")
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members" }, () => soon("members"))
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => soon("groups"))
      .on("postgres_changes", { event: "*", schema: "public", table: "study_groups" }, () => soon("groups"))
      // amizade nova ou desfeita muda quem aparece na sala
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => soon("all"))
      .subscribe();
    const iv = setInterval(() => load("totals"), 60000);
    return () => { alive = false; sb().removeChannel(ch); clearInterval(iv); Object.values(tm).forEach(clearTimeout); };
  }, [load]);

  // totais mudam quando eu registro sessões
  const nSessions = st.sessions.length;
  const lastDur = st.sessions.reduce((a, s) => a + s.duration_min, 0);
  useEffect(() => { if (ready) load("totals"); }, [nSessions, lastDur, ready, load]);

  const me = members.find((m) => m.user_id === uid) || null;

  // presença acompanha o cronômetro
  const timer = st.profile?.timer || null;
  const subjName = timer ? st.subjects.find((s) => s.id === timer.subject_id)?.name || "" : "";
  // Só este aparelho escreve a própria presença quando o SEU cronômetro muda (ou ao entrar na sala),
  // nunca em resposta à linha do banco: com dois aparelhos abertos (um deles com o cronômetro
  // atrasado, ex.: aba em segundo plano), cada um desfazia o que o outro gravava e a pessoa
  // ficava piscando na sala, estudando/parado a cada segundo.
  const meRef = useRef(me);
  meRef.current = me;
  const lastPushed = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const joined = !!me;
  const shareDefault = !!me?.share_subject;
  useEffect(() => {
    const cur = meRef.current;
    if (!cur) { lastPushed.current = null; return; }
    // "estudar sozinho": o cronômetro roda, mas a sala não mostra a sessão
    const t = timer && timer.social !== "sozinho" ? timer : null;
    const showSubject = t ? (t.social ? t.social === "materia" : shareDefault) : false;
    const want = {
      studying: !!(t && t.running),
      paused: !!(t && !t.running),
      since: t && t.running ? new Date(t.since).toISOString() : null,
      accum_ms: t ? Math.round(t.running ? t.accum || 0 : timerMs(t)) : 0,
      subject: showSubject && t ? subjName.slice(0, 120) : "",
    };
    const key = JSON.stringify(want);
    if (key === lastPushed.current) return;
    const first = lastPushed.current === null;
    lastPushed.current = key;
    if (first) {
      // primeira vez: só grava se o banco estiver diferente do meu cronômetro
      const same = want.studying === cur.studying && want.paused === cur.paused && want.accum_ms === Number(cur.accum_ms) && want.subject === cur.subject &&
        (want.since ? !!cur.since && Math.abs(new Date(cur.since).getTime() - new Date(want.since).getTime()) < 1000 : !cur.since);
      if (same) return;
    }
    // updated_at local para a mesinha ficar cinza logo ao parar (o banco devolve o valor certo em seguida)
    setMembers((ms) => ms.map((m) => (m.user_id === uid ? { ...m, ...want, updated_at: new Date().toISOString() } : m)));
    queue.current = queue.current.then(() => sb().from("room_members").update(want).eq("user_id", uid)).then((r) => {
      const error = (r as { error?: unknown } | undefined)?.error;
      if (error) console.error(error);
    });
  }, [joined, shareDefault, timer, subjName, uid]);

  // day off: o grupo vê "de folga hoje" (a folga fica no calendário; aqui só o dia vai para a sala)
  const offToday = st.events.some((e) => e.type === "folga" && e.status !== "cancelado" && e.date === todayKey()) ? todayKey() : null;
  useEffect(() => {
    if (!me || !("off_day" in me) || (me.off_day ?? null) === offToday) return;
    setMembers((ms) => ms.map((m) => (m.user_id === uid ? { ...m, off_day: offToday } : m)));
    sb().from("room_members").update({ off_day: offToday }).eq("user_id", uid).then(({ error }) => { if (error) console.error(error); });
  }, [me, offToday, uid]);

  const join = useCallback(async (nick: string, share: boolean) => {
    const { error } = await sb().from("room_members").upsert({ user_id: uid, nick: nick.trim().slice(0, 30), share_subject: share });
    if (error) { toast(friendlyError(error)); return false; }
    await load("all");
    return true;
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

  const rpcError = (e: { message?: string }) => toast(e.message && !/fetch|network/i.test(e.message) ? e.message : friendlyError(e));
  // o código do grupo é gerado no banco
  const createGroup = useCallback(async (name: string) => {
    const { data, error } = await sb().rpc("create_group", { p_name: name.trim().slice(0, 40) });
    if (error) { rpcError(error); return null; }
    await load("groups");
    return data as string;
  }, [load, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const joinGroup = useCallback(async (code: string) => {
    // os códigos não são listáveis: só dá para saber se existe tentando entrar (com limite de erros)
    const { data, error } = await sb().rpc("join_group", { p_code: code.trim().toUpperCase() });
    if (error) { rpcError(error); return false; }
    if (data === "nao_encontrado") { toast("Nenhum grupo com esse código. Confira com quem criou."); return false; }
    await load("all");
    return true;
  }, [load, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const leaveGroup = useCallback(async (code: string) => {
    const { error } = await sb().from("group_members").delete().eq("code", code).eq("user_id", uid);
    if (error) { toast(friendlyError(error)); return; }
    await load("all");
  }, [uid, load, toast]);

  const sendFriend = useCallback(async (code: string) => {
    const { data, error } = await sb().rpc("send_friend_request", { p_code: code.trim().toUpperCase() });
    if (error) { rpcError(error); return false; }
    if (data === "nao_encontrado") { toast("Nenhuma pessoa com esse código."); return false; }
    if (data === "enviado" || data === "aceito") flushPush();
    toast(data === "enviado" ? "Pedido de amizade enviado." : data === "aceito" ? "Vocês agora são amigos." : data === "ja_amigos" ? "Vocês já são amigos." : "Você já mandou um pedido para essa pessoa.");
    await load("all");
    return true;
  }, [load, toast]); // eslint-disable-line react-hooks/exhaustive-deps
  const acceptFriend = useCallback(async (id: string) => {
    const { error } = await sb().rpc("accept_friend", { p_id: id });
    if (error) { rpcError(error); return; }
    flushPush();
    toast("Amizade aceita.");
    await load("all");
  }, [load, toast]); // eslint-disable-line react-hooks/exhaustive-deps
  const removeFriend = useCallback(async (id: string) => {
    const { error } = await sb().from("friendships").delete().eq("id", id);
    if (error) { toast(friendlyError(error)); return; }
    await load("all");
  }, [load, toast]);
  const blockFriend = useCallback(async (id: string) => {
    const { error } = await sb().rpc("block_friend", { p_id: id });
    if (error) { rpcError(error); return; }
    toast("Pessoa bloqueada: ela não consegue mais mandar pedidos para você.");
    await load("all");
  }, [load, toast]); // eslint-disable-line react-hooks/exhaustive-deps
  const unblock = useCallback(async (userId: string) => {
    const { error } = await sb().from("friend_blocks").delete().eq("user_id", uid).eq("blocked", userId);
    if (error) { toast(friendlyError(error)); return; }
    toast("Desbloqueado.");
    await load("friends");
  }, [uid, load, toast]);
  const nudge = useCallback(async (to: string, msg: NudgeKey) => {
    const { error } = await sb().rpc("nudge_friend", { p_to: to, p_msg: msg });
    if (error) { rpcError(error); return false; }
    flushPush();
    toast("Chamado enviado.");
    return true;
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps
  const setAcceptNudges = useCallback(async (v: boolean) => {
    setMembers((ms) => ms.map((m) => (m.user_id === uid ? { ...m, accept_nudges: v } : m)));
    const { error } = await sb().from("room_members").update({ accept_nudges: v }).eq("user_id", uid);
    if (error) { toast(friendlyError(error)); load("members"); }
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

  const value = useMemo<Room>(() => ({ ready, members, groups, memberships, totals, me, myGroups, join, updateMe, leave, createGroup, joinGroup, leaveGroup, friends, sendFriend, acceptFriend, removeFriend, blockFriend, blocks, unblock, nudge, setAcceptNudges }),
    [ready, members, groups, memberships, totals, me, myGroups, join, updateMe, leave, createGroup, joinGroup, leaveGroup, friends, sendFriend, acceptFriend, removeFriend, blockFriend, blocks, unblock, nudge, setAcceptNudges]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Sala da demonstração: colegas e amiga de exemplo, nada vai para o banco */
export function DemoRoomProvider({ demo, children }: { demo: import("./demo").DemoRoom; children: ReactNode }) {
  const st = useStore();
  const { uid, toast } = st;
  const timer = st.profile?.timer || null;
  // hora da última mudança do meu cronômetro (para a mesinha); antes disso, a do exemplo
  const [changedAt, setChangedAt] = useState<string | null>(null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setChangedAt(new Date().toISOString()); }, [timer]);
  const members = useMemo(() => demo.members.map((m) => {
    if (m.user_id !== uid) return m;
    const t = timer && timer.social !== "sozinho" ? timer : null;
    const off = st.events.some((e) => e.type === "folga" && e.status !== "cancelado" && e.date === todayKey()) ? todayKey() : null;
    return { ...m, off_day: off, updated_at: changedAt || new Date(0).toISOString(), studying: !!(t && t.running), paused: !!(t && !t.running), since: t && t.running ? new Date(t.since).toISOString() : null,
      accum_ms: t ? Math.round(t.running ? t.accum || 0 : timerMs(t)) : 0, subject: t && t.social === "materia" ? st.subjects.find((s) => s.id === t.subject_id)?.name || "" : "" };
  }), [demo.members, uid, timer, st.subjects, st.events, changedAt]);
  const totals = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const r of demo.totals) (out[r.user_id] ||= {})[r.day] = r.minutes;
    return out;
  }, [demo.totals]);
  const value = useMemo<Room>(() => {
    const only = async () => { toast("Na demonstração, a sala, os grupos e os amigos são de exemplo."); return false; };
    return {
      ready: true, members, groups: demo.groups, memberships: demo.memberships, totals, me: members.find((m) => m.user_id === uid) || null, myGroups: demo.groups,
      join: only, updateMe: async () => { await only(); }, leave: async () => { await only(); }, createGroup: async () => { await only(); return null; },
      joinGroup: only, leaveGroup: async () => { await only(); }, friends: demo.friends, sendFriend: only,
      acceptFriend: async () => { await only(); }, removeFriend: async () => { await only(); },
      blockFriend: async () => { await only(); }, blocks: [], unblock: async () => { await only(); },
      nudge: async (_to, msg) => { toast(`Exemplo: na conta de verdade, sua amiga receberia "${NUDGES[msg]}".`); return true; },
      setAcceptNudges: async () => { await only(); },
    };
  }, [members, demo, totals, uid, toast]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
