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
-- o código nasce no banco; para o teste, o grupo de Bruno passa a se chamar PETRO7
select public.create_group('Turma 2024.1');
reset role;
insert into public.study_groups (code, name, created_by) select 'PETRO7', name, created_by from public.study_groups;
update public.group_members set code = 'PETRO7';
delete from public.study_groups where code <> 'PETRO7';
set role authenticated;
do $$ begin
  begin
    insert into public.study_groups (code, name, created_by) values ('ABCDEF', 'Escolhido', '00000000-0000-0000-0000-00000000000b');
    raise exception 'FALHOU: grupo criado direto na tabela (com código escolhido)';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.group_members where user_id = auth.uid()) <> 1 then raise exception 'criador não entrou no próprio grupo'; end if;
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
  begin
    insert into public.group_members (code) values ('PETRO7');
    raise exception 'FALHOU: entrou em grupo direto na tabela';
  exception when insufficient_privilege then null;
  end;
  if public.join_group(' petro7 ') <> 'ok' then raise exception 'Ana não entrou com o código certo'; end if;
  if public.join_group('PETRO7') <> 'ja_membro' then raise exception 'entrar duas vezes'; end if;
end $$;
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
    insert into public.group_members (code, user_id) values ('PETRO7', '00000000-0000-0000-0000-00000000000a');
    raise exception 'FALHOU: colocou outra pessoa num grupo';
  exception when insufficient_privilege then null;
  end;
end $$;
-- Carla chuta códigos: 10 erros e o banco para de responder por uma hora (nem o certo passa)
do $$ begin
  for i in 1..10 loop
    if public.join_group('ZZZZZ' || i) <> 'nao_encontrado' then raise exception 'código inexistente aceito'; end if;
  end loop;
  begin
    perform public.join_group('PETRO7');
    raise exception 'FALHOU: chutes de código sem limite';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  if (select count(*) from public.group_join_log) <> 0 then raise exception 'registro de tentativas visível'; end if;
  if (select count(*) from public.group_members) <> 0 then raise exception 'Carla entrou no grupo'; end if;
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

-- ============ Tarefas ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.tasks (title, subject_id, due) values ('Lista 4 de Cálculo', '10000000-0000-0000-0000-000000000001', current_date + 2);
insert into public.tasks (title) values ('Comprar calculadora');
update public.profiles set mastery_cfg = '{"w_acc":60}';
-- tema rosa aceito; tema inexistente não
update public.profiles set skin = 'rosa';
do $$ begin
  begin
    update public.profiles set skin = 'inventado';
    raise exception 'FALHOU: tema inexistente aceito';
  exception when check_violation then null; end;
  update public.profiles set skin = 'sonda';
end $$;
do $$ begin
  begin
    insert into public.tasks (title) values ('   ');
    raise exception 'FALHOU: tarefa sem título';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set mastery_cfg = '[1,2]';
    raise exception 'FALHOU: configuração do índice que não é objeto';
  exception when check_violation then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
update public.tasks set done = true;
do $$ begin
  if (select count(*) from public.tasks) <> 0 then raise exception 'Bruno vê as tarefas de Ana'; end if;
  begin
    insert into public.tasks (title, subject_id) values ('x', '10000000-0000-0000-0000-000000000001');
    raise exception 'FALHOU: tarefa ligada à disciplina de outra pessoa';
  exception when foreign_key_violation then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if (select count(*) from public.tasks where done) <> 0 then raise exception 'Bruno alterou tarefas de Ana'; end if;
end $$;

