-- Diário de Sonda — SUB por prova, notificações (relatório semanal) e amigos.

-- ============ SUB: cada prova diz se tem SUB (e qual, quando houver mais de uma) ============
alter table public.assessments
  add column sub_id uuid,
  add constraint assessments_sub_fk foreign key (sub_id, user_id) references public.assessments (id, user_id) on delete set null (sub_id),
  add constraint assessments_sub_self check (sub_id is null or sub_id <> id);

-- mantém o comportamento de antes: nas disciplinas com SUB, as provas ficam cobertas pela SUB existente
update public.assessments p set sub_id = (
  select s.id from public.assessments s
  where s.subject_id = p.subject_id and s.kind = 'sub'
  order by s.date nulls last, s.created_at limit 1)
where p.kind = 'prova'
  and exists (select 1 from public.subjects sj where sj.id = p.subject_id and sj.recovery = 'sub');

-- ============ Amigos ============
alter table public.room_members
  add column friend_code text unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  add column accept_nudges boolean not null default true;
update public.room_members set friend_code = upper(substr(md5(gen_random_uuid()::text), 1, 8)) where friend_code is null;
alter table public.room_members alter column friend_code set not null;

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.room_members (user_id) on delete cascade,
  to_user uuid not null references public.room_members (user_id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente','aceito')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create unique index friendships_pair on public.friendships (least(from_user, to_user), greatest(from_user, to_user));
alter table public.friendships enable row level security;
-- pedidos e aceites só pelas funções abaixo; cada um vê e desfaz só as próprias amizades
create policy "amizades próprias" on public.friendships
  for select to authenticated using (auth.uid() in (from_user, to_user));
create policy "desfazer amizade" on public.friendships
  for delete to authenticated using (auth.uid() in (from_user, to_user));

create or replace function public.are_friends(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friendships
    where status = 'aceito' and least(from_user, to_user) = least(auth.uid(), p_other) and greatest(from_user, to_user) = greatest(auth.uid(), p_other))
$$;

-- amigos também se veem na sala (presença e minutos), como quem divide um grupo
create or replace function public.shares_group(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_other = auth.uid() or exists (
    select 1 from public.group_members a
    join public.group_members b on b.code = a.code
    where a.user_id = auth.uid() and b.user_id = p_other
  ) or public.are_friends(p_other)
$$;

-- ============ Notificações ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('relatorio','amizade','chamado','aviso')),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 4000),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  from_user uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
-- um relatório por semana, mesmo abrindo o app em vários aparelhos
create unique index notifications_report_week on public.notifications (user_id, (data->>'week')) where kind = 'relatorio';
alter table public.notifications enable row level security;
create policy "notificações próprias" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "marcar como lida" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "apagar notificação" on public.notifications
  for delete to authenticated using (user_id = auth.uid());
-- a própria pessoa só cria relatórios e avisos para si; o que vem de amigos passa pelas funções
create policy "relatório próprio" on public.notifications
  for insert to authenticated with check (user_id = auth.uid() and from_user is null and kind in ('relatorio','aviso'));

-- ============ Funções de amizade (checam tudo no banco) ============
create or replace function public.send_friend_request(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare me text; target uuid; f public.friendships;
begin
  select nick into me from public.room_members where user_id = auth.uid();
  if me is null then raise exception 'Entre na sala com um apelido antes de adicionar amigos.'; end if;
  select user_id into target from public.room_members where friend_code = upper(btrim(p_code));
  if target is null then raise exception 'Nenhuma pessoa com esse código.'; end if;
  if target = auth.uid() then raise exception 'Esse é o seu próprio código.'; end if;
  select * into f from public.friendships where least(from_user, to_user) = least(auth.uid(), target) and greatest(from_user, to_user) = greatest(auth.uid(), target);
  if found then
    if f.status = 'aceito' then return 'ja_amigos'; end if;
    if f.to_user = auth.uid() then perform public.accept_friend(f.id); return 'aceito'; end if;
    return 'ja_pedido';
  end if;
  insert into public.friendships (from_user, to_user) values (auth.uid(), target) returning * into f;
  insert into public.notifications (user_id, kind, title, data, from_user)
    values (target, 'amizade', me || ' quer ser seu amigo no Diário de Sonda', jsonb_build_object('request_id', f.id), auth.uid());
  return 'enviado';
end $$;

create or replace function public.accept_friend(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me text; f public.friendships;
begin
  update public.friendships set status = 'aceito' where id = p_id and to_user = auth.uid() and status = 'pendente' returning * into f;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  select nick into me from public.room_members where user_id = auth.uid();
  insert into public.notifications (user_id, kind, title, from_user)
    values (f.from_user, 'amizade', coalesce(me, 'Alguém') || ' aceitou seu pedido de amizade', auth.uid());
end $$;

-- lista as próprias amizades com o apelido da outra pessoa (pedidos pendentes incluídos)
create or replace function public.my_friendships()
returns table (id uuid, other uuid, nick text, status text, incoming boolean)
language sql stable security definer set search_path = public as $$
  select f.id, o.user_id, o.nick, f.status, f.to_user = auth.uid()
  from public.friendships f
  join public.room_members o on o.user_id = case when f.from_user = auth.uid() then f.to_user else f.from_user end
  where auth.uid() in (f.from_user, f.to_user)
  order by f.status, o.nick
$$;

-- "chamar para estudar": só entre amigos, só mensagens prontas, no máximo 1 por hora para a mesma pessoa
create or replace function public.nudge_friend(p_to uuid, p_msg text)
returns void language plpgsql security definer set search_path = public as $$
declare me text; txt text;
begin
  if not public.are_friends(p_to) then raise exception 'Vocês precisam ser amigos.'; end if;
  txt := case p_msg
    when 'bora' then 'Bora estudar?'
    when 'sala' then 'Tô na sala, vem estudar comigo!'
    when 'revisao' then 'Bora revisar junto hoje?'
    when 'prova' then 'Prova chegando: bora estudar?'
  end;
  if txt is null then raise exception 'Mensagem inválida.'; end if;
  if not (select accept_nudges from public.room_members where user_id = p_to) then raise exception 'Essa pessoa desligou os chamados.'; end if;
  if exists (select 1 from public.notifications where user_id = p_to and from_user = auth.uid() and kind = 'chamado' and created_at > now() - interval '1 hour') then
    raise exception 'Você já chamou essa pessoa na última hora.';
  end if;
  select nick into me from public.room_members where user_id = auth.uid();
  insert into public.notifications (user_id, kind, title, data, from_user)
    values (p_to, 'chamado', me || ': ' || txt, jsonb_build_object('msg', p_msg), auth.uid());
end $$;

revoke all on function public.are_friends(uuid) from public;
revoke all on function public.send_friend_request(text) from public;
revoke all on function public.accept_friend(uuid) from public;
revoke all on function public.my_friendships() from public;
revoke all on function public.nudge_friend(uuid, text) from public;
grant execute on function public.are_friends(uuid) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.accept_friend(uuid) to authenticated;
grant execute on function public.my_friendships() to authenticated;
grant execute on function public.nudge_friend(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.friendships;
  end if;
end $$;
