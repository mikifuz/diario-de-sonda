import type { MetadataRoute } from "next";

// Permite instalar o app na tela de início (no iPhone, é o que libera os avisos no celular)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fundo do Poço",
    short_name: "Fundo do Poço",
    description: "Acompanhamento de estudos com plano do dia, provas e sala de estudos.",
    lang: "pt-BR",
    start_url: "/hoje",
    scope: "/",
    display: "standalone",
    background_color: "#fbecd9",
    theme_color: "#f2679c",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
