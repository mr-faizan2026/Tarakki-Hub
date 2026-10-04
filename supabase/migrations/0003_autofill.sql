-- ============================================================================
-- TarakkiHub — Autofill profiles (run AFTER 0001_init.sql and 0002_admin.sql)
--
-- Adds everything Part 2 of the Chrome extension needs:
--   • autofill_profiles     — one saved Meesho catalog form per row
--   • fill_events           — one row per autofill run (usage stats)
--   • is_paid_plan()        — what counts as a paid tier
--   • has_active_plan()     — THE gate: not blocked + an active, unexpired paid
--                             plan. Every autofill_profiles policy requires it,
--                             so a free / expired / blocked account cannot read
--                             or save profiles even with a tampered extension.
--   • autofill_profile_limit() + insert trigger — per-plan profile cap, read
--                             from plans.limits (default: unlimited on paid).
--   • record_fill_event()   — atomic "log the run + bump used_count".
--
-- Autofill does NOT consume credits: credits stay reserved for the low-shipping
-- image (see consume_credit in 0001/0002). Access is by plan alone.
--
-- Row Level Security stays ON for every table. Idempotent: safe to re-run.
--
-- ── RUNNING THIS ───────────────────────────────────────────────────────────
-- Paste the WHOLE file into the Supabase SQL Editor and Run. Two things to know:
--
--   1. The editor runs your SELECTION if any text is selected. Click once in the
--      editor and press Ctrl/Cmd+A before Run, or make sure nothing is selected.
--   2. If it still reports "unterminated dollar-quoted string", the editor cut
--      the script inside a function body. Run the seven PART blocks below one at
--      a time instead — each is complete on its own and safe to re-run.
--
-- Every function body is wrapped in a named dollar tag rather than a bare pair,
-- and the read-only ones are single statements with no semicolons inside, which
-- keeps them intact even through a client that splits scripts naively.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — is_paid_plan(plan)
-- The single definition of "paid", so the gate, the limit lookup and any future
-- billing code can never disagree.
--
-- Everything except the free tier is paid. Plan names come from public.plans and
-- are stored lower-cased on profiles.plan by the admin panel, so this compares
-- case-insensitively and treats a missing/blank plan as free.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.is_paid_plan(p_plan text)
returns boolean
language sql
immutable
as $is_paid_plan$
  select lower(btrim(coalesce(p_plan, ''))) not in ('', 'free')
$is_paid_plan$;

comment on function public.is_paid_plan(text) is
  'True for every tier except the free one. Add new free-equivalent tier names here.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — has_active_plan(uid), the autofill gate
--
-- True only when ALL of these hold:
--   1. the account exists and is not blocked;
--   2. its effective plan (profiles.plan, kept in sync by the admin panel and
--      later by the Cashfree webhook) is a paid tier;
--   3. if the account has ANY subscription row for that plan, at least one of
--      them is 'active' with an unexpired renewal date. No subscription row for
--      that plan means an admin granted it directly, which stays valid; and a
--      renewal that inserts a fresh active row wins over an old expired one.
--
-- Rule 3 is what makes "hasn't expired" real: the moment the last active
-- subscription flips to expired/cancelled, or its renewal_at slips into the
-- past, the policies below stop returning rows — mid-session, without the
-- extension having to co-operate.
--
-- SECURITY DEFINER so RLS on profiles/subscriptions cannot hide the answer from
-- the policy that calls it. It reads nothing else and returns only a boolean.
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
      and public.is_paid_plan(p.plan)
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
$has_active_plan$;

comment on function public.has_active_plan(uuid) is
  'Autofill gate: not blocked + a paid plan whose subscription (if any) is active and unexpired.';

revoke all on function public.has_active_plan(uuid) from public;
grant execute on function public.has_active_plan(uuid) to authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — autofill_profiles
-- One saved Meesho catalog form. `fields` is the captured field array the
-- extension writes; see extension/src/lib/autofill-types.ts for the exact record
-- shape (key, label, normalizedLabel, section, type, value, occurrence, attrs).
--
-- PLAN GATING IN THE DATABASE. Every policy — read included — requires an active
-- paid plan, so a tampered extension gains nothing: a free or expired account
-- gets zero rows back and every write is rejected.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.autofill_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null default 'Untitled profile',
  category_path text,
  fields        jsonb not null default '[]'::jsonb,
  field_count   int not null default 0,
  used_count    int not null default 0,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists autofill_profiles_user_id_idx
  on public.autofill_profiles (user_id);

create index if not exists autofill_profiles_recent_idx
  on public.autofill_profiles (user_id, last_used_at desc nulls last, updated_at desc);

alter table public.autofill_profiles enable row level security;

drop policy if exists "autofill_profiles: read own" on public.autofill_profiles;
create policy "autofill_profiles: read own"
  on public.autofill_profiles for select
  using (auth.uid() = user_id and public.has_active_plan(auth.uid()));

drop policy if exists "autofill_profiles: insert own" on public.autofill_profiles;
create policy "autofill_profiles: insert own"
  on public.autofill_profiles for insert
  with check (auth.uid() = user_id and public.has_active_plan(auth.uid()));

