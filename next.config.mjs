/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Sessões viraram parte da Sala; Notas, parte de Disciplinas
  async redirects() {
    return [
      { source: "/sessoes", destination: "/sala", permanent: false },
      { source: "/notas", destination: "/disciplinas", permanent: false },
    ];
  },
};

export default nextConfig;
