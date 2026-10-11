/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Sessões e Sala viraram uma página só
  async redirects() {
    return [{ source: "/sessoes", destination: "/sala", permanent: false }];
  },
};

export default nextConfig;
