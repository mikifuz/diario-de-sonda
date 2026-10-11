"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PAGES } from "@/lib/constants";
import { useStore, timerMs } from "@/lib/store";
import { useRoom } from "@/lib/room";
import { fmtClock } from "@/lib/calc";
import { Brand } from "./Brand";
import { Icon, useNow } from "./ui";
import { EvalModal } from "./modals";

function TimerPill() {
  const st = useStore();
  const now = useNow();
  const t = st.profile?.timer;
  if (!t) return null;
  const s = st.subjects.find((x) => x.id === t.subject_id);
  return (
    <Link href="/sala" className={"timer-pill" + (t.running ? "" : " paused")} aria-label="Cronômetro em andamento">
      <i className="dot" /><span>{fmtClock(timerMs(t, now))}</span><span className="hide-m small" style={{ color: "var(--muted)" }}>{s?.name}</span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const st = useStore();
  const room = useRoom();
  const path = usePathname() || "/painel";
  const page = PAGES.find((p) => path.startsWith(p.href)) || PAGES[0];
  const live = room.members.filter((m) => m.studying && m.user_id !== st.uid).length;

  // tema salvo no perfil
  const skin = st.profile?.skin;
  useEffect(() => {
    if (!skin) return;
    if (skin === "moderno") document.documentElement.removeAttribute("data-skin");
    else document.documentElement.setAttribute("data-skin", skin);
    try { localStorage.setItem("ds-skin", skin); } catch { /* armazenamento indisponível */ }
  }, [skin]);

  const isSubjectPage = /^\/disciplinas\/[^/]+/.test(path);
  const title = isSubjectPage ? st.subjects.find((s) => path.endsWith(s.id))?.name || "Disciplina" : page.t;

  return (
    <div className="app">
      <aside className="side" aria-label="Navegação">
        <Brand />
        <nav className="nav">
          {PAGES.map((p) => (
            <Link key={p.href} href={p.href} aria-current={page.href === p.href ? "page" : undefined}>
              <Icon d={p.ic} /><span>{p.full}</span>
              {p.href === "/sala" && live > 0 && <span className="chip ok" style={{ marginLeft: "auto" }} title="Estudando agora">{live}</span>}
            </Link>
          ))}
        </nav>
        <div className="foot">
          <div className="store-badge"><i className="dot" style={{ background: st.ready ? "var(--ok)" : "var(--muted)" }} />{st.ready ? "Sincronizado" : "Carregando…"}</div>
          <div className="small muted" style={{ overflowWrap: "anywhere" }}>{st.email}</div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="ttl"><span className="lbl">{isSubjectPage ? "Disciplina" : page.full}</span><h1 style={{ fontSize: "calc(1.25rem*var(--display-scale))" }}>{title}</h1></div>
          <TimerPill />
          <Link className="btn icon ghost show-m" href="/configuracoes" aria-label="Configurações"><Icon d={PAGES[PAGES.length - 1].ic} s={20} /></Link>
        </header>
        <main>{st.ready ? children : <div className="empty"><b>Abrindo o diário…</b><span>Carregando seus registros.</span></div>}</main>
      </div>
      <nav className="mobile-nav" aria-label="Navegação">
        {PAGES.filter((p) => p.href !== "/configuracoes").map((p) => (
          <Link key={p.href} href={p.href} aria-current={page.href === p.href ? "page" : undefined}><Icon d={p.ic} s={20} /><span>{p.nm}</span></Link>
        ))}
      </nav>
      {st.evalId && <EvalModal id={st.evalId} onClose={() => st.setEvalId(null)} />}
    </div>
  );
}
