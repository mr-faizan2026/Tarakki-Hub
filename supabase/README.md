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

Run them **in order**, `0001` then `0002`. Both are idempotent (safe to run
more than once). Pick one method:

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
