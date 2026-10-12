"use client";
// Sala de estudos: cronômetro (antes "Sessões"), grupos ao vivo, placar e histórico, numa página só.
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { activeSubjects, timerMs, topicName, useStore } from "@/lib/store";
import { liveMs, memberDesk, NUDGES, todayMin, useRoom, weekMin, withLive, type NudgeKey } from "@/lib/room";
import { dkey, fmtClock, fmtMin, inRange, keyDate, monthStats, nf, pct, periodRange, stats, streak, todayKey, type Period, qt } from "@/lib/calc";
import { lastTaught, studyHint, topicExams } from "@/lib/plan";
import { ACT } from "@/lib/constants";
import type { Activity, RoomMember, Session, Social } from "@/lib/types";
import { ConfirmButton, Dot, Empty, I, Icon, Tabs, useNow } from "@/components/ui";
import { SessionModal, SubjectModal, TopicOptions } from "@/components/modals";
import { SessionRow } from "@/components/SessionRow";
import { SOCIAL, StartModal, type StartArgs } from "@/components/studyStart";
import { Desk } from "@/components/desk";

function Privacy() {
  const yes = ["Seu apelido, se está estudando agora e há quanto tempo", "Minutos estudados por dia (últimos 35 dias) e sequência de dias", "O nome da disciplina em andamento, só quando você escolhe mostrar"];
  return (
    <div className="stack small" style={{ gap: 6 }}>
      <b>O que os colegas dos seus grupos veem</b>
      {yes.map((t) => <span key={t} className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}><span style={{ color: "var(--ok)" }}>✓</span><span>{t}</span></span>)}
      <span className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}><span style={{ color: "var(--bad)" }}>✕</span><span>Notas, confiança, acertos, erros, conteúdos e observações: ficam só com você</span></span>
      <span className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}><span style={{ color: "var(--bad)" }}>✕</span><span>Quem não está em nenhum grupo com você não vê nada</span></span>
    </div>
  );
}