-- ============ SUB por prova ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.assessments (id, subject_id, name, kind) values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'SUB A1/A2', 'sub');
insert into public.assessments (subject_id, name, sub_id) values ('10000000-0000-0000-0000-000000000001', 'A1', '60000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  begin
    insert into public.assessments (subject_id, name, sub_id) values ('10000000-0000-0000-0000-00000000000b', 'P1', '60000000-0000-0000-0000-000000000001');
    raise exception 'FALHOU: prova ligada à SUB de outra pessoa';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ============ Notificações e amigos ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.notifications (kind, title, data) values ('relatorio', 'Relatório da semana', '{"week":"2026-10-11"}');
do $$ begin
  begin
    insert into public.notifications (kind, title, data) values ('relatorio', 'De novo', '{"week":"2026-10-11"}');
    raise exception 'FALHOU: dois relatórios na mesma semana';
  exception when unique_violation then null;
  end;
end $$;
reset role;
update public.room_members set friend_code = 'ABCDEF01' where user_id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;

-- Carla (fora do grupo de Ana) não vê Ana, não chama Ana e não escreve nas notificações dela
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  if (select count(*) from public.room_members) <> 1 then raise exception 'Carla vê Ana antes da amizade'; end if;
  if (select count(*) from public.notifications) <> 0 then raise exception 'Carla vê notificações alheias'; end if;
  begin
    perform public.nudge_friend('00000000-0000-0000-0000-00000000000a', 'bora');
    raise exception 'FALHOU: chamado sem amizade';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    insert into public.notifications (user_id, kind, title) values ('00000000-0000-0000-0000-00000000000a', 'aviso', 'spam');
    raise exception 'FALHOU: notificação escrita para outra pessoa';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.notifications (kind, title, from_user) values ('chamado', 'falso', '00000000-0000-0000-0000-00000000000a');
    raise exception 'FALHOU: chamado forjado';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.friendships (from_user, to_user, status) values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'aceito');
    raise exception 'FALHOU: amizade aceita sem o outro lado';
  exception when insufficient_privilege then null;
  end;
  if public.send_friend_request('abcdef01') <> 'enviado' then raise exception 'pedido de amizade não enviado'; end if;
  if public.send_friend_request('ABCDEF01') <> 'ja_pedido' then raise exception 'pedido duplicado'; end if;
  begin
    perform public.accept_friend((select id from public.friendships limit 1));
    raise exception 'FALHOU: aceitou o próprio pedido';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  if (select count(*) from public.room_members) <> 1 then raise exception 'Carla vê Ana com o pedido ainda pendente'; end if;
end $$;

-- Ana recebe o pedido, aceita; Bruno não vê nada disso
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.friendships) <> 0 then raise exception 'Bruno vê amizades alheias'; end if;
  if (select count(*) from public.my_friendships()) <> 0 then raise exception 'Bruno lista amizades alheias'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if (select count(*) from public.notifications where kind = 'amizade') <> 1 then raise exception 'pedido de amizade não chegou'; end if;
  if (select nick from public.my_friendships()) <> 'Carla' then raise exception 'pedido sem o apelido de quem pediu'; end if;
  perform public.accept_friend((select id from public.my_friendships()));
end $$;

-- Carla agora vê Ana na sala e pode chamá-la uma vez por hora
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  if (select count(*) from public.room_members) <> 2 then raise exception 'amiga não aparece na sala'; end if;
  if (select count(*) from public.notifications where kind = 'amizade') <> 1 then raise exception 'aviso de aceite não chegou'; end if;
  perform public.nudge_friend('00000000-0000-0000-0000-00000000000a', 'bora');
  begin
    perform public.nudge_friend('00000000-0000-0000-0000-00000000000a', 'sala');
    raise exception 'FALHOU: dois chamados na mesma hora';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform public.nudge_friend('00000000-0000-0000-0000-00000000000a', 'qualquer texto');
    raise exception 'FALHOU: mensagem livre aceita';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if (select title from public.notifications where kind = 'chamado') <> 'Carla: Bora estudar?' then raise exception 'chamado não chegou'; end if;
end $$;
-- Ana desliga os chamados e desfaz a amizade: Carla volta a não ver Ana
update public.room_members set accept_nudges = false where user_id = '00000000-0000-0000-0000-00000000000a';
delete from public.friendships;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  if (select count(*) from public.room_members) <> 1 then raise exception 'amizade desfeita continua visível'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- Spam de pedidos: desfazer e pedir de novo não gera outro aviso na mesma semana
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  begin
    perform public.send_friend_request('ABCDEF01');
    raise exception 'FALHOU: pedido repetido logo depois de desfazer a amizade';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  if (select count(*) from public.friend_request_log) <> 0 then raise exception 'registro de pedidos visível'; end if;
