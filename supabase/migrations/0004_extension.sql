-- ============================================================================
-- TarakkiHub — Chrome extension control plane (run AFTER 0001 → 0003)
--
-- Everything Part 3 of the extension needs on the server:
--   • extension_devices      — one row per install; the device limit lives here
--   • extension_events       — adapter health checks (NO form or personal data)
--   • credit_claims          — idempotency ledger, so a network retry of an
--                              export cannot charge a second credit
--   • app_settings keys      — adapter_config, kill_switches, min/latest version
--   • extension_device_limit()    — per-plan cap, read from plans.limits
--   • extension_device_list()     — the list the panel shows at the cap
--   • register_extension_device() — register / reclaim, enforce the cap
--   • revoke_extension_device()   — sign one install out
--   • extension_heartbeat()       — the one call that says "still allowed"
--   • consume_credit_for()        — consume_credit, keyed to a device AND an
--                                   idempotency key
--   • record_extension_events()   — batched health insert, field-filtered
--
-- WHO CALLS WHAT. The extension never touches these tables: every one is
-- RLS-on with no client write policy, and EXECUTE on every function below is
-- revoked from public. The extension talks to /api/extension/* on the web app,
-- which verifies the caller's Supabase JWT and then calls these with the
-- service role. That is deliberate — a device limit the client evaluates is not
-- a limit, and an idempotency key the client can skip is not one either.
--
-- Read-own policies ARE granted where a seller sees their own rows (devices).
-- Nothing here lets one account see another's.
--
-- Idempotent: safe to run more than once.
--
-- ── RUNNING THIS ───────────────────────────────────────────────────────────
-- Paste the WHOLE file into the Supabase SQL Editor and Run. Two things to know:
--
--   1. The editor runs your SELECTION if any text is selected. Click once in the
--      editor and press Ctrl/Cmd+A before Run, or make sure nothing is selected.
--   2. If it reports "unterminated dollar-quoted string" the editor has split the
--      script inside a function body. Run the eleven PART blocks below one at a
--      time instead — each is complete on its own and safe to re-run.
--
-- Every function body uses a NAMED dollar tag rather than a bare pair, for
-- exactly that reason.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — settings the admin panel edits
--
-- adapter_config is DATA, never code. The extension merges it over its bundled
-- defaults and validates it against a schema before use; an invalid or
-- unreachable config falls back to the bundled defaults. Nothing in it is ever
-- evaluated, injected as a script, or passed to Function().
--
-- Shape (every key optional — only the keys present override a default):
--   {
--     "version": 3,
--     "shipping": { "labels": [...], "negative": [...], "maxClimb": 4 },
--     "form":     { "anchorText": [...], "excludeSelectors": [...],
--                   "minControls": 3, "minAnchors": 2,
--                   "coverage": { "preferred": 0.9, "fallback": 0.6 } },
--     "labels":   { "maxLen": 90, "sectionMaxLen": 60,
--                   "defaultSection": "Listing details",
--                   "placeholderNoise": "^(\\s*|select|choose)$" },
--     "dropdown": { "selectors": [...], "listbox": [...], "option": [...],
--                   "confirmLabels": [...] },
--     "timing":   { "settleQuietMs": 350, "maxPasses": 4, ... },
--     "fuzzyThreshold": 0.82
--   }
--
-- BUMP "version" ON EVERY EDIT. The extension re-fetches when a heartbeat
-- reports a version newer than its cached one; an edit that leaves the version
-- alone reaches nobody until their next browser restart.
--
-- kill_switches turns one feature off for everyone, with the message the panel
-- shows inside that feature's own card:
--   { "live_shipping":   { "enabled": true },
--     "image_generator": { "enabled": true },
--     "autofill":        { "enabled": false,
--                          "message": "Paused while Meesho changes its form." } }
-- ════════════════════════════════════════════════════════════════════════════

insert into public.app_settings (key, value) values
  ('adapter_config',     '{"version": 1}'::jsonb),
  ('kill_switches',      '{"live_shipping": {"enabled": true}, "image_generator": {"enabled": true}, "autofill": {"enabled": true}}'::jsonb),
  ('ext_min_version',    '"0.0.0"'::jsonb),
  ('ext_latest_version', '"0.1.0"'::jsonb),
  ('ext_device_limit',   '2'::jsonb)
on conflict (key) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — extension_devices
--
-- device_id is a random UUID the extension generates on first install and keeps
-- in chrome.storage.local. It is NOT a fingerprint: it identifies an install,
-- not a machine or a person, and a reinstall simply looks like a new device the
-- seller can sign out from the panel.
--
-- A revoked row is KEPT rather than deleted, so the install that was signed out
-- gets a clean "signed out on another device" answer at its next heartbeat
-- instead of silently re-registering itself.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.extension_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  device_id    text not null,
  -- "Chrome on Windows" — what the seller reads in the device list.
  label        text,
  ext_version  text,
  status       text not null default 'active',
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, device_id)
);

do $devices_status$
begin
  if not exists (select 1 from pg_constraint where conname = 'extension_devices_status_check') then
    alter table public.extension_devices
      add constraint extension_devices_status_check check (status in ('active', 'revoked'));
  end if;
end$devices_status$;

create index if not exists extension_devices_user_idx
  on public.extension_devices (user_id, status, last_seen_at desc);

alter table public.extension_devices enable row level security;

-- The dashboard shows a seller their own devices. Every write stays server-side.
drop policy if exists "extension_devices: read own" on public.extension_devices;
create policy "extension_devices: read own"
  on public.extension_devices for select
  using (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — extension_events (adapter health)
--
-- WHAT MAY GO IN HERE, exactly: a feature name, a check key, ok/not_found/error,
-- the extension version, the device id, and a URL PATH with every id segment
-- replaced by ":id". Nothing else. No form values, no product names, no prices,
-- no seller details. `detail` carries a short adapter-side reason ("listbox
-- empty") and is length-capped on the way in.
--
-- No client write policy: events arrive through /api/extension/events, which
-- rate-limits them per device, and are filtered again by
-- record_extension_events() below.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.extension_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete set null,
  device_id   text,
  ext_version text,
  feature     text not null,
  check_key   text not null,
  status      text not null,
  path        text,
  detail      text,
  created_at  timestamptz not null default now()
);

do $events_status$
begin
  if not exists (select 1 from pg_constraint where conname = 'extension_events_status_check') then
    alter table public.extension_events
      add constraint extension_events_status_check
      check (status in ('ok', 'not_found', 'error'));
  end if;
end$events_status$;

create index if not exists extension_events_recent_idx
  on public.extension_events (created_at desc);
create index if not exists extension_events_check_idx
  on public.extension_events (feature, check_key, created_at desc);

alter table public.extension_events enable row level security;
-- Deliberately no policies: written by the service role, read in /admin only.


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — credit_claims (idempotency)
--
-- One row per final export, keyed by the idempotency key the extension minted
-- for it. The usage row returned the FIRST time is stored verbatim, so a retry
-- of the same export replays that answer instead of charging again.
--
-- This is the half of "never charge twice" that has to live on the server. The
-- extension's own "charged once per run" flag sits in a service worker Chrome is
-- free to kill mid-export; this row does not.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.credit_claims (
  idempotency_key text primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  device_id       text,
  action          text not null,
  amount          int not null,
  -- The usage row as it stood after the charge. '{}' means "claimed but the
  -- transaction did not finish" — see the replay path in PART 10.
  usage_snapshot  jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists credit_claims_user_idx
  on public.credit_claims (user_id, created_at desc);

alter table public.credit_claims enable row level security;
-- No policies: only the service role writes, only through consume_credit_for().


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — extension_device_limit(uid)
--
-- How many simultaneous installs this account may keep signed in.
-- Per-plan override first (plans.limits ->> 'devices'), then the global
-- app_settings default, then 2. Never below 1.
--
-- To give a tier more devices:
--     update public.plans
--        set limits = limits || '{"devices": 5}'::jsonb
--      where name = 'Pro';
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.extension_device_limit(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $extension_device_limit$
  select greatest(
    1,
    coalesce(
      (select (pl.limits ->> 'devices')::int
         from public.profiles p
         join public.plans pl on lower(btrim(pl.name)) = lower(btrim(p.plan))
        where p.id = p_user and jsonb_exists(pl.limits, 'devices')
        limit 1),
      (select nullif(value #>> '{}', '')::int
         from public.app_settings where key = 'ext_device_limit'),
      2
    )
  )
$extension_device_limit$;

comment on function public.extension_device_limit(uuid) is
  'Simultaneous extension installs allowed: plans.limits.devices, else app_settings.ext_device_limit, else 2.';

revoke all on function public.extension_device_limit(uuid) from public;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — extension_device_list(uid)
--
-- The list the panel shows when it has to ask the seller which install to sign
-- out. Deliberately thin: no IP, no user agent beyond the label the extension
-- supplied about itself.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.extension_device_list(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $extension_device_list$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'device_id',    d.device_id,
        'label',        d.label,
        'ext_version',  d.ext_version,
        'last_seen_at', d.last_seen_at,
        'created_at',   d.created_at
      )
      order by d.last_seen_at desc
    ),
    '[]'::jsonb
  )
  from public.extension_devices d
  where d.user_id = p_user and d.status = 'active'
$extension_device_list$;

revoke all on function public.extension_device_list(uuid) from public;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 7 — register_extension_device()
--
-- Returns a jsonb envelope rather than raising, because "you are at your device
-- limit" is a normal answer the panel renders as a device list, not an error:
--
--   { "ok": true,  "device": {...}, "limit": 2, "devices": [...] }
--   { "ok": false, "code": "device_limit", "limit": 2, "devices": [...] }
--   { "ok": false, "code": "account_blocked" }
--
-- An existing row for this (user, device_id) is REACTIVATED rather than counted
-- against the limit — a reinstall, or signing back in on the same install, is
-- the same device. Only a genuinely new device_id can hit the cap, and hitting
-- it is never bypassed: the seller must sign one out first.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.register_extension_device(
  p_user      uuid,
  p_device_id text,
  p_label     text default null,
  p_version   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $register_extension_device$
declare
  v_limit  int;
  v_count  int;
  v_row    public.extension_devices;
  v_known  boolean;
begin
  if p_user is null or coalesce(btrim(p_device_id), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'bad_request');
  end if;

  if exists (select 1 from public.profiles where id = p_user and status = 'blocked') then
    return jsonb_build_object('ok', false, 'code', 'account_blocked');
  end if;

  v_limit := public.extension_device_limit(p_user);

  select exists (
    select 1 from public.extension_devices
     where user_id = p_user and device_id = p_device_id
  ) into v_known;

  if not v_known then
    select count(*) into v_count
      from public.extension_devices
     where user_id = p_user and status = 'active';

    if v_count >= v_limit then
      return jsonb_build_object(
        'ok', false,
        'code', 'device_limit',
        'limit', v_limit,
        'devices', public.extension_device_list(p_user)
      );
    end if;
  end if;

  insert into public.extension_devices
    (user_id, device_id, label, ext_version, status, last_seen_at, revoked_at)
  values
    (p_user, p_device_id, nullif(btrim(p_label), ''), nullif(btrim(p_version), ''),
     'active', now(), null)
  on conflict (user_id, device_id) do update
    set status       = 'active',
        revoked_at   = null,
        label        = coalesce(nullif(btrim(excluded.label), ''), public.extension_devices.label),
        ext_version  = coalesce(nullif(btrim(excluded.ext_version), ''), public.extension_devices.ext_version),
        last_seen_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'limit', v_limit,
    'device', to_jsonb(v_row),
    'devices', public.extension_device_list(p_user)
  );
end;
$register_extension_device$;

revoke all on function public.register_extension_device(uuid, text, text, text) from public;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 8 — revoke_extension_device()
--
-- Sign one install out. The revoked install learns about it at its next
-- heartbeat (device_ok = false) and signs itself out locally; until then it
-- still cannot spend a credit, because consume_credit_for() checks the row too.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.revoke_extension_device(
  p_user      uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $revoke_extension_device$
declare
  v_found boolean;
begin
  update public.extension_devices
     set status = 'revoked', revoked_at = now()
   where user_id = p_user and device_id = p_device_id and status = 'active';

  v_found := found;

  return jsonb_build_object(
    'ok', true,
    'revoked', v_found,
    'devices', public.extension_device_list(p_user)
  );
end;
$revoke_extension_device$;

revoke all on function public.revoke_extension_device(uuid, text) from public;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 9 — extension_heartbeat()
--
-- THE periodic call. One round trip answers every question the extension has to
-- re-ask: is this device still allowed, is the account still live, what plan and
-- how many credits, is autofill unlocked, and has the admin changed the adapter
-- config, the kill switches or the version floor since last time.
--
-- It also stamps last_seen_at, which is what makes the device list meaningful.
--
-- device_ok is false when the row is missing or revoked. The extension signs
-- itself out locally on that answer — and because the real gates are elsewhere
-- (RLS on autofill_profiles, consume_credit_for's own device check), a tampered
-- client that ignores the answer still cannot spend a credit or read a profile.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.extension_heartbeat(
  p_user      uuid,
  p_device_id text,
  p_version   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $extension_heartbeat$
declare
  v_profile public.profiles;
  v_usage   public.usage;
  v_device  public.extension_devices;
begin
  select * into v_profile from public.profiles where id = p_user;

  update public.extension_devices
     set last_seen_at = now(),
         ext_version  = coalesce(nullif(btrim(p_version), ''), ext_version)
   where user_id = p_user and device_id = p_device_id and status = 'active'
  returning * into v_device;

  select * into v_usage from public.usage where user_id = p_user;

  return jsonb_build_object(
    'ok', true,
    'device_ok', v_device.id is not null,
    'blocked', coalesce(v_profile.status, 'active') = 'blocked',
    'plan', coalesce(v_profile.plan, 'free'),
    'has_active_plan', public.has_active_plan(p_user),
    'credits_remaining', coalesce(v_usage.credits_remaining, 0),
    'images_used', coalesce(v_usage.images_used, 0),
    'device_limit', public.extension_device_limit(p_user),
    'devices', public.extension_device_list(p_user),
    'adapter_config_version', coalesce(
      (select value -> 'version' from public.app_settings where key = 'adapter_config'),
      '0'::jsonb),
    'min_version', coalesce(
      (select value #>> '{}' from public.app_settings where key = 'ext_min_version'),
      '0.0.0'),
    'latest_version', coalesce(
      (select value #>> '{}' from public.app_settings where key = 'ext_latest_version'),
      '0.0.0'),
    'kill_switches', coalesce(
      (select value from public.app_settings where key = 'kill_switches'),
      '{}'::jsonb)
  );
end;
$extension_heartbeat$;

revoke all on function public.extension_heartbeat(uuid, text, text) from public;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 10 — consume_credit_for()
--
-- consume_credit(), with the two things Part 3 adds:
--   • the device must be registered and active — a credit cannot be spent from
--     an install the seller has signed out;
--   • an idempotency key makes the charge replayable. The first call does the
--     work and stores the resulting usage row; every later call with the same
--     key returns that stored row and charges nothing.
--
-- The claim row is inserted BEFORE the decrement, in the same transaction, so
-- two concurrent retries of one export serialise on the primary key: the loser
-- gets unique_violation, waits for the winner to commit, re-reads the snapshot
-- and returns it.
--
-- THE '{}' CASE. If the winner's transaction dies between claiming the key and
-- writing the snapshot, the whole transaction rolls back — claim included — so
-- a later retry starts clean. A '{}' snapshot therefore only ever means "the
-- winner is still in flight"; we fall back to the live usage row rather than
-- returning a record of nulls, which would show the seller a zero balance.
--
-- Errors are raised (not enveloped) so the API route can map them to the codes
-- the panel already knows: no_credits, account_blocked, device_revoked.
-- ════════════════════════════════════════════════════════════════════════════
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

  select * into v_row from public.usage where user_id = p_user for update;

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
-- PART 11 — record_extension_events()
--
-- Batched health insert. Takes the array the extension sent and keeps only the
-- six allowed fields, length-capped. Belt and braces: the API route validates
-- too, but this is the last gate before the table, and "health events contain no
-- personal data" is a promise worth enforcing twice.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.record_extension_events(
  p_user      uuid,
  p_device_id text,
  p_version   text,
  p_events    jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $record_extension_events$
declare
  v_inserted int := 0;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;

  insert into public.extension_events
    (user_id, device_id, ext_version, feature, check_key, status, path, detail)
  select
    p_user,
    nullif(btrim(p_device_id), ''),
    nullif(btrim(p_version), ''),
    left(e ->> 'feature', 40),
    left(e ->> 'check_key', 60),
    e ->> 'status',
    left(e ->> 'path', 200),
    left(e ->> 'detail', 200)
  from (
    select value as e
    from jsonb_array_elements(p_events)
    limit 50
  ) rows
  where e ->> 'feature' is not null
    and e ->> 'check_key' is not null
    and (e ->> 'status') in ('ok', 'not_found', 'error');

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$record_extension_events$;

revoke all on function public.record_extension_events(uuid, text, text, jsonb) from public;
