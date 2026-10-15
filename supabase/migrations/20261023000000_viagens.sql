-- Fundo do Poço — Viagens no calendário: um item com data de ida (date) e de volta (end_date).
-- Nos dias da viagem os blocos de estudo da rotina não contam; o plano das provas se refaz em volta dela.
alter table public.events add column if not exists end_date date;
alter table public.events drop constraint if exists events_end_date_check;
alter table public.events add constraint events_end_date_check
  check (end_date is null or (end_date >= date and end_date - date <= 120));
alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('prova','trabalho','apresentacao','entrega','sub','aula','atividade','simulado','estudo','revisao','pessoal','indisponivel','sem_aula','viagem'));