end $$;
-- Bruno pede, Ana bloqueia: o pedido some e Bruno não consegue pedir de novo
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if public.send_friend_request('ABCDEF01') <> 'enviado' then raise exception 'pedido de Bruno não enviado'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  perform public.block_friend((select id from public.my_friendships() where nick = 'Bruno'));
  if exists (select 1 from public.my_friendships() where nick = 'Bruno') then raise exception 'pedido bloqueado continuou'; end if;
  if exists (select 1 from public.notifications where kind = 'amizade' and from_user = '00000000-0000-0000-0000-00000000000b') then raise exception 'aviso do pedido bloqueado continuou'; end if;
  if (select nick from public.my_blocks()) <> 'Bruno' then raise exception 'bloqueio não listado'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.friend_blocks) <> 0 then raise exception 'Bruno vê quem o bloqueou'; end if;
  begin
    perform public.send_friend_request('ABCDEF01');
    raise exception 'FALHOU: pedido de quem foi bloqueado';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform public.block_friend(gen_random_uuid());
    raise exception 'FALHOU: bloqueio de pedido inexistente';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  -- chutar códigos de amigo: 10 erros e para por uma hora
  for i in 1..10 loop
    if public.send_friend_request('0000000' || i) <> 'nao_encontrado' then raise exception 'código de amigo inexistente aceito'; end if;
  end loop;
  begin
    perform public.send_friend_request('00000011');
    raise exception 'FALHOU: chutes de código de amigo sem limite';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
delete from public.friend_blocks;
do $$ begin
  if (select count(*) from public.my_blocks()) <> 0 then raise exception 'desbloquear falhou'; end if;
end $$;

-- Limites de tamanho e de quantidade (ninguém enche o banco sozinho)
do $$ begin
  begin
    update public.profiles set name = repeat('x', 5000) where id = auth.uid();
    raise exception 'FALHOU: nome gigante aceito';
  exception when check_violation then null;
  end;
  begin
    insert into public.subjects (name, notes) values ('Y', repeat('x', 20000));
    raise exception 'FALHOU: anotação gigante aceita';
  exception when check_violation then null;
  end;
  begin
    update public.room_members set friend_code = 'QUALQUER COISA' where user_id = auth.uid();
    raise exception 'FALHOU: código de amigo inventado';
  exception when check_violation then null;
  end;
  insert into public.habits (name) select 'h' || g from generate_series(1, 200) g;
  begin
    insert into public.habits (name) values ('um a mais');
    raise exception 'FALHOU: sem limite de registros';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  delete from public.habits;
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
-- ============ Meu curso ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.curriculum (id, name, phase, credits, status, subject_id) values ('70000000-0000-0000-0000-000000000001', 'Cálculo Diferencial e Integral III', 3, 4, 'cursando', '10000000-0000-0000-0000-000000000001');
insert into public.curriculum (name, phase, credits, prereqs) values ('Equações Diferenciais', 4, 4, '[{"id":"70000000-0000-0000-0000-000000000001"}]');
do $$ begin
  begin
    insert into public.curriculum (name, status) values ('x', 'talvez');
    raise exception 'FALHOU: situação inválida';
  exception when check_violation then null;
  end;
  begin
    insert into public.curriculum (name, prereqs) values ('x', '{"id":1}');
    raise exception 'FALHOU: pré-requisitos que não são lista';
  exception when check_violation then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
update public.curriculum set status = 'aprovada';
delete from public.curriculum;
do $$ begin
  if (select count(*) from public.curriculum) <> 0 then raise exception 'Bruno vê a matriz de Ana'; end if;
  begin
    insert into public.curriculum (name, subject_id) values ('x', '10000000-0000-0000-0000-000000000001');
    raise exception 'FALHOU: matriz ligada à disciplina de outra pessoa';
  exception when foreign_key_violation then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if (select count(*) from public.curriculum) <> 2 then raise exception 'Bruno apagou a matriz de Ana'; end if;
  if (select count(*) from public.curriculum where status = 'aprovada') <> 0 then raise exception 'Bruno alterou a matriz de Ana'; end if;
end $$;

