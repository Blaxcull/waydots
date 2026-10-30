alter table public.subscriptions
  add column if not exists payment_provider text,
  add column if not exists provider_order_id text,
  add column if not exists provider_payment_id text,
  add column if not exists provider_signature text,
  add column if not exists receipt text,
  add column if not exists amount integer,
  add column if not exists currency text;

create unique index if not exists subscriptions_provider_order_id_key
  on public.subscriptions (provider_order_id)
  where provider_order_id is not null;

create unique index if not exists subscriptions_provider_payment_id_key
  on public.subscriptions (provider_payment_id)
  where provider_payment_id is not null;
