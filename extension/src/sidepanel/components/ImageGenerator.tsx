import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account } from "@/lib/account";
import {
  sendToBackground,
  type MeeshoCategory,
  type QuoteResponse,
  type TabState,
} from "@/lib/messages";
import type { Usage } from "@/lib/db-types";
import { BILLING_URL } from "@/lib/config";
import { CreditError, spendExportCredit } from "@/lib/credits";
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
import { Icon } from "../ui/Icon";
import { CategoryPicker } from "./CategoryPicker";
import { LivePrice, VariationCard, formatRupees, type QuoteState } from "./VariationCard";

/**
 * Feature B — low-shipping images, priced LIVE by Meesho.
 *
 *   1. The seller uploads one photo and picks the Meesho category.
 *   2. We render N Listify-style variations (size · frame · stickers).
 *   3. Every image — the seller's own photo first, as the baseline — is quoted
 *      by Meesho itself through the open supplier-panel tab (upload → match →
 *      shipping; see content/meesho-api.ts).
 *   4. Results are listed by that live ₹, lowest first. No estimate, anywhere.
 *
 * Credits: a run costs 1 credit, and only when the seller USES (downloads or
 * applies) an image whose live shipping is lower than their own photo's. Using
 * one unlocks every other image from the same run. No proven reduction → free.
 */

const CONCURRENCY = 3; // parallel quotes — quick, but gentle on the seller's account
const MIN_COUNT = 5;
const MAX_COUNT = 50;
const DEFAULT_COUNT = 20;
const CATEGORY_KEY = "tk_last_category";
/** Error codes that stop the whole run (vs. one image failing). */
const FATAL_CODES = new Set(["no_session", "signed_out", "unreachable"]);

type Notice = { kind: "error" | "success"; text: string } | null;

type Item = { spec: VariantSpec; quote: QuoteState; blob: Blob | null };

type Run = {
  id: number;
  tabId: number;
  category: MeeshoCategory;
  baseline: QuoteState;
  items: Item[];
  running: boolean;
  charged: boolean;
};

type PayResult = "free" | "charged" | "denied";

function shippingOf(q: QuoteState): number | null {
  return q.status === "done" ? q.shipping : null;
}

