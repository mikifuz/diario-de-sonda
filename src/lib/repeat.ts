// Repetir um item do calendário: cada repetição vira um item próprio (sem coluna nova no banco).
export type Repeat = "" | "semana" | "2semanas" | "3semanas" | "mes";
export const REPEAT: Record<Exclude<Repeat, "">, string> = {
  semana: "Toda semana",
  "2semanas": "A cada 2 semanas",
  "3semanas": "A cada 3 semanas",
  mes: "Todo mês",
};
/** Teto de repetições num salvamento (um ano de toda semana) */
export const MAX_REPEAT = 53;

const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Datas da primeira até `until` (inclusive). "Todo mês" usa o mesmo dia; num mês sem esse dia (31), o último dia do mês. */
export function repeatDates(start: string, every: Repeat, until: string): string[] {
  if (!every || !until || until < start) return [start];
  const [y, m, d] = start.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; out.length < MAX_REPEAT; i++) {
    let k: string;
    if (every === "mes") {
      const mm = m - 1 + i, yy = y + Math.floor(mm / 12), mo = (mm % 12) + 1;
      k = key(yy, mo, Math.min(d, lastDay(yy, mo)));
    } else {
      const step = every === "semana" ? 7 : every === "2semanas" ? 14 : 21;
      const t = new Date(Date.UTC(y, m - 1, d + i * step));
      k = key(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    }
    if (k > until) break;
    out.push(k);
  }
  return out;
}

/** Padrão do "repetir até": fim do semestre (julho ou dezembro) */
export function defaultUntil(start: string): string {
  const y = Number(start.slice(0, 4));
  return [`${y}-07-15`, `${y}-12-20`, `${y + 1}-07-15`].find((k) => k > start)!;
}
