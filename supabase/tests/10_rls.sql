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

-- Bruno não vê nada de Ana (nem na sala: eles ainda não dividem um grupo)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.subjects) <> 0 then raise exception 'Bruno vê disciplinas de Ana'; end if;
  if (select count(*) from public.study_sessions) <> 0 then raise exception 'Bruno vê sessões de Ana'; end if;
  if (select count(*) from public.assessments) <> 0 then raise exception 'Bruno vê notas de Ana'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'Bruno vê perfil alheio'; end if;
  if (select count(*) from public.room_members) <> 0 then raise exception 'Bruno vê Ana na sala sem dividir grupo'; end if;
  if (select count(*) from public.room_daily_totals(35, 'America/Sao_Paulo')) <> 0 then raise exception 'Bruno vê os minutos de Ana sem dividir grupo'; end if;
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

-- Grupos: só quem divide um grupo se vê
insert into public.room_members (nick) values ('Bruno');
insert into public.study_groups (code, name) values ('PETRO7', 'Turma 2024.1');
insert into public.group_members (code) values ('PETRO7');
do $$ begin
  if (select count(*) from public.study_groups) <> 1 then raise exception 'criador não vê o próprio grupo'; end if;
  if (select count(*) from public.room_members) <> 1 then raise exception 'Bruno deveria ver só a si mesmo'; end if;
end $$;

-- Ana não vê o grupo nem os membros antes de entrar; entra sabendo o código
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if (select count(*) from public.study_groups) <> 0 then raise exception 'códigos de grupos alheios visíveis'; end if;
  if (select count(*) from public.group_members) <> 0 then raise exception 'membros de grupos alheios visíveis'; end if;
  if (select count(*) from public.room_members) <> 1 then raise exception 'Ana vê alguém sem dividir grupo'; end if;
  if (select nick from public.room_members) <> 'Ana' then raise exception 'Bruno alterou a presença de Ana'; end if;
end $$;
insert into public.group_members (code) values ('PETRO7');
do $$ begin
  if (select count(*) from public.study_groups) <> 1 then raise exception 'Ana não vê o grupo em que entrou'; end if;
  if (select count(*) from public.group_members) <> 2 then raise exception 'Ana não vê os membros do grupo'; end if;
  if (select count(*) from public.room_members) <> 2 then raise exception 'Ana não vê Bruno no grupo'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.room_members) <> 2 then raise exception 'Bruno não vê Ana no grupo'; end if;
  if (select minutes from public.room_daily_totals(35, 'America/Sao_Paulo') where user_id = '00000000-0000-0000-0000-00000000000a') <> 50 then raise exception 'totais do grupo incorretos'; end if;
end $$;

-- Carla, fora do grupo, não vê ninguém e não entra com código errado
reset role;
insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000c', '{"name":"Carla"}');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
insert into public.room_members (nick) values ('Carla');
do $$ begin
  if (select count(*) from public.room_members) <> 1 then raise exception 'Carla vê pessoas de fora do grupo'; end if;
  if (select count(*) from public.study_groups) + (select count(*) from public.group_members) <> 0 then raise exception 'Carla vê grupos alheios'; end if;
  if (select count(*) from public.room_daily_totals(35, 'America/Sao_Paulo')) <> 0 then raise exception 'Carla vê minutos de quem não é do grupo'; end if;
  begin
    insert into public.group_members (code) values ('ZZZZZZ');
    raise exception 'FALHOU: entrou em grupo inexistente';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.group_members (code, user_id) values ('PETRO7', '00000000-0000-0000-0000-00000000000a');
    raise exception 'FALHOU: colocou outra pessoa num grupo';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

-- Validações
do $$ begin
  begin
    insert into public.subjects (name, min_avg) values ('X', 11);
    raise exception 'FALHOU: média mínima acima de 10 aceita';
  exception when check_violation then null;
  end;
end $$;

-- ============ Rotina, banco de erros e revisões ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.assessments (id, subject_id, name, weight, date) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Prova 2', 3, current_date + 10);
insert into public.assessments (subject_id, name, kind, weight) values ('10000000-0000-0000-0000-000000000001', 'SUB', 'sub', 1);
update public.topics set taught_on = current_date, assessment_id = '30000000-0000-0000-0000-000000000001' where id = '20000000-0000-0000-0000-000000000001';
update public.subjects set recovery = 'sub' where id = '10000000-0000-0000-0000-000000000001';
insert into public.routine_blocks (weekday, start_time, end_time, kind, subject_id) values (1, '08:20', '10:00', 'aula', '10000000-0000-0000-0000-000000000001');
insert into public.routine_blocks (weekday, start_time, end_time, kind) values (1, '14:00', '16:00', 'estudo');
insert into public.mistakes (id, subject_id, topic_id, category, description) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'sinal', 'Troquei o sinal do jacobiano');
insert into public.review_items (id, subject_id, topic_id, mistake_id, assessment_id, title, due) values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Sinal do jacobiano', current_date + 1);
insert into public.review_logs (item_id, result, autonomy, prev_step, new_step, prev_due, new_due) values ('50000000-0000-0000-0000-000000000001', 'certo', 'sozinho', 0, 1, current_date, current_date + 3);

