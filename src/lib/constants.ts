import type { Activity, Autonomy, BlockKind, Comprehension, EventType, MistakeCategory, Priority, Recovery, Result, Skin, Status, StudyPref } from "./types";

export const ACT: Record<Activity, string> = { aula: "Aula", leitura: "Leitura", exercicios: "Exercícios", revisao: "Revisão", simulado: "Simulado", resumo: "Resumo", teorico: "Estudo teórico", pratico: "Estudo prático" };
export const RES: Record<Result, string> = { certo: "Resolvi corretamente", parcial: "Resolvi parcialmente", errado: "Não consegui resolver", nao: "Ainda não conferi" };
export const AUTO: Record<Autonomy, string> = { sozinho: "Sozinho", anotacoes: "Consultei fórmulas ou anotações", ajuda: "Precisei de ajuda externa", resolucao: "Consultei a resolução completa" };
export const AUTO_S: Record<Autonomy, string> = { sozinho: "Sozinho", anotacoes: "Com anotações", ajuda: "Com ajuda", resolucao: "Viu resolução" };
export const DIFF = ["Muito fácil", "Fácil", "Moderada", "Difícil", "Muito difícil"];
export const COMP: Record<Comprehension, string> = { total: "Entendi completamente", parcial: "Entendi parcialmente", duvidas: "Ainda tenho dúvidas", nao: "Não entendi o conteúdo" };
export const CONF = ["Muito inseguro", "Inseguro", "Razoável", "Confiante", "Muito confiante"];
export const EVT: Record<EventType, string> = { prova: "Prova", trabalho: "Trabalho", apresentacao: "Apresentação", entrega: "Entrega", sub: "Prova substitutiva (SUB)", aula: "Aula", atividade: "Atividade", simulado: "Simulado", estudo: "Estudo planejado", revisao: "Revisão", pessoal: "Compromisso pessoal", indisponivel: "Indisponível" };
export const GRADED: EventType[] = ["prova", "trabalho", "apresentacao", "entrega", "sub"];
export const PRIO: Record<Priority, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };
export const STATUS: Record<Status, string> = { pendente: "Pendente", concluido: "Concluído", cancelado: "Cancelado" };
export const PREF: Record<StudyPref, string> = { antes: "Adiantar o conteúdo antes da aula", depois: "Revisar depois da aula", ambos: "Os dois" };
export const RECOVERY: Record<Recovery, string> = { nenhuma: "Sem recuperação", sub: "Prova substitutiva (SUB)", exame: "Exame final" };
export const BLOCK: Record<BlockKind, string> = { aula: "Aula", estudo: "Estudo", trabalho: "Trabalho ou estágio", deslocamento: "Deslocamento", pessoal: "Compromisso pessoal", descanso: "Descanso" };
export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const WD_S = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const MISTAKE: Record<MistakeCategory, string> = {
  conceitual: "Conceitual", algebrico: "Algébrico", aritmetico: "Aritmético", interpretacao: "Interpretação", unidade: "Unidade",
  sinal: "Sinal", formula: "Fórmula inadequada", metodo: "Método inadequado", atencao: "Falta de atenção", tempo: "Tempo insuficiente",
};
export const MISTAKE_D: Record<MistakeCategory, string> = {
  conceitual: "Não entendeu o conceito ou a teoria por trás", algebrico: "Manipulação algébrica errada", aritmetico: "Conta errada",
  interpretacao: "Leu ou entendeu o enunciado de outro jeito", unidade: "Unidade trocada, faltando ou sem conversão", sinal: "Sinal trocado",
  formula: "Usou a fórmula errada para a situação", metodo: "Escolheu um caminho que não resolve ou não é o pedido", atencao: "Sabia, mas se distraiu",
  tempo: "Não deu tempo de terminar",
};
export const DEFAULT_STEPS = [1, 3, 7, 14, 30];
/** Horários de aula pré-definidos (padrão informado pelo dono; editáveis no bloco) */
export const CLASS_SLOTS = [
  { n: "1º horário", start: "08:20", end: "10:00" },
  { n: "2º horário", start: "10:20", end: "12:00" },
  { n: "3º horário", start: "13:30", end: "15:10" },
  { n: "4º horário", start: "15:20", end: "17:00" },
];

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
  { href: "/hoje", nm: "Hoje", full: "Hoje", t: "Plano do dia", ic: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" },
  { href: "/sala", nm: "Sala", full: "Sala de estudos", t: "Sala de estudos", ic: "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" },
  { href: "/calendario", nm: "Agenda", full: "Calendário", t: "Calendário acadêmico", ic: "M3 6h18v15H3zM3 10h18M8 3v5M16 3v5" },
  { href: "/disciplinas", nm: "Disciplinas", full: "Disciplinas", t: "Minhas disciplinas", ic: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM18 20V7M8 8h6M8 12h6" },
  { href: "/notificacoes", nm: "Avisos", full: "Notificações", t: "Notificações", ic: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" },
  { href: "/configuracoes", nm: "Ajustes", full: "Configurações", t: "Configurações", ic: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4" },
] as const;
