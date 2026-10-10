# Diário de Sonda — contexto para quem continuar o projeto

Aplicativo de acompanhamento de estudos de um aluno de Engenharia de Petróleo (UDESC), com colegas usando a sala de estudos. Toda a interface e as mensagens são em **português do Brasil**. O dono do projeto não é programador: explique em linguagem simples e diga claramente quando ele precisa agir (ex.: rodar SQL no Supabase).

## Histórico
1. Começou como uma página publicada no Claude (artifact) com os mesmos recursos.
2. Migrado para Next.js 15 + Supabase para funcionar fora do Claude. Deploy: GitHub → Vercel (automático a cada push em `main`).
3. A cópia JSON exportada da primeira versão (`version: 1`) é importada por `src/lib/legacy.ts`.

## Regras do produto (não negociáveis)
- **Confiança, acerto conferido e autonomia são métricas separadas.** Confiança alta nunca conta como acerto. "Ainda não conferi" não entra em médias de acerto.
- Nunca inventar dados nos painéis. Dados de exemplo só em modo demonstração claramente marcado.
- Toda leitura/estimativa mostra o motivo (ex.: `signal()` em `calc.ts` devolve `why`). Sem dados suficientes, dizer isso.
- Notas estimadas (simulação, futura correção por IA) sempre separadas da nota oficial.
- Regras de média variam por disciplina (média mínima e exame configuráveis); não assumir regra da universidade.
- Privacidade: dados acadêmicos são só do dono (RLS). A sala expõe apenas apelido, presença e minutos por dia (`room_daily_totals`).
- Não criar botões que parecem funcionar mas não fazem nada; recursos futuros aparecem só como "próximas etapas".

## Arquitetura
- `src/lib/calc.ts`: cálculos puros (médias, acerto, leitura de conteúdo, datas). Testes em `calc.test.ts`.
- `src/lib/store.tsx`: carrega as tabelas do usuário, grava de forma otimista (`save`, `saveMany`, `remove`), escuta realtime dos próprios dados; cronômetro fica em `profiles.timer` para seguir entre aparelhos.
- `src/lib/room.tsx`: sala de estudos (presença sincronizada com o cronômetro, grupos com código de 6 caracteres, placar).
- `src/components/`: modais (sessão, autoavaliação, disciplina, conteúdo, item do calendário), gráficos SVG, navegação.
- Tela logada em `src/app/(app)/*` (client components). Login em `/entrar`.
- Estilo: `src/app/globals.css` com tokens; temas pelo atributo `data-skin` no `<html>` (sonda, caderno, blueprint, terminal; "moderno" = sem atributo, segue claro/escuro).
- Banco: `supabase/migrations/`. **Nunca editar uma migration já aplicada**; criar uma nova com timestamp maior e avisar o dono para rodá-la no SQL Editor do Supabase.

## Verificação
- `npm run typecheck`, `npm test`, `npm run build`.
- CI (`.github/workflows/ci.yml`) roda isso e também aplica as migrations num Postgres 16 com `supabase/tests/00_stub_auth.sql` + `10_rls.sql` (testes de privacidade). Ao criar tabelas novas, acrescente testes de RLS em `10_rls.sql`.

## Próximas etapas (ordem combinada)
1. **Análise de desempenho**: banco de erros (categorias: conceitual, algébrico, aritmético, interpretação, unidade, sinal, fórmula inadequada, método inadequado, falta de atenção, tempo insuficiente), índice de domínio por conteúdo com metodologia transparente e configurável, revisão espaçada com página "Revisões de hoje", planejamento reverso a partir da data da prova, relatórios. Também recolocar o modo demonstração (dados só em memória).
2. **IA** (chave só no servidor, via route handlers): simulados com gabarito/resolução/critérios em PDF, correção assistida de resoluções por foto (sinalizar trechos ilegíveis), assistente que responde com base nos dados e distingue fato de estimativa.
3. **Engenharia de Petróleo**: fórmulas com variáveis, unidades e hipóteses (KaTeX), conversor SI ↔ unidades de campo (bbl, scf, psi, ft, mD, cP, °API), verificação dimensional, histórico da graduação (matriz curricular informada pelo aluno, não presumida).
4. Biblioteca de materiais por disciplina (Supabase Storage, privada).
