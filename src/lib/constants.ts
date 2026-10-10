import type { Activity, Autonomy, Comprehension, EventType, Priority, Result, Skin, Status } from "./types";

export const ACT: Record<Activity, string> = { aula: "Aula", leitura: "Leitura", exercicios: "Exercícios", revisao: "Revisão", simulado: "Simulado", resumo: "Resumo", teorico: "Estudo teórico", pratico: "Estudo prático" };
export const RES: Record<Result, string> = { certo: "Resolvi corretamente", parcial: "Resolvi parcialmente", errado: "Não consegui resolver", nao: "Ainda não conferi" };
export const AUTO: Record<Autonomy, string> = { sozinho: "Sozinho", anotacoes: "Consultei fórmulas ou anotações", ajuda: "Precisei de ajuda externa", resolucao: "Consultei a resolução completa" };
export const AUTO_S: Record<Autonomy, string> = { sozinho: "Sozinho", anotacoes: "Com anotações", ajuda: "Com ajuda", resolucao: "Viu resolução" };
export const DIFF = ["Muito fácil", "Fácil", "Moderada", "Difícil", "Muito difícil"];
export const COMP: Record<Comprehension, string> = { total: "Entendi completamente", parcial: "Entendi parcialmente", duvidas: "Ainda tenho dúvidas", nao: "Não entendi o conteúdo" };
export const CONF = ["Muito inseguro", "Inseguro", "Razoável", "Confiante", "Muito confiante"];
export const EVT: Record<EventType, string> = { prova: "Prova", trabalho: "Trabalho", apresentacao: "Apresentação", entrega: "Entrega", aula: "Aula", atividade: "Atividade", simulado: "Simulado", estudo: "Estudo planejado", revisao: "Revisão", pessoal: "Compromisso pessoal", indisponivel: "Indisponível" };
export const GRADED: EventType[] = ["prova", "trabalho", "apresentacao", "entrega"];
export const PRIO: Record<Priority, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };
export const STATUS: Record<Status, string> = { pendente: "Pendente", concluido: "Concluído", cancelado: "Cancelado" };
export const COLORS = ["#4f86f7", "#e0864a", "#3fae7a", "#c75b9b", "#d4b13f", "#5bb8c7", "#9a7be0", "#d0584f"];

export const SKINS: { id: Skin; nm: string; d: string; c: string[] }[] = [
  { id: "sonda", nm: "Painel de Sonda", d: "Anos 70, verde-oliva e âmbar", c: ["#1f221b", "#33382b", "#e3a23b", "#ece4cb"] },
  { id: "caderno", nm: "Caderno de Campo", d: "Papel pautado e tinta azul", c: ["#ebe3cf", "#f7f1e1", "#24466e", "#2b2419"] },
  { id: "blueprint", nm: "Blueprint", d: "Planta técnica em cianotipia", c: ["#163d70", "#215495", "#ffe08a", "#eef5ff"] },
  { id: "terminal", nm: "Terminal", d: "Fósforo verde, tela antiga", c: ["#090c08", "#142013", "#7dff5f", "#b9f5a8"] },
  { id: "moderno", nm: "Moderno", d: "Limpo, segue o claro/escuro do sistema", c: ["#f4f6f8", "#ffffff", "#2556c4", "#18202b"] },
];

export const PAGES = [
  { href: "/painel", nm: "Painel", full: "Painel", t: "Painel do semestre", ic: "M3 13h4v8H3zM10 3h4v18h-4zM17 9h4v12h-4z" },
  { href: "/sessoes", nm: "Sessões", full: "Sessões", t: "Sessões de estudo", ic: "M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 1h6" },
  { href: "/sala", nm: "Sala", full: "Sala de estudos", t: "Sala de estudos", ic: "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" },
  { href: "/calendario", nm: "Agenda", full: "Calendário", t: "Calendário acadêmico", ic: "M3 6h18v15H3zM3 10h18M8 3v5M16 3v5" },
  { href: "/disciplinas", nm: "Disciplinas", full: "Disciplinas", t: "Minhas disciplinas", ic: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM18 20V7M8 8h6M8 12h6" },
  { href: "/notas", nm: "Notas", full: "Notas", t: "Notas e médias", ic: "M5 3h14v18H5zM9 7h6M9 11h6M9 15h3" },
  { href: "/configuracoes", nm: "Ajustes", full: "Configurações", t: "Configurações", ic: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4" },
] as const;
