-- Apply on Supabase after the core migrations (npm run db:migrate -- --supabase).
-- The Honeydoo server connects with a privileged role and enforces authorization in code.
-- These policies make the anon/authenticated keys safe if they are ever used directly:
-- public catalog data is readable when the merchant is active; everything else is denied
-- unless the caller is a member of the merchant.

do $$
declare t text;
begin
  foreach t in array array[
    'markets','categories','merchants','merchant_members','merchant_locations','merchant_integrations',
    'oauth_states','products','product_overrides','product_variations','modifier_lists','modifiers',
    'product_modifier_lists','product_location_availability','customers','carts','cart_items','orders',
    'order_items','order_status_history','payments','refunds','transactions','sync_jobs','webhook_events',
    'merchant_consents','analytics_events','audit_log','ai_requests','customer_sessions','password_resets','staff_users','staff_invites','staff_sessions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

create or replace function public.is_merchant_member(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from merchant_members m where m.merchant_id = mid and m.user_ref = auth.uid()::text)
$$;

-- Public catalog (read only, active merchants only)
create policy public_markets on markets for select using (active);
create policy public_categories on categories for select using (true);
create policy public_merchants on merchants for select using (status = 'active' or is_merchant_member(id));
create policy public_locations on merchant_locations for select
  using ((active and exists (select 1 from merchants m where m.id = merchant_id and m.status = 'active')) or is_merchant_member(merchant_id));
create policy public_products on products for select
  using ((publication_status = 'published' and exists (select 1 from merchants m where m.id = merchant_id and m.status = 'active')) or is_merchant_member(merchant_id));
create policy public_variations on product_variations for select
  using (exists (select 1 from products p where p.id = product_id and (p.publication_status = 'published' or is_merchant_member(p.merchant_id))));

-- Merchant-scoped data
create policy member_orders on orders for select using (is_merchant_member(merchant_id));
create policy member_integrations on merchant_integrations for select using (is_merchant_member(merchant_id));
create policy member_consents on merchant_consents for select using (is_merchant_member(merchant_id));
create policy member_transactions on transactions for select using (is_merchant_member(merchant_id));
-- All other tables: no policies, so only the server role can access them.
