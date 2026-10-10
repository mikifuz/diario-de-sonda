"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import { liveMs, todayMin, useRoom, weekMin } from "@/lib/room";
import { fmtClock, fmtMin, streak } from "@/lib/calc";
import { ConfirmButton, Empty, I, Icon, Tabs, useNow } from "@/components/ui";

function Privacy() {
  const yes = ["Seu apelido, se está estudando agora e há quanto tempo", "Minutos estudados por dia (últimos 35 dias) e sequência de dias", "O nome da disciplina em andamento, só se você permitir"];
  return (
    <div className="stack small" style={{ gap: 6 }}>
      <b>O que os colegas veem</b>
      {yes.map((t) => <span key={t} className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}><span style={{ color: "var(--ok)" }}>✓</span><span>{t}</span></span>)}
      <span className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}><span style={{ color: "var(--bad)" }}>✕</span><span>Notas, confiança, acertos, erros, conteúdos e observações: ficam só com você</span></span>
    </div>
  );
}

export default function Sala() {
  const st = useStore();
  const room = useRoom();
  useNow();
  const [g, setG] = useState("all");
  const [per, setPer] = useState<"hoje" | "semana">("hoje");
  const [nick, setNick] = useState(() => st.profile?.name || "");
  const [share, setShare] = useState(false);
  const [gName, setGName] = useState("");
  const [gCode, setGCode] = useState("");
  const me = room.me;

  if (!room.ready) return <Empty title="Abrindo a sala…" />;

  if (!me) {
    const join = (e: FormEvent) => { e.preventDefault(); if (!nick.trim()) { st.toast("Escolha um apelido."); return; } room.join(nick, share); };
    return (
      <section className="grid g2">
        <div className="panel stack" style={{ gap: 16 }}>
          <span className="lbl">Estudar junto</span>
          <h2 style={{ fontSize: "calc(1.4rem*var(--display-scale))" }}>Entre na sala de estudos</h2>
          <p style={{ margin: 0, maxWidth: "60ch" }}>Veja quem da turma está com o cronômetro ligado agora, acompanhe o placar do dia e da semana e crie grupos com seus colegas. Seu cronômetro de sempre passa a aparecer na sala.</p>
          <form className="stack" style={{ gap: 12 }} onSubmit={join}>
            <label className="f"><span>Apelido que os colegas vão ver</span><input type="text" maxLength={30} required value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Ex.: Micael" /></label>
            <label className="check"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />Mostrar o nome da disciplina que estou estudando</label>
            <div className="row"><button className="btn pri">Entrar na sala</button></div>
          </form>
        </div>
        <div className="panel"><Privacy /></div>
      </section>
    );
  }

  const inGroup = (uid: string) => g === "all" || room.memberships.some((m) => m.code === g && m.user_id === uid);
  const members = room.members.filter((m) => inGroup(m.user_id));
  const isMe = (uid: string) => uid === st.uid;
  const now = members.filter((m) => m.studying || m.paused).sort((a, b) => Number(b.studying) - Number(a.studying) || liveMs(b) - liveMs(a));
  const val = (m: typeof members[number]) => (per === "hoje" ? todayMin(m, room.totals[m.user_id]) : weekMin(m, room.totals[m.user_id]));
  const rank = [...members].sort((a, b) => val(b) - val(a));
  const top = Math.max(1, ...rank.map(val));

  const newGroup = async (e: FormEvent) => { e.preventDefault(); if (!gName.trim()) return; const code = await room.createGroup(gName); if (code) { setGName(""); setG(code); st.toast(`Grupo criado. Código: ${code}`); } };
  const joinGroup = async (e: FormEvent) => { e.preventDefault(); const c = gCode.trim().toUpperCase(); if (room.myGroups.some((x) => x.code === c)) { st.toast("Você já está nesse grupo."); return; } if (await room.joinGroup(c)) { setGCode(""); setG(c); st.toast("Você entrou no grupo."); } };
  const copy = (code: string) => { try { navigator.clipboard.writeText(code).then(() => st.toast(`Código ${code} copiado.`), () => st.toast(`Código do grupo: ${code}`)); } catch { st.toast(`Código do grupo: ${code}`); } };

  return (
    <>
      <div className="row between">
        <Tabs value={g} onChange={setG} label="Grupo" options={[["all", `Todos (${room.members.length})`], ...room.myGroups.map((x) => [x.code, x.name] as [string, string])]} />
        <span className="small muted">{members.length} pessoa(s) neste filtro</span>
      </div>
      <section className="grid g3">
        <div className="panel span2">
          <div className="panel-h"><h2>Estudando agora</h2><span className="chip ok">{now.filter((m) => m.studying).length} ao vivo</span></div>
          {now.length ? (
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 10 }}>
              {now.map((m) => (
                <div key={m.user_id} className="panel" style={{ padding: 14, background: "var(--panel2)", outline: isMe(m.user_id) ? "1px solid var(--accent)" : undefined }}>
                  <div className="row between" style={{ flexWrap: "nowrap" }}>
                    <b className="t" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nick}{isMe(m.user_id) ? " (você)" : ""}</b>
                    <i className="dot" style={{ background: m.studying ? "var(--ok)" : "var(--muted)", animation: m.studying ? "blink 1.6s infinite" : undefined }} />
                  </div>
                  <div className="num" style={{ fontSize: "1.6rem", marginTop: 6 }}>{fmtClock(liveMs(m))}</div>
                  <div className="small muted">{m.studying ? "estudando" : "pausado"}{m.subject ? ` · ${m.subject}` : ""}</div>
                </div>
              ))}
            </div>
          ) : <Empty>Ninguém está com o cronômetro ligado agora.<Link className="btn pri sm" href="/sessoes"><Icon d={I.play} s={14} />Começar a estudar</Link></Empty>}
          <div className="panel-h" style={{ marginTop: 22 }}><h2>Placar</h2><Tabs value={per} onChange={setPer} options={[["hoje", "Hoje"], ["semana", "Semana"]]} /></div>
          {rank.length ? (
            <div className="list">{rank.map((m, i) => {
              const v = val(m), sk = streak(room.totals[m.user_id] || {}, m.studying);
              return (
                <div key={m.user_id} className="li" style={isMe(m.user_id) ? { background: "color-mix(in srgb,var(--accent) 8%,transparent)" } : undefined}>
                  <span className="num" style={{ width: "2ch", textAlign: "right", color: i < 3 && v > 0 ? "var(--accent)" : "var(--muted)" }}>{i + 1}</span>
                  <div className="grow">
                    <div className="row between" style={{ flexWrap: "nowrap" }}><span className="t">{m.nick}{isMe(m.user_id) ? " (você)" : ""}</span><span className="num">{fmtMin(v)}</span></div>
                    <div className="bar" style={{ marginTop: 5 }}><i style={{ width: `${(v / top) * 100}%`, background: isMe(m.user_id) ? "var(--accent)" : "var(--muted)" }} /></div>
                  </div>
                  <span className={"chip " + (sk >= 3 ? "warn" : "")} title="Dias seguidos com estudo">{sk} dia{sk === 1 ? "" : "s"}</span>
                </div>
              );
            })}</div>
          ) : <p className="muted small">Ninguém neste grupo ainda.</p>}
          <p className="small muted" style={{ margin: "10px 0 0" }}>A semana começa na segunda-feira. O placar soma as sessões salvas e o cronômetro em andamento.</p>
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-h"><h3>Meus grupos</h3></div>
            {room.myGroups.length ? (
              <div className="list">{room.myGroups.map((x) => (
                <div key={x.code} className="li">
                  <div className="grow"><div className="t">{x.name}</div><div className="m">código <b className="num" style={{ color: "var(--fg)", letterSpacing: ".1em" }}>{x.code}</b></div></div>
                  <button className="btn sm ghost" onClick={() => copy(x.code)}>Copiar</button>
                  <ConfirmButton small label="Sair" confirmLabel="Sair" onConfirm={() => { if (g === x.code) setG("all"); room.leaveGroup(x.code); }} />
                </div>
              ))}</div>
            ) : <p className="small muted" style={{ margin: "0 0 10px" }}>Crie um grupo e passe o código para os colegas, ou entre em um grupo existente.</p>}
            <form className="row" style={{ marginTop: 10, flexWrap: "nowrap" }} onSubmit={newGroup}><input type="text" maxLength={40} value={gName} onChange={(e) => setGName(e.target.value)} placeholder="Nome do novo grupo" aria-label="Nome do novo grupo" required /><button className="btn sm">Criar</button></form>
            <form className="row" style={{ marginTop: 8, flexWrap: "nowrap" }} onSubmit={joinGroup}><input type="text" maxLength={6} value={gCode} onChange={(e) => setGCode(e.target.value.toUpperCase())} placeholder="Código, ex.: PETRO7" aria-label="Código do grupo" required style={{ fontFamily: "var(--f-mono)" }} /><button className="btn sm">Entrar</button></form>
          </div>
          <MyPresence />
        </div>
      </section>
    </>
  );
}

function MyPresence() {
  const room = useRoom();
  const me = room.me!;
  const [nick, setNick] = useState(me.nick);
  const [share, setShare] = useState(me.share_subject);
  return (
    <div className="panel">
      <div className="panel-h"><h3>Minha presença</h3></div>
      <form className="stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (nick.trim()) room.updateMe({ nick: nick.trim().slice(0, 30), share_subject: share }); }}>
        <label className="f"><span>Apelido</span><input type="text" maxLength={30} value={nick} onChange={(e) => setNick(e.target.value)} required /></label>
        <label className="check"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />Mostrar a disciplina em andamento</label>
        <div className="row"><button className="btn sm">Salvar</button><ConfirmButton small label="Sair da sala" question="Seu placar sai da sala." confirmLabel="Sair" onConfirm={room.leave} /></div>
      </form>
      <details style={{ marginTop: 12 }}><summary className="small">O que os colegas veem</summary><div style={{ marginTop: 10 }}><Privacy /></div></details>
    </div>
  );
}
