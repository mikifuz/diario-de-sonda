-- Diário de Sonda — rodada de segurança antes de abrir para mais gente.
-- 1) Limites de tamanho nos textos e de quantidade de registros por pessoa (ninguém enche o banco sozinho).
-- 2) Pedidos de amizade com limite e opção de bloquear; tentativas de código errado limitadas.
-- 3) Grupos criados e acessados só por funções (código gerado no banco; chutar códigos fica limitado).
-- 4) "Excluir minha conta": apaga a conta e tudo o que é dela.

-- ============ 1. Tamanho dos textos ============
-- "not valid": vale para tudo o que for gravado daqui em diante, sem barrar a migration por dado antigo.
alter table public.profiles
  add constraint profiles_len check (length(name) <= 120 and length(course) <= 120 and length(university) <= 120 and length(current_semester) <= 20) not valid,
  add constraint profiles_json_size check (coalesce(pg_column_size(timer), 0) <= 4000 and coalesce(pg_column_size(mastery_cfg), 0) <= 2000) not valid;
alter table public.subjects
  add constraint subjects_len check (length(name) <= 200 and length(code) <= 40 and length(professor) <= 200 and length(semester) <= 20 and length(schedule) <= 500 and length(notes) <= 10000) not valid,
  add constraint subjects_traits_size check (pg_column_size(traits) <= 8000) not valid;
alter table public.topics add constraint topics_len check (length(name) <= 500) not valid;
alter table public.study_sessions add constraint study_sessions_len check (length(notes) <= 2000) not valid;
alter table public.assessments add constraint assessments_len check (length(name) <= 200 and length(description) <= 5000) not valid;
alter table public.events add constraint events_len check (length(title) <= 200 and length(description) <= 5000) not valid;
alter table public.mistakes add constraint mistakes_len check (length(description) <= 5000 and length(correction) <= 5000) not valid;
alter table public.notifications add constraint notifications_data_size check (pg_column_size(data) <= 4000) not valid;
alter table public.room_members add constraint room_members_friend_code check (friend_code ~ '^[0-9A-F]{8}$') not valid;

-- ============ 1b. Quantidade de registros por pessoa ============
-- Limites folgados para o uso normal. Sessões de estudo não têm limite (pedido do dono: parar para
-- comer ou ir ao banheiro vira uma sessão nova, e isso não pode virar problema).
create or replace function public.limit_rows() returns trigger
language plpgsql security definer set search_path = public as $$
declare col text := coalesce(tg_argv[1], 'user_id'); owner uuid; n bigint;
begin
  owner := (to_jsonb(new) ->> col)::uuid;
  if owner is null then return new; end if;
  execute format('select count(*) from %I.%I where %I = $1', tg_table_schema, tg_table_name, col) into n using owner;
  if n >= tg_argv[0]::bigint then
    raise exception 'Limite de % registros atingido nesta parte do app. Apague registros antigos para continuar.', tg_argv[0]
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.limit_rows() from public;

create index if not exists topics_user_idx on public.topics (user_id);
create index if not exists assessments_user_idx on public.assessments (user_id);
create index if not exists mistakes_user_idx on public.mistakes (user_id);
create index if not exists review_logs_user_idx on public.review_logs (user_id);
create index if not exists habits_user_idx on public.habits (user_id);
create index if not exists study_groups_creator_idx on public.study_groups (created_by);