/* ============ Cronômetro ============ */
function TimerPanel({ onManual, onNewSubject }: { onManual: () => void; onNewSubject: () => void }) {
  const st = useStore();
  const room = useRoom();
  const params = useSearchParams();
  const now = useNow();
  const list = activeSubjects(st.subjects);
  const pre = params.get("disciplina");
  const [subjectId, setSubjectId] = useState(pre && list.some((s) => s.id === pre) ? pre : list[0]?.id || "");
  // vindo de um alerta: já traz conteúdo e atividade
  const preTopic = params.get("conteudo"), preAct = params.get("atividade") as Activity | null;
  const today = todayKey();
  const lastOf = (sid: string) => lastTaught(st.topics, sid, today)?.id || "";
  const [topicId, setTopicId] = useState(() => (preTopic && st.topics.some((x) => x.id === preTopic && x.subject_id === pre) ? preTopic : lastOf(pre && list.some((s) => s.id === pre) ? pre : list[0]?.id || "")));
  const [activity, setActivity] = useState<Activity>(preAct && preAct in ACT ? preAct : "exercicios");
  const [discard, setDiscard] = useState(false);
  const [start, setStart] = useState<StartArgs | null>(null);
  const t = st.profile?.timer;

  if (t) {
    const s = st.subjects.find((x) => x.id === t.subject_id), tn = topicName(st.topics, t.topic_id);
    const social: Social = t.social || (room.me ? (room.me.share_subject ? "materia" : "anonimo") : "sozinho");
    return (
      <div className="panel">
        <div className="panel-h"><h2>Sessão em andamento</h2><span className={"chip " + (t.running ? "ok" : "warn")}>{t.running ? "cronometrando" : "pausada"}</span></div>
        <div className="row between" style={{ gap: 20 }}>
          <div className="row" style={{ gap: 16, flexWrap: "nowrap" }}>
          <Desk state={t.running ? "estudando" : "parou"} size={96} />
          <div className="stack" style={{ gap: 6 }}>
            <div className="clock">{fmtClock(timerMs(t, now))}</div>
            <div className="row" style={{ gap: 8 }}><Dot c={s?.color || "var(--muted)"} /><b>{s?.name || "Disciplina removida"}</b>{tn && <span className="muted">· {tn}</span>}<span className="chip">{ACT[t.activity]}</span></div>
          </div>
          </div>
          <div className="row">
            {discard ? (
              <><span className="small">Descartar {fmtClock(timerMs(t, now))} sem salvar?</span>
                <button className="btn danger sm" onClick={() => { st.discardTimer(); setDiscard(false); st.toast("Sessão descartada."); }}>Descartar</button>
                <button className="btn sm ghost" onClick={() => setDiscard(false)}>Manter</button></>
            ) : (
              <>{t.running ? <button className="btn" onClick={st.pauseTimer}><Icon d={I.pause} s={16} />Pausar</button> : <button className="btn" onClick={st.resumeTimer}><Icon d={I.play} s={16} />Retomar</button>}
                <button className="btn pri" onClick={st.stopTimer}><Icon d={I.stop} s={16} />Encerrar e avaliar</button>
                <button className="btn ghost" onClick={() => setDiscard(true)}>Descartar</button></>
            )}
          </div>
        </div>
        <div className="row small" style={{ marginTop: 14, gap: 8 }}>
          <span className="muted">Na sala:</span>
          <Tabs value={social} label="Como esta sessão aparece na sala" onChange={(v) => {
            if (v !== "sozinho" && !room.me) { st.toast("Entre na sala com um apelido (mais abaixo) para aparecer para o grupo."); return; }
            st.setSocial(v);
          }} options={[["materia", "Com a matéria"], ["anonimo", "Sem a matéria"], ["sozinho", "Só eu"]]} />
        </div>
      </div>
    );
  }
  if (!list.length) return <div className="panel"><Empty title="Cadastre uma disciplina primeiro">As sessões ficam ligadas a uma disciplina e, se quiser, a um conteúdo.<button className="btn pri sm" onClick={onNewSubject}><Icon d={I.plus} s={14} />Nova disciplina</button></Empty></div>;
  return (
    <div className="panel">
      <div className="panel-h"><h2>Começar a estudar</h2><button className="btn sm" onClick={onManual}><Icon d={I.plus} s={14} />Registrar manualmente</button></div>
      <div className="fgrid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
        <label className="f"><span>Disciplina</span><select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(lastOf(e.target.value)); }}>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="f"><span>Conteúdo</span><select value={topicId} onChange={(e) => setTopicId(e.target.value)}><option value="">Geral da disciplina</option><TopicOptions topics={st.topics} subjectId={subjectId} /></select></label>
        <label className="f"><span>Atividade</span><select value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>{Object.entries(ACT).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      </div>
      <TopicHint topicId={topicId} today={today} />
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn pri" onClick={() => setStart({ subject_id: subjectId, topic_id: topicId || null, activity })}><Icon d={I.play} s={16} />Começar</button>
        <span className="small muted">O tempo continua contando mesmo se você fechar a página ou trocar de aparelho.</span>
      </div>
      {start && <StartModal args={start} onClose={() => setStart(null)} />}
    </div>
  );
}

/** "Estudando para quê": aula do conteúdo e a prova em que ele cai */
function TopicHint({ topicId, today }: { topicId: string; today: string }) {
  const st = useStore();
  const t = topicId ? st.topics.find((x) => x.id === topicId) : null;
  if (!t) return null;
  // prova marcada, a dos subconteúdos ou a primeira depois da aula; num assunto com várias, a próxima
  const ex = topicExams(t, st.topics, st.assessments).sort((x, y) => (x.date || "").localeCompare(y.date || ""));
  const a = ex.find((x) => x.date && x.date >= today) ?? ex[ex.length - 1] ?? null;
  const txt = studyHint(t.taught_on, a, today);
  return txt ? <p className="small muted" style={{ margin: "8px 0 0" }}>{txt}</p> : null;
}

