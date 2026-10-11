-- Diário de Sonda — Meu curso: matriz curricular do aluno, pré-requisitos e situação de cada disciplina.
-- A matriz é informada pelo aluno (modelo transcrito do documento oficial, editável). Só o dono vê.

create table public.curriculum (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  code text not null default '' check (length(code) <= 40),
  phase smallint check (phase between 1 and 15),
  credits smallint not null default 0 check (credits between 0 and 60),
  kind text not null default 'obrigatoria' check (kind in ('obrigatoria', 'vaga', 'optativa', 'estagio', 'tcc', 'extensao', 'complementar')),
  -- [{ "id": uuid, "co": true|false }]; co = correquisito
  prereqs jsonb not null default '[]' check (jsonb_typeof(prereqs) = 'array' and jsonb_array_length(prereqs) <= 30),
  -- regra "70% dos créditos anteriores (fases 1 a N)"
  min_pct smallint check (min_pct between 1 and 100),
  min_phase smallint check (min_phase between 1 and 15),
  status text not null default 'pendente' check (status in ('pendente', 'cursando', 'aprovada', 'reprovada', 'dispensada')),
  grade numeric(4,2) check (grade between 0 and 10),
  term text not null default '' check (length(term) <= 20),
  subject_id uuid,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id)
);
create index curriculum_user_idx on public.curriculum (user_id, phase, position);

alter table public.curriculum enable row level security;
create policy "matriz própria" on public.curriculum
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.curriculum;
  end if;
end $$;
