import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account } from "@/lib/account";
import {
  sendToBackground,
  type ManualPricing,
  type MeeshoCategory,
  type QuoteBasis,
  type QuoteMode,
  type QuoteResponse,
  type TabState,
} from "@/lib/messages";
import type { Usage } from "@/lib/db-types";
import { BILLING_URL } from "@/lib/config";
import { clearBusy, markBusy } from "@/lib/busy";
import {
  CreditError,
  creditErrorMessage,
  newIdempotencyKey,
  spendExportCredit,
} from "@/lib/credits";
import {
  calibrate,
  isCalibrated,
  panelFigure,
  savingBetween,
  type Calibration,
} from "@/lib/calibration";
import { detectBoundingBox, type Box } from "@/lib/image/bounding-box";
import {
  blobToDataUrl,
  decodeImageFile,
  exportVariantJpeg,
  originalForUpload,
  type StickerArt,
} from "@/lib/image/compositor";
import { buildVariantSpecs, type VariantSpec } from "@/lib/image/variants";
import { loadStickerArt, loadStickerIndex } from "@/lib/image/stickers";
import { pathsDiffer } from "@/lib/category-path";
import { Icon } from "../ui/Icon";
import { Explain } from "../ui/Explain";
import type { PanelContextApi } from "../hooks/usePanelContext";
import { CategoryPicker } from "./CategoryPicker";
import { PricingBasis, type PricingMode } from "./PricingBasis";
import {
  LivePrice,
  VariationCard,
  formatRupees,
  type QuoteState,
  type VerifyState,
} from "./VariationCard";

/**
 * Feature B — low-shipping images, priced LIVE by Meesho.
 *
 *   1. The seller uploads one photo and picks the Meesho category.
 *   2. We render N variations that deliberately look UNLIKE each other —
 *      crop, size, framing, stickers (lib/image/variants.ts). Meesho prices
 *      from which catalog product it matches the photo to, so visual spread is
 *      the whole mechanism: similar pictures match the same product and quote
 *      the same rupee.
 *   3. Every image — the seller's own photo included, as the baseline — is
 *      quoted by Meesho itself through the open supplier-panel tab (upload →
 *      match → shipping; see content/meesho-api.ts).
 *   4. Results are listed by that live ₹, lowest first. No estimate, anywhere.
 *
 * ── WHAT MAKES THE ₹ TRUE ──────────────────────────────────────────────────
 * Nothing here models Meesho's pricing. Every quote re-issues the supplier
 * panel's OWN captured pricing request, and three rules stand between a Meesho
 * response and the seller's eyes:
 *
 *   • CALIBRATION (lib/calibration.ts). Before anything else, the panel's own
 *     request is posted straight back, untouched, and must reproduce the figure
 *     the panel is displaying. If it doesn't, we are talking to Meesho about a
 *     different listing and the run stops showing prices altogether. This is
 *     not a caveat that can be dismissed: it is the difference between "₹139
 *     less than your photo" and ₹39 more, which is what a seller was shown when
 *     our request had drifted from their panel's.
 *   • ONE QUESTION per ranked figure. The calibration probe is `mirror` mode;
 *     EVERY ranked figure, the seller's own photo included, is `match` mode.
 *     They are never subtracted from each other — `savingBetween` refuses. The
 *     baseline is therefore the photo priced the way the variants are, not the
 *     panel's current display figure, and a "saving" means what it says.
 *   • VERIFICATION before use: downloading or applying re-quotes the exact
 *     bytes, and a figure that doesn't reproduce is corrected and flagged
 *     instead of spent. Applying then waits for the panel's OWN redrawn
 *     breakdown and reports it verbatim, agreeing or not.
 *
 * ── WHAT WE NO LONGER DO ───────────────────────────────────────────────────
 * This screen used to refuse outright — "no image we generate can change that
 * figure" — whenever the panel's captured request carried `duplicate_pid: null`.
 * The panel sends null whenever it re-prices without re-matching, so the
 * refusal fired constantly on listings whose shipping demonstrably moved by
 * ₹10–₹20 with the front photo. We now ASK, and the only claim that the photo
 * doesn't matter is one Meesho's own answers support (`spreadOf`).
 *
 * Credits: a run costs 1 credit, and only when the seller USES (downloads or
 * applies) an image whose VERIFIED live shipping is lower than their own
 * photo's, in a CALIBRATED run. Using one unlocks every other image from the
 * same run. No proven reduction → free.
 */

const CONCURRENCY = 3; // parallel quotes — quick, but gentle on the seller's account
const MIN_COUNT = 5;
const MAX_COUNT = 50;
const DEFAULT_COUNT = 20;
const CATEGORY_KEY = "tk_last_category";
/** Error codes that stop the whole run (vs. one image failing). */
const FATAL_CODES = new Set([
  "no_session",
  "signed_out",
  "unreachable",
  "no_panel_capture",
  "panel_changed",
]);
/** How many leaders the end-of-run check may confirm before it stops. */
const MAX_AUTO_VERIFY = 3;

/**
 * The steps that actually make Meesho re-price after a new front image, found
 * the hard way on a live listing (see panelFigureAfterApply). Applying the
 * image alone leaves the old charge on screen, which looks exactly like the
 * quote having been wrong.
 *
 * The SELLER does this, not us. Doing it for them was built and then removed on
 * the user's decision (2026-09-26): de-selecting a size makes Meesho destroy
 * that size's price and MRP, so automating it means writing to the listing form
 * and betting their typed values on our restore working. Telling them the three
 * steps costs fifteen seconds and cannot lose anything.
 */
const REPRICE_STEPS = "Un-tick the size, tick it again, re-enter price and MRP.";

/** How long to watch the panel for its own re-priced figure after an apply. */
const REPRICE_WATCH_MS = 180_000;
const REPRICE_POLL_MS = 2_000;

type Notice = { kind: "error" | "success" | "info"; text: string } | null;

type Item = { spec: VariantSpec; quote: QuoteState; blob: Blob | null; verify: VerifyState };

