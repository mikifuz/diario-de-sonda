import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diário de Sonda",
  description: "Acompanhamento de estudos: sessões cronometradas, confiança × acerto, calendário de provas, médias e sala de estudos com colegas.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Aplica o tema salvo antes da primeira pintura, evitando piscar.
const skinScript = `try{var s=localStorage.getItem("ds-skin")||"sonda";if(s==="moderno")document.documentElement.removeAttribute("data-skin");else document.documentElement.setAttribute("data-skin",s)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-skin="sonda" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: skinScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Libre+Baskerville:wght@400;700&family=Crimson+Pro:wght@400;500;600&family=Courier+Prime:wght@400;700&family=VT323&family=Share+Tech+Mono&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
