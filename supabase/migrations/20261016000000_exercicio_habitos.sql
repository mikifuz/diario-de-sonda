-- Diário de Sonda — bloco de exercício físico na rotina e hábitos do dia.

-- Rotina: novo tipo de bloco "exercicio"
alter table public.routine_blocks drop constraint if exists routine_blocks_kind_check;
alter table public.routine_blocks add constraint routine_blocks_kind_check
  check (kind in ('aula', 'estudo', 'exercicio', 'trabalho', 'deslocamento', 'pessoal', 'descanso'));

-- Hábitos que o aluno quer acompanhar (ex.: "Fiquei pouco tempo no celular")
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
-- Um registro por hábito cumprido por dia
create table public.habit_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null,
  day date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, day),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);
create index habit_checks_user_idx on public.habit_checks (user_id, day);

alter table public.habits enable row level security;
alter table public.habit_checks enable row level security;
create policy "hábitos próprios" on public.habits
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "registros de hábitos próprios" on public.habit_checks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.habits;
    alter publication supabase_realtime add table public.habit_checks;
  end if;
end $$;
