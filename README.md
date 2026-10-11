# Diário de Sonda

Acompanhamento de estudos universitários, pensado para Engenharia de Petróleo. Registra horas de estudo, separa **confiança** (o que você sentiu), **acerto conferido** (o que deu certo) e **autonomia** (quanto apoio usou), organiza provas e calcula médias. Tem também uma **sala de estudos** em tempo real para estudar junto com colegas.

## O que já funciona

| Área | Recursos |
|---|---|
| Hoje | Planejamento reverso de cada prova (aba Provas: quanto cada conteúdo ainda precisa, distribuído nos blocos de estudo até a véspera); plano do dia que encaixa revisões e aulas (consolidar a de hoje ou adiantar a de amanhã) nos seus blocos de estudo, com o motivo de cada tarefa e o que não coube; banco de erros com 10 categorias; revisão espaçada ancorada na prova (encerra depois dela, pode ser reativada até a SUB); rotina semanal em blocos; aviso quando as revisões não cabem antes de uma prova |
| Painel | Alertas acionáveis (prova chegando com conteúdo frágil, confiança baixa ou sem resultado conferido → "faça exercícios", com o motivo); lista de tarefas; horas do dia, semana e mês; meta semanal; horas por dia por disciplina; medidores de acerto, confiança e autonomia; gráfico de calibração; próximas avaliações |
| Disciplinas | Importação do cronograma do professor (Excel, Word, PDF ou texto) com prévia: conteúdos com data da aula, provas e feriados; aula remarcada empurra as seguintes. Visão geral com uma linha por disciplina (média atual, situação, próxima prova, horas, acerto); dentro de cada uma: notas enxutas (uma linha por avaliação, simulação em 3 cenários, SUB ou exame configuráveis), conteúdos em árvore, perfil de avaliação do professor, erros e sessões; previsão × nota real |
| Calendário | Visão mensal, itens por dia, próximos 30 dias; provas que "contam na média" vão direto para as notas |
| Sala de estudos | Cronômetro com pausa que continua entre aparelhos e, ao começar, a escolha de entrar na sala (com ou sem a matéria) ou estudar sozinho; registro manual; autoavaliação rápida; histórico de sessões. Sala só por grupos (código de convite) e amigos (código de amigo, "chamar para estudar" com mensagens prontas): quem está estudando agora, placar do dia e da semana, sequência de dias |
| Meu curso | Matriz curricular (modelo de Engenharia de Petróleo UDESC 2024, editável) com fluxograma interativo: toque numa disciplina e veja o que ela exige e o que libera; situação de cada disciplina, pré-requisitos e correquisitos, regra dos 70% dos créditos, o que dá para cursar no próximo semestre, gargalos, optativas em qualquer fase ("Adicionar optativa" com semestre e nota) e previsão de formatura conservadora × otimista, semestre a semestre, mostrando os semestres puxados e a cadeia que segura a data |
| Notificações | Relatório da semana todo domingo de manhã (horas, acerto × confiança, erros, provas da semana seguinte), pedidos de amizade e chamados para estudar |
| Demonstração | Em `/demo` (link "Ver demonstração sem conta" na tela de login): um semestre de exemplo com 4 disciplinas, sessões, erros, revisões, rotina, sala e notificações, tudo só na memória da aba e marcado com uma faixa; nada é salvo |
| Conta | Login por e-mail e senha, recuperação de senha, 5 temas visuais, exportar e importar dados (inclusive da primeira versão) |

## Privacidade

Todos os dados acadêmicos ficam protegidos por **Row Level Security** no Postgres: cada conta só lê e altera as próprias linhas. Na sala de estudos ficam visíveis apenas apelido, presença e minutos por dia (estes calculados por uma função que devolve só totais). Os testes em `supabase/tests/10_rls.sql` verificam isso a cada envio ao GitHub.

## Tecnologia

- Next.js 15 (App Router) + React 19 + TypeScript
- Supabase: Postgres, autenticação e tempo real
- CSS próprio com tokens por tema (sem framework de componentes)
- Testes: `node:test` via `tsx` para cálculos e importação; SQL para privacidade

```
src/
  app/
    (app)/            telas logadas: painel, hoje, sala (cronômetro + grupos), calendario, disciplinas (com notas), configuracoes
    entrar/           login e cadastro
    redefinir-senha/  nova senha pelo link do e-mail
  components/         interface (modais, gráficos, navegação)
  lib/
    calc.ts           regras de cálculo puras (testadas)
    plan.ts           revisão espaçada, rotina e plano do dia (puras, testadas)
    legacy.ts         conversão da cópia da primeira versão (testada)
    store.tsx         dados do usuário, gravação otimista e sincronização
    room.tsx          sala de estudos
supabase/
  migrations/         esquema do banco
  tests/              testes de privacidade
```

## Colocar no ar (uma vez)

### 1. Supabase (banco e login)

1. Crie uma conta em [supabase.com](https://supabase.com) (pode entrar com o GitHub) e clique em **New project**. Região sugerida: *South America (São Paulo)*. Guarde a senha do banco.
2. No projeto, abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/migrations/20261010000000_inicial.sql` e clique em **Run**. Deve aparecer *Success*. Repita, em ordem, para cada arquivo seguinte da pasta `supabase/migrations/` (cada um uma vez só).
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
4. Em **Authentication → Sign In / Providers → Email**, decida se quer exigir confirmação por e-mail. Com ela ligada, o envio gratuito do Supabase tem limite baixo de e-mails por hora; para uma turma pequena isso costuma bastar.

### 2. Vercel (hospedagem)

1. Crie uma conta em [vercel.com](https://vercel.com) entrando com o GitHub.
2. **Add New → Project**, escolha o repositório `diario-de-sonda` e, antes de publicar, em **Environment Variables** adicione:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL do passo 1.3
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = chave anon do passo 1.3
3. Clique em **Deploy**. Ao final você recebe um endereço como `diario-de-sonda.vercel.app`.

### 3. Ligar os dois

No Supabase, **Authentication → URL Configuration**:
- **Site URL**: o endereço da Vercel (ex.: `https://diario-de-sonda.vercel.app`)
- **Redirect URLs**: adicione `https://diario-de-sonda.vercel.app/**`

Sem isso, os links de confirmação e de recuperação de senha apontam para o lugar errado.

### 4. Trazer seus dados da primeira versão

Na página antiga (publicada no Claude), vá em **Configurações → Exportar cópia (JSON)**. No site novo, crie sua conta e use **Configurações → Importar cópia**. Importe uma vez só: repetir duplica os registros.

## Rodar no computador (opcional)

Requer Node.js 20 ou mais novo.

```bash
npm install
cp .env.example .env.local   # preencha com os dados do Supabase
npm run dev                  # http://localhost:3000
```

Verificações:

```bash
npm run typecheck
npm test
npm run build
```

Ao rodar localmente, adicione `http://localhost:3000/**` às Redirect URLs do Supabase.

## Próximas etapas

1. **Análise de desempenho**: concluída (falta só a rodada de testes com o dono).
2. **Inteligência artificial** (chave de API só no servidor): simulados com gabarito e resolução em PDF, correção assistida, assistente que consulta os dados.
3. **Engenharia de Petróleo**: biblioteca de fórmulas com unidades, conversor SI ↔ unidades de campo, verificação dimensional (o histórico da graduação já está em Meu curso).
4. **Biblioteca** de materiais por disciplina (Supabase Storage).
