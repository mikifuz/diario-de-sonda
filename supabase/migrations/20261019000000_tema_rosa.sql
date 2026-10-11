-- Tema "Rosa" (pedido do dono): libera o novo valor na escolha de tema do perfil.
alter table public.profiles drop constraint if exists profiles_skin_check;
alter table public.profiles add constraint profiles_skin_check
  check (skin in ('sonda','caderno','blueprint','terminal','moderno','rosa'));
