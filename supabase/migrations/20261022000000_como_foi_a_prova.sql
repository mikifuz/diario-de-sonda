-- "Como foi a prova?" (pedido do dono): depois do horário da prova o app pergunta como a pessoa se sentiu.
-- 1 = muito mal … 5 = muito bem; 0 = "não perguntar desta prova". É só uma impressão: não é nota nem acerto.
alter table public.assessments add column if not exists felt smallint check (felt between 0 and 5);
