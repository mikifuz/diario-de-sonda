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
- Privacidade: dados acadêmicos são só do dono (RLS). A sala expõe apenas apelido, presença e minutos por dia (`room_daily_totals`), e **só para quem divide um grupo** (não existe sala geral; códigos de grupo não são listáveis).
- Não criar botões que parecem funcionar mas não fazem nada; recursos futuros aparecem só como "próximas etapas".

## Arquitetura
- `src/lib/calc.ts`: cálculos puros (médias com SUB/exame, acerto, leitura de conteúdo, datas). Testes em `calc.test.ts`.
- `src/lib/plan.ts`: revisão espaçada ancorada na prova (`nextReview`, `itemState`, `anchorFor`), plano do dia (`planDay`: encaixa revisões e aulas nos blocos de estudo da rotina) e carga até as provas (`examLoads`). Tudo devolve `why`. Testes em `plan.test.ts`.
- `src/lib/mastery.ts`: índice de domínio por conteúdo (0–100): acerto conferido (recência com meia-vida de 14 dias), autonomia, prática recente e erros em aberto; pesos em `profiles.mastery_cfg` (padrão 50/25/15/10, 30 dias, mínimo 3 registros). Confiança não entra. Devolve `formula` e `why`. Testes em `mastery.test.ts` (inclui os alertas).
- `src/lib/reverse.ts`: planejamento reverso (aba Provas em `/hoje`): para cada prova em até 30 dias, meta de minutos por conteúdo pelo índice de domínio (sem dados/frágil 120, em construção 75, dominado 30) menos o já estudado, distribuída em pedaços de até 45 min (um por conteúdo por dia) nos blocos de estudo, com 20% reservado para revisões/aulas e 60 min de revisão geral na véspera; prova mais próxima usa o tempo primeiro; conteúdo não dado só entra a partir da aula. Calculado na hora, nada gravado. Os pedaços de hoje entram no plano do dia (`todayTasks` → `PlanInput.extra`). Testes em `reverse.test.ts`.
- `src/lib/alerts.ts`: alertas do painel (prova em até 14 dias com conteúdo frágil; em construção ou sem dados a até 7 dias; confiança baixa → "faça exercícios"; confiança × acerto; revisões atrasadas), cada um com motivo e link para começar exercícios.
- `src/lib/store.tsx`: carrega as tabelas do usuário, grava de forma otimista (`save`, `saveMany`, `remove`), escuta realtime dos próprios dados; cronômetro fica em `profiles.timer` para seguir entre aparelhos.
- `src/lib/room.tsx`: sala de estudos (presença sincronizada com o cronômetro, grupos com código de 6 caracteres, placar).
- Página `/sala` junta cronômetro, grupos ao vivo, placar e histórico de sessões (a antiga `/sessoes` redireciona para cá). Ao começar, `StartModal` (`components/studyStart.tsx`) pergunta: entrar na sala com a matéria, sem a matéria ou estudar sozinho (`profiles.timer.social`).
- `src/components/`: modais (sessão, autoavaliação, disciplina, conteúdo, item do calendário), gráficos SVG, navegação; `planning.tsx` tem os modais de erro, revisão e bloco da rotina.
- Notas ficam dentro de cada disciplina (`GradesPanel`, `#notas`); a lista de Disciplinas é a visão geral (uma linha por disciplina).
- Página `/hoje` (abas Plano do dia, Revisões, Banco de erros, Rotina; `?aba=` abre uma aba).
- Tela logada em `src/app/(app)/*` (client components). Login em `/entrar`.
- Estilo: `src/app/globals.css` com tokens; temas pelo atributo `data-skin` no `<html>` (sonda, caderno, blueprint, terminal; "moderno" = sem atributo, segue claro/escuro).
- Banco: `supabase/migrations/`. **Nunca editar uma migration já aplicada**; criar uma nova com timestamp maior e avisar o dono para rodá-la no SQL Editor do Supabase.

## Verificação
- `npm run typecheck`, `npm test`, `npm run build`.
- CI (`.github/workflows/ci.yml`) roda isso e também aplica as migrations num Postgres 16 com `supabase/tests/00_stub_auth.sql` + `10_rls.sql` (testes de privacidade). Ao criar tabelas novas, acrescente testes de RLS em `10_rls.sql`.

