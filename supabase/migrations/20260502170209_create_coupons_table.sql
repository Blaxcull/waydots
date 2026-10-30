create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  offer_id text not null,
  amount numeric not null,
  max_uses int not null default 0,
  used_count int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Enable RLS
alter table public.coupons enable row level security;

-- Policies
create policy "Anyone can validate coupons"
on public.coupons
for select
to anon, authenticated
using (is_active = true);

-- Add sample coupon
insert into public.coupons (code, offer_id, amount, max_uses)
values ('DISCOUNTFULL', 'offer_SkX4FXH2AyTCcx', 490, 10)
on conflict (code) do nothing;
