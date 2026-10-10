-- Diário de Sonda — esquema inicial
-- Dados acadêmicos são privados por usuário (RLS). A sala de estudos expõe apenas
-- apelido, presença e totais diários de minutos, nunca notas, confiança ou erros.

create extension if not exists pgcrypto;

-- ============ Perfis ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  course text not null default 'Engenharia de Petróleo',
  university text not null default '',
  current_semester text not null default '',
  default_min_avg numeric(4,2) not null default 7 check (default_min_avg between 0 and 10),
  weekly_goal_h numeric(5,1) check (weekly_goal_h is null or weekly_goal_h > 0),
  skin text not null default 'sonda' check (skin in ('sonda','caderno','blueprint','terminal','moderno')),
  timer jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============ Disciplinas e conteúdos ============
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  code text not null default '',
  professor text not null default '',
  semester text not null default '',
  credits numeric(5,1) check (credits is null or credits >= 0),
  hours numeric(6,1) check (hours is null or hours >= 0),
  color text not null default '#4f86f7' check (color ~ '^#[0-9a-fA-F]{6}$'),
  min_avg numeric(4,2) not null default 7 check (min_avg between 0 and 10),
  schedule text not null default '',
  notes text not null default '',
  traits jsonb not null default '{}'::jsonb,
  exam_enabled boolean not null default false,
  exam_w_avg numeric(5,2) not null default 1 check (exam_w_avg > 0),
  exam_w_exam numeric(5,2) not null default 1 check (exam_w_exam > 0),
  exam_min_final numeric(4,2) not null default 5 check (exam_min_final between 0 and 10),
  exam_min_take numeric(4,2) check (exam_min_take is null or exam_min_take between 0 and 10),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index subjects_user_idx on public.subjects (user_id);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  parent_id uuid,
  name text not null check (length(btrim(name)) > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade,
  foreign key (parent_id, user_id) references public.topics (id, user_id) on delete set null (parent_id),
  check (parent_id is null or parent_id <> id)
);
create index topics_subject_idx on public.topics (subject_id);

-- ============ Sessões de estudo (com autoavaliação) ============
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  topic_id uuid,
  activity text not null check (activity in ('aula','leitura','exercicios','revisao','simulado','resumo','teorico','pratico')),
  started_at timestamptz not null,
  duration_min integer not null check (duration_min between 1 and 1440),
  questions integer check (questions is null or questions >= 0),
  correct integer check (correct is null or correct >= 0),
  notes text not null default '',
  -- três métricas separadas: confiança (subjetiva), resultado (verificado) e autonomia
  confidence smallint check (confidence between 1 and 5),
  result text check (result in ('certo','parcial','errado','nao')),
  autonomy text check (autonomy in ('sozinho','anotacoes','ajuda','resolucao')),
  difficulty smallint check (difficulty between 0 and 4),
  comprehension text check (comprehension in ('total','parcial','duvidas','nao')),
  created_at timestamptz not null default now(),
  check (correct is null or questions is null or correct <= questions),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade,
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id)
);
create index study_sessions_user_time_idx on public.study_sessions (user_id, started_at desc);

-- ============ Avaliações que contam na média ============
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  kind text not null default 'prova' check (kind in ('prova','trabalho','apresentacao','entrega')),
  date date,
  time time,
  weight numeric(6,2) not null default 1 check (weight > 0),
  grade numeric(4,2) check (grade between 0 and 10),
  predicted numeric(4,2) check (predicted between 0 and 10),
  sim_c numeric(4,2) check (sim_c between 0 and 10),
  sim_e numeric(4,2) check (sim_e between 0 and 10),
  sim_o numeric(4,2) check (sim_o between 0 and 10),
  priority text not null default 'alta' check (priority in ('baixa','media','alta')),
  status text not null default 'pendente' check (status in ('pendente','concluido','cancelado')),
  description text not null default '',
  created_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);
create index assessments_subject_idx on public.assessments (subject_id);

-- ============ Outros itens do calendário ============
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid,
  title text not null check (length(btrim(title)) > 0),
  type text not null check (type in ('prova','trabalho','apresentacao','entrega','aula','atividade','simulado','estudo','revisao','pessoal','indisponivel')),
  date date not null,
  time time,
  priority text not null default 'media' check (priority in ('baixa','media','alta')),
  status text not null default 'pendente' check (status in ('pendente','concluido','cancelado')),
  description text not null default '',
  created_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);
create index events_user_date_idx on public.events (user_id, date);

-- ============ Privacidade dos dados acadêmicos ============
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.topics enable row level security;
alter table public.study_sessions enable row level security;
alter table public.assessments enable row level security;
alter table public.events enable row level security;

create policy "perfil próprio" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "disciplinas próprias" on public.subjects
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "conteúdos próprios" on public.topics
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sessões próprias" on public.study_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "avaliações próprias" on public.assessments
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "eventos próprios" on public.events
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ Sala de estudos (parte compartilhada) ============
create table public.room_members (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  nick text not null check (length(btrim(nick)) between 1 and 30),
  share_subject boolean not null default false,
  studying boolean not null default false,
  paused boolean not null default false,
  since timestamptz,
  accum_ms bigint not null default 0 check (accum_ms >= 0),
  subject text not null default '' check (length(subject) <= 120),
  updated_at timestamptz not null default now()
);

create table public.study_groups (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  name text not null check (length(btrim(name)) between 1 and 40),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  code text not null references public.study_groups (code) on delete cascade,
  user_id uuid not null default auth.uid() references public.room_members (user_id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (code, user_id)
);

create trigger room_members_touch before update on public.room_members
  for each row execute function public.touch_updated_at();

alter table public.room_members enable row level security;
alter table public.study_groups enable row level security;
alter table public.group_members enable row level security;

create policy "sala visível a quem está logado" on public.room_members
  for select to authenticated using (true);
create policy "entrar na sala" on public.room_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "atualizar a própria presença" on public.room_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sair da sala" on public.room_members
  for delete to authenticated using (user_id = auth.uid());

create policy "grupos visíveis" on public.study_groups
  for select to authenticated using (true);
create policy "criar grupo" on public.study_groups
  for insert to authenticated with check (created_by = auth.uid());

create policy "membros visíveis" on public.group_members
  for select to authenticated using (true);
create policy "entrar em grupo" on public.group_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "sair de grupo" on public.group_members
  for delete to authenticated using (user_id = auth.uid());

-- Totais diários de quem está na sala. Roda como dono da função para somar sessões
-- privadas, mas devolve só (usuário, dia, minutos).
create or replace function public.room_daily_totals(p_days integer default 35, p_tz text default 'America/Sao_Paulo')
returns table (user_id uuid, day date, minutes integer)
language sql stable security definer set search_path = public as $$
  select s.user_id,
         (s.started_at at time zone p_tz)::date as day,
         sum(s.duration_min)::integer as minutes
  from public.study_sessions s
  join public.room_members m on m.user_id = s.user_id
  where auth.uid() is not null
    and s.started_at >= now() - make_interval(days => least(greatest(p_days, 1), 120) + 1)
  group by s.user_id, (s.started_at at time zone p_tz)::date
$$;

revoke all on function public.room_daily_totals(integer, text) from public;
grant execute on function public.room_daily_totals(integer, text) to authenticated;

-- ============ Tempo real ============
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.room_members, public.group_members, public.study_groups,
      public.profiles, public.subjects, public.topics, public.study_sessions,
      public.assessments, public.events;
  end if;
end $$;