## Decisões já tomadas com o dono
- Público: exatas, principalmente UDESC. **Na UDESC não há mais exame; há SUB**: prova que substitui a menor nota entre as **provas** (não trabalhos), em geral só quando for maior (depende do professor → `subjects.sub_replace_lower`). O modo `recovery` por disciplina (`nenhuma`/`sub`/`exame`) mantém o exame para outros cursos. A SUB é uma linha em `assessments` com `kind = 'sub'`, fora dos pesos. **Cada prova diz se tem SUB** (`assessments.sub_id`, coluna "Tem SUB?" nas notas; com várias SUBs vira uma escolha): cada SUB substitui a menor nota entre as provas marcadas com ela, e várias SUBs se somam (`gradeCalc` → `subs`, `subFinal`). Na importação do cronograma, "SUB A1/A2" é ligada às provas A1 e A2; SUB sem citação, às provas anteriores sem SUB.
- **Revisão não passa da prova**: cada item de revisão fica ancorado numa prova (`review_items.assessment_id`, escolhida pelo conteúdo ou a próxima da disciplina); nenhuma data passa da véspera; depois da prova o item se encerra (calculado, não gravado). Depois da última prova, se a disciplina tem SUB, o app oferece reativar as revisões da prova que seria substituída. Sem prova: intervalo máximo de 14 dias. Escada padrão 1, 3, 7, 14, 30 (configurável).
- A próxima data depende só de resultado conferido + autonomia; confiança é registrada mas não muda a data.
- Horários de aula pré-definidos (`CLASS_SLOTS` em `constants.ts`): 1º 08:20–10:00, 2º 10:20–12:00, 3º 13:30–15:10, 4º 15:20–17:00 (informados pelo dono; o fim do 1º foi corrigido para 10:00 conforme o comprovante do SIGA, que divide em aulas de 50 min: 08:20–09:10, 09:10–10:00). São atalhos no bloco da rotina; "Outro horário" permite qualquer horário. Horários seguidos viram um bloco só. O bloco de aula pode criar uma disciplina nova na hora.
- **Importar do SIGA**: `src/lib/siga.ts` lê o "Comprovante de matrícula" do SIGA (UDESC) pelo texto e posições do PDF (pdf.js, no navegador; o arquivo não sai do aparelho). Sem IA. Mostra uma prévia e só grava depois da confirmação. O exemplo de teste (`src/lib/fixtures/siga-comprovante.json`) não tem nome, matrícula nem código de autenticidade; nunca versionar o PDF original.
- **Sala só por grupos** (decisão do dono): migration `20261012000000_sala_por_grupos.sql` (`shares_group`, `is_group_member`). Entrar num grupo exige o código. "Estudar sozinho" esconde a presença ao vivo, mas os minutos salvos continuam no placar do grupo.
- **Importar cronograma do professor** (por disciplina): `src/lib/syllabus.ts` lê Excel (.xlsx), Word (.docx), PDF com texto ou texto colado, sem IA, no navegador (`syllabusFile.ts`, com `fflate` e pdf.js). Classifica cada linha em conteúdo, prova, SUB, trabalho, exercícios ou sem aula; conteúdos repetidos viram um só (data da primeira aula) e são ligados à prova seguinte. Prévia com tipo editável antes de gravar; não duplica o que já existe. Testado com 5 cronogramas reais de 2026/2 (fixtures sem nomes nem e-mails de professores; nunca versionar os arquivos originais). 
- Aula remarcada: ao adiar a data de um conteúdo, `pushLessons` empurra os seguintes para o próximo dia de aula (rotina, ou os dias em que a disciplina costuma ter aula). A Sala já seleciona o conteúdo da aula mais recente (`lastTaught`) e mostra "Estudando para: aula de dd/mm · cai na P2".
- **Notificações** (`/notificacoes`, tabela `notifications`): relatório semanal gerado no app no domingo a partir das 7h sobre domingo–sábado (`src/lib/report.ts`, um por semana por índice único), pedidos de amizade e chamados. Só dentro do app por enquanto (push no celular fica para depois). Marcar como lida usa `update`, não upsert (a política de insert só aceita relatório/aviso próprios).
- **Amigos** (`friendships`, código de amigo em `room_members.friend_code`): pedido + aceite pelas funções `send_friend_request`/`accept_friend`/`my_friendships`; amigos se veem na sala como num grupo (`shares_group` inclui `are_friends`). "Chamar para estudar" (`nudge_friend`): só entre amigos, só mensagens prontas, 1 por hora por pessoa, respeita `accept_nudges`.
- O plano do dia considera a rotina pessoal (blocos semanais de aula, estudo, trabalho etc.), compromissos do calendário e a preferência de estudo (adiantar antes da aula / revisar depois / os dois; padrão no perfil, opcional por disciplina). Só blocos de **estudo** recebem tarefas. O que não cabe aparece, não é escondido. Sem IA nesta parte: regras fixas e explicadas.

## Próximas etapas (ordem combinada)
1. **Análise de desempenho** — feito: banco de erros, revisão espaçada, plano do dia, rotina, SUB por prova, planejamento reverso, notificações com relatório semanal, amigos. Falta: modo demonstração (dados só em memória) e uma rodada de testes reais com o dono.
1b. **Pedidos do dono**: feito — Notas dentro de Disciplinas (`components/grades.tsx`; `/notas` redireciona), painel com alertas e lista de tarefas (`tasks`, `components/dashboard.tsx`), índice de domínio.
2. **IA** (chave só no servidor, via route handlers): simulados com gabarito/resolução/critérios em PDF, correção assistida de resoluções por foto (sinalizar trechos ilegíveis), assistente que responde com base nos dados e distingue fato de estimativa.
3. **Engenharia de Petróleo**: fórmulas com variáveis, unidades e hipóteses (KaTeX), conversor SI ↔ unidades de campo (bbl, scf, psi, ft, mD, cP, °API), verificação dimensional, histórico da graduação (matriz curricular informada pelo aluno, não presumida).
4. Biblioteca de materiais por disciplina (Supabase Storage, privada).
