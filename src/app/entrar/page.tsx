"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { configured, friendlyError, sb } from "@/lib/supabase";
import { Brand, NotConfigured } from "@/components/Brand";
import { Tabs } from "@/components/ui";
import Link from "next/link";
import { DEMO_FLAG } from "@/lib/demo";

type Mode = "entrar" | "criar" | "esqueci";

export default function Entrar() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  useEffect(() => {
    // entrar de verdade sai do modo demonstração
    try { sessionStorage.removeItem(DEMO_FLAG); } catch { /* sem armazenamento */ }
    if (new URLSearchParams(window.location.search).get("conta") === "excluida") setMsg({ ok: true, t: "Sua conta e todos os seus dados foram excluídos." });
    if (!configured) return;
    sb().auth.getSession().then(({ data }) => { if (data.session) router.replace("/hoje"); });
  }, [router]);

  if (!configured) return <NotConfigured />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const auth = sb().auth;
    try {
      if (mode === "entrar") {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.replace("/hoje");
      } else if (mode === "criar") {
        if (password.length < 8) { setMsg({ ok: false, t: "A senha precisa ter pelo menos 8 caracteres." }); return; }
        const { data, error } = await auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() }, emailRedirectTo: `${location.origin}/hoje` } });
        if (error) throw error;
        if (data.session) router.replace("/hoje");
        else setMsg({ ok: true, t: "Conta criada. Enviamos um link de confirmação para o seu e-mail; abra-o e depois entre aqui." });
      } else {
        const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/redefinir-senha` });
        if (error) throw error;
        setMsg({ ok: true, t: "Se houver uma conta com este e-mail, você receberá um link para criar uma nova senha." });
      }
    } catch (err) {
      setMsg({ ok: false, t: friendlyError(err as { message?: string }) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="panel stack auth-card" style={{ gap: 18 }}>
        <Brand />
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: "calc(1.35rem*var(--display-scale))" }}>{mode === "criar" ? "Criar conta" : mode === "esqueci" ? "Recuperar senha" : "Entrar"}</h1>
          <p className="small muted" style={{ margin: 0 }}>Horas de estudo, plano do dia e provas do semestre num só lugar.</p>
        </div>
        {mode !== "esqueci" && <Tabs value={mode} onChange={(m) => { setMode(m); setMsg(null); }} options={[["entrar", "Entrar"], ["criar", "Criar conta"]]} label="Modo" />}
        <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
          {mode === "criar" && <label className="f"><span>Seu nome</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
          <label className="f"><span>E-mail</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          {mode !== "esqueci" && <label className="f"><span>Senha</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "criar" ? 8 : 6} autoComplete={mode === "criar" ? "new-password" : "current-password"} /></label>}
          {msg && <div className={"callout" + (msg.ok ? " info" : "")} role="status">{msg.t}</div>}
          <button className="btn pri" disabled={busy} style={{ justifyContent: "center" }}>{busy ? "Aguarde…" : mode === "criar" ? "Criar conta" : mode === "esqueci" ? "Enviar link" : "Entrar"}</button>
        </form>
        <div className="row between small">
          {mode === "esqueci"
            ? <button type="button" className="btn ghost sm" onClick={() => { setMode("entrar"); setMsg(null); }}>Voltar para entrar</button>
            : <button type="button" className="btn ghost sm" onClick={() => { setMode("esqueci"); setMsg(null); }}>Esqueci minha senha</button>}
          <Link className="btn ghost sm" href="/demo">Ver demonstração sem conta</Link>
        </div>
      </div>
    </div>
  );
}
