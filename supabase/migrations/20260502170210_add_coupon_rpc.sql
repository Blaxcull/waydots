create or replace function public.increment_coupon_usage(p_offer_id text)
returns void
language plpgsql
security definer
as $$
begin
  update public.coupons
  set used_count = used_count + 1,
      updated_at = timezone('utc', now())
  where offer_id = p_offer_id;
end;
$$;
