"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export const I = {
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  play: "M7 4l13 8-13 8z",
  pause: "M7 4h4v16H7zM14 4h4v16h-4z",
  stop: "M5 5h14v14H5z",
  back: "M15 18l-6-6 6-6",
  chev: "M9 6l6 6-6 6",
  archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
  check: "M5 12l5 5L20 7",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};

export function Icon({ d, s = 18 }: { d: string; s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    const f = ref.current?.querySelector<HTMLElement>("input,select,textarea,button.pri");
    setTimeout(() => f?.focus(), 20);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-h">
          <div>{sub && <span className="lbl">{sub}</span>}<h2>{title}</h2></div>
          <button type="button" className="btn icon ghost" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Grupo de botões de escolha única; clicar no selecionado limpa (exceto se required) */
export function Seg<T extends string | number>({ value, options, onChange, scale, required }: {
  value: T | null | undefined; options: [T, string, string?][]; onChange: (v: T | null) => void; scale?: boolean; required?: boolean;
}) {
  return (
    <div className={"seg" + (scale ? " scale" : "")}>
      {options.map(([k, label, sub]) => (
        <button key={String(k)} type="button" aria-pressed={value === k} onClick={() => onChange(value === k && !required ? null : k)}>
          {sub != null ? (<><b>{label}</b><span>{sub}</span></>) : label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {options.map(([k, n]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{n}</button>)}
    </div>
  );
}

/** Botão de exclusão em dois passos (confirm() não é usado) */
export function ConfirmButton({ label, confirmLabel, question, onConfirm, small }: { label: ReactNode; confirmLabel: string; question?: string; onConfirm: () => void; small?: boolean }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => { if (!ask) return; const t = setTimeout(() => setAsk(false), 6000); return () => clearTimeout(t); }, [ask]);
  if (!ask) return <button type="button" className={"btn danger" + (small ? " sm" : "")} onClick={() => setAsk(true)}>{label}</button>;
  return (
    <span className="row" style={{ gap: 6 }}>
      {question && <span className="small">{question}</span>}
      <button type="button" className={"btn danger" + (small ? " sm" : "")} onClick={onConfirm}>{confirmLabel}</button>
      <button type="button" className={"btn ghost" + (small ? " sm" : "")} onClick={() => setAsk(false)}>Cancelar</button>
    </span>
  );
}

export function Empty({ title, children }: { title?: string; children?: ReactNode }) {
  return <div className="empty">{title && <b>{title}</b>}{children}</div>;
}

export function Dot({ c, size = 8 }: { c: string; size?: number }) {
  return <i className="dot" style={{ background: c, width: size, height: size }} />;
}

/** Relógio que atualiza a cada segundo */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