-- ============ Sem aula / feriado ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.events (title, type, date) values ('Recesso', 'sem_aula', current_date + 3);
delete from public.events where type = 'sem_aula';

-- ============ Exercício físico e hábitos ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.routine_blocks (weekday, start_time, end_time, kind) values (2, '18:00', '19:00', 'exercicio');
insert into public.habits (id, name) values ('80000000-0000-0000-0000-000000000001', 'Fiquei pouco tempo no celular');
insert into public.habit_checks (habit_id, day) values ('80000000-0000-0000-0000-000000000001', current_date);
do $$ begin
  begin
    insert into public.habit_checks (habit_id, day) values ('80000000-0000-0000-0000-000000000001', current_date);
    raise exception 'FALHOU: hábito marcado duas vezes no mesmo dia';
  exception when unique_violation then null;
  end;
  begin
    insert into public.habits (name) values ('  ');
    raise exception 'FALHOU: hábito sem nome';
  exception when check_violation then null;
  end;
  begin
    insert into public.routine_blocks (weekday, start_time, end_time, kind) values (2, '18:00', '19:00', 'balada');
    raise exception 'FALHOU: tipo de bloco inválido';
  exception when check_violation then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
delete from public.habit_checks;
update public.habits set name = 'x';
do $$ begin
  if (select count(*) from public.habits) <> 0 or (select count(*) from public.habit_checks) <> 0 then raise exception 'Bruno vê os hábitos de Ana'; end if;
  begin
    insert into public.habit_checks (habit_id, day) values ('80000000-0000-0000-0000-000000000001', current_date - 1);
    raise exception 'FALHOU: marcou hábito de outra pessoa';
  exception when foreign_key_violation then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  if (select count(*) from public.habit_checks) <> 1 then raise exception 'Bruno apagou o registro de Ana'; end if;
  if (select name from public.habits) <> 'Fiquei pouco tempo no celular' then raise exception 'Bruno alterou o hábito de Ana'; end if;
end $$;
delete from public.habits;
do $$ begin
  if (select count(*) from public.habit_checks) <> 0 then raise exception 'registro do hábito apagado continuou'; end if;
end $$;
delete from public.routine_blocks where kind = 'exercicio';

-- Ana: apagar disciplina apaga sessões e avaliações dela
delete from public.subjects where id = '10000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from public.study_sessions) <> 0 or (select count(*) from public.assessments) <> 0 then raise exception 'cascata falhou'; end if;
  if (select count(*) from public.routine_blocks) <> 1 then raise exception 'aula da disciplina apagada continuou na rotina'; end if;
  if (select count(*) from public.tasks) <> 1 then raise exception 'tarefa da disciplina apagada continuou (ou a avulsa sumiu)'; end if;
  if (select count(*) from public.curriculum where subject_id is null) <> 2 then raise exception 'matriz deveria continuar, só sem a ligação com a disciplina apagada'; end if;
end $$;

-- Carla exclui a conta: some tudo dela, o grupo de Bruno e os dados de Ana continuam
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
insert into public.subjects (name) values ('Física');
select public.delete_my_account();
reset role;
do $$ begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000c') then raise exception 'conta não excluída'; end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000c')
    or exists (select 1 from public.subjects where user_id = '00000000-0000-0000-0000-00000000000c')
    or exists (select 1 from public.room_members where user_id = '00000000-0000-0000-0000-00000000000c')
    or exists (select 1 from public.notifications where '00000000-0000-0000-0000-00000000000c' in (user_id, from_user))
    or exists (select 1 from public.friend_request_log where from_user = '00000000-0000-0000-0000-00000000000c')
    or exists (select 1 from public.group_join_log where user_id = '00000000-0000-0000-0000-00000000000c') then
    raise exception 'dados da conta excluída continuaram';
  end if;
  if not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a') or not exists (select 1 from public.study_groups where code = 'PETRO7') then
    raise exception 'excluir uma conta afetou outras pessoas';
  end if;
end $$;
-- sem login, ninguém exclui nada
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin
    perform public.delete_my_account();
    raise exception 'FALHOU: exclusão sem login';
  exception when insufficient_privilege or raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
end $$;
reset role;
select 'RLS OK' as resultado;
