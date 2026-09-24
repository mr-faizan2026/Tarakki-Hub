-- ============================================================================
-- TarakkiHub — Initial schema (profiles, templates, usage, exports,
-- credit_events, plans). New accounts get free starter credits (see
-- starter_credits(), default 3).
-- Row Level Security is ON for every table. Owner-scoped access throughout.
-- Run this once in the Supabase SQL Editor (or via `supabase db push`).
-- Safe to re-run: guarded with IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto; present by default on Supabase.
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- profiles — one row per auth user
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  role       text not null default 'user' check (role in ('user', 'admin')),
  plan       text not null default 'free',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- templates — saved listing templates, owner-only CRUD
-- ----------------------------------------------------------------------------
create table if not exists public.templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null default 'Untitled template',
  category   text,
  fields     jsonb not null default '{}'::jsonb,
  images     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_user_id_idx on public.templates (user_id);
create index if not exists templates_updated_at_idx on public.templates (updated_at desc);

alter table public.templates enable row level security;

drop policy if exists "templates: read own" on public.templates;
create policy "templates: read own"
  on public.templates for select
  using (auth.uid() = user_id);

drop policy if exists "templates: insert own" on public.templates;
create policy "templates: insert own"
  on public.templates for insert
  with check (auth.uid() = user_id);

drop policy if exists "templates: update own" on public.templates;
create policy "templates: update own"
  on public.templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "templates: delete own" on public.templates;
create policy "templates: delete own"
  on public.templates for delete
  using (auth.uid() = user_id);

-- keep updated_at fresh on every write
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists templates_touch_updated_at on public.templates;
create trigger templates_touch_updated_at
  before update on public.templates
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- usage — credit ledger, one row per user. Owner read-only.
-- Writes happen server-side via SECURITY DEFINER functions only.
-- ----------------------------------------------------------------------------
create table if not exists public.usage (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users (id) on delete cascade,
  credits_remaining int not null default 0,
  images_used       int not null default 0,
  period_start      timestamptz not null default now(),
  period_end        timestamptz not null default (now() + interval '30 days')
);

create index if not exists usage_user_id_idx on public.usage (user_id);

alter table public.usage enable row level security;

drop policy if exists "usage: read own" on public.usage;
create policy "usage: read own"
  on public.usage for select
  using (auth.uid() = user_id);
-- No insert/update/delete policies: only SECURITY DEFINER functions may write.

-- ----------------------------------------------------------------------------
-- image_exports — one row per export, for usage tracking. Owner read-only.
-- ----------------------------------------------------------------------------
create table if not exists public.image_exports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists image_exports_user_id_idx on public.image_exports (user_id);
create index if not exists image_exports_created_at_idx on public.image_exports (created_at desc);

alter table public.image_exports enable row level security;

drop policy if exists "image_exports: read own" on public.image_exports;
create policy "image_exports: read own"
  on public.image_exports for select
  using (auth.uid() = user_id);
-- Inserts only via consume_export_credit() below.

-- ----------------------------------------------------------------------------
-- credit_events — append-only credit-usage log, one row per spend. Owner
-- read-only. Written server-side by consume_credit() (called by the Chrome
-- extension). The web dashboard only reads this to show the usage history.
-- ----------------------------------------------------------------------------
create table if not exists public.credit_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null default 'Credit used',
  credits    int  not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists credit_events_user_id_idx on public.credit_events (user_id);
create index if not exists credit_events_created_at_idx on public.credit_events (created_at desc);

alter table public.credit_events enable row level security;

drop policy if exists "credit_events: read own" on public.credit_events;
create policy "credit_events: read own"
  on public.credit_events for select
  using (auth.uid() = user_id);
-- Inserts only via consume_credit() below.

-- ----------------------------------------------------------------------------
-- plans — public scaffold the admin panel will manage later. Public read.
-- ----------------------------------------------------------------------------
create table if not exists public.plans (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  price_placeholder text,
  limits            jsonb not null default '{}'::jsonb,
  features          jsonb not null default '[]'::jsonb,
  sort_order        int not null default 0
);

alter table public.plans enable row level security;

drop policy if exists "plans: public read" on public.plans;
create policy "plans: public read"
  on public.plans for select
  to anon, authenticated
  using (true);

