/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Cashfree webhook signature + input normalisation — run with `npm test`
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  These three functions sit directly in front of money and each one fails
 *  SILENTLY when it is wrong:
 *
 *    • verifyWebhookSignature — get it wrong in the permissive direction and
 *      anyone who can POST to the webhook mints themselves credits. Get it
 *      wrong in the strict direction and no real payment ever settles. Neither
 *      shows up as an exception; both look like "it just doesn't work".
 *    • customerIdFor — Cashfree rejects a customer_id with punctuation, and a
 *      Postgres uuid is full of hyphens. The resulting error does not mention
 *      hyphens.
 *    • normalisePhone — Cashfree wants exactly 10 digits, and Indian sellers
 *      type +91, spaces and a leading 0.
 *
 *  The expected signature below is built INDEPENDENTLY of the implementation,
 *  the way Cashfree's own documented Node sample builds it. A test that reuses
 *  the function it is testing proves only that the function equals itself.
 *
 *  Run: node scripts/test-cashfree.mjs
 */

import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const mod = await import(
  pathToFileURL(resolve(import.meta.dirname, "../src/lib/cashfree.ts")).href
);
const { verifyWebhookSignature, normalisePhone, customerIdFor, isPaid } = mod;

const SECRET = "test_secret_key_abc123";
const BODY = JSON.stringify({ data: { order: { order_id: "th_abcdef" } } });
const TS = "1759500000";

/** Cashfree's documented algorithm: base64(HMAC-SHA256(timestamp + rawBody)). */
const GOOD = createHmac("sha256", SECRET).update(TS + BODY).digest("base64");

let pass = 0;
let fail = 0;

function check(name, got, want) {
  const ok = Object.is(got, want);
  console.log(
    `${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : `   got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`,
  );
  ok ? pass++ : fail++;
}

const sig = (over = {}) =>
  verifyWebhookSignature({
    secretKey: SECRET,
    timestamp: TS,
    rawBody: BODY,
    signature: GOOD,
    ...over,
  });

console.log("\n  webhook signature");
check("accepts a correct signature", sig(), true);
check("rejects a forged signature", sig({ signature: "ZmFrZQ==" }), false);
check("rejects a replay under a different timestamp", sig({ timestamp: "1759599999" }), false);
check("rejects a tampered body", sig({ rawBody: BODY.replace("abcdef", "999999") }), false);
check("rejects the wrong secret", sig({ secretKey: "other" }), false);
check("rejects a missing signature", sig({ signature: null }), false);
check("rejects a missing timestamp", sig({ timestamp: null }), false);
check("rejects an empty signature", sig({ signature: "" }), false);
// A longer/shorter candidate must not throw out of timingSafeEqual.
check("rejects a length mismatch without throwing", sig({ signature: GOOD + "x" }), false);

console.log("\n  customer id (Cashfree: 3-50 alphanumeric)");
const cid = customerIdFor("3f8a1c2e-55b7-4d9a-9b1e-7c2d4e5f6a7b");
check("strips uuid hyphens", /^[a-zA-Z0-9]+$/.test(cid), true);
check("stays within 3..50", cid.length >= 3 && cid.length <= 50, true);
check("pads a very short id", customerIdFor("a").length >= 3, true);

console.log("\n  phone (Cashfree: exactly 10 digits)");
check("plain 10 digits", normalisePhone("9876543210"), "9876543210");
check("+91 and spaces stripped", normalisePhone("+91 98765 43210"), "9876543210");
check("0 trunk prefix stripped", normalisePhone("09876543210"), "9876543210");
check("hyphens stripped", normalisePhone("98765-43210"), "9876543210");
check("too short rejected", normalisePhone("98765"), null);
check("non-mobile leading digit rejected", normalisePhone("1234567890"), null);
check("empty rejected", normalisePhone(""), null);
check("null rejected", normalisePhone(null), null);

console.log("\n  order status");
check("PAID is paid", isPaid("PAID"), true);
check("lowercase paid is paid", isPaid("paid"), true);
check("ACTIVE is not paid", isPaid("ACTIVE"), false);
check("EXPIRED is not paid", isPaid("EXPIRED"), false);
check("undefined is not paid", isPaid(undefined), false);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
