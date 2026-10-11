export function Brand() {
  return (
    <div className="brand">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <path d="M5 20C5 11.5 9.5 5.5 15 5.5S25 11.5 25 20Z" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12.6 20V6.4M17.4 20V6.4" stroke="var(--accent)" strokeWidth="1.4" />
        <rect x="2.5" y="20" width="25" height="4.6" rx="2.3" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
      </svg>
      <div><b>Fundo do Poço</b><span>BOLETIM DE ESTUDOS</span></div>
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
