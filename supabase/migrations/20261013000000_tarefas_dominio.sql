-- Diário de Sonda — lista de tarefas (to-do) e configuração do índice de domínio.

-- Pesos e parâmetros do índice de domínio (null = padrão do app)
alter table public.profiles add column mastery_cfg jsonb
  check (mastery_cfg is null or jsonb_typeof(mastery_cfg) = 'object');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  subject_id uuid,
  due date,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);
create index tasks_user_idx on public.tasks (user_id, done, due);

alter table public.tasks enable row level security;
create policy "tarefas próprias" on public.tasks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;
