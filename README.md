# TarakkiHub — Marketing site & design system

_Ecommerce. Growth. Freedom._

The public marketing site for **TarakkiHub**, a tool suite for Meesho sellers
(save a template once, autofill any catalog in one click, cut shipping cost,
know your margins). This repo also contains a **reusable design system** —
tokens, type scale, and primitives — that the future dashboard and admin panel
inherit.

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4** (CSS-first `@theme` tokens)
- **Framer Motion** for restrained, engineered motion
- Fonts: **Clash Display** (hero headlines) + **Satoshi** (everything else),
  self-hosted from Fontshare via `next/font/local`; **Fraunces italic** (one
  editorial accent) via `next/font/google`

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (static prerender)
```

## Design system

Everything is defined as tokens in [`src/app/globals.css`](src/app/globals.css)
under `@theme`, so the dashboard/admin can import the same language.

**Colour** — Teal (brand/growth) + Ink (stability/text) + warm neutrals. No
purple, no gradient soup. The Amber accent is used exactly once, by design.

| Token group | Examples |
| --- | --- |
| Surfaces | `canvas` `surface` `hairline` `canvas-sunk` |
| Teal | `teal-50 … teal-800` (brand `500`) |
| Ink | `ink-100 … ink-900` (brand `800`) |
| Accent | `amber-500` (rare) |

**Type** — Fluid modular scale via `clamp()`. Utilities: `text-display-xl`,
`text-display`, `text-h2/h3/h4`, `text-lead`, `text-body`, `text-small`,
`text-eyebrow`, `text-micro`. Families: `font-display` (Clash), `font-sans`
(Satoshi), `font-serif` (Fraunces), `font-mono`.

**Radii** — small and deliberate (`3–16px`), never `rounded-3xl` on everything.

**Custom utilities** — `bg-dotgrid`, `wash-teal`, `wash-ink`, `label-mono`,
`caret-blink`.

### Primitives (`src/components/ui`)

`Button` · `Container` · `Section` · `Eyebrow` · `Badge` · `Stat` · `Card`-like
`Accordion` · `PricingCard` · `TestimonialCard` · `Icon` (line-icon set, no
emoji) · `Logo`.

Motion helpers live in `src/lib/motion.ts` and
`src/components/motion/Reveal.tsx`. Reduced motion is honoured globally via
`MotionConfig reducedMotion="user"` plus a CSS fallback.

## Structure

```
src/
  app/            layout, page composition, globals.css (tokens), icon.svg
  components/
    ui/           design-system primitives
    motion/       scroll-entrance wrappers
    site/         landing-page sections
  content/        product-true copy (features, testimonials, faqs, pricing)
  lib/            fonts, cn(), motion variants
  fonts/          self-hosted Satoshi + Clash Display woff2
```

## Editing pricing (scaffold)

Pricing is an **inert scaffold** — no real prices, no checkout.

1. Fill `price.monthly` / `price.yearly` in
   [`src/content/pricing.ts`](src/content/pricing.ts).
2. Set `PRICING_LIVE = true` in
   [`src/components/site/Pricing.tsx`](src/components/site/Pricing.tsx).
3. Wire the CTA `href`s to your signup/checkout flow.

The monthly/yearly toggle already works; only checkout is left to connect.

## Dashboard & Auth (Step 2)

The authenticated product — **Supabase** auth + database + storage, an
interactive **image tool** (react-konva), and the seller dashboard — lives
alongside the marketing site and inherits the exact same design system.

**Setup:** copy `.env.local` values from your Supabase project, then apply the
database migration. Full runbook: [`supabase/README.md`](supabase/README.md).

```
src/
  proxy.ts                 session refresh + route protection (Next 16 `proxy`)
  app/
    (auth)/                login · signup · forgot-password · reset-password
    auth/                  callback · confirm · signout route handlers
    dashboard/             overview · templates · image-tool · billing · settings
  components/
    auth/  dashboard/  templates/  image-tool/  settings/  billing/
  lib/
    supabase/              client · server · admin · proxy · types
    account · password · templates · image-tool · composite · stickers · storage
```

**Auth flow.** Email/password via Supabase Auth. Signup → email confirmation →
`/dashboard`. Passwords have a live strength meter and inline validation. All
`/dashboard` routes are gated in `proxy.ts` **and** re-checked server-side in the
dashboard layout (`getUser()`).

**Image tool.** Not AI generation — it re-frames a seller's own photo (border,
padding, background, draggable badges) and exports marketplace-ready sizes. Each
export spends one credit via the atomic `consume_export_credit()` RPC and is
logged to `image_exports`; exports are blocked at zero with an upgrade prompt.

**Security.** RLS on every table; the service-role key is server-only (guarded by
`server-only`); nothing sensitive is committed (`.env*` is git-ignored).

## Notes

- All section visuals are inline SVG/CSS — no raster images, so no layout shift
  and nothing to lazy-load.
- `/` prerenders as static HTML. Fonts are self-hosted and preloaded.
- TarakkiHub is an independent tool and is not affiliated with Meesho.
