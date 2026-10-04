-- ════════════════════════════════════════════════════════════════════════════
--  0005 — CREDIT PACKS & CASHFREE BILLING
--
--  Idempotent. Safe to run more than once. Run AFTER 0001–0004.
--
--  ── WHAT THIS CHANGES, AND WHY ─────────────────────────────────────────────
--  0001–0004 were built around a monthly PLAN (profiles.plan + subscriptions).
--  The product sells one-time CREDIT PACKS instead: pay ₹99 once, get 25
--  credits that are good for 30 days. Nothing recurring, no mandate, no
--  renewal date to chase.a
--
--  This migration adds that model WITHOUT removing the plan model, because the
--  admin panel can still grant a plan by hand and that must keep working. The
--  autofill gate below ends up as "an admin granted you a plan OR you bought a
--  pack that hasn't expired".
--
--  ── THE THREE THINGS THAT MAKE THIS SAFE TO PUT IN FRONT OF MONEY ──────────
--  1. The PRICE IS NEVER TAKEN FROM THE CLIENT. A checkout request names a
--     pack slug; the amount, the credit count and the validity are all read
--     from `credit_packs` here, server-side. A tampered request can only ask
--     for a different pack, never for a different price.
--  2. GRANTING IS IDEMPOTENT. Cashfree retries a webhook until it gets a 2xx,
--     and a retried grant that adds credits twice is a money bug. `granted_at`
--     is the latch: the grant takes the payment row FOR UPDATE and does nothing
--     if it is already set.
--  3. ONE PAYMENT ROW PER CASHFREE ORDER, enforced by a unique index rather
--     than by application care.
--
--  ── CREDITS NOW ACTUALLY EXPIRE ───────────────────────────────────────────
--  They never did. `usage.period_end` existed from 0001 but nothing read it, so
--  "30 Days Validity" on the pricing page would have been a lie the first time
--  someone tested it. Expiry is enforced at SPEND time (see expire_credits_if_due)
--  rather than by a scheduled job — no cron to deploy, no window where an
--  expired balance is still spendable.
--
--  Expiry raises the EXISTING 'no_credits' error rather than a new one, so the
--  extension needs no change: it already shows "out of credits" for that, which
--  is exactly what an expired balance is from the seller's side.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
--  PART 1 — credit_packs: what is for sale
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.credit_packs (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  tagline       text,
  credits       int  not null check (credits > 0),
  -- GST-INCLUSIVE, in rupees. This is the exact figure the buyer is charged and
  -- the exact figure shown on the pricing page; the tax is worked out from it,
  -- never added to it. Storing anything else here guarantees a page that says
  -- ₹99 and a checkout that asks for ₹116.82.
  price_inr     numeric(10, 2) not null check (price_inr > 0),
  validity_days int  not null check (validity_days > 0),
  features      jsonb not null default '[]'::jsonb,
  featured      boolean not null default false,
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists credit_packs_active_idx
  on public.credit_packs (active, sort_order);

alter table public.credit_packs enable row level security;

-- Anyone may read what is for sale — the pricing page is public and is rendered
-- for signed-out visitors. Nothing here is sensitive. Writes are admin-only, via
-- the service role, which bypasses RLS.
drop policy if exists "credit_packs: public read" on public.credit_packs;
create policy "credit_packs: public read"
  on public.credit_packs for select
  to anon, authenticated
  using (active);

-- The catalogue. `on conflict do update` so re-running the migration corrects a
-- price rather than silently keeping an old one, while leaving the id (and any
-- payment row pointing at the slug) alone.
insert into public.credit_packs
  (slug, name, tagline, credits, price_inr, validity_days, features, featured, sort_order)
values
  ('starter', 'Starter', 'Try it on a few listings.',
   25, 99.00, 30,
   '["25 credits", "Valid 30 days", "Live shipping check on every image", "Listing autofill included"]'::jsonb,
   false, 1),
  ('growth', 'Growth', 'For sellers listing every week.',
   100, 299.00, 30,
   '["100 credits", "Valid 30 days", "Live shipping check on every image", "Listing autofill included"]'::jsonb,
   true, 2),
  ('pro', 'Pro', 'Lowest price per credit.',
   400, 699.00, 45,
   '["400 credits", "Valid 45 days", "Live shipping check on every image", "Listing autofill included"]'::jsonb,
   false, 3),
  ('ultimate', 'Ultimate', 'Longest validity — 90 days.',
   500, 999.00, 90,
   '["500 credits", "Valid 90 days", "Live shipping check on every image", "Listing autofill included"]'::jsonb,
   false, 4)
on conflict (slug) do update
  set name          = excluded.name,
      tagline       = excluded.tagline,
      credits       = excluded.credits,
      price_inr     = excluded.price_inr,
      validity_days = excluded.validity_days,
      features      = excluded.features,
      featured      = excluded.featured,
      sort_order    = excluded.sort_order,
      active        = true;


-- ════════════════════════════════════════════════════════════════════════════
--  PART 2 — payments gains what a pack purchase needs
-- ════════════════════════════════════════════════════════════════════════════
alter table public.payments add column if not exists pack_slug       text;
alter table public.payments add column if not exists credits_granted int;
alter table public.payments add column if not exists validity_days   int;
-- The latch that makes granting idempotent. Null until credits are actually
-- added; set inside the same transaction that adds them.
alter table public.payments add column if not exists granted_at      timestamptz;
alter table public.payments add column if not exists updated_at      timestamptz not null default now();

-- One row per provider order. This is the backstop behind the webhook's own
-- care: even if two webhook deliveries race, they cannot create two orders.
create unique index if not exists payments_provider_ref_uniq
  on public.payments (provider, provider_ref)
  where provider_ref is not null;

create index if not exists payments_status_idx on public.payments (status);


-- ════════════════════════════════════════════════════════════════════════════
--  PART 3 — usage gains `paid_until`
--
--  `period_end` already says when the current CREDITS expire. It cannot double
--  as the autofill gate, because 0001 gives every new signup 3 free starter
--  credits with a period_end 30 days out — so "period_end in the future" is true
--  for someone who has never paid a rupee.
--
--  `paid_until` is null until a pack is bought and is the one thing the gate
--  reads. Two fields, two meanings, neither guessing at the other.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.usage add column if not exists paid_until timestamptz;

create index if not exists usage_paid_until_idx on public.usage (paid_until);


-- ════════════════════════════════════════════════════════════════════════════
--  PART 4 — expiry, enforced at spend time
--
--  Zeroes a balance whose period_end has passed and records it, so the seller's
--  credit history explains where the credits went instead of them just being
--  gone. Returns the fresh row.
--
--  Called at the top of both spend paths. It is a no-op in the common case (one
--  comparison), which is why it can afford to run on every spend.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.expire_credits_if_due(p_user uuid)
returns public.usage
language plpgsql
security definer
set search_path = public
as $expire_credits_if_due$
declare
  v_row public.usage;
begin
  select * into v_row from public.usage where user_id = p_user for update;
  if v_row.user_id is null then
    return v_row;
  end if;

  if v_row.credits_remaining > 0
     and v_row.period_end is not null
     and v_row.period_end <= now() then

    insert into public.credit_events (user_id, action, credits)
    values (p_user, 'Credits expired', v_row.credits_remaining);

    update public.usage
       set credits_remaining = 0
     where user_id = p_user
    returning * into v_row;
  end if;

  return v_row;
end;
$expire_credits_if_due$;

comment on function public.expire_credits_if_due(uuid) is
  'Zeroes an expired credit balance and logs it. Called at the top of every spend.';

revoke all on function public.expire_credits_if_due(uuid) from public;


-- ════════════════════════════════════════════════════════════════════════════
--  PART 5 — grant_credit_pack: the only thing that adds paid credits
--
--  Takes a payment row id, not a user and an amount. That is deliberate: the
--  caller cannot invent a credit count, because the count comes from the
--  payment row, which was written from the pack catalogue at checkout.
--
--  ── STACKING ──────────────────────────────────────────────────────────────
--  Buying a second pack while one is live ADDS the credits and pushes both
--  expiry dates out to whichever is later. A seller who tops up mid-month must
--  never end up with a SHORTER validity than they already had — `greatest()` is
--  what guarantees that.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.grant_credit_pack(p_payment_id uuid)
returns public.usage
language plpgsql
security definer
set search_path = public
as $grant_credit_pack$
declare
  v_pay   public.payments;
  v_row   public.usage;
  v_until timestamptz;
begin
  -- FOR UPDATE: two concurrent webhook deliveries serialise here, and the
  -- second one finds granted_at already set.
  select * into v_pay from public.payments where id = p_payment_id for update;

  if v_pay.id is null then
    raise exception 'payment_not_found';
  end if;

  if v_pay.granted_at is not null then
    -- Already done. Not an error: a retried webhook is normal operation.
    select * into v_row from public.usage where user_id = v_pay.user_id;
    return v_row;
  end if;

  if v_pay.status <> 'success' then
    raise exception 'payment_not_successful';
  end if;

  if coalesce(v_pay.credits_granted, 0) < 1 or coalesce(v_pay.validity_days, 0) < 1 then
    raise exception 'payment_missing_pack_details';
  end if;

  select * into v_row from public.usage where user_id = v_pay.user_id for update;

  if v_row.user_id is null then
    insert into public.usage (user_id, credits_remaining)
    values (v_pay.user_id, 0)
    returning * into v_row;
  end if;

  -- Expire a stale balance BEFORE topping up, so old credits that should have
  -- lapsed are not silently revived by the new pack's longer window.
  if v_row.credits_remaining > 0
     and v_row.period_end is not null
     and v_row.period_end <= now() then
    insert into public.credit_events (user_id, action, credits)
    values (v_pay.user_id, 'Credits expired', v_row.credits_remaining);
    update public.usage set credits_remaining = 0 where user_id = v_pay.user_id
    returning * into v_row;
  end if;

  v_until := greatest(
    coalesce(v_row.period_end, now()),
    now() + make_interval(days => v_pay.validity_days)
  );

  update public.usage
     set credits_remaining = credits_remaining + v_pay.credits_granted,
         period_start      = least(coalesce(period_start, now()), now()),
         period_end        = v_until,
         paid_until        = greatest(coalesce(paid_until, now()), v_until)
   where user_id = v_pay.user_id
  returning * into v_row;

  insert into public.credit_events (user_id, action, credits)
  values (
    v_pay.user_id,
    'Pack purchased — ' || coalesce(v_pay.pack_slug, 'credits'),
    v_pay.credits_granted
  );

  update public.payments
     set granted_at = now(),
         updated_at = now()
   where id = p_payment_id;

  return v_row;
end;
$grant_credit_pack$;

comment on function public.grant_credit_pack(uuid) is
  'Idempotently credits a successful pack payment. Latched on payments.granted_at.';

revoke all on function public.grant_credit_pack(uuid) from public;
-- No grant to `authenticated`: only the service role (the webhook) may call it.


-- ════════════════════════════════════════════════════════════════════════════
--  PART 6 — the two spend paths now expire first
--
--  Both are re-declared in full rather than patched, because `create or replace`
--  takes a whole body. The ONLY change in each is the expire_credits_if_due()
--  call before the balance is read. Everything else — the idempotency claim, the
--  block check, the device check, the event log — is unchanged from 0001/0004.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.consume_credit(
  p_action text default 'Credit used',
  p_amount int  default 1
)
returns public.usage
language plpgsql
security definer
set search_path = public
as $consume_credit$
declare
  row public.usage;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_amount is null or p_amount < 1 then
    raise exception 'invalid_amount';
  end if;

  -- NEW in 0005: lapse an out-of-date balance before it can be spent.
  row := public.expire_credits_if_due(auth.uid());

  if row.user_id is null then
    insert into public.usage (user_id, credits_remaining) values (auth.uid(), 0)
    returning * into row;
  end if;

  if row.credits_remaining < p_amount then
    raise exception 'no_credits';
  end if;

  update public.usage
    set credits_remaining = credits_remaining - p_amount,
        images_used = images_used + p_amount
    where user_id = auth.uid()
    returning * into row;

  insert into public.credit_events (user_id, action, credits)
  values (auth.uid(), coalesce(nullif(trim(p_action), ''), 'Credit used'), p_amount);

  return row;
end;
$consume_credit$;

revoke all on function public.consume_credit(text, int) from public;
grant execute on function public.consume_credit(text, int) to authenticated;


create or replace function public.consume_credit_for(
  p_user            uuid,
  p_device_id       text,
  p_idempotency_key text,
  p_action          text default 'Credit used',
  p_amount          int  default 1
)
returns public.usage
language plpgsql
security definer
set search_path = public
as $consume_credit_for$
declare
  v_row    public.usage;
  v_claim  public.credit_claims;
  v_action text := coalesce(nullif(btrim(p_action), ''), 'Credit used');
begin
  if p_user is null then
    raise exception 'not_authenticated';
  end if;
  if coalesce(btrim(p_idempotency_key), '') = '' then
    raise exception 'missing_idempotency_key';
  end if;
  if p_amount is null or p_amount < 1 then
    raise exception 'invalid_amount';
  end if;

  -- Replay first: a retry must not even look at the balance.
  select * into v_claim from public.credit_claims
   where idempotency_key = p_idempotency_key;

  if v_claim.idempotency_key is not null then
    if v_claim.user_id <> p_user then
      raise exception 'idempotency_key_conflict';
    end if;
    if v_claim.usage_snapshot <> '{}'::jsonb then
      return jsonb_populate_record(null::public.usage, v_claim.usage_snapshot);
    end if;
    select * into v_row from public.usage where user_id = p_user;
    return v_row;
  end if;

  if exists (select 1 from public.profiles where id = p_user and status = 'blocked') then
    raise exception 'account_blocked';
  end if;

  if not exists (
    select 1 from public.extension_devices
     where user_id = p_user and device_id = p_device_id and status = 'active'
  ) then
    raise exception 'device_revoked';
  end if;

  -- NEW in 0005: lapse an out-of-date balance before it can be spent. Placed
  -- AFTER the replay check on purpose — a retry of an already-settled spend
  -- must return the recorded snapshot untouched, whatever the clock says now.
  v_row := public.expire_credits_if_due(p_user);

  if v_row.user_id is null then
    insert into public.usage (user_id, credits_remaining) values (p_user, 0)
    returning * into v_row;
  end if;

  if v_row.credits_remaining < p_amount then
    raise exception 'no_credits';
  end if;

  -- Claim the key BEFORE spending. A concurrent retry loses here and replays.
  begin
    insert into public.credit_claims
      (idempotency_key, user_id, device_id, action, amount, usage_snapshot)
    values
      (p_idempotency_key, p_user, nullif(btrim(p_device_id), ''), v_action, p_amount,
       '{}'::jsonb);
  exception when unique_violation then
    select * into v_claim from public.credit_claims
     where idempotency_key = p_idempotency_key;
    if v_claim.usage_snapshot <> '{}'::jsonb then
      return jsonb_populate_record(null::public.usage, v_claim.usage_snapshot);
    end if;
    select * into v_row from public.usage where user_id = p_user;
    return v_row;
  end;

  update public.usage
     set credits_remaining = credits_remaining - p_amount,
         images_used       = images_used + p_amount
   where user_id = p_user
  returning * into v_row;

  insert into public.credit_events (user_id, action, credits)
  values (p_user, v_action, p_amount);

  update public.credit_claims
     set usage_snapshot = to_jsonb(v_row)
   where idempotency_key = p_idempotency_key;

  return v_row;
end;
$consume_credit_for$;

revoke all on function public.consume_credit_for(uuid, text, text, text, int) from public;


-- ════════════════════════════════════════════════════════════════════════════
--  PART 7 — the autofill gate learns about packs
--
--  Unchanged for an admin-granted plan: that path is still exactly 0003's. What
--  is added is the OR — a seller whose pack has not expired passes the gate.
--
--  Note it reads `paid_until`, not `credits_remaining`. A seller who has spent
--  every credit but is still inside their 30 days keeps autofill. Autofill costs
--  no credits, so taking it away the moment the balance hits zero would be
--  punishing them for using the thing they paid for.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.has_active_plan(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $has_active_plan$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.status <> 'blocked'
      and (
        -- (a) an unexpired credit pack
        exists (
          select 1 from public.usage u
          where u.user_id = p.id
            and u.paid_until is not null
            and u.paid_until > now()
        )
        -- (b) or an admin-granted paid plan, as in 0003
        or (
          public.is_paid_plan(p.plan)
          and (
            not exists (
              select 1
              from public.subscriptions s
              where s.user_id = p.id
                and lower(btrim(s.plan)) = lower(btrim(p.plan))
            )
            or exists (
              select 1
              from public.subscriptions s
              where s.user_id = p.id
                and lower(btrim(s.plan)) = lower(btrim(p.plan))
                and s.status = 'active'
                and (s.renewal_at is null or s.renewal_at > now())
            )
          )
        )
      )
  );
$has_active_plan$;

comment on function public.has_active_plan(uuid) is
  'Autofill gate: not blocked, AND (an unexpired credit pack OR an active admin-granted paid plan).';

revoke all on function public.has_active_plan(uuid) from public;
grant execute on function public.has_active_plan(uuid) to authenticated;


-- ════════════════════════════════════════════════════════════════════════════
--  PART 8 — profiles.phone, AND CLOSING A PRIVILEGE-ESCALATION HOLE
--
--  ── THE HOLE ──────────────────────────────────────────────────────────────
--  0001 shipped this policy:
--
--      create policy "profiles: update own" on public.profiles for update
--        using (auth.uid() = id) with check (auth.uid() = id);
--
--  RLS is ROW-level. That policy says "you may update your own row" and says
--  nothing about WHICH COLUMNS — and Supabase grants `authenticated` UPDATE on
--  every column of every public table by default. So any signed-in user could
--  call the public REST API against their own row and set:
--
--      { "role": "admin" }   → full /admin access; src/lib/admin.ts trusts this
--                              column and nothing else
--      { "plan": "pro"   }   → is_paid_plan() true → autofill free, forever
--      { "status":"active"}  → un-block themselves after being blocked
--
--  The first is a total account takeover of the admin panel. The second walks
--  straight past the billing this migration exists to add — there is no point
--  charging ₹99 for a pack if one PATCH grants the same thing for nothing.
--
--  ── THE FIX ───────────────────────────────────────────────────────────────
--  Column-level grants, which is the mechanism RLS deliberately does not cover.
--  The row policy above still decides WHICH row; these decide which COLUMNS.
--
--  The admin panel is unaffected: every admin mutation in
--  src/app/admin/users/[id]/actions.ts runs through the SERVICE ROLE, which
--  bypasses both RLS and these grants. The only user-facing write is
--  src/app/dashboard/settings/actions.ts, which sets full_name — still allowed.
-- ════════════════════════════════════════════════════════════════════════════

-- Cashfree requires a 10-digit customer_phone on every order. Collected once at
-- checkout and kept, so a repeat purchase does not ask again — and so support,
-- which runs on WhatsApp, can match a payment to a seller.
alter table public.profiles add column if not exists phone text;

revoke update on public.profiles from anon, authenticated;
grant  update (full_name, phone) on public.profiles to authenticated;

-- anon has no business writing a profile at all.
revoke insert, delete on public.profiles from anon, authenticated;