create trigger subjects_limit before insert on public.subjects for each row execute function public.limit_rows('500');
create trigger topics_limit before insert on public.topics for each row execute function public.limit_rows('10000');
create trigger assessments_limit before insert on public.assessments for each row execute function public.limit_rows('5000');
create trigger events_limit before insert on public.events for each row execute function public.limit_rows('20000');
create trigger routine_blocks_limit before insert on public.routine_blocks for each row execute function public.limit_rows('1000');
create trigger mistakes_limit before insert on public.mistakes for each row execute function public.limit_rows('20000');
create trigger review_items_limit before insert on public.review_items for each row execute function public.limit_rows('20000');
create trigger review_logs_limit before insert on public.review_logs for each row execute function public.limit_rows('50000');
create trigger tasks_limit before insert on public.tasks for each row execute function public.limit_rows('20000');
create trigger curriculum_limit before insert on public.curriculum for each row execute function public.limit_rows('1000');
create trigger habits_limit before insert on public.habits for each row execute function public.limit_rows('200');
create trigger habit_checks_limit before insert on public.habit_checks for each row execute function public.limit_rows('50000');
create trigger study_groups_limit before insert on public.study_groups for each row execute function public.limit_rows('50', 'created_by');
create trigger group_members_limit before insert on public.group_members for each row execute function public.limit_rows('30');

-- ============ 2. Amizades: limites e bloqueio ============
-- Registro das tentativas (só as funções leem e escrevem; nenhuma política = ninguém acessa direto)
create table public.friend_request_log (
  id bigint generated always as identity primary key,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid references auth.users(id) on delete cascade, -- null = código que não existe
  created_at timestamptz not null default now()
);
create index friend_request_log_from_idx on public.friend_request_log (from_user, created_at);
alter table public.friend_request_log enable row level security;

create table public.friend_blocks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked),
  check (user_id <> blocked)
);
alter table public.friend_blocks enable row level security;
create policy "bloqueios próprios" on public.friend_blocks
  for select to authenticated using (user_id = auth.uid());