drop policy if exists "autofill_profiles: update own" on public.autofill_profiles;
create policy "autofill_profiles: update own"
  on public.autofill_profiles for update
  using (auth.uid() = user_id and public.has_active_plan(auth.uid()))
  with check (auth.uid() = user_id and public.has_active_plan(auth.uid()));

drop policy if exists "autofill_profiles: delete own" on public.autofill_profiles;
create policy "autofill_profiles: delete own"
  on public.autofill_profiles for delete
  using (auth.uid() = user_id and public.has_active_plan(auth.uid()));

-- touch_updated_at() comes from 0001_init.sql.
drop trigger if exists autofill_profiles_touch_updated_at on public.autofill_profiles;
create trigger autofill_profiles_touch_updated_at
  before update on public.autofill_profiles
  for each row execute function public.touch_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — autofill_profile_limit(uid)
-- How many profiles this account may keep. NULL means unlimited, which is the
-- default for every paid plan.
--
-- To cap a tier, add the key to that plan's `limits` jsonb in public.plans:
--     update public.plans
--        set limits = limits || '{"autofill_profiles": 10}'::jsonb
--      where name = 'Pro';
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.autofill_profile_limit(uid uuid default auth.uid())
returns int
language sql
stable
security definer
set search_path = public
as $autofill_profile_limit$
  select (pl.limits ->> 'autofill_profiles')::int
  from public.profiles p
  join public.plans pl on lower(btrim(pl.name)) = lower(btrim(p.plan))
  where p.id = uid
    and jsonb_exists(pl.limits, 'autofill_profiles')
  limit 1
$autofill_profile_limit$;

revoke all on function public.autofill_profile_limit(uuid) from public;
grant execute on function public.autofill_profile_limit(uuid) to authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — enforce the cap on insert
-- A trigger (not a policy) so the client gets a named error it can turn into a
-- clear message instead of a bare RLS denial.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.enforce_autofill_profile_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $enforce_autofill_profile_limit$
declare
  v_limit int := public.autofill_profile_limit(new.user_id);
  v_count int;
begin
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_count
  from public.autofill_profiles
  where user_id = new.user_id;

  if v_count >= v_limit then
    raise exception 'profile_limit_reached';
  end if;

  return new;
end;
$enforce_autofill_profile_limit$;

drop trigger if exists autofill_profiles_enforce_limit on public.autofill_profiles;
create trigger autofill_profiles_enforce_limit
  before insert on public.autofill_profiles
  for each row execute function public.enforce_autofill_profile_limit();


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — fill_events
-- One row per autofill run. Powers "times used" and lets the web dashboard show
-- recent fills read-only.
--
-- Deliberately NOT plan-gated: a seller whose plan lapsed should still see their
-- own history. The gate belongs on the profiles (the actual feature), not on the
-- log of what already happened.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.fill_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  profile_id    uuid references public.autofill_profiles (id) on delete set null,
  filled_count  int not null default 0,
  skipped_count int not null default 0,
  failed_count  int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists fill_events_user_id_idx on public.fill_events (user_id);
create index if not exists fill_events_created_at_idx on public.fill_events (created_at desc);

alter table public.fill_events enable row level security;

drop policy if exists "fill_events: read own" on public.fill_events;
create policy "fill_events: read own"
  on public.fill_events for select
  using (auth.uid() = user_id);

drop policy if exists "fill_events: insert own" on public.fill_events;
create policy "fill_events: insert own"
  on public.fill_events for insert
  with check (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- PART 7 — record_fill_event()
-- One call that logs the run AND bumps the profile's used_count / last_used_at,
-- so the two cannot drift apart.
--
-- SECURITY DEFINER, but it checks ownership AND has_active_plan() itself before
-- touching anything, so it is no weaker than the policies above.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.record_fill_event(
  p_profile_id uuid,
  p_filled     int default 0,
  p_skipped    int default 0,
  p_failed     int default 0
)
returns public.autofill_profiles
language plpgsql
security definer
set search_path = public
as $record_fill_event$
declare
  v_row public.autofill_profiles;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.has_active_plan(auth.uid()) then
    raise exception 'plan_required';
  end if;

  select * into v_row
  from public.autofill_profiles
  where id = p_profile_id and user_id = auth.uid()
  for update;

  if v_row.id is null then
    raise exception 'profile_not_found';
  end if;

  insert into public.fill_events
    (user_id, profile_id, filled_count, skipped_count, failed_count)
  values
    (auth.uid(), v_row.id, greatest(coalesce(p_filled, 0), 0),
     greatest(coalesce(p_skipped, 0), 0), greatest(coalesce(p_failed, 0), 0));

  update public.autofill_profiles
     set used_count   = used_count + 1,
         last_used_at = now()
   where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$record_fill_event$;

revoke all on function public.record_fill_event(uuid, int, int, int) from public;
grant execute on function public.record_fill_event(uuid, int, int, int) to authenticated;