type Run = {
  id: number;
  tabId: number;
  category: MeeshoCategory;
  /** The basis every quote in this run was priced against. Null = mirror the
   *  panel's own request. Snapshotted so mid-run edits can't skew a ranking. */
  pricing: ManualPricing | null;
  /** The captured panel request this whole run is pinned to, so every image in
   *  it was priced against the same listing (see meesho-api's expectSignature). */
  signature: string | null;
  /** Did the panel's own captured request carry a matched product? Reported on
   *  the diagnostic, and nothing more. It used to abort the run — see the note
   *  on PanelPricingContext.pricesByMatch for why that was wrong. */
  pricesByMatch: boolean;
  /**
   * The seller's own photo, priced the same way every variant is (upload →
   * match → price). THIS is what a saving is measured against.
   */
  baseline: QuoteState;
  /** The mirror probe: the panel's body posted back untouched. Never ranked,
   *  never compared against — its only job is to be equal to the panel's own
   *  displayed figure, which is what `calibration` records. */
  calibrationQuote: QuoteState;
  /** Whether that probe reproduced the panel's figure. Gates the whole run. */
  calibration: Calibration;
  items: Item[];
  running: boolean;
  charged: boolean;
  /**
   * The idempotency key for THIS run's one charge.
   *
   * Minted once, when the run starts, and sent with every attempt at the charge —
   * including a retry after a dropped connection. The server charges on the first
   * call carrying it and replays the same answer for the rest, which is what makes
   * "the download timed out, click it again" free instead of two credits.
   *
   * It is random rather than derived from `id`: that counter restarts at 1 every
   * time the panel reopens, so a key built from it would collide with a previous
   * session's run and the server would replay THAT charge — a free export and a
   * stale balance.
   */
  chargeKey: string;
};

/** Only a calibrated run may show prices or claim a saving (lib/calibration). */
function isTrustworthy(run: Run): boolean {
  return isCalibrated(run.calibration);
}

type PayResult = "free" | "charged" | "denied";

const IDLE: VerifyState = { status: "idle" };

function shippingOf(q: QuoteState): number | null {
  return q.status === "done" ? q.shipping : null;
}

/** A figure paired with the question it answered, or null if there isn't one. */
function comparableOf(q: QuoteState): { shipping: number; basis: QuoteBasis } | null {
  return q.status === "done" ? { shipping: q.shipping, basis: q.quote.basis } : null;
}

/**
 * Is this image genuinely cheaper than the seller's own photo?
 *
 * Routed through `savingBetween` rather than a bare `<` so the comparison can't
 * silently span two different questions — that subtraction is what once sold a
 * ₹39 increase as a ₹139 saving. If the bases ever diverge, this returns false
 * and nothing is claimed or charged.
 */
function isReduction(item: Item, run: Run): boolean {
  // An uncalibrated run has no meaningful baseline, so nothing can be shown to
  // beat it — and nothing may be charged for.
  if (!isTrustworthy(run)) return false;
  const saving = savingBetween(comparableOf(run.baseline), comparableOf(item.quote));
  return saving != null && saving > 0;
}

/**
 * How much the figures in a run actually differ, baseline included.
 *
 * The one honest way to say "the photo doesn't set this charge": ask Meesho
 * about every image and find it gave one answer. Reading that off a field in
 * the panel's request instead is what told sellers ₹68 was a floor while other
 * tools were pulling the same listing down to ₹58.
 */
function spreadOf(run: Run | null): {
  min: number;
  max: number;
  distinct: number;
  quoted: number;
} | null {
  if (!run) return null;
  const base = shippingOf(run.baseline);
  const figures = [
    ...(base != null ? [base] : []),
    ...run.items.map((it) => shippingOf(it.quote)).filter((s): s is number => s != null),
  ];
  if (!figures.length) return null;
  return {
    min: Math.min(...figures),
    max: Math.max(...figures),
    distinct: new Set(figures).size,
    /** Variations that came back with a figure (the baseline isn't one). */
    quoted: figures.length - (base != null ? 1 : 0),
  };
}

