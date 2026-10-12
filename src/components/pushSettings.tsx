"use client";
// Configurações → Avisos no celular: ativar neste aparelho, escolher o que receber e testar.
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { sb, friendlyError } from "@/lib/supabase";
import { qt } from "@/lib/calc";
import { callPush, currentSubscription, disablePush, enablePush, pushSupport, saveSubscription, type PushSupport } from "@/lib/pushClient";

interface Row { id: string; endpoint: string; device: string; amigos: boolean; manha: boolean }

export function PushSettings() {
  const st = useStore();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mine, setMine] = useState<string | null>(null); // endpoint deste aparelho
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState("");

  const load = async () => {
    const { data, error } = await sb().from("push_subscriptions").select("id,endpoint,device,amigos,manha").order("created_at");
    // tabela ainda não criada: falta rodar a migration no Supabase
    if (error) { setMissing(error.code === "42P01" || error.code === "PGRST205"); setRows([]); return; }
    setRows(data as Row[]);
  };

  useEffect(() => {
    if (st.demo) return;
    const s = pushSupport();
    setSupport(s);
    (async () => {
      const sub = s === "ok" ? await currentSubscription().catch(() => null) : null;
      // o navegador pode trocar a inscrição; regrava para o servidor não mandar para a antiga
      if (sub) { await saveSubscription(sub); setMine(sub.endpoint); }
      await load();
    })();
  }, [st.demo]); // eslint-disable-line react-hooks/exhaustive-deps

  const here = rows?.find((r) => r.endpoint === mine) ?? null;
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { st.toast(friendlyError(e as { message?: string })); } finally { setBusy(""); }
  };
  const enable = () => run("Ativando…", async () => {
    const err = await enablePush();
    if (err) { st.toast(err); setSupport(pushSupport()); return; }
    const sub = await currentSubscription();
    setMine(sub?.endpoint ?? null);
    await load();
    st.toast("Avisos ativados neste aparelho.");
  });
  const disable = () => run("Desativando…", async () => { await disablePush(); setMine(null); await load(); st.toast("Avisos desativados neste aparelho."); });
  const test = () => run("Enviando…", async () => {
    const r = await callPush("teste", { endpoint: mine });
    st.toast(r.ok ? "Aviso de teste enviado. Deve chegar em alguns segundos." : r.error || "Não foi possível enviar.");
  });
  const setPref = (patch: Partial<Pick<Row, "amigos" | "manha">>) => run("", async () => {
    if (!here) return;
    setRows((rs) => rs?.map((r) => (r.id === here.id ? { ...r, ...patch } : r)) ?? rs);
    const { error } = await sb().from("push_subscriptions").update(patch).eq("id", here.id);
    if (error) { st.toast(friendlyError(error)); await load(); }
  });

  let body;
  if (st.demo) body = <p className="small" style={{ margin: 0 }}>Na demonstração os avisos no celular ficam desligados.</p>;
  else if (support === null || rows === null) body = <p className="small muted" style={{ margin: 0 }}>Carregando…</p>;
  else if (support === "sem_servidor") body = <p className="small" style={{ margin: 0 }}>Os avisos ainda não foram configurados no servidor do app (faltam as chaves na Vercel). Assim que estiverem lá, o botão para ativar aparece aqui.</p>;
  else if (missing) body = <p className="small" style={{ margin: 0 }}>Falta preparar o banco de dados: rode a atualização <b>20261020000000_avisos_no_celular.sql</b> no SQL Editor do Supabase.</p>;
  else if (support === "iphone_tela") body = <p className="small" style={{ margin: 0 }}>No iPhone, os avisos só funcionam com o app na Tela de Início: no Safari, toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>, abra o app pelo ícone novo e volte aqui.</p>;
  else if (support === "sem_suporte") body = <p className="small" style={{ margin: 0 }}>Este navegador não recebe avisos. No celular, use o Chrome (Android) ou o app na Tela de Início (iPhone).</p>;
  else if (support === "bloqueado") body = <p className="small" style={{ margin: 0 }}>Os avisos foram bloqueados para este site. Libere nas configurações do navegador (cadeado ao lado do endereço → Notificações) e recarregue a página.</p>;
  else if (!here) body = (
    <div className="row"><button className="btn pri" onClick={enable} disabled={!!busy}>{busy || "Ativar avisos neste aparelho"}</button></div>
  );
  else body = (
    <div className="stack" style={{ gap: 8 }}>
      <label className="check"><input type="checkbox" checked={here.manha} onChange={(e) => setPref({ manha: e.target.checked })} />Resumo da manhã (por volta das 7h): provas nos próximos 3 dias, revisões e tarefas do dia, e quando você passa 3 dias sem estudar. Sem nada para dizer, não chega nada.</label>
      <label className="check"><input type="checkbox" checked={here.amigos} onChange={(e) => setPref({ amigos: e.target.checked })} />Pedidos de amizade e chamados para estudar</label>
      <div className="row">
        <button className="btn" onClick={test} disabled={!!busy}>Mandar um aviso de teste</button>
        <button className="btn ghost" onClick={disable} disabled={!!busy}>Desativar neste aparelho</button>
        {busy && <span className="small muted">{busy}</span>}
      </div>
    </div>
  );

  return (
    <section className="panel">
      <div className="panel-h"><h2>Avisos no celular</h2>{rows && rows.length > 0 && <span className="lbl">ativados em {qt(rows.length, "aparelho", "aparelhos")}</span>}</div>
      <div className="stack">
        {body}
        <p className="small muted" style={{ margin: 0 }}>Cada aparelho é ativado separadamente. Os avisos chegam mesmo com o app fechado e trazem só o título do que aconteceu; os detalhes continuam dentro do app.</p>
      </div>
    </section>
  );
}
