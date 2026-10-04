import { report, type HealthReport } from "@/lib/health";
import { categoryPath, discoverFields, formRoot, readShipping } from "./meesho";
import { probeInstalled } from "./panel-context";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE PAGE SELF-TEST — "can the adapter still find what it needs here?"
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Runs once per supplier-panel page load, a moment after the page settles, and
 *  answers five questions with ok / not_found / error. Queued through
 *  lib/health.ts and sent in batches by the background.
 *
 *  ── WHAT THIS BUYS ────────────────────────────────────────────────────────
 *  Meesho changes its supplier panel without notice. Before this, the first
 *  signal was a support message days later, by which time the seller had already
 *  decided the tool was unreliable. Now /admin shows `form.root` dropping from
 *  98% found to 3% found within the hour, on a named path, and the fix is a
 *  selector edit in adapter_config rather than a release.
 *
 *  ── WHY EVERY PAGE AND NOT JUST THE FORM ──────────────────────────────────
 *  Because "the form wasn't found" is only meaningful next to "and this is the
 *  path it wasn't found on". Half the value of this data is learning which
 *  screens sellers actually reach — the catalog form has moved twice already.
 *  Pages with no form report `not_found`, which is correct and expected; the
 *  signal is the RATE on a given path changing, not any single row.
 *
 *  ── WHAT IS SENT ──────────────────────────────────────────────────────────
 *  A feature name, a check key, a status, the id-stripped path, and for two
 *  checks a BUCKETED count ("n=20-29"). Nothing else can leave here: a category
 *  name, a field label and a rupee figure are all things this file deliberately
 *  does not pass on, even though it has them in hand. `category.detected`
 *  reports WHETHER a breadcrumb was read, never what it said.
 */

export const FEATURE = {
  shipping: "shipping",
  form: "form",
  fill: "fill",
  image: "image",
  panel: "panel",
  category: "category",
} as const;

/**
 * Bucket a count so it is useful without being a measurement of the seller's
 * catalog. "Meesho's form went from ~30 controls to ~8" is the fact worth
 * knowing; the exact number on one listing is not.
 */
export function bucket(n: number): string {
  if (n <= 0) return "n=0";
  if (n < 10) return `n=${n}`;
  const lo = Math.floor(n / 10) * 10;
  return `n=${lo}-${lo + 9}`;
}

/**
 * Run the checks for this page load.
 *
 * `pageKey` is the content script's boot id plus the current href, so the same
 * check is reported once per page load but AGAIN after an SPA navigation — which
 * is what makes "it broke after they pressed Next" visible.
 *
 * Every check is individually wrapped: this walks markup we do not control, and a
 * self-test that throws would take the content script's boot path with it. A
 * thrown check reports `error` and the rest still run.
 */
export async function runSelfTest(pageKey: string): Promise<void> {
  const url = location.href;
  const checks: HealthReport[] = [];

  /* 1. The page-world pricing probe. Without it nothing can be mirrored, so a
   *    drop here explains a sudden wave of "no quotes available". */
  checks.push(
    safely(() => ({
      feature: FEATURE.panel,
      checkKey: "probe_installed",
      status: probeInstalled() ? "ok" : "not_found",
      url,
    })),
  );

  /* 2. The live shipping figure. */
  checks.push(
    safely(() => {
      const hit = readShipping();
      return {
        feature: FEATURE.shipping,
        checkKey: "figure_found",
        status: hit ? "ok" : "not_found",
        url,
        // WHERE it was read from, never the value. `label-climb-2` turning into
        // `label-inline` across every install is a Meesho markup change.
        ...(hit?.source ? { detail: hit.source } : {}),
      };
    }),
  );

  /* 3 + 4. The catalog form and its controls. */
  const root = safeRoot();
  checks.push({
    feature: FEATURE.form,
    checkKey: "form_root",
    status: root === "error" ? "error" : root ? "ok" : "not_found",
    url,
  });

  if (root && root !== "error") {
    checks.push(
      safely(() => {
        const fields = discoverFields(root);
        return {
          feature: FEATURE.form,
          checkKey: "field_detect",
          status: fields.length ? "ok" : "not_found",
          url,
          detail: bucket(fields.length),
        };
      }),
    );

    /* 5. The category breadcrumb — WHETHER, not what. */
    checks.push(
      safely(() => {
        const path = categoryPath(root, discoverFields(root));
        return {
          feature: FEATURE.category,
          checkKey: "detected",
          status: path ? "ok" : "not_found",
          url,
        };
      }),
    );
  }

  for (const check of checks) await report(check, pageKey);
}

/** formRoot() walks foreign markup; distinguish "no form" from "it threw". */
function safeRoot(): HTMLElement | null | "error" {
  try {
    return formRoot();
  } catch {
    return "error";
  }
}

function safely(run: () => HealthReport): HealthReport {
  try {
    return run();
  } catch (err) {
    return {
      feature: "adapter",
      checkKey: "self_test",
      status: "error",
      url: location.href,
      // The error's own message, which comes from our code, not from the page.
      detail: err instanceof Error ? err.name : "threw",
    };
  }
}

/* ─── action-time checks ───────────────────────────────────────────────── */

/**
 * Report the outcome of a real fill run. Separate from the self-test because this
 * is the check that matters most: a form the adapter can SEE but cannot WRITE is
 * the failure sellers actually feel, and it is invisible to a discovery-only test.
 */
export async function reportFillOutcome(
  result: { filled: number; failed: number; skipped: number },
  pageKey: string,
): Promise<void> {
  const status = result.failed > 0 ? "error" : result.filled > 0 ? "ok" : "not_found";
  await report(
    {
      feature: FEATURE.fill,
      checkKey: "fill_run",
      status,
      url: location.href,
      detail: `filled=${bucket(result.filled)} failed=${bucket(result.failed)}`,
    },
    // A run is its own event: two runs on one page load are both worth seeing,
    // so the page key is extended rather than reused.
    `${pageKey}|fill|${Date.now()}`,
  );
}

/** Did an image actually land in the front-image input? */
export async function reportImageApply(ok: boolean, pageKey: string): Promise<void> {
  await report(
    {
      feature: FEATURE.image,
      checkKey: "apply_front_image",
      status: ok ? "ok" : "not_found",
      url: location.href,
    },
    `${pageKey}|apply|${Date.now()}`,
  );
}
