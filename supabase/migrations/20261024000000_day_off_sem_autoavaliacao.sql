-- Fundo do Poço — Day off, estudo extra no calendário e fim da autoavaliação, do banco de erros e das revisões.
-- Pedido do dono: a autoavaliação depois da sessão, o banco de erros e a revisão espaçada não estavam sendo úteis.
-- Os dados antigos dessas partes são apagados (o dono autorizou). Revisar agora é uma tarefa da lista de tarefas.

-- ============ 1. Day off ============
-- Folga marcada na Sala vira um item do calendário (tipo "folga"); o grupo vê só o dia (room_members.off_day).
alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('prova','trabalho','apresentacao','entrega','sub','aula','atividade','simulado','estudo','revisao','pessoal','indisponivel','sem_aula','viagem','folga'));
alter table public.room_members add column if not exists off_day date;

-- ============ 2. Estudo extra no calendário ============
-- "Estudo planejado" com início e fim conta como horário de estudo no plano daquele dia.
alter table public.events add column if not exists end_time time;
alter table public.events drop constraint if exists events_end_time_check;
alter table public.events add constraint events_end_time_check
  check (end_time is null or (time is not null and end_time > time));

-- ============ 3. Sem autoavaliação, banco de erros e revisões ============
drop table if exists public.review_logs;
drop table if exists public.review_items;
drop table if exists public.mistakes;

alter table public.study_sessions
  drop column if exists questions,
  drop column if exists correct,
  drop column if exists confidence,
  drop column if exists result,
  drop column if exists autonomy,
  drop column if exists difficulty,
  drop column if exists comprehension;

-- o limite de tamanho do perfil citava mastery_cfg: refeito só com o cronômetro
alter table public.profiles drop constraint if exists profiles_json_size;
alter table public.profiles
  drop column if exists review_steps,
  drop column if exists mastery_cfg;
alter table public.profiles add constraint profiles_json_size check (coalesce(pg_column_size(timer), 0) <= 4000) not valid;