do $$ begin
  begin
    insert into public.routine_blocks (weekday, start_time, end_time, kind) values (2, '10:00', '09:00', 'estudo');
    raise exception 'FALHOU: bloco terminando antes de começar';
  exception when check_violation then null;
  end;
  begin
    insert into public.routine_blocks (weekday, start_time, end_time, kind) values (2, '08:00', '09:00', 'aula');
    raise exception 'FALHOU: aula sem disciplina';
  exception when check_violation then null;
  end;
  begin
    insert into public.mistakes (subject_id, category, description) values ('10000000-0000-0000-0000-000000000001', 'chute', 'x');
    raise exception 'FALHOU: categoria de erro inválida';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set review_steps = '{1,0,7}';
    raise exception 'FALHOU: degrau de revisão com zero dias';
  exception when check_violation then null;
  end;
end $$;

-- Bruno não vê nem altera a rotina, os erros e as revisões de Ana
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.routine_blocks) <> 0 then raise exception 'Bruno vê a rotina de Ana'; end if;
  if (select count(*) from public.mistakes) <> 0 then raise exception 'Bruno vê os erros de Ana'; end if;
  if (select count(*) from public.review_items) <> 0 then raise exception 'Bruno vê as revisões de Ana'; end if;
  if (select count(*) from public.review_logs) <> 0 then raise exception 'Bruno vê o histórico de revisões de Ana'; end if;
end $$;
update public.mistakes set description = 'hack';
delete from public.review_items;
insert into public.subjects (id, name) values ('10000000-0000-0000-0000-00000000000b', 'Física');
do $$ begin
  begin
    insert into public.mistakes (subject_id, category, description) values ('10000000-0000-0000-0000-000000000001', 'sinal', 'invasão');
    raise exception 'FALHOU: erro ligado à disciplina de outra pessoa';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.review_items (subject_id, mistake_id, title, due) values ('10000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-000000000001', 'x', current_date);
    raise exception 'FALHOU: revisão ligada ao erro de outra pessoa';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.review_logs (item_id, result, prev_step, new_step, prev_due) values ('50000000-0000-0000-0000-000000000001', 'certo', 0, 1, current_date);
    raise exception 'FALHOU: histórico gravado na revisão de outra pessoa';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.topics (subject_id, name, assessment_id) values ('10000000-0000-0000-0000-00000000000b', 'x', '30000000-0000-0000-0000-000000000001');
    raise exception 'FALHOU: conteúdo ligado à prova de outra pessoa';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Ana: dados intactos; apagar a prova solta o conteúdo e a revisão; apagar o erro apaga a revisão dele
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if (select description from public.mistakes) <> 'Troquei o sinal do jacobiano' then raise exception 'Bruno alterou o erro de Ana'; end if;
  if (select count(*) from public.review_items) <> 1 then raise exception 'Bruno apagou a revisão de Ana'; end if;
end $$;
delete from public.assessments where id = '30000000-0000-0000-0000-000000000001';
do $$ begin
  if (select assessment_id from public.topics where id = '20000000-0000-0000-0000-000000000001') is not null then raise exception 'conteúdo continua ligado à prova apagada'; end if;
  if (select assessment_id from public.review_items) is not null or (select count(*) from public.review_items) <> 1 then raise exception 'revisão não foi solta da prova apagada'; end if;
end $$;

-- Ana: apagar conteúdo mantém a sessão como "geral"
delete from public.topics where id = '20000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from public.study_sessions where topic_id is null) <> 1 then raise exception 'sessão perdida ao apagar conteúdo'; end if;
  if (select count(*) from public.mistakes where topic_id is null) <> 1 then raise exception 'erro perdido ao apagar conteúdo'; end if;
end $$;
delete from public.mistakes;
do $$ begin
  if (select count(*) from public.review_items) <> 0 or (select count(*) from public.review_logs) <> 0 then raise exception 'revisão do erro apagado continuou'; end if;
end $$;
-- Ana: apagar disciplina apaga sessões e avaliações dela
delete from public.subjects where id = '10000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from public.study_sessions) <> 0 or (select count(*) from public.assessments) <> 0 then raise exception 'cascata falhou'; end if;
  if (select count(*) from public.routine_blocks) <> 1 then raise exception 'aula da disciplina apagada continuou na rotina'; end if;
end $$;

reset role;
select 'RLS OK' as resultado;
