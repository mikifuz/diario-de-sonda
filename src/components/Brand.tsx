export function Brand() {
  return (
    <div className="brand">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <path d="M15 2 L8 14 h4 l-3 14 h12 l-3-14 h4 Z" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M11 20h8M10.4 24h9.2M12 16h6" stroke="var(--accent)" strokeWidth="1.2" />
      </svg>
      <div><b>Diário de Sonda</b><span>BOLETIM DE ESTUDOS</span></div>
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="auth-wrap">
      <div className="panel stack auth-card" style={{ gap: 14 }}>
        <Brand />
        <h1 style={{ fontSize: "calc(1.3rem*var(--display-scale))" }}>Falta conectar o banco de dados</h1>
        <p style={{ margin: 0 }}>As variáveis <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> não foram configuradas.</p>
        <p className="small muted" style={{ margin: 0 }}>Copie os valores em Supabase → Project Settings → API. Rodando no computador, coloque-os no arquivo <code>.env.local</code>; na Vercel, em Settings → Environment Variables, e faça um novo deploy.</p>
      </div>
    </div>
  );
}
