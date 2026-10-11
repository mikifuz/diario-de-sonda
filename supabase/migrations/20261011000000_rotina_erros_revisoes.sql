-- Diário de Sonda — rotina semanal, banco de erros, revisões ancoradas na prova e SUB.
-- Tudo aqui é privado por usuário (RLS); nada aparece na sala de estudos.

-- ============ Preferências ============
alter table public.profiles
  add column study_pref text not null default 'depois' check (study_pref in ('antes','depois','ambos')),
  -- degraus da revisão espaçada, em dias
  add column review_steps integer[] not null default '{1,3,7,14,30}'
    check (cardinality(review_steps) between 1 and 12 and 0 < all (review_steps) and 120 >= all (review_steps));

alter table public.subjects
  -- null = segue a preferência do perfil
  add column study_pref text check (study_pref is null or study_pref in ('antes','depois','ambos')),
  add column recovery text not null default 'nenhuma' check (recovery in ('nenhuma','sub','exame')),
  -- a SUB substitui a menor nota de prova mesmo quando for menor que ela (depende do professor)
  add column sub_replace_lower boolean not null default false;

update public.subjects set recovery = 'exame' where exam_enabled;

-- Prova substitutiva como tipo de avaliação e de item do calendário
alter table public.assessments drop constraint assessments_kind_check;
alter table public.assessments add constraint assessments_kind_check
  check (kind in ('prova','trabalho','apresentacao','entrega','sub'));
alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('prova','trabalho','apresentacao','entrega','sub','aula','atividade','simulado','estudo','revisao','pessoal','indisponivel'));

-- Chaves compostas para impedir ligações com registros de outra pessoa
alter table public.assessments add constraint assessments_id_user_key unique (id, user_id);
alter table public.study_sessions add constraint study_sessions_id_user_key unique (id, user_id);

-- ============ Conteúdo: quando é dado e em que prova cai ============
alter table public.topics
  add column taught_on date,
  add column assessment_id uuid,
  add constraint topics_assessment_fk foreign key (assessment_id, user_id)
    references public.assessments (id, user_id) on delete set null (assessment_id);

-- ============ Rotina semanal ============
create table public.routine_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  start_time time not null,
  end_time time not null,
  kind text not null check (kind in ('aula','estudo','trabalho','deslocamento','pessoal','descanso')),
  subject_id uuid,
  label text not null default '' check (length(label) <= 80),
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check (kind <> 'aula' or subject_id is not null),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);
create index routine_blocks_user_idx on public.routine_blocks (user_id, weekday);

-- ============ Banco de erros ============
create table public.mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  topic_id uuid,
  session_id uuid,
  category text not null check (category in ('conceitual','algebrico','aritmetico','interpretacao','unidade','sinal','formula','metodo','atencao','tempo')),
  description text not null check (length(btrim(description)) > 0),
  correction text not null default '',
  source text not null default '' check (length(source) <= 200),
  occurred_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade,
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id),
  foreign key (session_id, user_id) references public.study_sessions (id, user_id) on delete set null (session_id)
);
create index mistakes_subject_idx on public.mistakes (subject_id);

-- ============ Revisão espaçada ============
-- Cada item fica ancorado numa prova; quando ela passa, o item se encerra.
create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  topic_id uuid,
  mistake_id uuid,
  assessment_id uuid,
  title text not null check (length(btrim(title)) between 1 and 200),
  step smallint not null default 0 check (step between 0 and 11),
  due date not null,
  est_min smallint not null default 15 check (est_min between 5 and 240),
  active boolean not null default true,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade,
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id),
  foreign key (mistake_id, user_id) references public.mistakes (id, user_id) on delete cascade,
  foreign key (assessment_id, user_id) references public.assessments (id, user_id) on delete set null (assessment_id)
);
create index review_items_user_due_idx on public.review_items (user_id, due);

create table public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id uuid not null,
  reviewed_at timestamptz not null default now(),
  -- três métricas separadas, como nas sessões; só resultado e autonomia mudam a data
  result text not null check (result in ('certo','parcial','errado','nao')),
  autonomy text check (autonomy in ('sozinho','anotacoes','ajuda','resolucao')),
  confidence smallint check (confidence between 1 and 5),
  prev_step smallint not null,
  new_step smallint not null,
  prev_due date not null,
  new_due date,
  foreign key (item_id, user_id) references public.review_items (id, user_id) on delete cascade
);
create index review_logs_item_idx on public.review_logs (item_id);

-- ============ Privacidade ============
alter table public.routine_blocks enable row level security;
alter table public.mistakes enable row level security;
alter table public.review_items enable row level security;
alter table public.review_logs enable row level security;

create policy "rotina própria" on public.routine_blocks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "erros próprios" on public.mistakes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "revisões próprias" on public.review_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "histórico de revisões próprio" on public.review_logs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ Tempo real ============
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.routine_blocks, public.mistakes, public.review_items, public.review_logs;
  end if;
end $$;
