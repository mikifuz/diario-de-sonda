-- Avisos no celular (Web Push). Cada aparelho que a pessoa ativa vira uma linha aqui, com o que
-- ela quer receber nele. Quem envia é o servidor do app (chave secreta só na Vercel).

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- só os serviços de aviso dos navegadores (Google/Chrome, Firefox, Apple, Microsoft)
  endpoint text not null check (length(endpoint) <= 1000 and endpoint ~ '^https://([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|mozaws\.net|push\.apple\.com|notify\.windows\.com)/'),
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth text not null check (length(auth) between 1 and 100),
  device text not null default '' check (length(device) <= 100),
  -- pedidos de amizade e chamados para estudar
  amigos boolean not null default true,
  -- resumo da manhã: provas próximas, revisões e tarefas do dia
  manha boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "aparelhos próprios" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger push_subscriptions_limit before insert on public.push_subscriptions for each row execute function public.limit_rows('20');

-- marca quando o aviso de uma notificação já foi para o celular (evita mandar duas vezes)
alter table public.notifications add column pushed_at timestamptz;
