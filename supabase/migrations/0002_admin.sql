-- ============================================================================
-- TarakkiHub — Admin panel support (run AFTER 0001_init.sql)
--
-- Adds everything the /admin panel needs on top of the base schema:
--   • profiles.status        — block / unblock a user
--   • app_settings           — global config (editable starter-credit amount)
--   • plans.*                — monthly_credits, price_amount, is_active
--   • subscriptions          — Cashfree-driven later; UI reads it now
--   • payments               — Cashfree-driven later; placeholder, no seed rows
--   • admin_actions          — audit log of every admin mutation
--   • block enforcement      — consume_credit()/consume_export_credit() refuse
--                              blocked accounts (kills the extension for them)
--   • starter_credits()      — now reads app_settings so admins can change it
--
-- Row Level Security stays ON for every table. All admin reads/writes go through
-- the Supabase service role on the server (bypasses RLS); nothing here opens a
-- client-side hole. Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles.status — 'active' | 'blocked'. A blocked user can't spend credits
-- (see consume_credit below) and is bounced out of the app server-side.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_status_check') then
    alter table public.profiles
      add constraint profiles_status_check check (status in ('active', 'blocked'));
  end if;
end$$;

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

-- ----------------------------------------------------------------------------
-- app_settings — tiny key/value store for global config. Only the service role
-- (admin server) and SECURITY DEFINER functions touch it; no client policies.
-- ----------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
-- Deliberately no policies: reads/writes happen server-side via the service role.

insert into public.app_settings (key, value)
values ('starter_credits', '3'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- plans — extend the existing scaffold with the fields the admin panel edits.
-- monthly_credits is the credit allotment; price_amount is the (placeholder)
-- numeric price Cashfree will use; is_active hides a plan without deleting it.
-- ----------------------------------------------------------------------------
alter table public.plans add column if not exists monthly_credits int not null default 0;
alter table public.plans add column if not exists price_amount numeric;
alter table public.plans add column if not exists is_active boolean not null default true;

-- Backfill monthly_credits from the original limits->>'credits' where unset.
update public.plans
  set monthly_credits = coalesce((limits ->> 'credits')::int, 0)
  where monthly_credits = 0 and (limits ? 'credits');

-- ----------------------------------------------------------------------------
-- subscriptions — one row per user subscription. Cashfree webhooks will drive
-- this later; for now the admin UI reads whatever exists. Owner may read own.
-- ----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  plan         text not null default 'free',
  status       text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  started_at   timestamptz not null default now(),
  renewal_at   timestamptz,
  provider     text,          -- 'cashfree' once wired
  provider_ref text,          -- Cashfree subscription id
  created_at   timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions: read own" on public.subscriptions;
create policy "subscriptions: read own"
  on public.subscriptions for select
  using (auth.uid() = user_id);
-- Writes: service role only (admin server + future Cashfree webhook).

-- ----------------------------------------------------------------------------
-- payments — transaction ledger. PLACEHOLDER: Cashfree isn't wired yet, so this
-- stays empty until real checkout lands. No seed / mock rows on purpose.
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  amount       numeric not null default 0,
  currency     text not null default 'INR',
  plan         text,
  status       text not null default 'pending' check (status in ('pending', 'success', 'failed', 'refunded')),
  provider     text,          -- 'cashfree' once wired
  provider_ref text,          -- Cashfree order / payment id
  created_at   timestamptz not null default now()
);

create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_created_at_idx on public.payments (created_at desc);

alter table public.payments enable row level security;

drop policy if exists "payments: read own" on public.payments;
create policy "payments: read own"
  on public.payments for select
  using (auth.uid() = user_id);
-- Writes: service role only (future Cashfree webhook).

-- ----------------------------------------------------------------------------
-- admin_actions — append-only audit log. Every admin mutation writes one row.
-- Read/write via the service role only (no client policies).
-- ----------------------------------------------------------------------------
create table if not exists public.admin_actions (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid references auth.users (id) on delete set null,
  admin_email    text,
  action         text not null,
  target_user_id uuid references auth.users (id) on delete set null,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_actions_created_at_idx on public.admin_actions (created_at desc);
create index if not exists admin_actions_target_idx on public.admin_actions (target_user_id);

alter table public.admin_actions enable row level security;
-- Deliberately no policies: the admin server reads/writes it via the service role.

-- ----------------------------------------------------------------------------
-- starter_credits() — now reads the editable value from app_settings, falling
-- back to 3. SECURITY DEFINER + STABLE so it works from the signup trigger and
-- ignores RLS on app_settings.
-- ----------------------------------------------------------------------------
create or replace function public.starter_credits()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (value #>> '{}')::int from public.app_settings where key = 'starter_credits'),
    3
  );
$$;

-- ----------------------------------------------------------------------------
-- Re-create the credit-spend functions with a BLOCK CHECK up front. A blocked
-- profile can no longer spend credits, so the Chrome extension stops working
-- for them at the database level — not just in the UI.
-- ----------------------------------------------------------------------------
create or replace function public.consume_export_credit()
returns public.usage
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.usage;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid() and status = 'blocked') then
    raise exception 'account_blocked';
  end if;

  select * into row from public.usage where user_id = auth.uid() for update;

  if row is null then
    insert into public.usage (user_id, credits_remaining) values (auth.uid(), 0)
    returning * into row;
  end if;

  if row.credits_remaining <= 0 then
    raise exception 'no_credits';
  end if;

  update public.usage
    set credits_remaining = credits_remaining - 1,
        images_used = images_used + 1
    where user_id = auth.uid()
    returning * into row;

  insert into public.image_exports (user_id) values (auth.uid());

  return row;
end;
$$;

revoke all on function public.consume_export_credit() from public;
grant execute on function public.consume_export_credit() to authenticated;

create or replace function public.consume_credit(
  p_action text default 'Credit used',
  p_amount int  default 1
)
returns public.usage
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.usage;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid() and status = 'blocked') then
    raise exception 'account_blocked';
  end if;

  if p_amount is null or p_amount < 1 then
    raise exception 'invalid_amount';
  end if;

  select * into row from public.usage where user_id = auth.uid() for update;

  if row is null then
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
$$;

revoke all on function public.consume_credit(text, int) from public;
grant execute on function public.consume_credit(text, int) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_users — a read view the admin panel queries (via the SERVICE ROLE only)
-- to list/search/filter users. It joins profiles + usage + auth.users so the
-- email (which lives in auth.users) is searchable in one query.
--
-- SECURITY: this view exposes every user's email, so access is locked down to
-- the service role. We revoke it from the PostgREST roles (anon/authenticated)
-- so it can NEVER be read from the client — only the server, holding the
-- service-role key, can select from it.
-- ----------------------------------------------------------------------------
create or replace view public.admin_users as
select
  p.id,
  p.full_name,
  p.role,
  p.plan,
  p.status,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  coalesce(us.credits_remaining, 0) as credits_remaining,
  coalesce(us.images_used, 0)       as images_used
from public.profiles p
join auth.users u on u.id = p.id
left join public.usage us on us.user_id = p.id;

revoke all on public.admin_users from anon, authenticated;

-- ----------------------------------------------------------------------------
-- FIRST ADMIN — there is no public "become admin" path. Promote your own
-- account by running this once, replacing the email:
--
--   update public.profiles
--     set role = 'admin'
--     where id = (select id from auth.users where email = 'you@example.com');
--
-- After that, the /admin panel lets an admin grant/revoke the role for others.
-- ----------------------------------------------------------------------------
