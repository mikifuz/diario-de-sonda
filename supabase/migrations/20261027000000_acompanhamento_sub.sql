-- Fundo do Poço — acompanhamento para a SUB.
-- assessments.sub_prep (na prova com nota baixa): 1 = quer se preparar para a SUB (a SUB entra no plano das provas),
-- 0 = não quer (não pergunta de novo desta prova), null = ainda não respondeu.
-- profiles.sub_ask: false = não perguntar mais em nenhuma prova (liga de novo em Configurações).
alter table public.assessments add column if not exists sub_prep smallint;
alter table public.assessments drop constraint if exists assessments_sub_prep_check;
alter table public.assessments add constraint assessments_sub_prep_check check (sub_prep is null or sub_prep in (0, 1));
alter table public.profiles add column if not exists sub_ask boolean not null default true;
