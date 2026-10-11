-- Diário de Sonda — a sala de estudos passa a ser só por grupos.
-- Antes: qualquer conta logada via todos na sala e conseguia listar os códigos dos grupos.
-- Agora: cada pessoa vê só a si mesma e quem está em algum grupo em comum; um grupo só
-- é visível para quem é membro (ou o criou), e entrar exige saber o código.

-- Funções auxiliares (security definer evita recursão entre as políticas de group_members)
create or replace function public.is_group_member(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where code = p_code and user_id = auth.uid())
$$;

create or replace function public.shares_group(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_other = auth.uid() or exists (
    select 1 from public.group_members a
    join public.group_members b on b.code = a.code
    where a.user_id = auth.uid() and b.user_id = p_other
  )
$$;

revoke all on function public.is_group_member(text) from public;
revoke all on function public.shares_group(uuid) from public;
grant execute on function public.is_group_member(text) to authenticated;
grant execute on function public.shares_group(uuid) to authenticated;

-- Presença: só a própria e a de quem divide grupo
drop policy "sala visível a quem está logado" on public.room_members;
create policy "sala visível no grupo" on public.room_members
  for select to authenticated using (public.shares_group(user_id));

-- Grupos: só membros (ou quem criou) veem nome e código
drop policy "grupos visíveis" on public.study_groups;
create policy "grupo visível a membros" on public.study_groups
  for select to authenticated using (created_by = auth.uid() or public.is_group_member(code));

-- Membros: só de grupos dos quais eu faço parte
drop policy "membros visíveis" on public.group_members;
create policy "membros visíveis no grupo" on public.group_members
  for select to authenticated using (user_id = auth.uid() or public.is_group_member(code));

-- Totais diários: só de quem divide grupo comigo (e os meus)
create or replace function public.room_daily_totals(p_days integer default 35, p_tz text default 'America/Sao_Paulo')
returns table (user_id uuid, day date, minutes integer)
language sql stable security definer set search_path = public as $$
  select s.user_id,
         (s.started_at at time zone p_tz)::date as day,
         sum(s.duration_min)::integer as minutes
  from public.study_sessions s
  join public.room_members m on m.user_id = s.user_id
  where auth.uid() is not null
    and public.shares_group(s.user_id)
    and s.started_at >= now() - make_interval(days => least(greatest(p_days, 1), 120) + 1)
  group by s.user_id, (s.started_at at time zone p_tz)::date
$$;