/* ============ Grupos ============ */
/** Pedido de amizade direto para quem divide um grupo com você (sem pedir o código).
 * Aparece ao passar o mouse; no celular (sem mouse) fica sempre visível. */
function FriendAdd({ m }: { m: RoomMember }) {
  const st = useStore();
  const room = useRoom();
  const [busy, setBusy] = useState(false);
  if (m.user_id === st.uid || !m.friend_code) return null;
  const f = room.friends.find((x) => x.other === m.user_id);
  if (f?.status === "aceito") return null;
  if (f && !f.incoming) return <span className="small muted reveal" title={`Você já mandou um pedido para ${m.nick}`}>pedido enviado</span>;
  if (f) return <button className="btn sm pri" onClick={() => room.acceptFriend(f.id)} title={`${m.nick} quer ser seu amigo`}>Aceitar amizade</button>;
  const send = async () => { setBusy(true); await room.sendFriend(m.friend_code!); setBusy(false); };
  return (
    <button className="btn sm ghost reveal" disabled={busy} onClick={send} title={`Mandar um pedido de amizade para ${m.nick}`} aria-label={`Adicionar ${m.nick} como amigo`}>
      <Icon d={I.plus} s={12} />Amigo
    </button>
  );
}

function GroupsArea() {
  const st = useStore();
  const room = useRoom();
  useNow();
  const [g, setG] = useState("");
  const [per, setPer] = useState<"hoje" | "semana" | "mes">("hoje");
  const [nick, setNick] = useState(() => st.profile?.name?.split(" ")[0] || "");
  const me = room.me;
  if (!room.ready) return null;

  if (!me) {
    const join = async (e: FormEvent) => { e.preventDefault(); if (!nick.trim()) { st.toast("Escolha um apelido."); return; } if (await room.join(nick, false)) st.toast("Pronto. Agora entre num grupo (com o código de um colega) ou crie o seu."); };
    return (
      <section className="grid g2">
        <div className="panel stack" style={{ gap: 14 }}>
          <span className="lbl">Estudar junto</span>
          <h2>Sala de estudos em grupo</h2>
          <p style={{ margin: 0, maxWidth: "60ch" }}>Escolha um apelido e depois entre no grupo de um colega (com o código dele) ou crie o seu, para ver quem está estudando agora e o placar do dia, da semana e do mês. Só quem está no mesmo grupo vê você.</p>
          <form className="row" style={{ flexWrap: "nowrap" }} onSubmit={join}>
            <input type="text" maxLength={30} required value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Seu apelido, ex.: Mica" aria-label="Apelido" />
            <button className="btn pri">Entrar na sala</button>
          </form>
        </div>
        <div className="panel"><Privacy /></div>
      </section>
    );
  }

  const groups = room.myGroups;
  const cur = groups.find((x) => x.code === g) || groups[0];
  const isMe = (uid: string) => uid === st.uid;
  const members = cur ? room.members.filter((m) => room.memberships.some((x) => x.code === cur.code && x.user_id === m.user_id)) : [];
  // estudando (abajur aceso) ou parou há menos de 1 h (cinza); depois disso some
  const desk = (m: typeof members[number]) => memberDesk(m, room.totals[m.user_id]);
  const now = members.filter((m) => desk(m)).sort((a, b) => Number(b.studying) - Number(a.studying) || Number(b.paused) - Number(a.paused) || liveMs(b) - liveMs(a));
  const ago = (m: typeof members[number]) => Math.max(1, Math.round((Date.now() - new Date(m.updated_at).getTime()) / 60000));
  const month = new Map(members.map((m) => [m.user_id, monthStats(withLive(m, room.totals[m.user_id]))]));
  const ms = (m: typeof members[number]) => month.get(m.user_id)!;
  const val = (m: typeof members[number]) => (per === "hoje" ? todayMin(m, room.totals[m.user_id]) : per === "semana" ? weekMin(m, room.totals[m.user_id]) : ms(m).minutes);
  const rank = [...members].sort((a, b) => val(b) - val(a));
  const top = Math.max(1, ...rank.map(val));
  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const groupMonth = members.reduce((a, m) => a + ms(m).minutes, 0);
  // destaques do mês: só aparecem com dado de verdade (ninguém ganha com zero)
  const best = (f: (x: ReturnType<typeof monthStats>) => number) => {
    const b = [...members].sort((a, c) => f(ms(c)) - f(ms(a)))[0];
    return b && f(ms(b)) > 0 ? b : null;
  };
  const hl = per === "mes" ? [
    { k: "Mais horas", m: best((x) => x.minutes), t: (x: ReturnType<typeof monthStats>) => fmtMin(Math.round(x.minutes)) },
    { k: "Mais dias estudados", m: best((x) => x.active), t: (x: ReturnType<typeof monthStats>) => `${x.active} de ${x.elapsed} dias` },
    { k: "Maior sequência", m: best((x) => x.bestStreak), t: (x: ReturnType<typeof monthStats>) => qt(x.bestStreak, "dia seguido", "dias seguidos") },
    { k: "Maior dia", m: best((x) => x.bestDay), t: (x: ReturnType<typeof monthStats>) => `${fmtMin(Math.round(x.bestDay))}${x.bestDayKey ? ` em ${x.bestDayKey.slice(8)}/${x.bestDayKey.slice(5, 7)}` : ""}` },
  ].filter((h) => h.m) : [];

  return (
    <section className="grid g3">
      <div className="panel span2">
        {cur ? (
          <>
            <div className="row between" style={{ marginBottom: 12 }}>
              <Tabs value={cur.code} onChange={setG} label="Grupo" options={groups.map((x) => [x.code, x.name] as [string, string])} />
              <span className="small muted">{qt(members.length, "pessoa", "pessoas")} no grupo</span>
            </div>
            <div className="panel-h"><h2>Estudando agora</h2><span className="chip ok">{now.filter((m) => m.studying).length} ao vivo</span></div>
            <p className="small muted" style={{ margin: "-6px 0 10px" }}>Abajur aceso: estudando agora. Cinza: parou há menos de 1 hora. Depois disso a mesa sai daqui.</p>
            {now.length ? (
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 10 }}>
                {now.map((m) => (
                  <div key={m.user_id} className="panel hover-row" style={{ padding: 14, background: "var(--panel2)", outline: isMe(m.user_id) ? "1px solid var(--accent)" : undefined }}>
                    <div style={{ display: "grid", placeItems: "center", marginBottom: 8 }}><Desk state={desk(m)!} size={130} label={`${m.nick}: ${m.studying ? "estudando, abajur aceso" : "parou há pouco, abajur apagado"}`} /></div>
                    <div className="row between" style={{ flexWrap: "nowrap" }}>
                      <b className="t" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nick}{isMe(m.user_id) ? " (você)" : ""}</b>
                      <i className="dot" style={{ background: m.studying ? "var(--ok)" : "var(--muted)", animation: m.studying ? "blink 1.6s infinite" : undefined }} />
                    </div>
                    <div className="reveal-wrap" style={{ marginTop: 6 }}><FriendAdd m={m} /></div>
                    {m.studying || m.paused
                      ? <div className="num" style={{ fontSize: "1.6rem", marginTop: 6 }}>{fmtClock(liveMs(m))}</div>
                      : <div className="num" style={{ fontSize: "1.6rem", marginTop: 6, color: "var(--muted)" }}>{fmtMin(todayMin(m, room.totals[m.user_id]))}</div>}
                    <div className="small muted">{m.studying ? "estudando" : m.paused ? `pausado há ${qt(ago(m), "minuto", "minutos")}` : `parou há ${qt(ago(m), "minuto", "minutos")} · total de hoje`}{m.subject ? ` · ${m.subject}` : ""}</div>
                  </div>
                ))}
              </div>
            ) : <p className="small muted" style={{ margin: 0 }}>Ninguém do grupo estudou na última hora.</p>}
            <div className="panel-h" style={{ marginTop: 22 }}><h2>Placar</h2><Tabs value={per} onChange={setPer} options={[["hoje", "Hoje"], ["semana", "Semana"], ["mes", "Mês"]]} /></div>
            {per === "mes" && (
              <div className="panel" style={{ padding: 14, background: "var(--panel2)", marginBottom: 10 }}>
                <div className="small muted">O grupo estudou em {monthName}</div>
                <div className="num" style={{ fontSize: "1.8rem" }}>{fmtMin(Math.round(groupMonth))}</div>
                <div className="small muted">somando {qt(members.length, "pessoa", "pessoas")}{members.length ? ` · média de ${fmtMin(Math.round(groupMonth / members.length))} por pessoa` : ""}</div>
                {hl.length > 0 && (
                  <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8, marginTop: 12 }}>
                    {hl.map((h) => (
                      <div key={h.k} className="small"><span className="lbl">{h.k}</span><div><b>{h.m!.nick}{isMe(h.m!.user_id) ? " (você)" : ""}</b></div><div className="muted">{h.t(ms(h.m!))}</div></div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="list">{rank.map((m, i) => {
              const v = val(m), sk = streak(room.totals[m.user_id] || {}, m.studying);
              return (
                <div key={m.user_id} className="li hover-row" style={isMe(m.user_id) ? { background: "color-mix(in srgb,var(--accent) 8%,transparent)" } : undefined}>
                  <span className="num" style={{ width: "2ch", textAlign: "right", color: i < 3 && v > 0 ? "var(--accent)" : "var(--muted)" }}>{i + 1}</span>
                  <div className="grow">
                    <div className="row between" style={{ flexWrap: "nowrap" }}><span className="t">{m.nick}{isMe(m.user_id) ? " (você)" : ""}</span><span className="num">{fmtMin(v)}</span></div>
                    <div className="bar" style={{ marginTop: 5 }}><i style={{ width: `${(v / top) * 100}%`, background: isMe(m.user_id) ? "var(--accent)" : "var(--muted)" }} /></div>
                    {per === "mes" && <div className="small muted" style={{ marginTop: 3 }}>estudou {ms(m).active} de {ms(m).elapsed} dias · maior sequência: {qt(ms(m).bestStreak, "dia", "dias")}</div>}
                  </div>
                  <FriendAdd m={m} />
                  <span className={"chip " + (sk >= 3 ? "warn" : "")} title="Dias seguidos com estudo, até hoje">{qt(sk, "dia", "dias")}</span>
                </div>
              );
            })}</div>
            <p className="small muted" style={{ margin: "10px 0 0" }}>A semana começa na segunda-feira e o mês, no dia 1. O placar soma as sessões salvas (inclusive as feitas &quot;só para mim&quot;) e o cronômetro em andamento de quem está visível.</p>
          </>
        ) : (
          <Empty title="Você ainda não está em nenhum grupo">Use os botões "Entrar num grupo" (se um colega já te passou o código) ou "Criar um grupo" (se ninguém criou ainda). Ninguém te vê até vocês estarem no mesmo grupo.</Empty>
        )}
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <FriendsPanel />
        <GroupsPanel onPick={setG} cur={cur?.code} />
        <MyPresence />
      </div>
    </section>
  );
}

function FriendsPanel() {
  const st = useStore();
  const room = useRoom();
  useNow(30_000);
  const [code, setCode] = useState("");
  const me = room.me!;
  const friends = room.friends.filter((f) => f.status === "aceito");
  const incoming = room.friends.filter((f) => f.status === "pendente" && f.incoming);
  const outgoing = room.friends.filter((f) => f.status === "pendente" && !f.incoming);
  const copy = () => { const c = me.friend_code || ""; try { navigator.clipboard.writeText(c).then(() => st.toast(`Código ${c} copiado.`), () => st.toast(`Seu código: ${c}`)); } catch { st.toast(`Seu código: ${c}`); } };
  const add = async (e: FormEvent) => { e.preventDefault(); if (code.trim() && (await room.sendFriend(code))) setCode(""); };
  return (
    <div className="panel">
      <div className="panel-h"><h3>Amigos</h3>{incoming.length > 0 && <span className="chip warn">{qt(incoming.length, "pedido", "pedidos")}</span>}</div>
      <div className="row small" style={{ gap: 6, marginBottom: 8 }}>Seu código de amigo: <b className="num" style={{ letterSpacing: ".1em" }}>{me.friend_code || "–"}</b>{me.friend_code && <button className="btn sm ghost" onClick={copy}>Copiar</button>}</div>
      {incoming.map((f) => (
        <div key={f.id} className="li"><div className="grow small"><b>{f.nick}</b> quer ser seu amigo</div>
          <button className="btn sm pri" onClick={() => room.acceptFriend(f.id)}>Aceitar</button><button className="btn sm ghost" onClick={() => room.removeFriend(f.id)}>Recusar</button>
          <ConfirmButton small label="Bloquear" question={`Bloquear ${f.nick}? Essa pessoa não conseguirá mandar novos pedidos.`} confirmLabel="Bloquear" onConfirm={() => room.blockFriend(f.id)} /></div>
      ))}
      {friends.length > 0 && <div className="list">{friends.map((f) => {
        const m = room.members.find((x) => x.user_id === f.other);
        return (
          <div key={f.id} className="li" style={{ gap: 8, alignItems: "flex-start" }}>
            {m && memberDesk(m, room.totals[m.user_id]) ? <Desk state={memberDesk(m, room.totals[m.user_id])!} size={44} /> : <i className="dot" style={{ background: "var(--muted)", flex: "none", marginTop: 7 }} />}
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="t">{f.nick}</div>
              <div className="m">{m?.studying ? `estudando agora · ${fmtClock(liveMs(m))}${m.subject ? ` · ${m.subject}` : ""}` : m?.paused ? "pausado" : "fora da sala agora"}</div>
              <select value="" onChange={(e) => { if (e.target.value) room.nudge(f.other, e.target.value as NudgeKey); }} aria-label={`Chamar ${f.nick} para estudar`} style={{ marginTop: 6, padding: "4px 6px", fontSize: ".82em" }}>
                <option value="">Chamar para estudar…</option>{(Object.keys(NUDGES) as NudgeKey[]).map((k) => <option key={k} value={k}>{NUDGES[k]}</option>)}</select>
            </div>
            <ConfirmButton small label="✕" question={`Desfazer amizade com ${f.nick}?`} confirmLabel="Desfazer" onConfirm={() => room.removeFriend(f.id)} />
          </div>
        );
      })}</div>}
      {outgoing.map((f) => (
        <div key={f.id} className="li small"><div className="grow muted">Pedido enviado para {f.nick}</div><button className="btn sm ghost" onClick={() => room.removeFriend(f.id)}>Cancelar</button></div>
      ))}
      {!room.friends.length && <p className="small muted" style={{ margin: "0 0 8px" }}>Passe seu código para um colega, ou digite o código dele. Quem já está num grupo com você dá para adicionar direto: passe o mouse no nome dele e toque em "+ Amigo". Amigos veem um ao outro na sala (como num grupo) e podem se chamar para estudar.</p>}
      <form className="row" style={{ marginTop: 8, flexWrap: "nowrap" }} onSubmit={add}><input type="text" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código de amigo" aria-label="Código de amigo" style={{ fontFamily: "var(--f-mono)" }} /><button className="btn sm">Adicionar</button></form>
      {room.blocks.length > 0 && <details className="small" style={{ marginTop: 10 }}><summary>{qt(room.blocks.length, "pessoa bloqueada", "pessoas bloqueadas")}</summary>
        {room.blocks.map((b) => <div key={b.blocked} className="li small"><div className="grow muted">{b.nick}</div><button className="btn sm ghost" onClick={() => room.unblock(b.blocked)}>Desbloquear</button></div>)}
      </details>}
      <label className="check small" style={{ marginTop: 10 }}><input type="checkbox" checked={me.accept_nudges !== false} onChange={(e) => room.setAcceptNudges(e.target.checked)} />Receber chamados dos amigos</label>
      <p className="small muted" style={{ margin: "6px 0 0" }}>Chamados usam só mensagens prontas, no máximo um por hora para cada amigo.</p>
    </div>
  );
}

function GroupsPanel({ onPick, cur }: { onPick: (c: string) => void; cur?: string }) {
  const st = useStore();
  const room = useRoom();
  const [gName, setGName] = useState("");
  const [gCode, setGCode] = useState("");
  const [mode, setMode] = useState<"entrar" | "criar" | null>(null);
  const newGroup = async (e: FormEvent) => { e.preventDefault(); if (!gName.trim()) return; const code = await room.createGroup(gName); if (code) { setGName(""); setMode(null); onPick(code); st.toast(`Grupo criado. Passe o código ${code} para os colegas.`); } };
  const joinGroup = async (e: FormEvent) => { e.preventDefault(); const c = gCode.trim().toUpperCase(); if (room.myGroups.some((x) => x.code === c)) { st.toast("Você já está nesse grupo."); return; } if (await room.joinGroup(c)) { setGCode(""); setMode(null); onPick(c); st.toast("Você entrou no grupo."); } };
  const copy = (code: string) => { try { navigator.clipboard.writeText(code).then(() => st.toast(`Código ${code} copiado.`), () => st.toast(`Código do grupo: ${code}`)); } catch { st.toast(`Código do grupo: ${code}`); } };
  return (
    <div className="panel">
      <div className="panel-h"><h3>Meus grupos</h3></div>
      {room.myGroups.length > 0 && (
        <div className="list">{room.myGroups.map((x) => (
          <div key={x.code} className="li">
            <div className="grow"><div className="t">{x.name}</div><div className="m">código <b className="num" style={{ color: "var(--fg)", letterSpacing: ".1em" }}>{x.code}</b></div></div>
            <button className="btn sm ghost" onClick={() => copy(x.code)}>Copiar</button>
            <ConfirmButton small label="Sair" confirmLabel="Sair" onConfirm={() => { if (cur === x.code) onPick(""); room.leaveGroup(x.code); }} />
          </div>
        ))}</div>
      )}
      {/* uma coisa de cada vez: entrar OU criar */}
      <div className="grid g2" style={{ gap: 8, marginTop: room.myGroups.length ? 12 : 0 }}>
        <button type="button" className={"btn" + (mode === "entrar" ? " pri" : "")} aria-pressed={mode === "entrar"} onClick={() => setMode(mode === "entrar" ? null : "entrar")}>Entrar num grupo</button>
        <button type="button" className={"btn" + (mode === "criar" ? " pri" : "")} aria-pressed={mode === "criar"} onClick={() => setMode(mode === "criar" ? null : "criar")}>Criar um grupo</button>
      </div>
      {!mode && <p className="small muted" style={{ margin: "8px 0 0" }}>Escolha só um: se um colega já criou o grupo, <b>entre</b> com o código que ele passou. Se ninguém criou ainda, <b>crie</b> e passe o código para os colegas.</p>}
      {mode === "entrar" && <form className="stack" style={{ gap: 6, marginTop: 10 }} onSubmit={joinGroup}>
        <span className="small">Digite o código de 6 letras que seu colega passou:</span>
        <div className="row" style={{ flexWrap: "nowrap" }}><input type="text" maxLength={6} value={gCode} onChange={(e) => setGCode(e.target.value.toUpperCase())} placeholder="Ex.: PETRO7" aria-label="Código do grupo" required autoFocus style={{ fontFamily: "var(--f-mono)" }} /><button className="btn pri sm">Entrar</button></div>
      </form>}
      {mode === "criar" && <form className="stack" style={{ gap: 6, marginTop: 10 }} onSubmit={newGroup}>
        <span className="small">Dê um nome ao grupo. O app cria um código para você passar aos colegas:</span>
        <div className="row" style={{ flexWrap: "nowrap" }}><input type="text" maxLength={40} value={gName} onChange={(e) => setGName(e.target.value)} placeholder="Ex.: Turma Petróleo 3ª fase" aria-label="Nome do novo grupo" required autoFocus /><button className="btn pri sm">Criar</button></div>
      </form>}
      <p className="small muted" style={{ margin: "8px 0 0" }}>O código é a chave do grupo: passe só para quem você quer que veja seus horários de estudo.</p>
    </div>
  );
}

function MyPresence() {
  const room = useRoom();
  const me = room.me!;
  const [nick, setNick] = useState(me.nick);
  return (
    <div className="panel">
      <div className="panel-h"><h3>Minha presença</h3></div>
      <form className="stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (nick.trim()) room.updateMe({ nick: nick.trim().slice(0, 30) }); }}>
        <label className="f"><span>Apelido</span><input type="text" maxLength={30} value={nick} onChange={(e) => setNick(e.target.value)} required /></label>
        <span className="small muted">Ao começar cada sessão você escolhe: {Object.values(SOCIAL).map((x) => x[0].toLowerCase()).join("; ")}.</span>
        <div className="row"><button className="btn sm">Salvar</button><ConfirmButton small label="Sair da sala" question="Você sai de todos os placares e grupos e desfaz suas amizades." confirmLabel="Sair" onConfirm={room.leave} /></div>
      </form>
      <details style={{ marginTop: 12 }}><summary className="small">O que os colegas veem</summary><div style={{ marginTop: 10 }}><Privacy /></div></details>
    </div>
  );
}

/* ============ Histórico ============ */
function History({ onEdit }: { onEdit: (id: string) => void }) {
  const st = useStore();
  const [per, setPer] = useState<Period>("30");
  const [subF, setSubF] = useState("");
  const rng = periodRange(per);
  const ses = st.sessions.filter((s) => inRange(s, rng) && (!subF || s.subject_id === subF)).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const groups: [string, Session[]][] = [];
  for (const s of ses) {
    const k = dkey(s.started_at);
    const g = groups.find((x) => x[0] === k);
    if (g) g[1].push(s); else groups.push([k, [s]]);
  }
  const sp = stats(ses);
  return (
    <div className="panel">
      <div className="panel-h"><h2>Minhas sessões</h2>
        <div className="row">
          <select value={subF} onChange={(e) => setSubF(e.target.value)} aria-label="Filtrar disciplina" style={{ width: "auto" }}><option value="">Todas as disciplinas</option>{activeSubjects(st.subjects, true).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <Tabs value={per} onChange={setPer} label="Período" options={[["7", "7 dias"], ["30", "30 dias"], ["semestre", "Semestre"], ["tudo", "Tudo"]]} />
        </div>
      </div>
      <div className="row small muted" style={{ marginBottom: 8, gap: 16 }}><span>{sp.n} sessões</span><span>{fmtMin(sp.min)}</span><span>confiança {sp.conf == null ? "–" : nf(sp.conf)}/5</span><span>acerto conferido {pct(sp.acc)}</span></div>
      {groups.length ? groups.map(([k, arr]) => (
        <div key={k} style={{ marginTop: 10 }}>
          <div className="row between" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
            <span className="lbl">{keyDate(k).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span>
            <span className="num small muted">{fmtMin(arr.reduce((a, s) => a + s.duration_min, 0))}</span>
          </div>
          <div className="list">{arr.map((s) => <SessionRow key={s.id} s={s} onEdit={() => onEdit(s.id)} />)}</div>
        </div>
      )) : <Empty>Nenhuma sessão neste filtro.</Empty>}
    </div>
  );
}

function Sala() {
  const [modal, setModal] = useState<null | { k: "session"; id: string | null } | { k: "subject" }>(null);
  return (
    <>
      <TimerPanel onManual={() => setModal({ k: "session", id: null })} onNewSubject={() => setModal({ k: "subject" })} />
      <GroupsArea />
      <History onEdit={(id) => setModal({ k: "session", id })} />
      {modal?.k === "session" && <SessionModal id={modal.id} onClose={() => setModal(null)} />}
      {modal?.k === "subject" && <SubjectModal id={null} onClose={() => setModal(null)} />}
    </>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Sala /></Suspense>;
}
