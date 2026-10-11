// Feriados nacionais de lei (Brasil): sem aula nesses dias. Pontos facultativos (Carnaval, Corpus Christi)
// não entram: dependem da universidade; o aluno marca no calendário como "Sem aula / feriado".
import { addDays, pad } from "./calc";

const FIXED: Record<string, string> = {
  "01-01": "Confraternização Universal", "04-21": "Tiradentes", "05-01": "Dia do Trabalho", "09-07": "Independência do Brasil",
  "10-12": "Nossa Senhora Aparecida", "11-02": "Finados", "11-15": "Proclamação da República", "11-20": "Dia Nacional de Zumbi e da Consciência Negra",
  "12-25": "Natal",
};

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) */
export function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}

/** Nome do feriado nacional na data ("2026-10-12" → "Nossa Senhora Aparecida"), ou null */
export function holidayOf(day: string): string | null {
  const fixed = FIXED[day.slice(5)];
  if (fixed) return fixed;
  if (day === addDays(easter(Number(day.slice(0, 4))), -2)) return "Sexta-feira Santa";
  return null;
}
