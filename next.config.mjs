/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Sessões viraram parte da Sala; Notas e o Fluxograma (antigo Meu curso), parte de Disciplinas
  // proteções básicas: ninguém abre o app dentro de outro site (clickjacking), o navegador não
  // "adivinha" tipos de arquivo e os links externos não recebem o endereço completo das páginas
  async headers() {
    return [{
      // o aviso no celular depende deste arquivo; o navegador precisa sempre buscar a versão nova
      source: "/sw.js",
      headers: [{ key: "Cache-Control", value: "no-cache" }],
    }, {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  async redirects() {
    return [
      { source: "/sessoes", destination: "/sala", permanent: false },
      { source: "/notas", destination: "/disciplinas", permanent: false },
      { source: "/curso", destination: "/disciplinas?aba=fluxograma", permanent: false },
    ];
  },
};

export default nextConfig;
