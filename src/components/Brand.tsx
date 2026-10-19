export function Brand() {
  return (
    <div className="brand">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <path d="M6.4 17.4V22.6M12 25.6L16.4 11.8L20.8 25.6M13.4 21.2H19.4M25 11.4L24.2 20.4" />
        <circle cx="24" cy="21" r="3.6" />
        <g transform="rotate(-9 16.4 11.8)">
          <rect x="8" y="10.5" width="19" height="2.8" rx="1.2" />
          <path d="M8.6 9.2C5.6 9.2 4 11.6 4 14.2C4 15.9 4.8 17.2 5.8 17.8L8.6 14.8Z" />
        </g>
        <rect x="4.6" y="22.6" width="3.6" height="3" rx="0.8" />
        <path d="M2.6 25.6H29.4" />
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
