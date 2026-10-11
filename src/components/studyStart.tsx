"use client";
// Ao começar uma sessão: entrar na sala do grupo (com ou sem a matéria) ou estudar sozinho.
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useRoom } from "@/lib/room";
import { ACT } from "@/lib/constants";
import type { Activity, Social } from "@/lib/types";
import { Modal } from "./ui";

export interface StartArgs { subject_id: string; topic_id: string | null; activity: Activity }

export const SOCIAL: Record<Social, [string, string]> = {
  materia: ["Entrar na sala mostrando a matéria", "Os colegas dos seus grupos veem que você está estudando e qual disciplina."],
  anonimo: ["Entrar na sala sem mostrar a matéria", "Os colegas veem só que você está estudando e há quanto tempo."],
  sozinho: ["Não, estudar sozinho", "O cronômetro roda só para você; a sala não mostra esta sessão."],
};

export function StartModal({ args, onClose, onStarted }: { args: StartArgs; onClose: () => void; onStarted?: () => void }) {
  const st = useStore();
  const room = useRoom();
  const [nick, setNick] = useState(() => st.profile?.name?.split(" ")[0] || "");
  const [busy, setBusy] = useState(false);
  const sub = st.subjects.find((s) => s.id === args.subject_id);
  const topic = args.topic_id ? st.topics.find((t) => t.id === args.topic_id)?.name : "";
  const noGroups = !!room.me && room.myGroups.length === 0;

  const go = async (social: Social) => {
    if (social !== "sozinho" && !room.me) {
      if (!nick.trim()) { st.toast("Escolha um apelido para a sala."); return; }
      setBusy(true);
      const ok = await room.join(nick, social === "materia");
      setBusy(false);
      if (!ok) return;
    }
    st.startTimer(args.subject_id, args.topic_id, args.activity, social);
    st.toast(social === "sozinho" ? "Cronômetro iniciado." : room.myGroups.length ? "Cronômetro iniciado. Você está na sala." : "Cronômetro iniciado. Entre em um grupo para os colegas te verem.");
    onStarted?.();
    onClose();
  };

  return (
    <Modal title="Entrar na sala de estudos?" sub={`${sub?.name || ""}${topic ? ` · ${topic}` : ""} · ${ACT[args.activity]}`} onClose={onClose}>
      <div className="stack" style={{ gap: 10 }}>
        {!room.me && (
          <label className="f"><span>Apelido que os colegas vão ver (para entrar na sala)</span>
            <input type="text" maxLength={30} value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Ex.: Mica" /></label>
        )}
        {(Object.keys(SOCIAL) as Social[]).map((k) => (
          <button key={k} type="button" className={"btn" + (k === "materia" ? " pri" : "")} disabled={busy} onClick={() => go(k)}
            style={{ flexDirection: "column", alignItems: "flex-start", whiteSpace: "normal", textAlign: "left", gap: 2 }}>
            <b>{SOCIAL[k][0]}</b><span className="small" style={{ opacity: 0.85 }}>{SOCIAL[k][1]}</span>
          </button>
        ))}
        {(noGroups || !room.me) && <p className="small muted" style={{ margin: 0 }}>A sala é só por grupos: só quem está num grupo com você te vê. Crie um grupo ou entre com um código aqui na página da Sala.</p>}
        <p className="small muted" style={{ margin: 0 }}>Dá para mudar isso durante a sessão.</p>
      </div>
    </Modal>
  );
}
