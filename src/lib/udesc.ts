// Modo UDESC (pedido do dono, para o irmão que estuda em outra universidade).
// Sem coluna nova: vale o campo "Universidade" do perfil (profiles.university).
//  - vazio  → ainda não respondeu "Você é da UDESC?" (o app pergunta em Hoje)
//  - "UDESC" (ou qualquer texto com UDESC) → modo ligado
//  - outra coisa → modo desligado: some o que só serve para a UDESC (fluxograma, SIGA, horários de aula da UDESC)
type P = { university?: string | null } | null | undefined;

/** texto gravado em "Universidade" quando a pessoa diz que não é da UDESC e não conta qual */
export const OTHER_UNI = "Outra universidade";

export const udescAsked = (p: P) => !!p?.university?.trim();
export const isUdesc = (p: P) => /\budesc\b/i.test(p?.university || "");

/** universidade a gravar ao ligar/desligar o modo (mantém o nome que a pessoa digitou, se houver) */
export function uniFor(on: boolean, current: string, other = ""): string {
  if (on) return "UDESC";
  const name = other.trim() || (isUdesc({ university: current }) ? "" : current.trim());
  return (name || OTHER_UNI).slice(0, 120);
}
