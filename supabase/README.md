# Supabase — schema, auth & storage

This folder holds the database migration for the TarakkiHub dashboard. The app
talks to Supabase for **auth**, the **database**, and **storage**. Row Level
Security is enabled on every table; the service-role key is used **server-side
only** and never shipped to the browser.

## 1. Environment variables

These live in `.env.local` at the repo root (already git-ignored — never commit
it):

```
NEXT_PUBLIC_SUPABASE_URL=...          # safe for the browser
NEXT_PUBLIC_SUPABASE_ANON_KEY=...     # safe for the browser
SUPABASE_SERVICE_ROLE_KEY=...         # server-only, keep secret
```

## 2. Apply the migrations

Run them **in order**, `0001` → `0002` → `0003` → `0004`. All four are idempotent
(safe to run more than once). Pick one method:

**A — Supabase dashboard (simplest)**
1. Open your project → **SQL Editor** → **New query**.
2. Paste the entire contents of `migrations/0001_init.sql`, **Run**. This
   creates the `profiles`, `templates`, `usage`, `image_exports`,
   `credit_events` and `plans` tables, the `product-images` storage bucket, the
   new-user trigger, and the `starter_credits()`, `consume_export_credit()` and
   `consume_credit()` functions.
3. Open another **New query**, paste `migrations/0002_admin.sql`, **Run**. This
   adds everything the **/admin panel** needs (see
   [§5 Admin panel](#5-admin-panel--access-control) below).
4. Open another **New query**, paste `migrations/0003_autofill.sql`, **Run**.
   This adds the **Chrome extension's listing autofill** (see
   [§6 Autofill](#6-autofill--plan-gating-in-the-database) below).
5. Open another **New query**, paste `migrations/0004_extension.sql`, **Run**.
   This adds the **extension's control plane** — device registration and the
   device limit, the licence heartbeat, idempotent credit spends, adapter health
   events, and the `app_settings` rows the `/admin → Extension` page edits (see
   [§7 Extension control plane](#7-extension-control-plane) below).

> **If you get `unterminated dollar-quoted string`,** the editor sent only part
> of the script — it cut off inside a function body. Two things to check:
>
> - **The SQL Editor runs your selection if any text is selected.** Click once in
>   the editor and press `Ctrl`/`Cmd`+`A` before Run, or clear the selection.
> - Otherwise, run the `-- PART 1` … `-- PART n` blocks one at a time, in order
>   (`0003_autofill.sql` has seven, `0004_extension.sql` has eleven). Each block
>   is complete on its own and safe to re-run.
>
> The same applies to the `$$` blocks in `0001` and `0002`.

> **Upgrading / fixing an existing project?** The migration is idempotent — just
> paste and run the whole file again. Re-running it replaces the new-user trigger
> and functions, adds `credit_events`, and **back-fills** a profile + usage row
> (with the free starter credits) for any existing auth user who is missing one —
> so accounts that were stuck at 0 credits get their credits. It never overwrites
> rows that already exist.

**B — Supabase CLI**
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### What it creates

| Object | Purpose | RLS |
| --- | --- | --- |
| `profiles` | one row per user (name, role, plan) | read/update own row |
| `templates` | saved listing templates (fields + images JSON) | owner-only CRUD |
| `usage` | credit ledger (credits, used, period) | owner **read-only** |
| `image_exports` | one row per export, for usage tracking | owner **read-only** |
| `credit_events` | credit-usage log (date, action, credits) shown on the dashboard | owner **read-only** |
| `plans` | Free / Pro / Business scaffold (placeholder pricing) | public read |
| function `starter_credits()` | **single config value** for free signup credits (default 3) | — |
| trigger `on_auth_user_created` | auto-creates a profile + usage row (`starter_credits()` free credits) on signup | — |
| function `consume_credit(action, amount)` | atomically spend N credits + log a `credit_events` row (used by the extension) | `authenticated` only |
| function `consume_export_credit()` | legacy: spend 1 credit + log an export (server-side) | `authenticated` only |
| bucket `product-images` | private storage, namespaced `‹uid›/…` | per-user object policies |

**`0002_admin.sql` additionally creates:**

| Object | Purpose | RLS |
| --- | --- | --- |
| `profiles.status` | `active` / `blocked` — block enforcement | via profiles |
| `app_settings` | global config (editable starter-credit amount) | service role only |
| `plans.*` | adds `monthly_credits`, `price_amount`, `is_active` | public read |
| `subscriptions` | Cashfree-driven later; UI reads it now | read own; service-role writes |
| `payments` | Cashfree-driven later; empty placeholder | read own; service-role writes |
| `admin_actions` | audit log of every admin mutation | service role only |
| view `admin_users` | profiles+usage+auth join for the users table | **service role only** (revoked from anon/authenticated) |
| `consume_credit()` / `consume_export_credit()` | now **refuse blocked accounts** | `authenticated` only |
| `starter_credits()` | now reads the editable `app_settings` value | — |

**`0003_autofill.sql` additionally creates:**

| Object | Purpose | RLS |
| --- | --- | --- |
| `autofill_profiles` | one saved Meesho catalog form per row (`fields` jsonb) | owner-only CRUD **and** an active paid plan |
| `fill_events` | one row per autofill run (usage stats) | owner read + insert |
| function `is_paid_plan(text)` | the single definition of "paid" | — |
| function `has_active_plan(uid)` | **the autofill gate** — not blocked + an active, unexpired paid plan | `authenticated` only |
| function `autofill_profile_limit(uid)` | per-plan profile cap, read from `plans.limits` (NULL = unlimited) | `authenticated` only |
| trigger `autofill_profiles_enforce_limit` | raises `profile_limit_reached` on insert past the cap | — |
| function `record_fill_event(...)` | logs a run **and** bumps `used_count` / `last_used_at`, atomically | `authenticated` only |

## 3. Configure Auth (one-time, in the dashboard)

**Auth → URL Configuration**
- **Site URL:** `http://localhost:3000` for local dev (swap to your production
  URL when you deploy).
- **Redirect URLs:** add `http://localhost:3000/**` (and your production
  equivalent). This allowlists the confirmation / password-reset redirects.

**Email confirmation** is currently **on** (`mailer_autoconfirm = false`), so new
users must click a link in their email before they can sign in. The app handles
this: signup shows a "confirm your email" state, and the confirmation link is
caught by `/auth/callback` (PKCE `?code=`) or `/auth/confirm` (`token_hash`).

**Optional — email templates.** The default templates work out of the box (they
route through `/auth/callback`). If you'd rather use the token-hash flow, set the
**Confirm signup** and **Reset password** templates to:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/dashboard
```

(use `&next=/reset-password` for the reset-password template).

## 4. Verify

1. `npm run dev`, open `http://localhost:3000/signup`, create an account.
2. Confirm via the email link → you land on `/dashboard` with 3 credits
   (Overview and the Credits page both show `3`).
3. In the Supabase dashboard, check that a `profiles` and `usage` row now exist
   for the new user.

## 5. Admin panel & access control

The admin panel lives at **`/admin`** and is a separate area from the user
dashboard. It's for the platform owner to manage users, plans, credits,
subscriptions and payments.

### Make the first admin

There is **no public "become admin" path** — you promote the first admin by
hand in the Supabase **SQL Editor** (run `0002_admin.sql` first). Replace the
email with yours:

```sql
update public.profiles
  set role = 'admin'
  where id = (select id from auth.users where email = 'you@example.com');
```

Sign out and back in, and you'll see an **Admin panel** link in the dashboard
sidebar. After that, an admin can grant/revoke the role for other users from
the panel itself (Users → open a user → Role).

### How access is enforced (airtight, server-side)

- **Route gate.** `proxy.ts` requires a session for `/admin`; with none it
  redirects to `/login`.
- **Role gate.** Every admin page/layout calls `requireAdmin()`
  ([`src/lib/admin.ts`](../src/lib/admin.ts)), which reads the caller's *own*
  profile through the cookie-bound (RLS-scoped) client and redirects non-admins
  to `/dashboard` and blocked users to `/blocked`. A client can never spoof
  this.
- **Mutations.** Every admin action re-checks admin status with
  `authorizeAdminAction()` **before** it touches anything, and only then uses
  the **service role** (server-only key). RLS is never opened to the client.
- **Blocked users.** Setting `profiles.status = 'blocked'` bounces them out of
  the dashboard/admin *and* makes the `consume_credit()` DB functions refuse
  them — so the Chrome extension stops working for them at the database level,
  not just in the UI.
- **The `admin_users` view** (which exposes emails) is revoked from the
  `anon`/`authenticated` PostgREST roles; only the server, holding the
  service-role key, can read it.

> **Cashfree not wired yet.** Payments and real subscription status are
> clearly-marked placeholders. The `payments`/`subscriptions` tables and their
> admin screens already read live data, so they fill in automatically once the
> Cashfree webhook handler writes to those tables — no mock data is shown.

## 6. Autofill — plan gating in the database

The Chrome extension's **listing autofill** (save a filled Meesho catalog form
once, fill the next one in a click) is for **paid plans only**, and that rule is
enforced by Postgres, not by the extension.

Every policy on `autofill_profiles` — `select` included — requires
`public.has_active_plan(auth.uid())`. A free, expired or blocked account gets an
empty list and a rejected write no matter what the client asks for, so tampering
with the extension gains nothing. The panel's locked state is showing the seller
a decision the database has already made.

`has_active_plan(uid)` is true only when **all** of these hold:

1. the account exists and `profiles.status` is not `blocked`;
2. its `profiles.plan` is a paid tier (`is_paid_plan()` — anything but `free`);
3. if a `subscriptions` row exists **for that plan**, it is `active` and its
   `renewal_at` has not passed. No subscription row for that plan means an admin
   granted it directly, which stays valid.

Rule 3 is what makes "hasn't expired" real: the moment a subscription flips to
`expired`/`cancelled`, or `renewal_at` slips into the past, the policies stop
returning rows — mid-session, without the extension having to co-operate.

**Autofill costs no credits.** Credits stay reserved for the low-shipping image
(`consume_credit()`); autofill access is by plan alone.

**Capping profiles per plan** is optional and off by default (paid plans are
unlimited). To cap a tier, add the key to that plan's `limits` jsonb:

```sql
update public.plans
   set limits = limits || '{"autofill_profiles": 10}'::jsonb
 where name = 'Pro';
```

An insert past the cap raises `profile_limit_reached`, which the extension turns
into "Your plan's profile limit is full. Delete one to save another."

`fill_events` is deliberately **not** plan-gated: a seller whose plan lapsed can
still see their own history. The gate belongs on the feature, not on the log of
what already happened.

## 7. Extension control plane

`0004_extension.sql` adds the tables and functions the Chrome extension's Part 3
needs. The shape of it matters more than the list: **the extension never touches
any of these tables.** Every one is RLS-on with no client write policy, and
`EXECUTE` on every function is revoked from `public`.

The extension talks to `/api/extension/*` on the web app, which verifies the
caller's Supabase JWT and then calls these functions with the service role. That
is deliberate — a device limit the client could evaluate is not a limit, and an
idempotency key the client could skip is not one either. No endpoint ever takes a
user id from a request body; it comes from the verified token.

### What it adds

| Object | What it is for |
| --- | --- |
| `extension_devices` | One row per install. `device_id` is a random UUID the extension generates on first install — **not** a fingerprint. Revoked rows are kept, so a signed-out install gets a clean answer instead of silently re-registering. Sellers may read their own rows; writes are server-side. |
| `extension_events` | Adapter health checks. A feature name, a check name, `ok`/`not_found`/`error`, the extension version, the device id, and a URL path with every id replaced by `:id`. **Nothing else, ever** — `record_extension_events()` keeps only those fields, and the API route filters first. |
| `credit_claims` | The idempotency ledger. One row per export, keyed by the key the extension minted for it. The primary key is what makes "charged once" true. |
| `extension_device_limit(uid)` | Devices allowed: `plans.limits.devices`, else `app_settings.ext_device_limit`, else 2. |
| `register_extension_device(...)` | Registers or reactivates an install, enforcing the cap. Returns a jsonb envelope, because "you are at your limit" is a normal answer the panel renders as a device list, not an error. |
| `revoke_extension_device(...)` | Signs one install out. It finds out at its next heartbeat, and cannot spend a credit in the meantime. |
| `extension_heartbeat(...)` | The one periodic call: still allowed, blocked, plan, credits, device list, adapter config version, version floor, kill switches. Also stamps `last_seen_at`. |
| `consume_credit_for(...)` | `consume_credit()` plus a device check and an idempotency key. See the comment block in the migration for why the claim is inserted before the decrement. |

### The `app_settings` rows it seeds

All five are edited from **`/admin → Extension`**; you should not need to touch
them by hand.

| Key | What it does |
| --- | --- |
| `adapter_config` | Meesho selectors, label words and timings, as **data**. The extension validates it against a schema and merges it over its bundled defaults; anything invalid falls back to those defaults. **Nothing in it is ever executed.** |
| `kill_switches` | Pause `live_shipping`, `image_generator` or `autofill` for everyone, with the message the panel shows. |
| `ext_min_version` | Below this, the extension shows a blocking "please update" screen and does nothing else. |
| `ext_latest_version` | Above the running version, a quiet update notice. Set it **after** the Web Store approves a build, never before. |
| `ext_device_limit` | The global device default, overridable per plan. |

**Bump `adapter_config.version` on every edit** or nothing re-fetches. The admin
page does it for you; a manual `update` must do it too:

```sql
update public.app_settings
   set value = jsonb_set(value, '{version}', '5'::jsonb),
       updated_at = now()
 where key = 'adapter_config';
```

### Giving one plan more devices

```sql
update public.plans
   set limits = limits || '{"devices": 5}'::jsonb
 where name = 'Pro';
```

### Housekeeping

`extension_events` grows with use and nothing prunes it automatically, because a
scheduled job is one more thing to go wrong unnoticed. Trim it when it gets large
— the `/admin` page reads only the most recent 500 rows, and anything older than a
few weeks has already told you what it was going to:

```sql
delete from public.extension_events where created_at < now() - interval '30 days';
```

`credit_claims` is small (one row per export) and is worth keeping: it is the
record that answers "was I charged twice?".

## 7. Credit packs & Cashfree billing (`0005_billing.sql`)

Run it like the others: **SQL Editor → New query → paste → Run.** Idempotent.

It adds the **credit pack** model the product actually sells — one-time packs,
no subscription — on top of (not instead of) the plan model, so an admin can
still grant a plan by hand.

**What it creates**

| Object | Purpose |
| --- | --- |
| `credit_packs` | The catalogue, seeded with Starter / Growth / Pro / Ultimate. **This is where prices live** — the pricing page and `/api/checkout` both read it, so they cannot disagree. Public read. |
| `payments.pack_slug`, `.credits_granted`, `.validity_days`, `.granted_at` | What a payment bought, written at checkout from the catalogue. |
| `usage.paid_until` | When paid access ends. `null` for anyone who has never bought. |
| `profiles.phone` | Cashfree requires a 10-digit number on every order. |
| `grant_credit_pack(payment_id)` | The **only** thing that adds paid credits. Service-role only, idempotent, latched on `granted_at`. |
| `expire_credits_if_due(user)` | Zeroes a lapsed balance and logs it. |

**What it changes**

- `consume_credit()` and `consume_credit_for()` now expire a stale balance
  before spending. Credits genuinely expire now; before this, `usage.period_end`
  existed but nothing read it, so "30 days validity" would not have been true.
  An expired balance raises the existing `no_credits`, so the extension needs no
  change.
- `has_active_plan()` — the autofill gate — now passes for **an unexpired pack
  OR an admin-granted plan**. A seller who has spent every credit keeps autofill
  until their pack's validity runs out.

### ⚠️ It also closes a privilege-escalation hole

`0001` created `"profiles: update own"` with `using (auth.uid() = id)`. RLS is
**row**-level, so that policy let a signed-in user `PATCH` **any column of their
own row** through the public REST API:

```
{ "role": "admin" }    → full /admin access
{ "plan": "pro"   }    → autofill free, bypassing billing entirely
{ "status":"active"}   → un-block themselves
```

`0005` revokes column `UPDATE` from `authenticated` and re-grants only
`full_name` and `phone`. The admin panel is unaffected — every admin mutation
goes through the service role, which bypasses RLS and column grants.

**Run this migration before taking a single payment.**

### Environment variables

```
CASHFREE_APP_ID=          # Cashfree dashboard → Developers → API Keys
CASHFREE_SECRET_KEY=      # secret, server-only
CASHFREE_MODE=sandbox     # "production" must be set explicitly
NEXT_PUBLIC_SITE_URL=     # only when the origin can't be inferred
```

Leave the keys blank and the site still runs: packs render and checkout answers
*"payments aren't switched on"*.

### Cashfree dashboard setup

1. **Webhook URL** → `https://tarakkihub.com/api/webhooks/cashfree`, subscribed
   to the payment success/failed events.
2. Test in **sandbox** first. Cashfree cannot reach `localhost`, so locally the
   webhook never arrives — the billing page's own status poll settles the order
   instead. To exercise the real webhook, point `NEXT_PUBLIC_SITE_URL` at an
   ngrok/cloudflared tunnel.
3. `npm test` checks the webhook signature verification against Cashfree's
   documented algorithm. Run it after touching `src/lib/cashfree.ts`.
