"use client";
// "Você é da UDESC?" — aparece em Hoje até a pessoa responder (campo Universidade vazio).
// A resposta liga/desliga o modo UDESC; dá para trocar depois em Configurações.
import { useState } from "react";
import { useStore } from "@/lib/store";
import { udescAsked, uniFor } from "@/lib/udesc";

export function UdescAsk() {
  const st = useStore();
  const [other, setOther] = useState<null | string>(null);
  if (st.demo || !st.profile || udescAsked(st.profile)) return null;
  const answer = async (on: boolean, name = "") => {
    if (await st.updateProfile({ university: uniFor(on, "", name) }))
      st.toast(on ? "Modo UDESC ligado: fluxograma e importação do SIGA disponíveis." : "Modo UDESC desligado. Dá para mudar em Configurações.");
  };
  return (
    <section className="panel" aria-label="Você é da UDESC?">
      <div className="panel-h"><h2>Você é da UDESC?</h2><span className="lbl">modo UDESC</span></div>
      <p className="small" style={{ margin: "0 0 10px", maxWidth: "66ch" }}>
        Com o modo UDESC, o app importa suas aulas do comprovante do SIGA, já sugere os horários de aula da UDESC e mostra o fluxograma do curso.
        Sem ele, fica o painel de estudo de sempre, para qualquer universidade. Você pode trocar depois em Configurações.
      </p>
      {other == null ? (
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm pri" onClick={() => answer(true)}>Sim, sou da UDESC</button>
          <button className="btn sm" onClick={() => setOther("")}>Não, sou de outra</button>
        </div>
      ) : (
        <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); answer(false, other); }}>
          <input type="text" value={other} maxLength={120} onChange={(e) => setOther(e.target.value)} placeholder="Qual? (opcional, ex.: UFSC)" style={{ maxWidth: 260 }} autoFocus aria-label="Sua universidade" />
          <button className="btn sm pri">Pronto</button>
          <button type="button" className="btn sm ghost" onClick={() => setOther(null)}>Voltar</button>
        </form>
      )}
    </section>
  );
}
