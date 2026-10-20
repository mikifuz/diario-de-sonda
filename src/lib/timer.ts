// Cronômetro esquecido e a mesinha da sala. Funções puras, testadas em timer.test.ts.
import { dkey } from "./calc";
import type { Session, Timer } from "./types";

/** Depois de 20 h seguidas sem pausa, o cronômetro é desligado sozinho (pedido do dono: quase sempre é esquecimento) */
export const MAX_RUN_MS = 20 * 3600_000;

/** Ligado sem pausa há mais de 20 h? */
export const forgotten = (t: Timer | null | undefined, now = Date.now()) => !!t && t.running && now - (t.run_since ?? t.since) > MAX_RUN_MS;

/**
 * O que salvar ao desligar sozinho. Não dá para saber quando a pessoa parou de verdade,
 * então o trecho sem pausa não é salvo (nada de inventar 20 h de estudo); só o tempo
 * acumulado antes da última retomada, que já foi interrompido por uma pausa.
 */
export function autoStop(t: Timer) {
  const keepMs = Math.max(0, t.accum || 0);
  return { keepMs, lostSince: t.run_since ?? t.since, minutes: Math.round(keepMs / 60000) };
}

/** Meia-noite (fuso local) logo depois de `ms` */
export function nextMidnight(ms: number) {
  const d = new Date(ms);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/**
 * Virada do dia (pedido do dono): cada dia conta o que foi estudado nele.
 * - Pausada num dia anterior: a sessão se encerra com o tempo que tinha (fica no dia em que foi feita);
 *   voltar a estudar é uma sessão nova.
 * - Ligada atravessando a meia-noite: o que foi até a meia-noite vira uma sessão do dia anterior
 *   e o cronômetro segue ligado, contando do zero a partir da meia-noite.
 * `keepMs` é o que salvar (o dia é o de `startedAt`); `next` é o cronômetro que continua (ou null).
 * Mais de uma meia-noite sem pausa já passa de 20 h e cai em `forgotten`, que é checado antes.
 */
export function rollover(t: Timer | null | undefined, now = Date.now()): { kind: "pausada" | "meia-noite"; keepMs: number; startedAt: number; next: Timer | null } | null {
  if (!t) return null;
  const today = dkey(now);
  const startedAt = t.started || t.since;
  if (!t.running) {
    if (dkey(t.paused_at ?? t.since) >= today) return null;
    return { kind: "pausada", keepMs: Math.max(0, t.accum || 0), startedAt, next: null };
  }
  if (dkey(t.since) >= today) return null;
  const mid = nextMidnight(t.since);
  return {
    kind: "meia-noite", keepMs: Math.max(0, (t.accum || 0) + mid - t.since), startedAt,
    next: { ...t, started: mid, since: mid, accum: 0, run_since: t.run_since ?? t.since },
  };
}

/**
 * Quanto do cronômetro ao vivo de alguém da sala conta a partir de `from` (ms; meia-noite de hoje ou
 * início da semana), para quem ainda não abriu o app depois da virada do dia: pausado antes de `from`
 * não conta; ligado desde antes de `from` só conta de `from` em diante.
 */
export function liveFrom(m: { studying: boolean; paused: boolean; since: string | null; accum_ms: number; updated_at: string }, from: number, now = Date.now()) {
  if (m.studying && m.since) {
    const s = new Date(m.since).getTime();
    return s >= from ? Number(m.accum_ms || 0) + Math.max(0, now - s) : Math.max(0, now - from);
  }
  if (m.paused) return new Date(m.updated_at).getTime() >= from ? Number(m.accum_ms || 0) : 0;
  return 0;
}

/** Mesinha da sala: abajur aceso estudando; tudo cinza parado há menos de 1 h; some depois disso */
export type Desk = "estudando" | "parou" | null;
export const DESK_FADE_MS = 3600_000;

/**
 * `changedAt` é a última mudança de presença (`room_members.updated_at`); `studiedRecently`
 * diz se há minutos salvos hoje ou ontem, para não acender a mesa de quem só trocou o apelido.
 */
export function deskState(m: { studying: boolean; paused: boolean; updated_at: string }, studiedRecently: boolean, now = Date.now()): Desk {
  if (m.studying) return "estudando";
  const ago = now - new Date(m.updated_at).getTime();
  if (!(ago >= 0 && ago < DESK_FADE_MS)) return null;
  return m.paused || studiedRecently ? "parou" : null;
}

/**
 * "Parei de estudar às HH:MM" (pedido do dono: esqueceu o cronômetro ligado depois de parar):
 * o instante mais recente com esse horário que não passa de `endedAt` (pode ser ontem, se virou a noite).
 */
export function stopAtFrom(hhmm: string, endedAt: number): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  const d = new Date(endedAt);
  d.setHours(+m[1], +m[2], 0, 0);
  if (d.getTime() > endedAt) d.setDate(d.getDate() - 1);
  return d.getTime();
}

const endOf = (s: Session) => new Date(s.started_at).getTime() + s.duration_min * 60000;

/**
 * A sessão que acabou de ser salva e as anteriores grudadas nela (mesma disciplina, terminam onde a
 * seguinte começa; ex.: o pedaço de antes da meia-noite), da mais antiga para a mais nova.
 */
export function sessionChain(sessions: Session[], lastId: string): Session[] {
  const last = sessions.find((s) => s.id === lastId);
  if (!last) return [];
  const out = [last];
  for (;;) {
    const start = new Date(out[0].started_at).getTime();
    const prev = sessions.find((s) => s.subject_id === last.subject_id && !out.includes(s) && Math.abs(endOf(s) - start) <= 2 * 60000);
    if (!prev) return out;
    out.unshift(prev);
  }
}

/**
 * Tira do fim da cadeia o tempo entre `stopAt` (quando parou de verdade) e `endedAt` (quando o
 * cronômetro foi encerrado): sessões inteiras depois de `stopAt` são apagadas, a do meio encurta.
 * Devolve null se `stopAt` é antes do começo (não sobraria nada) ou depois do fim.
 */
export function trimTail(chain: Session[], endedAt: number, stopAt: number) {
  let cut = Math.round((endedAt - stopAt) / 60000);
  if (!chain.length || cut < 1) return null;
  const cutMin = cut;
  const update: Session[] = [], remove: string[] = [];
  for (let i = chain.length - 1; i >= 0 && cut > 0; i--) {
    const s = chain[i];
    if (cut >= s.duration_min) { remove.push(s.id); cut -= s.duration_min; }
    else { update.push({ ...s, duration_min: s.duration_min - cut }); cut = 0; }
  }
  if (cut > 0 || remove.length === chain.length) return null;
  return { update, remove, cutMin, keptMin: chain.reduce((a, s) => a + s.duration_min, 0) - cutMin };
}
