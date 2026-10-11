-- Diário de Sonda — "Sem aula / feriado" no calendário: naquele dia (de todas as disciplinas ou de uma)
-- os horários de aula viram tempo de estudo no plano.
alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('prova','trabalho','apresentacao','entrega','sub','aula','atividade','simulado','estudo','revisao','pessoal','indisponivel','sem_aula'));
