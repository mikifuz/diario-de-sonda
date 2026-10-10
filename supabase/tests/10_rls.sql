-- Testes de privacidade e integridade. Falham com exceção se algo estiver errado.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"name":"Bruno"}');

do $$ begin
  if (select count(*) from public.profiles) <> 2 then raise exception 'perfil não criado no cadastro'; end if;
  if (select name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') <> 'Ana' then raise exception 'nome do perfil não copiado'; end if;
end $$;

-- Ana registra dados
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.subjects (id, name) values ('10000000-0000-0000-0000-000000000001', 'Cálculo III');
insert into public.topics (id, subject_id, name) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Integrais duplas');
insert into public.study_sessions (subject_id, topic_id, activity, started_at, duration_min, questions, correct, confidence, result, autonomy)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'exercicios', now() - interval '1 hour', 50, 10, 7, 4, 'parcial', 'sozinho');
insert into public.assessments (subject_id, name, weight, grade) values ('10000000-0000-0000-0000-000000000001', 'Prova 1', 3, 6.5);
insert into public.room_members (nick) values ('Ana');

-- Bruno não vê nada de Ana, exceto a sala
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.subjects) <> 0 then raise exception 'Bruno vê disciplinas de Ana'; end if;
  if (select count(*) from public.study_sessions) <> 0 then raise exception 'Bruno vê sessões de Ana'; end if;
  if (select count(*) from public.assessments) <> 0 then raise exception 'Bruno vê notas de Ana'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'Bruno vê perfil alheio'; end if;
  if (select count(*) from public.room_members) <> 1 then raise exception 'Bruno não vê a sala'; end if;
  if (select minutes from public.room_daily_totals(35, 'America/Sao_Paulo') limit 1) <> 50 then raise exception 'totais da sala incorretos'; end if;
end $$;

-- Bruno não consegue alterar a presença de Ana
update public.room_members set nick = 'hack' where user_id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if exists (select 1 from public.room_members where nick = 'hack') then raise exception 'Bruno alterou a presença de Ana'; end if;
end $$;

-- Bruno não consegue apontar sua sessão para a disciplina de Ana
do $$ begin
  begin
    insert into public.study_sessions (subject_id, activity, started_at, duration_min)
      values ('10000000-0000-0000-0000-000000000001', 'leitura', now(), 30);
    raise exception 'FALHOU: sessão ligada à disciplina de outra pessoa';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Bruno não consegue inserir dados em nome de Ana
do $$ begin
  begin
    insert into public.subjects (user_id, name) values ('00000000-0000-0000-0000-00000000000a', 'Invasão');
    raise exception 'FALHOU: inserção em nome de outra pessoa';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Grupos
insert into public.room_members (nick) values ('Bruno');
insert into public.study_groups (code, name) values ('PETRO7', 'Turma 2024.1');
insert into public.group_members (code) values ('PETRO7');

-- Validações
do $$ begin
  begin
    insert into public.subjects (name, min_avg) values ('X', 11);
    raise exception 'FALHOU: média mínima acima de 10 aceita';
  exception when check_violation then null;
  end;
end $$;

-- Ana: apagar conteúdo mantém a sessão como "geral"
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
delete from public.topics where id = '20000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from public.study_sessions where topic_id is null) <> 1 then raise exception 'sessão perdida ao apagar conteúdo'; end if;
end $$;
-- Ana: apagar disciplina apaga sessões e avaliações dela
delete from public.subjects where id = '10000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from public.study_sessions) <> 0 or (select count(*) from public.assessments) <> 0 then raise exception 'cascata falhou'; end if;
end $$;

reset role;
select 'RLS OK' as resultado;