/** Done (cheapest first; ties → bigger product) · in progress · failed. */
function sortForDisplay(items: Item[]): Item[] {
  const rank = (q: QuoteState) =>
    q.status === "done" ? 0 : q.status === "quoting" ? 1 : q.status === "queued" ? 2 : 3;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const r = rank(a.item.quote) - rank(b.item.quote);
      if (r) return r;
      const sa = shippingOf(a.item.quote);
      const sb = shippingOf(b.item.quote);
      if (sa != null && sb != null && sa !== sb) return sa - sb;
      if (sa != null && sb != null) return b.item.spec.footprint - a.item.spec.footprint;
      return a.index - b.index;
    })
    .map((x) => x.item);
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ImageGenerator({
  account,
  tab,
  panel,
  onQuotingChange,
  applyImage,
  onUsage,
  onBlocked,
  onSignedOut,
}: {
  account: Account;
  tab: TabState;
  /** Owned by App, so the shipping card above answers from the same reading. */
  panel: PanelContextApi;
  /** Lets App pause the panel-context poll while a run keeps the tab busy. */
  onQuotingChange: (quoting: boolean) => void;
  applyImage: (dataUrl: string, fileName: string) => Promise<{ ok: boolean; error?: string }>;
  onUsage: (usage: Usage) => void;
  onBlocked: () => void;
  /** This install was signed out elsewhere mid-action — say so, then sign out. */
  onSignedOut: (message: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [bbox, setBbox] = useState<Box | null>(null);

  const [category, setCategory] = useState<MeeshoCategory | null>(null);
  /**
   * Where the category above came from.
   *
   * "restored" is the whole reason this exists. The pick is remembered across
   * sessions, so opening the panel on a Men's Shirts form showed "Kurtis" from
   * last week with nothing to say it wasn't read from this listing — and the
   * pick is what a quote falls back to when the panel's captured request carries
   * no category of its own. A restored pick is a leftover until something
   * corroborates it, and the card says so.
   */
  const [categorySource, setCategorySource] = useState<"none" | "restored" | "picked">("none");
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [withStickers, setWithStickers] = useState(true);
  const [stickerArt, setStickerArt] = useState<StickerArt>(() => new Map());

  const [mode, setMode] = useState<PricingMode>("panel");
  const [priceInput, setPriceInput] = useState("");
  const [gstInput, setGstInput] = useState("");

  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const runSeq = useRef(0);
  const cancelRef = useRef(false);
  const runRef = useRef<Run | null>(null);
  runRef.current = run;
  const chargeRef = useRef<{ runId: number; promise: Promise<PayResult> } | null>(null);
  /** Ids the seller has seen a "this figure moved" warning for and re-clicked. */
  const confirmedRef = useRef(new Set<string>());
  /** Budget for the unprompted end-of-run verification (see the effect below). */
  const autoVerifiedRef = useRef({ runId: 0, used: 0 });
  /** The manual price/GST fields are pre-filled from the panel exactly once. */
  const seededRef = useRef(false);

  const credits = account.usage.credits_remaining;
  const connected = tab.meeshoTabId != null && tab.contentReady;
  const running = run?.running ?? false;

  const { context, refreshing, refresh } = panel;

  // App owns the poll; it only needs to know when to hold off.
  useEffect(() => {
    onQuotingChange(running);
  }, [running, onQuotingChange]);

  /**
   * Hold off a pending extension update while a run or an export is in flight.
   *
   * Applying one calls chrome.runtime.reload(), which closes this panel. Mid-run
   * that discards every generated image and the live quotes they were ranked by —
   * minutes of the seller's time and a dozen requests against their Meesho
   * account, for nothing. The charge itself is safe (the server's idempotency key
   * covers a retry), but the image would be gone.
   *
   * Cleared in the cleanup too, so closing the panel mid-run cannot leave the flag
   * set; `isBusy` also ages it out as a second line of defence (lib/busy.ts).
   */
  const exporting = busy !== null;
  useEffect(() => {
    if (!running && !exporting) {
      void clearBusy();
      return;
    }
    void markBusy();
    return () => {
      void clearBusy();
    };
  }, [running, exporting]);

  useEffect(() => {
    loadStickerIndex()
      .then(loadStickerArt)
      .then(setStickerArt)
      .catch(() => {});
    chrome.storage.local
      .get(CATEGORY_KEY)
      .then((stored) => {
        const saved = stored[CATEGORY_KEY] as MeeshoCategory | undefined;
        if (saved && typeof saved.id === "number") {
          setCategory(saved);
          setCategorySource("restored");
        }
      })
      .catch(() => {});
    return () => {
      cancelRef.current = true; // stop quoting if the panel closes mid-run
    };
  }, []);

  useEffect(() => {
    return () => {
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    };
  }, [thumbUrl]);

  // Seed the manual fields from the panel ONCE, so switching to "a price I
  // type" starts from the seller's real number rather than an empty box. Only
  // once: after that the fields are theirs, and re-seeding would fight them as
  // they clear or retype a value.
  useEffect(() => {
    if (seededRef.current || !context.captured) return;
    seededRef.current = true;
    if (context.price != null) setPriceInput(String(context.price));
    if (context.gstPercent != null) setGstInput(String(context.gstPercent));
  }, [context.captured, context.price, context.gstPercent]);

  const chooseCategory = useCallback((c: MeeshoCategory) => {
    setCategory(c);
    setCategorySource("picked");
    chrome.storage.local.set({ [CATEGORY_KEY]: c }).catch(() => {});
  }, []);

  const handleFile = useCallback(async (chosen: File) => {
    if (!chosen.type.startsWith("image/")) {
      setNotice({ kind: "error", text: "Choose a JPG, PNG or WEBP image." });
      return;
    }
    setLoadingImage(true);
    setNotice(null);
    try {
      const bmp = await decodeImageFile(chosen);
      setThumbUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(chosen);
      });
      setFile(chosen);
      setBitmap(bmp);
      setBbox(detectBoundingBox(bmp));
      setRun(null);
      setAppliedId(null);
    } catch {
      setNotice({ kind: "error", text: "Couldn't read that image. Try another." });
    } finally {
      setLoadingImage(false);
    }
  }, []);

  /* ─── the pricing basis this run would use ─────────────────────────────── */

  /**
   * The basis a run would quote against. A run always mirrors the panel's own
   * request; this only decides whether the seller is overriding the selling
   * price inside that mirror. An empty or invalid box means "don't override".
   */
  const pricing = useMemo((): { manual: ManualPricing | null } => {
    if (mode !== "manual") return { manual: null };
    const price = Number(priceInput);
    if (!priceInput.trim() || !Number.isFinite(price) || price <= 0) return { manual: null };
    const gstPercent = gstInput === "" ? null : Number(gstInput);
    return {
      manual: { price, gstPercent: Number.isFinite(gstPercent as number) ? gstPercent : null },
    };
  }, [mode, priceInput, gstInput]);

  /* ─── does the picked category belong to THIS listing? ─────────────────── */

  /**
   * Two independent ways to learn what the seller is actually listing, and the
   * card needs both:
   *
   *   • the captured pricing request's `sscat_id` — exact, but it only exists
   *     once the panel has priced something;
   *   • the catalog form's own breadcrumb — available the moment a form is on
   *     screen, which is the whole stretch of the flow the first one misses.
   *
   * Checking only the first is what let a remembered "Kurtis" sit unchallenged
   * over a Men's Shirts form for a full catalog-creation run: no price typed
   * yet, so nothing captured, so nothing to compare against.
   */
  const panelSscatId = context.captured ? context.sscatId : null;
  const formCategoryPath = tab.form.present ? tab.form.categoryPath : null;

  /**
   * The listing's category and the pick here clearly name different things. The
   * panel's own category still wins in the quote (it is the listing's real one),
   * so this is a heads-up that the picker describes something else — not a
   * source of error in the figure.
   */
  const categoryMismatch =
    category != null &&
    (panelSscatId != null
      ? panelSscatId !== category.id
      : pathsDiffer(formCategoryPath, category.name));

  /** Something on the listing agrees with the pick, so it needs no second look. */
  const categoryCorroborated =
    category != null &&
    (panelSscatId != null
      ? panelSscatId === category.id
      : formCategoryPath != null && !pathsDiffer(formCategoryPath, category.name));

  /**
   * A remembered pick that nothing on this listing confirms or contradicts —
   * the state the seller cannot tell apart from a deliberate choice, and the one
   * the card has to speak up about.
   */
  const categoryUnverified =
    category != null &&
    categorySource === "restored" &&
    !categoryCorroborated &&
    !categoryMismatch;

  /* ─── run state helpers (ignore updates from a superseded run) ─────────── */

  const patchRun = useCallback((runId: number, fn: (r: Run) => Run) => {
    setRun((prev) => (prev && prev.id === runId ? fn(prev) : prev));
  }, []);

  const patchItem = useCallback(
    (runId: number, id: string, patch: Partial<Item>) => {
      patchRun(runId, (r) => ({
        ...r,
        items: r.items.map((it) => (it.spec.id === id ? { ...it, ...patch } : it)),
      }));
    },
    [patchRun],
  );

  /**
   * One quote through the background → content script → Meesho.
   *
   * `mode` is explicit at every call site on purpose. "mirror" is the
   * calibration probe and passes no image; "match" is the only mode any ranked
   * figure may come from, and it is used for the seller's own photo as well as
   * every variant so the ranking compares like with like.
   */
  const quoteBlob = useCallback(
    async (
      run: Pick<Run, "tabId" | "pricing" | "signature"> & { sscatId: number },
      blob: Blob | null,
      fileName: string,
      mode: QuoteMode = "match",
    ): Promise<QuoteResponse> => {
      try {
        const dataUrl = blob ? await blobToDataUrl(blob) : null;
        const res = await sendToBackground({
          type: "QUOTE_IMAGE",
          tabId: run.tabId,
          dataUrl,
          fileName,
          mode,
          sscatId: run.sscatId,
          manual: run.pricing,
          expectSignature: run.signature,
        });
        return (
          res ?? { ok: false, error: "No answer from your supplier panel tab.", code: "unreachable" }
        );
      } catch {
        return { ok: false, error: "Couldn't reach your supplier panel tab.", code: "unreachable" };
      }
    },
    [],
  );

  /* ─── Generate: render every look, have Meesho quote each one live ─────── */

  const onGenerate = useCallback(async () => {
    if (!file || !bitmap || !bbox || !category || tab.meeshoTabId == null) return;
    // Re-read the panel right before snapshotting, so the request we mirror is
    // the one it just made. Without a capture there is nothing to mirror, and a
    // quote built any other way answers a listing the seller isn't making.
    const ctx = await refresh();
    if (!ctx.probeInstalled) {
      setNotice({
        kind: "error",
        text: "Reload your Meesho tab, then try again.",
      });
      return;
    }
    if (!ctx.captured) {
      setNotice({
        kind: "error",
        text: "Enter your selling price in the panel first, then press Generate.",
      });
      return;
    }

    const tabId = tab.meeshoTabId;
    const sscatId = category.id;
    const manual = pricing.manual;
    const runId = ++runSeq.current;
    cancelRef.current = false;
    chargeRef.current = null;
    confirmedRef.current = new Set();
    autoVerifiedRef.current = { runId, used: 0 };

    const specs = buildVariantSpecs({
      count,
      seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0,
      stickerIds: [...stickerArt.keys()],
      withStickers,
    });
    // Everything in this run asks Meesho this one question, so the images can
    // be ranked against each other and against the seller's own photo.
    const quoteTarget = { tabId, sscatId, pricing: manual, signature: ctx.signature };

    setRun({
      id: runId,
      tabId,
      category,
      pricing: manual,
      signature: ctx.signature,
      pricesByMatch: ctx.pricesByMatch,
      baseline: { status: "queued" },
      calibrationQuote: { status: "queued" },
      calibration: { status: "pending" },
      items: specs.map((spec) => ({
        spec,
        quote: { status: "queued" },
        blob: null,
        verify: IDLE,
      })),
      running: true,
      charged: false,
      chargeKey: newIdempotencyKey(),
    });
    setAppliedId(null);
    setNotice(null);

    const outcome = { fatal: null as string | null };

    /** Turn a response into a QuoteState, stopping the run on fatal errors. */
    const settle = (res: QuoteResponse): QuoteState => {
      if (res.ok) return { status: "done", shipping: res.quote.shipping, quote: res.quote };
      if (res.code && FATAL_CODES.has(res.code)) {
        outcome.fatal = res.error;
        cancelRef.current = true;
      }
      return { status: "error", error: res.error };
    };

    const stopRun = (text: string) => {
      cancelRef.current = true;
      setNotice({ kind: "error", text });
    };

    /* ── Step 1: CALIBRATION — does our request reproduce the panel's figure?
     *
     * The panel's own body, posted straight back, nothing touched, no image.
     * This is the only check that can catch us talking to Meesho about a
     * different listing than the seller's, and it is cheap: no upload, no match
     * call, one request. If it fails, nothing downstream means anything. */
    patchRun(runId, (r) => ({ ...r, calibrationQuote: { status: "quoting" } }));
    const mirrorState = settle(
      await quoteBlob(quoteTarget, null, "calibration", "mirror"),
    );
    const ours = mirrorState.status === "done" ? mirrorState.shipping : null;
    // The panel's own answer, preferred from the response to the very request we
    // mirrored; the figure rendered on the page is the corroborating read.
    const calibration: Calibration = calibrate(
      ours,
      panelFigure(
        mirrorState.status === "done" ? mirrorState.quote.debug.panelShipping : null,
        ctx.shipping,
        tab.shipping.value,
      ),
    );
    patchRun(runId, (r) => ({ ...r, calibrationQuote: mirrorState, calibration }));

    if (calibration.status === "mismatch") {
      stopRun(
        `Stopped. Re-sending your panel's own pricing request gets ${formatRupees(calibration.ours)}, but your panel is displaying ${formatRupees(calibration.panel)} for that same request. Until those agree, any "saving" we showed you would be made up — so we're showing nothing. Use "Copy diagnostic" below and send it over.`,
      );
    } else if (calibration.status === "no-reference") {
      stopRun(
        "Stopped. We couldn't find your panel's own shipping figure to check ours against. Open your listing's price breakdown in the supplier panel (enter your selling price), then press Generate again.",
      );
    } else if (ours == null) {
      stopRun(
        mirrorState.status === "error"
          ? `Couldn't reproduce your panel's own figure: ${mirrorState.error}`
          : "Couldn't reproduce your panel's own figure.",
      );
    }

    /* ── Step 2: the BASELINE — the seller's own photo, priced the way every
     * variant will be.
     *
     * Not the mirror figure above. That one answers "what is your panel showing
     * right now", which on most listings is a price computed without re-reading
     * the photo at all. The number a variant has to beat is what Meesho charges
     * when it prices THIS photo as the front image — same upload, same match
     * step, same `duplicate_pid` swap. Subtracting a match-priced variant from a
     * mirror-priced baseline is the arithmetic that once turned ₹39 worse into
     * "₹139 less", and it is why the two are separate fields here. */
    if (!cancelRef.current) {
      patchRun(runId, (r) => ({ ...r, baseline: { status: "quoting" } }));
      let baselineState: QuoteState;
      try {
        const blob = await originalForUpload(file, bitmap);
        const ext = blob.type === "image/png" ? "png" : "jpg";
        baselineState = settle(await quoteBlob(quoteTarget, blob, `your-photo.${ext}`));
      } catch {
        baselineState = { status: "error", error: "Couldn't prepare your photo." };
      }
      patchRun(runId, (r) => ({ ...r, baseline: baselineState }));
      if (baselineState.status !== "done") {
        stopRun(
          `Couldn't price your own photo, so there's nothing to compare against: ${
            baselineState.status === "error" ? baselineState.error : "no figure came back"
          }`,
        );
      }
    }

    /* ── Step 3: the variants, all in match mode, like the baseline ───────── */
    const jobs: (() => Promise<void>)[] = [
      ...specs.map((spec, i) => async () => {
        patchItem(runId, spec.id, { quote: { status: "quoting" } });
        try {
          const blob = await exportVariantJpeg(bitmap, bbox, spec, stickerArt);
          const state = settle(
            await quoteBlob(quoteTarget, blob, `tarakkihub-${i + 1}.jpg`),
          );
          patchItem(runId, spec.id, { blob, quote: state });
        } catch {
          patchItem(runId, spec.id, {
            quote: { status: "error", error: "Couldn't render this image." },
          });
        }
      }),
    ];

    let next = 0;
    const worker = async () => {
      while (!cancelRef.current && next < jobs.length) {
        await jobs[next++]();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const unchecked: QuoteState = { status: "error", error: "Not checked — the run was stopped." };
    const pending = (q: QuoteState) => q.status === "queued" || q.status === "quoting";
    patchRun(runId, (r) => ({
      ...r,
      running: false,
      calibrationQuote: pending(r.calibrationQuote) ? unchecked : r.calibrationQuote,
      baseline: pending(r.baseline) ? unchecked : r.baseline,
      items: r.items.map((it) => (pending(it.quote) ? { ...it, quote: unchecked } : it)),
    }));
    if (outcome.fatal) setNotice({ kind: "error", text: outcome.fatal });
  }, [
    file,
    bitmap,
    bbox,
    category,
    tab.meeshoTabId,
    count,
    stickerArt,
    withStickers,
    pricing,
    refresh,
    patchRun,
    patchItem,
    quoteBlob,
    tab.shipping.value,
  ]);

  const onStop = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const findItem = (id: string) => runRef.current?.items.find((it) => it.spec.id === id);

  /* ─── Verification: does Meesho say the same thing twice? ──────────────── */

  /**
   * Re-quote the EXACT bytes the seller would receive. A figure that doesn't
   * reproduce is replaced by the re-checked one and flagged, never presented as
   * settled — this is the check the seller would otherwise have to do by hand
   * (download the image, upload it to the panel, compare).
   */
  const verifyItem = useCallback(
    async (id: string): Promise<VerifyState> => {
      const r = runRef.current;
      const item = r?.items.find((it) => it.spec.id === id);
      if (!r || !item?.blob || item.quote.status !== "done") return IDLE;

      patchItem(r.id, id, { verify: { status: "checking" } });
      const res = await quoteBlob(
        { tabId: r.tabId, sscatId: r.category.id, pricing: r.pricing, signature: r.signature },
        item.blob,
        `verify-${id}.jpg`,
      );

      if (!res.ok) {
        const state: VerifyState = { status: "failed", error: res.error };
        patchItem(r.id, id, { verify: state });
        return state;
      }
      if (res.quote.shipping === item.quote.shipping) {
        const state: VerifyState = { status: "match" };
        patchItem(r.id, id, { verify: state });
        return state;
      }
      const state: VerifyState = { status: "differs", shipping: res.quote.shipping };
      patchItem(r.id, id, {
        verify: state,
        quote: { status: "done", shipping: res.quote.shipping, quote: res.quote },
      });
      return state;
    },
    [patchItem, quoteBlob],
  );

  // When a run ends, confirm the winner unprompted — the seller shouldn't have
  // to ask whether the headline number holds up. A correction re-sorts the list,
  // so this re-runs on the new leader; capped so a run of unstable matches can't
  // turn into a second full pass over the seller's account.
  useEffect(() => {
    if (!run || run.running || autoVerifiedRef.current.runId !== run.id) return;
    if (!isTrustworthy(run)) return; // nothing to confirm — the run showed no figures
    if (autoVerifiedRef.current.used >= MAX_AUTO_VERIFY) return;
    const best = sortForDisplay(run.items).find((it) => it.quote.status === "done");
    if (!best || best.verify.status !== "idle") return;
    autoVerifiedRef.current.used += 1;
    void verifyItem(best.spec.id);
  }, [run, verifyItem]);

  /**
   * Gate on verification before an image is used. Returns true to proceed.
   * A moved figure stops this click, shows the corrected number, and lets the
   * next click through — so nothing is ever spent on a number we just watched
   * change.
   */
  const confirmBeforeUse = useCallback(
    async (id: string): Promise<boolean> => {
      const item = findItem(id);
      if (!item) return false;
      if (confirmedRef.current.has(id) || item.verify.status === "match") return true;

      const state = await verifyItem(id);
      if (state.status === "match") return true;
      confirmedRef.current.add(id);
      if (state.status === "failed") {
        setNotice({
          kind: "error",
          text: "Couldn't re-check with Meesho. Click again to use it anyway.",
        });
      } else if (state.status === "differs") {
        setNotice({
          kind: "error",
          text: `Re-checked: Meesho now says ${formatRupees(state.shipping)} for this image. Card updated — click again to use it.`,
        });
      }
      return false;
    },
    [verifyItem],
  );

  /* ─── Credits: once per run, only for a proven reduction ───────────────── */

  const ensurePaid = useCallback(
    async (item: Item): Promise<PayResult> => {
      const r = runRef.current;
      if (!r || !isReduction(item, r) || r.charged) return "free";
      if (chargeRef.current?.runId === r.id) return chargeRef.current.promise;
      if (credits <= 0) {
        setNotice({
          kind: "error",
          text: "Out of credits — using a cheaper image needs 1.",
        });
        return "denied";
      }
      const promise = (async (): Promise<PayResult> => {
        try {
          // r.chargeKey, not a fresh key: every attempt at THIS run's one charge
          // carries the same idempotency key, so a retry after a dropped
          // connection replays the first answer instead of charging again.
          const usage = await spendExportCredit("Low-shipping image", r.chargeKey);
          onUsage(usage);
          patchRun(r.id, (x) => ({ ...x, charged: true }));
          return "charged";
        } catch (e) {
          chargeRef.current = null;
          if (e instanceof CreditError && e.kind === "account_blocked") {
            onBlocked();
          } else if (e instanceof CreditError && e.kind === "device_revoked") {
            // Signed out from another computer. The next heartbeat will clear the
            // session; saying so here is better than a bare "couldn't spend".
            onSignedOut(e.message);
          } else {
            setNotice({ kind: "error", text: creditErrorMessage(e) });
          }
          return "denied";
        }
      })();
      chargeRef.current = { runId: r.id, promise };
      return promise;
    },
    [credits, onUsage, onBlocked, onSignedOut, patchRun],
  );

  const onDownload = useCallback(
    async (id: string) => {
      if (findItem(id)?.quote.status !== "done") return;
      setBusy(`${id}:download`);
      setNotice(null);
      try {
        if (!(await confirmBeforeUse(id))) return;
        const item = findItem(id); // verification may have corrected the figure
        if (!item?.blob || item.quote.status !== "done") return;
        const paid = await ensurePaid(item);
        if (paid === "denied") return;
        saveBlob(item.blob, `tarakkihub-shipping-${item.quote.shipping}rs.jpg`);
        setNotice({
          kind: "success",
          text:
            paid === "charged"
              ? "Saved — 1 credit used, and every cheaper image from this run is now unlocked."
              : `Saved — Meesho quoted ${formatRupees(item.quote.shipping)} shipping for this image.`,
        });
      } finally {
        setBusy(null);
      }
    },
    [confirmBeforeUse, ensurePaid],
  );

  /**
   * ── AFTER APPLY: THE PANEL'S OWN FIGURE IS THE LAST WORD ──────────────────
   *
   * Confirmed on a live listing, 2026-09-26: the quote was ₹48, the image was
   * applied, and the panel kept showing the OLD charge — until the seller
   * un-ticked the size, ticked it again and re-entered price and MRP. Then the
   * breakdown read ₹48, exactly as quoted.
   *
   * So: dropping a file into the form does NOT make Meesho re-price. The panel
   * only re-runs its pricing call when the variation form is re-submitted. That
   * gap is the single most misleading moment in the whole feature — the seller
   * sees the image land, sees the charge not move, and reasonably concludes the
   * number was invented. It wasn't; the panel simply hasn't been asked yet.
   *
   * Two consequences, both handled here:
   *   • we print the steps IMMEDIATELY, not as a consolation after a timeout;
   *   • we watch for as long as a person plausibly takes to do them (six
   *     seconds, the old budget, was over before the seller had finished
   *     reading), and we keep the card buttons live while we wait.
   *
   * A re-price is detected by the panel's request CHANGING, not only by the
   * figure changing — re-pricing to the same rupee is a real outcome and must
   * be reported, not waited out.
   */
  const panelFigureAfterApply = useCallback(
    async (
      before: { shipping: number | null; signature: string | null },
      onWait: (secondsLeft: number) => void,
    ): Promise<number | null> => {
      const until = Date.now() + REPRICE_WATCH_MS;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, REPRICE_POLL_MS));
        const ctx = await refresh();
        const repriced =
          (ctx.signature != null && ctx.signature !== before.signature) ||
          (ctx.shipping != null && ctx.shipping !== before.shipping);
        if (repriced && ctx.shipping != null) return ctx.shipping;
        onWait(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
      }
      return null;
    },
    [refresh],
  );

  const onApply = useCallback(
    async (id: string) => {
      if (findItem(id)?.quote.status !== "done" || !connected) return;
      setBusy(`${id}:apply`);
      setNotice(null);
      try {
        if (!(await confirmBeforeUse(id))) return;
        const item = findItem(id);
        if (!item?.blob || item.quote.status !== "done") return;
        const paid = await ensurePaid(item);
        if (paid === "denied") return;
        const res = await applyImage(
          await blobToDataUrl(item.blob),
          `tarakkihub-${item.quote.shipping}rs.jpg`,
        );
        if (res.ok) {
          setAppliedId(id);
          const promised = item.quote.shipping;

          /* ── Make the panel re-price, without losing a rupee of their data ──
           *
           * The adapter reads every selected size's price/MRP BEFORE it clicks
           * anything, toggles the size, writes the values back and verifies
           * them. If any part of that is uncertain it changes nothing and says
           * so — and in every outcome it returns what it read, so a failure
           * ends with the seller's own numbers on screen instead of gone. */
          // The steps come FIRST. The panel will still be showing the old
          // charge at this moment, and without them that reads as a broken
          // promise rather than a form that hasn't been re-submitted yet.
          setNotice({
            kind: "info",
            text: `Applied. Your panel shows the old charge until it re-prices. ${REPRICE_STEPS} It should then read ${formatRupees(promised)}.`,
          });
          // Let go of the buttons: the seller now has work to do in their own
          // panel, and a frozen side panel would be in the way.
          setBusy(null);
          const seen = await panelFigureAfterApply(
            { shipping: context.shipping ?? tab.shipping.value, signature: context.signature },
            (secondsLeft) =>
              setNotice({
                kind: "info",
                text: `Applied — waiting for your panel to re-price (${secondsLeft}s). ${REPRICE_STEPS} It should then read ${formatRupees(promised)}.`,
              }),
          );
          setNotice(
            seen == null
              ? {
                  kind: "info",
                  text: `Applied. Meesho quoted ${formatRupees(promised)}, but your panel hasn't re-priced yet, so we can't confirm it. ${REPRICE_STEPS}`,
                }
              : seen === promised
                ? {
                    kind: "success",
                    text: `Confirmed — your panel now shows ${formatRupees(seen)}, exactly as quoted.`,
                  }
                : {
                    kind: "error",
                    text: `Your panel shows ${formatRupees(seen)}, not the ${formatRupees(promised)} we quoted. Your panel is right — please send us a diagnostic.`,
                  },
          );
        } else {
          setNotice({
            kind: "error",
            text: res.error ?? "Open Add Single Catalog in your panel, then apply.",
          });
        }
      } catch {
        setNotice({ kind: "error", text: "Couldn't apply it. Try reloading your listing." });
      } finally {
        setBusy(null);
      }
    },
    [
      confirmBeforeUse,
      ensurePaid,
      applyImage,
      connected,
      panelFigureAfterApply,
      context.shipping,
      context.signature,
      tab.shipping.value,
    ],
  );

  /* ─── diagnostic ──────────────────────────────────────────────────────── */

  /**
   * Everything needed to explain a figure, on the seller's own clipboard: what
   * their panel asked Meesho, what we asked, and what each got back. It stays on
   * their machine unless they choose to send it.
   */
  const copyDiagnostic = useCallback(async () => {
    const r = runRef.current;
    const quoteOf = (q: QuoteState | undefined) => (q?.status === "done" ? q.quote : (q ?? null));
    const payload = {
      at: new Date().toISOString(),
      version: chrome.runtime.getManifest().version,
      panelContext: context,
      panelFigureOnPage: tab.shipping,
      categoryPickedHere: r?.category ?? category,
      calibration: r?.calibration ?? null,
      /** The panel's body posted back untouched — what `calibration` compared. */
      mirrorProbe: quoteOf(r?.calibrationQuote),
      /** The seller's photo priced the way every variant is (upload → match). */
      yourPhoto: quoteOf(r?.baseline),
      firstVariant: quoteOf(r?.items.find((it) => it.quote.status === "done")?.quote),
      /** How far the run's figures actually spread — the evidence behind any
       *  claim that the photo does or doesn't move this listing's shipping. */
      spread: spreadOf(r),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setNotice({ kind: "success", text: "Diagnostic copied — paste it to us." });
    } catch {
      setNotice({ kind: "error", text: "Couldn't copy to the clipboard." });
    }
  }, [context, tab.shipping, category]);

  /* ─── derived view state ──────────────────────────────────────────────── */

  const sorted = useMemo(() => (run ? sortForDisplay(run.items) : []), [run]);
  const baselineShipping = run ? shippingOf(run.baseline) : null;
  const lowestId = sorted[0]?.quote.status === "done" ? sorted[0].spec.id : null;

  const spread = useMemo(() => spreadOf(run), [run]);
  const checked = run
    ? run.items.filter((it) => it.quote.status === "done" || it.quote.status === "error").length +
      (run.baseline.status === "done" || run.baseline.status === "error" ? 1 : 0)
    : 0;
  const total = run ? run.items.length + 1 : 0;
  const best = sorted[0] && shippingOf(sorted[0].quote);
  // A run mirrors the panel's own pricing request, so without one there is
  // nothing to press Generate for.
  const canGenerate = !!bitmap && !!category && connected && !running && context.captured;

  /**
   * What stands between this seller and a run, in the order it becomes true.
   *
   * This used to render only once a photo was loaded, which is exactly backwards:
   * before the upload there is nothing on the card but a confident "Generate &
   * check live shipping" button, greyed out, giving no reason — sitting directly
   * under a shipping card reading "not detected on this screen". `blocking`
   * separates "your panel isn't ready" from "your next step is an upload"; only
   * the first is a problem, and only the first is coloured like one.
   */
  const blocker: { text: string; blocking: boolean } | null = !connected
    ? { blocking: true, text: "Open your Meesho supplier panel" }
    : !context.probeInstalled
      ? { blocking: true, text: "Reload your supplier panel tab" }
      : !context.captured
        ? { blocking: true, text: "Enter your selling price in the panel" }
        : !bitmap
          ? { blocking: false, text: "Upload a product photo" }
          : !category
            ? { blocking: false, text: "Pick the Meesho category" }
            : null;

  return (
    <section className="section">
      <div className="section__title">
        <Icon name="image" size={18} />
        Low-shipping images
      </div>
      {/* The pitch, the method and the price, folded. It was three lines of grey
          text above the uploader on every single open. */}
      <Explain label="How this works">
        We make variations of your photo and Meesho prices each one live — by re-asking
        your own panel&apos;s pricing question with nothing changed but the image.
        Cheapest first. 1 credit only when you use an image that beats your own photo.
      </Explain>

      {/* Upload / preview */}
      {!file ? (
        <div
          className={dragging ? "drop drag" : "drop"}
          style={{ marginTop: 12 }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
        >
          <div className="drop__icon">
            <Icon name="upload" size={26} />
          </div>
          <div className="drop__title">
            {loadingImage ? "Reading image…" : "Upload a product photo"}
          </div>
          <div className="drop__hint">JPG · PNG · WEBP</div>
        </div>
      ) : (
        <div className="preview-row" style={{ marginTop: 12 }}>
          {thumbUrl ? <img className="preview-thumb" src={thumbUrl} alt="" /> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="preview-name">{file.name}</div>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              style={{ padding: "0 4px", height: 24 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={running}
            >
              Change image
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = ""; // allow re-choosing the same file
        }}
      />

      {/* Options */}
      <div className="stack" style={{ marginTop: 14 }}>
        <div className="opt-group">
          <span className="opt-label">Meesho category</span>
          <CategoryPicker
            key={category?.id ?? "none"}
            tabId={tab.meeshoTabId}
            value={category}
            onChange={chooseCategory}
            disabled={running}
          />
          {categoryMismatch ? (
            <span className="hint" style={{ color: "var(--danger-600)" }}>
              This listing is{" "}
              <b>{formCategoryPath && panelSscatId == null ? formCategoryPath : "a different category"}</b>
              , not {category?.name}.
            </span>
          ) : categoryUnverified ? (
            <div className="af-warn">
              <Icon name="alert" size={15} />
              <div>
                Still <b>{category?.name}</b>? It&apos;s left over from your last listing.
                <div className="row" style={{ gap: 7, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn--sm"
                    disabled={running}
                    onClick={() => setCategorySource("picked")}
                  >
                    <Icon name="check" size={14} /> Yes
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <PricingBasis
          context={context}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          mode={mode}
          onMode={setMode}
          price={priceInput}
          onPrice={setPriceInput}
          gst={gstInput}
          onGst={setGstInput}
          disabled={running}
        />

        <div className="opt-group">
          <span className="opt-label row spread">
            <span>Variations</span>
            <b className="count-value">{count}</b>
          </span>
          <input
            type="range"
            className="range"
            min={MIN_COUNT}
            max={MAX_COUNT}
            step={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={running}
            style={
              { "--fill": `${((count - MIN_COUNT) / (MAX_COUNT - MIN_COUNT)) * 100}%` } as React.CSSProperties
            }
          />
        </div>

        <label className="switch-row">
          <span>
            <span className="opt-label" style={{ display: "block" }}>
              <Icon name="sticker" size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              Add stickers
            </span>
            {/* Meesho's own upload screen lists "Image with text" and "Image
                with price" as NOT ALLOWED for primary images. Stickers can move
                the quote, but they can also fail QC — the seller decides, and
                they get told. */}
            <span className="hint">Meesho QC may reject text on a front image.</span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={withStickers}
            onChange={(e) => setWithStickers(e.target.checked)}
            disabled={running || stickerArt.size === 0}
          />
        </label>

        {running ? (
          <button type="button" className="btn btn-secondary btn--block" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn--block"
            onClick={() => void onGenerate()}
            disabled={!canGenerate}
            title={blocker?.text}
          >
            <Icon name="spark" size={16} />
            {run ? "Generate again" : "Generate & check shipping"}
          </button>
        )}

        {/* Always rendered when there is one — a disabled button that explains
            itself only after an upload is a button that explains itself too late. */}
        {blocker ? (
          <p
            className="hint"
            style={blocker.blocking ? { color: "var(--danger-600)" } : undefined}
          >
            {blocker.text}
          </p>
        ) : null}
      </div>

      {/* Notices */}
      {notice ? (
        <div
          className={
            notice.kind === "success" ? "alert success" : notice.kind === "info" ? "alert info" : "alert"
          }
          style={{ marginTop: 12 }}
        >
          {notice.text}
          {notice.kind === "error" && credits <= 0 ? (
            <>
              {" "}
              <a href={BILLING_URL} target="_blank" rel="noreferrer">
                Upgrade your plan
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Results */}
      {run && bitmap && bbox ? (
        <div style={{ marginTop: 14 }} className="stack">
          {running ? (
            <div className="progress" aria-live="polite">
              <div className="row spread">
                <span className="hint">
                  Checking with Meesho… {checked}/{total}
                </span>
                {best != null ? <b className="hint">Best {formatRupees(best)}</b> : null}
              </div>
              <div className="progress__track">
                <div className="progress__bar" style={{ width: `${(checked / total) * 100}%` }} />
              </div>
            </div>
          ) : null}

          <div className="baseline">
            {thumbUrl ? <img className="preview-thumb" src={thumbUrl} alt="" /> : null}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="opt-label">Your photo</div>
              <LivePrice quote={run.baseline} baseline={null} />
              {run.calibration.status === "ok" ? (
                <div className="delta same">
                  {/* Two different figures, and conflating them is the bug this
                      whole design exists to prevent. The calibration figure is
                      what the panel shows for the listing as it stands; the
                      baseline is what Meesho charges when it prices THIS photo
                      as the front image. They are equal on listings the panel
                      priced by match and often differ elsewhere — saying so is
                      the difference between a real saving and an invented one. */}
                  {shippingOf(run.baseline) === run.calibration.panel
                    ? `Matches your panel's ${formatRupees(run.calibration.panel)}.`
                    : `Your panel shows ${formatRupees(run.calibration.panel)} for the listing as it stands.`}
                </div>
              ) : null}
            </div>
          </div>

          {/* The gate. A figure we can't reconcile with the seller's own panel is
              not shown at all — not greyed out, not caveated. Showing it is how
              "₹139 less than your photo" came to mean ₹39 more. */}
          {run.calibration.status === "mismatch" ? (
            <div className="alert">
              <b>These figures don&apos;t match your panel, so we&apos;re hiding them.</b>
              <div style={{ marginTop: 6 }}>
                Same request, two answers: ours{" "}
                <b>{formatRupees(run.calibration.ours)}</b>, your panel{" "}
                <b>{formatRupees(run.calibration.panel)}</b>. Your panel is right.
              </div>
              <button
                type="button"
                className="btn btn-secondary btn--sm"
                style={{ marginTop: 10 }}
                onClick={() => void copyDiagnostic()}
              >
                Copy diagnostic
              </button>
            </div>
          ) : run.calibration.status === "no-reference" ? (
            <div className="alert">
              <b>Nothing to check against.</b>
              <div style={{ marginTop: 6 }}>
                Enter your selling price in the panel, then Generate again.
              </div>
            </div>
          ) : run.calibration.status === "pending" && !running ? (
            <div className="alert">Couldn&apos;t price your own photo — run stopped.</div>
          ) : null}

          {/* Evidence, not a prediction. We say "the photo can't move this" only
              after Meesho has been asked about every image and answered with the
              same figure each time — never from a field in the panel's request,
              which is what used to turn a movable ₹68 into "₹68 is the floor". */}
          {isTrustworthy(run) && !running && spread && spread.distinct === 1 ? (
            <div className="alert info">
              <b>Shipping didn&apos;t move on this listing.</b>
              <div style={{ marginTop: 6 }}>
                Meesho quoted <b>{formatRupees(spread.min)}</b> for your photo and all{" "}
                {spread.quoted} variations. Nothing charged.
              </div>
              <Explain label="What that means">
                Every framing, size and sticker we tried came back at the same figure, so on
                this listing the picture genuinely isn&apos;t what sets the charge. It can be
                different on your next one.
              </Explain>
            </div>
          ) : null}

          {isTrustworthy(run) ? (
            <>
              {/* What the run actually found, in one line: the range Meesho
                  quoted and how far the best image beat the seller's photo.
                  Every figure here is a live quote, none is an estimate. */}
              {!running && spread && spread.distinct > 1 ? (
                <div className="alert success">
                  {baselineShipping != null && spread.min < baselineShipping ? (
                    <b>
                      Cheapest saves {formatRupees(baselineShipping - spread.min)} per order.
                    </b>
                  ) : (
                    <b>Your own photo is already the cheapest. Nothing charged.</b>
                  )}
                  <div className="hint" style={{ marginTop: 4 }}>
                    Meesho quoted {formatRupees(spread.min)}–{formatRupees(spread.max)} across{" "}
                    {spread.quoted + 1} images.
                  </div>
                </div>
              ) : null}

              <p className="hint">
                {run.charged
                  ? "Unlocked — any image from this run is free."
                  : "1 credit, only if you use a cheaper image."}
              </p>

              <div className="variations">
                {sorted.map((item) => (
                  <VariationCard
                    key={item.spec.id}
                    bitmap={bitmap}
                    bbox={bbox}
                    spec={item.spec}
                    stickers={stickerArt}
                    quote={item.quote}
                    verify={item.verify}
                    baseline={baselineShipping}
                    isLowest={item.spec.id === lowestId}
                    needsCredit={!run.charged && isReduction(item, run)}
                    canApply={connected}
                    busy={
                      busy === `${item.spec.id}:apply`
                        ? "apply"
                        : busy === `${item.spec.id}:download`
                          ? "download"
                          : null
                    }
                    applied={appliedId === item.spec.id}
                    onApply={(id) => void onApply(id)}
                    onDownload={(id) => void onDownload(id)}
                  />
                ))}
              </div>

              {/* Always reachable, not just when something has already gone
                  wrong: if a figure here ever disagrees with the panel, one
                  paste should be enough for us to see exactly why. */}
              <button
                type="button"
                className="btn btn-ghost btn--sm"
                onClick={() => void copyDiagnostic()}
                title="Copy what your panel asked Meesho and what we asked, for support"
              >
                Copy diagnostic
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