function isReduction(item: Item, run: Run): boolean {
  const base = shippingOf(run.baseline);
  const s = shippingOf(item.quote);
  return base != null && s != null && s < base;
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
  applyImage,
  onUsage,
  onBlocked,
}: {
  account: Account;
  tab: TabState;
  applyImage: (dataUrl: string, fileName: string) => Promise<{ ok: boolean; error?: string }>;
  onUsage: (usage: Usage) => void;
  onBlocked: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [bbox, setBbox] = useState<Box | null>(null);

  const [category, setCategory] = useState<MeeshoCategory | null>(null);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [withStickers, setWithStickers] = useState(true);
  const [stickerArt, setStickerArt] = useState<StickerArt>(() => new Map());

  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const runSeq = useRef(0);
  const cancelRef = useRef(false);
  const runRef = useRef<Run | null>(null);
  runRef.current = run;
  const chargeRef = useRef<{ runId: number; promise: Promise<PayResult> } | null>(null);

  const credits = account.usage.credits_remaining;
  const connected = tab.meeshoTabId != null && tab.contentReady;
  const running = run?.running ?? false;

  useEffect(() => {
    loadStickerIndex()
      .then(loadStickerArt)
      .then(setStickerArt)
      .catch(() => {});
    chrome.storage.local
      .get(CATEGORY_KEY)
      .then((stored) => {
        const saved = stored[CATEGORY_KEY] as MeeshoCategory | undefined;
        if (saved && typeof saved.id === "number") setCategory(saved);
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

  const chooseCategory = useCallback((c: MeeshoCategory) => {
    setCategory(c);
    chrome.storage.local.set({ [CATEGORY_KEY]: c }).catch(() => {});
  }, []);

  const handleFile = useCallback(async (chosen: File) => {
    if (!chosen.type.startsWith("image/")) {
      setNotice({ kind: "error", text: "Please choose a JPG, PNG or WEBP image." });
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
      setNotice({ kind: "error", text: "Couldn't read that image. Try another file." });
    } finally {
      setLoadingImage(false);
    }
  }, []);

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

  /* ─── Generate: render every look, have Meesho quote each one live ─────── */

  const onGenerate = useCallback(async () => {
    if (!file || !bitmap || !bbox || !category || tab.meeshoTabId == null) return;
    const tabId = tab.meeshoTabId;
    const sscatId = category.id;
    const runId = ++runSeq.current;
    cancelRef.current = false;
    chargeRef.current = null;

    const specs = buildVariantSpecs({
      count,
      seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0,
      stickerIds: [...stickerArt.keys()],
      withStickers,
    });
    setRun({
      id: runId,
      tabId,
      category,
      baseline: { status: "queued" },
      items: specs.map((spec) => ({ spec, quote: { status: "queued" }, blob: null })),
      running: true,
      charged: false,
    });
    setAppliedId(null);
    setNotice(null);

    const outcome = { fatal: null as string | null };

    const quote = async (blob: Blob, fileName: string): Promise<QuoteResponse> => {
      try {
        const dataUrl = await blobToDataUrl(blob);
        const res = await sendToBackground({ type: "QUOTE_IMAGE", tabId, dataUrl, fileName, sscatId });
        return res ?? { ok: false, error: "No answer from your supplier panel tab.", code: "unreachable" };
      } catch {
        return { ok: false, error: "Couldn't reach your supplier panel tab.", code: "unreachable" };
      }
    };

    /** Turn a response into a QuoteState, stopping the run on fatal errors. */
    const settle = (res: QuoteResponse): QuoteState => {
      if (res.ok) return { status: "done", shipping: res.quote.shipping };
      if (res.code && FATAL_CODES.has(res.code)) {
        outcome.fatal = res.error;
        cancelRef.current = true;
      }
      return { status: "error", error: res.error };
    };

    const jobs: (() => Promise<void>)[] = [
      // The seller's own photo first — the baseline every variant is judged by.
      async () => {
        patchRun(runId, (r) => ({ ...r, baseline: { status: "quoting" } }));
        try {
          const blob = await originalForUpload(file, bitmap);
          const ext = blob.type === "image/png" ? "png" : "jpg";
          const state = settle(await quote(blob, `your-photo.${ext}`));
          patchRun(runId, (r) => ({ ...r, baseline: state }));
        } catch {
          patchRun(runId, (r) => ({
            ...r,
            baseline: { status: "error", error: "Couldn't prepare your photo." },
          }));
        }
      },
      ...specs.map((spec, i) => async () => {
        patchItem(runId, spec.id, { quote: { status: "quoting" } });
        try {
          const blob = await exportVariantJpeg(bitmap, bbox, spec, stickerArt);
          const state = settle(await quote(blob, `tarakkihub-${i + 1}.jpg`));
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
      baseline: pending(r.baseline) ? unchecked : r.baseline,
      items: r.items.map((it) => (pending(it.quote) ? { ...it, quote: unchecked } : it)),
    }));
    if (outcome.fatal) setNotice({ kind: "error", text: outcome.fatal });
  }, [file, bitmap, bbox, category, tab.meeshoTabId, count, stickerArt, withStickers, patchRun, patchItem]);

  const onStop = useCallback(() => {
    cancelRef.current = true;
  }, []);

  /* ─── Credits: once per run, only for a proven reduction ───────────────── */

  const ensurePaid = useCallback(
    async (item: Item): Promise<PayResult> => {
      const r = runRef.current;
      if (!r || !isReduction(item, r) || r.charged) return "free";
      if (chargeRef.current?.runId === r.id) return chargeRef.current.promise;
      if (credits <= 0) {
        setNotice({
          kind: "error",
          text: "You're out of credits — using a cheaper image needs 1 credit.",
        });
        return "denied";
      }
      const promise = (async (): Promise<PayResult> => {
        try {
          const usage = await spendExportCredit("Low-shipping image");
          onUsage(usage);
          patchRun(r.id, (x) => ({ ...x, charged: true }));
          return "charged";
        } catch (e) {
          chargeRef.current = null;
          if (e instanceof CreditError && e.kind === "account_blocked") {
            onBlocked();
          } else {
            setNotice({
              kind: "error",
              text:
                e instanceof CreditError && e.kind === "no_credits"
                  ? "You're out of credits — using a cheaper image needs 1 credit."
                  : "Couldn't spend a credit. Please try again.",
            });
          }
          return "denied";
        }
      })();
      chargeRef.current = { runId: r.id, promise };
      return promise;
    },
    [credits, onUsage, onBlocked, patchRun],
  );

  const findItem = (id: string) => runRef.current?.items.find((it) => it.spec.id === id);

  const onDownload = useCallback(
    async (id: string) => {
      const item = findItem(id);
      if (!item?.blob || item.quote.status !== "done") return;
      setBusy(`${id}:download`);
      setNotice(null);
      try {
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
    [ensurePaid],
  );

  const onApply = useCallback(
    async (id: string) => {
      const item = findItem(id);
      if (!item?.blob || item.quote.status !== "done" || !connected) return;
      setBusy(`${id}:apply`);
      setNotice(null);
      try {
        const paid = await ensurePaid(item);
        if (paid === "denied") return;
        const res = await applyImage(await blobToDataUrl(item.blob), `tarakkihub-${item.quote.shipping}rs.jpg`);
        if (res.ok) {
          setAppliedId(id);
          setNotice({
            kind: "success",
            text: `Applied as your front image — Meesho quoted ${formatRupees(item.quote.shipping)} shipping for it. If the price breakdown still shows the old figure, re-type the price to refresh it.`,
          });
        } else {
          setNotice({
            kind: "error",
            text: res.error ?? "Open Add Single Catalog in your supplier panel, then apply.",
          });
        }
      } catch {
        setNotice({ kind: "error", text: "Couldn't apply the image. Try reloading your listing." });
      } finally {
        setBusy(null);
      }
    },
    [ensurePaid, applyImage, connected],
  );

  /* ─── derived view state ──────────────────────────────────────────────── */

  const sorted = useMemo(() => (run ? sortForDisplay(run.items) : []), [run]);
  const baselineShipping = run ? shippingOf(run.baseline) : null;
  const lowestId = sorted[0]?.quote.status === "done" ? sorted[0].spec.id : null;
  const checked = run
    ? run.items.filter((it) => it.quote.status === "done" || it.quote.status === "error").length +
      (run.baseline.status === "done" || run.baseline.status === "error" ? 1 : 0)
    : 0;
  const total = run ? run.items.length + 1 : 0;
  const best = sorted[0] && shippingOf(sorted[0].quote);
  const canGenerate = !!bitmap && !!category && connected && !running;

  return (
    <section className="section">
      <div className="section__title">
        <Icon name="image" size={18} />
        Low-shipping images
      </div>
      <p className="hint" style={{ marginTop: 4 }}>
        Upload one product photo. We make variations of it and Meesho quotes
        the real shipping for each one, live from your account. Cheapest first.
      </p>

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
            {loadingImage ? "Reading image…" : "Upload a product image"}
          </div>
          <div className="drop__hint">JPG, PNG or WEBP · a clean/white background works best</div>
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
        </div>

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
          <span className="hint">
            Each image takes Meesho a few seconds to price; we check {CONCURRENCY} at a time.
          </span>
        </div>

        <label className="switch-row">
          <span>
            <span className="opt-label" style={{ display: "block" }}>
              <Icon name="sticker" size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              Add stickers
            </span>
            <span className="hint">Promo stickers on the product</span>
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
          >
            <Icon name="spark" size={16} />
            {run ? "Generate again" : "Generate & check live shipping"}
          </button>
        )}

        {!connected ? (
          <p className="hint">
            Open your Meesho supplier panel (logged in) in the active tab — prices come
            live from your account.
          </p>
        ) : !category && bitmap ? (
          <p className="hint">Pick the Meesho category you'll list this in.</p>
        ) : null}
      </div>

      {/* Notices */}
      {notice ? (
        <div
          className={notice.kind === "success" ? "alert success" : "alert"}
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
                  Checking live shipping on Meesho… {checked}/{total}
                </span>
                {best != null ? <b className="hint">Best so far {formatRupees(best)}</b> : null}
              </div>
              <div className="progress__track">
                <div className="progress__bar" style={{ width: `${(checked / total) * 100}%` }} />
              </div>
            </div>
          ) : null}

          <div className="baseline">
            {thumbUrl ? <img className="preview-thumb" src={thumbUrl} alt="" /> : null}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="opt-label">Your photo, as-is</div>
              <LivePrice quote={run.baseline} baseline={null} />
            </div>
          </div>

          <p className="hint">
            {run.charged
              ? "Unlocked — use any image from this run at no extra cost."
              : "1 credit per run, only when you use an image that beats your photo's live shipping. Otherwise free."}
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
        </div>
      ) : null}
    </section>
  );
}
