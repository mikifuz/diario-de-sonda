"use client";
// Notificações: relatório semanal (gerado no domingo de manhã), pedidos de amizade e chamados.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useRoom } from "@/lib/room";
import { sb } from "@/lib/supabase";
import { fmtMin, nf, pct, todayKey, qt } from "@/lib/calc";
import { buildReport, reportWeek, type ReportData } from "@/lib/report";
import type { AppNotification } from "@/lib/types";
import { ConfirmButton, Empty, I, Icon } from "./ui";
import { WeekPrint } from "./weekPrint";

/** Cria o relatório da semana quando ele estiver liberado e ainda não existir (um por semana) */
export function useWeeklyReport() {
  const st = useStore();
  const tried = useRef("");
  useEffect(() => {
    if (!st.ready || st.demo) return; // a demonstração já vem com o relatório
    const { week } = reportWeek(todayKey(), new Date().getHours());
    if (tried.current === week || st.notes.some((n) => n.kind === "relatorio" && n.data.week === week)) return;
    tried.current = week;
    const r = buildReport({ week, sessions: st.sessions, subjects: st.subjects, assessments: st.assessments, mistakes: st.mistakes, logs: st.reviewLogs, items: st.reviews });
    if (!r) return;
    sb().from("notifications").insert({ kind: "relatorio", title: r.title, body: r.body, data: r.data }).then(({ error }) => {
      // 23505: outro aparelho já criou o relatório desta semana
      if (!error || error.code === "23505") st.reload("notifications");
    });
  }, [st.ready, st.notes, st.sessions, st.subjects, st.assessments, st.mistakes, st.reviewLogs, st.reviews]); // eslint-disable-line react-hooks/exhaustive-deps
}

const ICON: Record<AppNotification["kind"], string> = { relatorio: "📊", amizade: "🤝", chamado: "📣", aviso: "ℹ️" };
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function Report({ d }: { d: ReportData }) {
  const max = Math.max(1, ...d.bySubject.map((x) => x.minutes));
  return (
    <div className="stack small" style={{ gap: 8, marginTop: 8 }}>
      <div className="grid g3" style={{ gap: 8 }}>
        <div className="kpi"><span className="lbl">Tempo de estudo</span><span className="num">{fmtMin(d.minutes)}</span><span className="s">{d.minutes - d.prevMinutes >= 0 ? "+" : "−"}{fmtMin(Math.abs(d.minutes - d.prevMinutes))} vs. semana anterior</span></div>
        <div className="kpi"><span className="lbl">Acerto conferido</span><span className="num">{pct(d.acc)}</span><span className="s">{qt(d.accN, "registro", "registros")}</span></div>
        <div className="kpi"><span className="lbl">Confiança média</span><span className="num">{d.conf == null ? "–" : `${nf(d.conf)}/5`}</span><span className="s">{qt(d.confN, "autoavaliação", "autoavaliações")}</span></div>
      </div>
      {d.bySubject.length > 0 && <div className="stack" style={{ gap: 4 }}>{d.bySubject.map((x) => (
        <div key={x.name} className="row" style={{ flexWrap: "nowrap", gap: 8 }}><span style={{ width: 160, flex: "none" }}>{x.name}</span><div className="bar" style={{ flex: 1 }}><i style={{ width: `${(x.minutes / max) * 100}%`, background: "var(--accent)" }} /></div><span className="num" style={{ width: 70, textAlign: "right" }}>{fmtMin(x.minutes)}</span></div>
      ))}</div>}
      <div>{qt(d.sessions, "sessão", "sessões")} em {qt(d.days, "dia", "dias")} · {qt(d.reviews, "revisão feita", "revisões feitas")}{d.late ? ` · ${qt(d.late, "atrasada", "atrasadas")} agora` : ""}</div>
      {d.mistakes.length > 0 && <div>Erros mais registrados: {d.mistakes.map((m) => `${m.cat} (${m.n})`).join(", ")}</div>}
      {d.exams.length > 0 && <div><b>Semana que vem:</b> {d.exams.map((e) => `${e.name} de ${e.subject} (${e.date.slice(8, 10)}/${e.date.slice(5, 7)})`).join(", ")} · <Link href="/hoje?aba=provas">ver plano das provas</Link></div>}
      <span className="muted">Confiança e acerto aparecem separados: confiança é o que você sentiu, acerto é o que foi conferido.</span>
    </div>
  );
}

