// Cronômetro esquecido e a mesinha da sala. Funções puras, testadas em timer.test.ts.
import type { Timer } from "./types";

/** Depois de 20 h seguidas sem pausa, o cronômetro é desligado sozinho (pedido do dono: quase sempre é esquecimento) */
export const MAX_RUN_MS = 20 * 3600_000;

/** Ligado sem pausa há mais de 20 h? */
export const forgotten = (t: Timer | null | undefined, now = Date.now()) => !!t && t.running && now - t.since > MAX_RUN_MS;

/**
 * O que salvar ao desligar sozinho. Não dá para saber quando a pessoa parou de verdade,
 * então o trecho sem pausa não é salvo (nada de inventar 20 h de estudo); só o tempo
 * acumulado antes da última retomada, que já foi interrompido por uma pausa.
 */
export function autoStop(t: Timer) {
  const keepMs = Math.max(0, t.accum || 0);
  return { keepMs, lostSince: t.since, minutes: Math.round(keepMs / 60000) };
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
