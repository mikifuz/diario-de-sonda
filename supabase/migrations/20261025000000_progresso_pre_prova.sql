-- Fundo do Poço — Progresso pré-prova: listas de exercícios ligadas a uma prova (aba Provas, em Hoje).
-- Opcional. Cada exercício é um quadradinho ("1a", "1b", "2"…); marcar guarda o dia (para medir o ritmo).
-- A prova pode ser de Notas (assessment_id) ou só do calendário (event_id); apagar a prova apaga as listas dela.

-- events ganha a chave (id, user_id), como as outras tabelas, para a ligação abaixo não cruzar usuários
alter table public.events drop constraint if exists events_id_user_key;
alter table public.events add constraint events_id_user_key unique (id, user_id);

create table public.exercise_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  assessment_id uuid,
  event_id uuid,
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null default 'lista' check (kind in ('lista', 'livro', 'outro')),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 400),
  done jsonb not null default '{}'::jsonb check (jsonb_typeof(done) = 'object'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint exercise_lists_exam check (num_nonnulls(assessment_id, event_id) = 1),
  constraint exercise_lists_size check (pg_column_size(items) + pg_column_size(done) < 32000),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade,
  foreign key (assessment_id, user_id) references public.assessments (id, user_id) on delete cascade,
  foreign key (event_id, user_id) references public.events (id, user_id) on delete cascade
);
create index exercise_lists_user_idx on public.exercise_lists (user_id);

alter table public.exercise_lists enable row level security;
create policy "listas de exercícios próprias" on public.exercise_lists
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger exercise_lists_limit before insert on public.exercise_lists for each row execute function public.limit_rows('2000');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.exercise_lists;
  end if;
end $$;