create policy "desbloquear" on public.friend_blocks
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.send_friend_request(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare me text; target uuid; f public.friendships;
begin
  select nick into me from public.room_members where user_id = auth.uid();
  if me is null then raise exception 'Entre na sala com um apelido antes de adicionar amigos.'; end if;
  if (select count(*) from public.friend_request_log where from_user = auth.uid() and to_user is null and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Muitos códigos errados seguidos. Espere uma hora e confira o código com seu colega.';
  end if;
  select user_id into target from public.room_members where friend_code = upper(btrim(p_code));
  if target is null then
    -- grava a tentativa errada (por isso devolve em vez de dar erro, que desfaria o registro)
    insert into public.friend_request_log (from_user) values (auth.uid());
    return 'nao_encontrado';
  end if;
  if target = auth.uid() then raise exception 'Esse é o seu próprio código.'; end if;
  select * into f from public.friendships where least(from_user, to_user) = least(auth.uid(), target) and greatest(from_user, to_user) = greatest(auth.uid(), target);
  if found then
    if f.status = 'aceito' then return 'ja_amigos'; end if;
    if f.to_user = auth.uid() then perform public.accept_friend(f.id); return 'aceito'; end if;
    return 'ja_pedido';
  end if;
  if exists (select 1 from public.friend_blocks where user_id = target and blocked = auth.uid()) then
    raise exception 'Não foi possível enviar o pedido para essa pessoa.';
  end if;
  if exists (select 1 from public.friend_request_log where from_user = auth.uid() and to_user = target and created_at > now() - interval '7 days') then
    raise exception 'Você já mandou um pedido para essa pessoa nesta semana. Espere uns dias para mandar de novo.';
  end if;
  if (select count(*) from public.friend_request_log where from_user = auth.uid() and to_user is not null and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Limite de 20 pedidos de amizade por dia. Tente amanhã.';
  end if;
  insert into public.friend_request_log (from_user, to_user) values (auth.uid(), target);
  insert into public.friendships (from_user, to_user) values (auth.uid(), target) returning * into f;
  insert into public.notifications (user_id, kind, title, data, from_user)
    values (target, 'amizade', me || ' quer ser seu amigo no Diário de Sonda', jsonb_build_object('request_id', f.id), auth.uid());
  return 'enviado';
end $$;

-- recusa (ou desfaz) e bloqueia: a outra pessoa não consegue mais mandar pedidos
create or replace function public.block_friend(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f public.friendships; other uuid;
begin
  delete from public.friendships where id = p_id and auth.uid() in (from_user, to_user) returning * into f;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  other := case when f.from_user = auth.uid() then f.to_user else f.from_user end;
  insert into public.friend_blocks (user_id, blocked) values (auth.uid(), other) on conflict do nothing;
  -- some também o aviso do pedido
  delete from public.notifications where user_id = auth.uid() and from_user = other and kind = 'amizade';
end $$;

create or replace function public.my_blocks()
returns table (blocked uuid, nick text)
language sql stable security definer set search_path = public as $$
  select b.blocked, coalesce(m.nick, 'Alguém que saiu da sala')
  from public.friend_blocks b left join public.room_members m on m.user_id = b.blocked
  where b.user_id = auth.uid()
  order by b.created_at
$$;

revoke all on function public.block_friend(uuid) from public;
revoke all on function public.my_blocks() from public;
grant execute on function public.block_friend(uuid) to authenticated;
grant execute on function public.my_blocks() to authenticated;

-- ============ 3. Grupos só pelas funções ============
-- Antes, entrar era um insert direto: dava para chutar códigos sem limite (e criar com um código
-- escolhido revelava se ele já existia). Agora o código nasce no banco e tentativas erradas são limitadas.
drop policy "criar grupo" on public.study_groups;
drop policy "entrar em grupo" on public.group_members;

create table public.group_join_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index group_join_log_user_idx on public.group_join_log (user_id, created_at);
alter table public.group_join_log enable row level security;

create or replace function public.create_group(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; b bytea; i int;
begin
  if not exists (select 1 from public.room_members where user_id = auth.uid()) then raise exception 'Entre na sala com um apelido antes de criar um grupo.'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'O nome do grupo precisa ter de 1 a 40 caracteres.'; end if;
  loop
    b := uuid_send(gen_random_uuid());
    c := '';
    for i in 0..5 loop c := c || substr(chars, 1 + (get_byte(b, i) % 32), 1); end loop;
    exit when not exists (select 1 from public.study_groups where code = c);
  end loop;
  insert into public.study_groups (code, name, created_by) values (c, btrim(p_name), auth.uid());
  insert into public.group_members (code, user_id) values (c, auth.uid());
  return c;
end $$;

-- devolve 'ok', 'ja_membro' ou 'nao_encontrado'
create or replace function public.join_group(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare c text := upper(btrim(coalesce(p_code, '')));
begin
  if not exists (select 1 from public.room_members where user_id = auth.uid()) then raise exception 'Entre na sala com um apelido antes de entrar num grupo.'; end if;
  if (select count(*) from public.group_join_log where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Muitos códigos errados seguidos. Espere uma hora e confira o código com quem criou o grupo.';
  end if;
  if not exists (select 1 from public.study_groups where code = c) then
    insert into public.group_join_log (user_id) values (auth.uid());
    return 'nao_encontrado';
  end if;
  if exists (select 1 from public.group_members where code = c and user_id = auth.uid()) then return 'ja_membro'; end if;
  insert into public.group_members (code, user_id) values (c, auth.uid());
  return 'ok';
end $$;

revoke all on function public.create_group(text) from public;
revoke all on function public.join_group(text) from public;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;

-- ============ 4. Excluir a própria conta ============
-- Apaga o usuário; tudo o que é dele sai junto (todas as tabelas apontam para auth.users com "on delete cascade").
-- Grupos que a pessoa criou continuam para os outros membros, sem o criador.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para excluí-la.'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- o Supabase também dá acesso direto a quem não entrou (anon); estas funções são só para quem está logado
revoke execute on function public.limit_rows(), public.block_friend(uuid), public.my_blocks(), public.create_group(text),
  public.join_group(text), public.delete_my_account() from anon;
