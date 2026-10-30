alter table public.subscriptions
  add column if not exists provider_subscription_id text,
  add column if not exists provider_plan_id text,
  add column if not exists provider_offer_id text;

create unique index if not exists subscriptions_provider_subscription_id_key
  on public.subscriptions (provider_subscription_id)
  where provider_subscription_id is not null;