export function NotificationsList() {
  const st = useStore();
  const room = useRoom();
  const [fresh] = useState(() => new Set(st.notes.filter((n) => !n.read_at).map((n) => n.id)));
  // abrir a página marca tudo como lido (o destaque continua até sair dela)
  useEffect(() => {
    const unread = st.notes.filter((n) => !n.read_at);
    // update (não upsert): notificações de amigos não podem ser "recriadas" pela própria pessoa
    if (unread.length && st.demo) { st.saveMany("notifications", unread.map((n) => ({ ...n, read_at: new Date().toISOString() }))); return; }
    if (unread.length) sb().from("notifications").update({ read_at: new Date().toISOString() }).in("id", unread.map((n) => n.id)).then(() => st.reload("notifications"));
  }, [st.notes]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<string | null>(null);
  const [week, setWeek] = useState(false);
  const read = st.notes.filter((n) => n.read_at && !fresh.has(n.id));
  if (!st.notes.length) return <Empty title="Nenhuma notificação">O relatório da semana chega todo domingo de manhã. Pedidos de amizade e chamados para estudar também aparecem aqui.</Empty>;
  return (
    <>
      <section className="panel">
        <div className="list">{st.notes.map((n) => {
          const req = n.kind === "amizade" && typeof n.data.request_id === "string" ? room.friends.find((f) => f.id === n.data.request_id && f.incoming && f.status === "pendente") : null;
          return (
            <div key={n.id} className="li" style={{ alignItems: "flex-start", background: fresh.has(n.id) ? "color-mix(in srgb,var(--accent) 8%,transparent)" : undefined }}>
              <span aria-hidden="true" style={{ fontSize: "1.2em" }}>{ICON[n.kind]}</span>
              <div className="grow">
                <div className="t">{n.title}</div>
                <div className="m">{when(n.created_at)}</div>
                {n.body && <div className="small" style={{ marginTop: 4 }}>{n.body}</div>}
                {n.kind === "relatorio" && (open === n.id ? <><Report d={n.data as unknown as ReportData} /><span className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => setWeek(true)}>Imprimir: esta semana + a próxima</button><button className="btn sm ghost" onClick={() => setOpen(null)}>Fechar</button></span></>
                  : <span className="row" style={{ gap: 6 }}><button className="btn sm ghost" style={{ paddingLeft: 0 }} onClick={() => setOpen(n.id)}>Ver relatório completo</button><button className="btn sm ghost" onClick={() => setWeek(true)}>Imprimir com a próxima semana</button></span>)}
                {req && <div className="row" style={{ marginTop: 6 }}><button className="btn sm pri" onClick={() => room.acceptFriend(req.id)}>Aceitar</button><button className="btn sm ghost" onClick={() => room.removeFriend(req.id)}>Recusar</button></div>}
                {n.kind === "chamado" && <div style={{ marginTop: 6 }}><Link className="btn sm" href="/sala"><Icon d={I.play} s={13} />Ir para a sala</Link></div>}
              </div>
              <button className="btn icon ghost" aria-label="Apagar notificação" onClick={() => st.remove("notifications", n.id)}><Icon d={I.trash} s={15} /></button>
            </div>
          );
        })}</div>
        {read.length > 0 && <div style={{ marginTop: 10 }}><ConfirmButton small label="Apagar as lidas" question={`Apagar ${qt(read.length, "notificação lida", "notificações lidas")}?`} confirmLabel="Apagar" onConfirm={async () => { for (const n of read) await st.remove("notifications", n.id); }} /></div>}
      </section>
      {week && <WeekPrint start={todayKey()} onDone={() => setWeek(false)} />}
      <p className="small muted" style={{ margin: 0 }}>O relatório chega todo domingo a partir das 7h, sobre a semana de domingo a sábado. Por enquanto as notificações aparecem dentro do app; avisos no celular com o app fechado ficam para uma próxima etapa.</p>
    </>
  );
}
