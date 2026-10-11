"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { configured, friendlyError, sb } from "@/lib/supabase";
import { Brand, NotConfigured } from "@/components/Brand";

export default function RedefinirSenha() {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!configured) return;
    // o link do e-mail abre uma sessão temporária de recuperação
    const { data } = sb().auth.onAuthStateChange((ev, session) => { if (ev === "PASSWORD_RECOVERY" || session) setOk(true); });
    sb().auth.getSession().then(({ data: d }) => setOk((v) => v || !!d.session));
    const t = setTimeout(() => setOk((v) => (v == null ? false : v)), 4000);
    return () => { data.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  if (!configured) return <NotConfigured />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setMsg("A senha precisa ter pelo menos 8 caracteres."); return; }
    const { error } = await sb().auth.updateUser({ password });
    if (error) { setMsg(friendlyError(error)); return; }
    router.replace("/painel");
  };

  return (
    <div className="auth-wrap">
      <div className="panel stack auth-card" style={{ gap: 16 }}>
        <Brand />
        <h1 style={{ fontSize: "calc(1.3rem*var(--display-scale))" }}>Nova senha</h1>
        {ok === false ? <p>O link expirou ou já foi usado. <a href="/entrar">Peça um novo</a>.</p> : (
          <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
            <label className="f"><span>Nova senha</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" /></label>
            {msg && <div className="callout" role="status">{msg}</div>}
            <button className="btn pri" disabled={!ok} style={{ justifyContent: "center" }}>Salvar nova senha</button>
          </form>
        )}
      </div>
    </div>
  );
}