-- Make plan names unique so the seed below can upsert idempotently (guarded so
-- re-running the migration doesn't error once the constraint exists).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plans_name_key') then
    alter table public.plans add constraint plans_name_key unique (name);
  end if;
end$$;

-- Seed / refresh the three placeholder tiers. Upsert by name keeps re-runs
-- idempotent and never duplicates rows.
insert into public.plans (name, price_placeholder, limits, features, sort_order)
values
  ('Free', 'Pricing launching soon',
   '{"credits": 3}'::jsonb,
   '["3 free credits to get started", "Chrome extension access", "Marketplace-ready image sizes"]'::jsonb,
   0),
  ('Pro', 'Pricing launching soon',
   '{"credits": 200}'::jsonb,
   '["200 credits / month", "Everything in the extension", "Batch processing", "Priority email support"]'::jsonb,
   1),
  ('Business', 'Pricing launching soon',
   '{"credits": 1000}'::jsonb,
   '["1,000 credits / month", "Everything in Pro", "Team seats (soon)", "Early access to new tools"]'::jsonb,
   2)
on conflict (name) do update set
  price_placeholder = excluded.price_placeholder,
  limits            = excluded.limits,
  features          = excluded.features,
  sort_order        = excluded.sort_order;

-- ----------------------------------------------------------------------------
-- starter_credits() — THE single config value for free signup credits.
-- Change the number here (and mirror it in src/lib/config.ts for UI copy) to
-- adjust how many credits every new account starts with. Default: 3.
-- ----------------------------------------------------------------------------
create or replace function public.starter_credits()
returns int
language sql
immutable
as $$
  select 3;
$$;

-- ----------------------------------------------------------------------------
-- New-user trigger — auto-create a profile + usage row with the free starter
-- credits (see starter_credits() above).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;

  insert into public.usage (user_id, credits_remaining, period_start, period_end)
  values (new.id, public.starter_credits(), now(), now() + interval '30 days')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Backfill — the trigger only fires on NEW signups. Any user who registered
-- before this schema/trigger existed has no profile or usage row, which shows
-- up as "0 credits". Give every such user their rows now, with the free starter
-- credits. Idempotent: only touches users who are missing a row.
-- ----------------------------------------------------------------------------
insert into public.profiles (id, full_name)
select u.id, nullif(trim(u.raw_user_meta_data ->> 'full_name'), '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.usage (user_id, credits_remaining, period_start, period_end)
select u.id, public.starter_credits(), now(), now() + interval '30 days'
from auth.users u
where not exists (select 1 from public.usage us where us.user_id = u.id);

-- ----------------------------------------------------------------------------
-- consume_export_credit() — atomic: check credit, decrement, log export.
-- SECURITY DEFINER so it can write to the owner-read-only usage/exports tables,
-- but it only ever acts on the calling user's own row (auth.uid()).
-- Raises 'no_credits' when the balance is exhausted.
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

  select * into row from public.usage where user_id = auth.uid() for update;

  if row is null then
    -- Defensive: create a row if somehow missing, with no starter credits.
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

-- ----------------------------------------------------------------------------
-- consume_credit(action, amount) — the general credit-spend entry point used by
-- the Chrome extension. Atomic: verifies the balance, decrements it, and logs a
-- credit_events row (date + action + credits) that the dashboard displays.
-- SECURITY DEFINER so it can write the owner-read-only tables, but it only ever
-- touches the calling user's own rows (auth.uid()).
-- Raises 'no_credits' when the balance can't cover the spend.
-- ----------------------------------------------------------------------------
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

  if p_amount is null or p_amount < 1 then
    raise exception 'invalid_amount';
  end if;

  select * into row from public.usage where user_id = auth.uid() for update;

  if row is null then
    -- Defensive: create a row if somehow missing, with no starter credits.
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
-- Storage — private bucket for uploaded product images + exports.
-- Objects are namespaced by user id: `<uid>/...`. Per-user access only.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', false)
on conflict (id) do nothing;

drop policy if exists "product-images: read own" on storage.objects;
create policy "product-images: read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "product-images: insert own" on storage.objects;
create policy "product-images: insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "product-images: update own" on storage.objects;
create policy "product-images: update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "product-images: delete own" on storage.objects;
create policy "product-images: delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
