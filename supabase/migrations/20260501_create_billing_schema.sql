create extension if not exists pgcrypto;

create type public.subscription_plan as enum ('free', 'pro');
create type public.subscription_status as enum (
  'inactive',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan public.subscription_plan not null default 'free',
  subscription_status public.subscription_status not null default 'inactive',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint subscriptions_user_id_key unique (user_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;

  insert into public.subscriptions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view own subscription" on public.subscriptions;
create policy "Users can view own subscription"
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Service role manages subscriptions" on public.subscriptions;
create policy "Service role manages subscriptions"
on public.subscriptions
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages profiles" on public.profiles;
create policy "Service role manages profiles"
on public.profiles
for all
to service_role
using (true)
with check (true);

comment on table public.profiles is 'Application profile data and current plan for each user.';
comment on table public.subscriptions is 'Stripe-backed subscription state synchronized by webhook handlers.';
