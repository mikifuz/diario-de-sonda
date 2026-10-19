-- Fundo do Poço — lixeira nas tarefas de estudo do Plano do dia (Hoje), valendo em todos os aparelhos.
-- profiles.skipped: identificador da tarefa descartada → dia em que descartou (o app apaga os de mais de 60 dias).
alter table public.profiles add column if not exists skipped jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_skipped_size;
alter table public.profiles add constraint profiles_skipped_size
  check (jsonb_typeof(skipped) = 'object' and length(skipped::text) <= 16000) not valid;
