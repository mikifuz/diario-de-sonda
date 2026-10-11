// Mesinha da sala (pedido do dono): bonequinho sentado atrás da mesa, abajur de um lado e livro aberto do outro.
// Estudando: abajur aceso e a pessoa iluminada. Parou há menos de 1 h: abajur apagado e tudo cinza.
// Parou há mais de 1 h: não aparece (quem decide é `deskState` em lib/timer.ts).
import type { Desk as DeskState } from "@/lib/timer";

export function Desk({ state, size = 120, label }: { state: Exclude<DeskState, null>; size?: number; label?: string }) {
  const on = state === "estudando";
  return (
    <svg className={"desk" + (on ? " on" : " off")} viewBox="0 0 120 76" width={size} height={(size * 76) / 120} role="img"
      aria-label={label || (on ? "Estudando: abajur aceso" : "Parou há pouco: abajur apagado")}>
      {on && <>
        <circle className="desk-halo" cx="60" cy="36" r="24" fill="var(--warn)" opacity=".16" />
        <polygon points="13,34 29,34 42,54 0,54" fill="var(--warn)" opacity=".22" />
      </>}
      {/* bonequinho atrás da mesa */}
      <circle cx="60" cy="24" r="7.5" fill="var(--accent)" />
      <path d="M45 54 Q45 35 60 35 Q75 35 75 54 Z" fill="var(--accent)" />
      {/* abajur */}
      <rect x="14" y="51" width="14" height="3" rx="1.5" fill="var(--fg)" />
      <line x1="21" y1="51" x2="21" y2="34" stroke="var(--fg)" strokeWidth="2" />
      <path d="M13 34 L29 34 L25 24 L17 24 Z" fill={on ? "var(--warn)" : "var(--muted)"} stroke="var(--fg)" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="21" cy="35.5" r="2.2" fill={on ? "var(--warn)" : "var(--muted)"} />
      {/* livro aberto */}
      <path d="M83 54 L83 47 Q89 44.5 95 47.5 Q101 44.5 107 47 L107 54 Q101 51.5 95 54 Q89 51.5 83 54 Z" fill="var(--panel)" stroke="var(--fg)" strokeWidth="1.2" strokeLinejoin="round" />
      <line x1="95" y1="47.5" x2="95" y2="54" stroke="var(--fg)" strokeWidth="1" />
      {/* mesa: tampo e dois pés */}
      <rect x="4" y="54" width="112" height="4" rx="1" fill="var(--fg)" />
      <rect x="10" y="58" width="3" height="17" fill="var(--fg)" />
      <rect x="107" y="58" width="3" height="17" fill="var(--fg)" />
    </svg>
  );
}
