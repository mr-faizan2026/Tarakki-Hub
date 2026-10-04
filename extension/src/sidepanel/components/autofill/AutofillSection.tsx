import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { Account } from "@/lib/account";
import type { CapturedField, FieldValue } from "@/lib/autofill-types";
import { applyOverrides } from "@/lib/autofill-overrides";
import type { AutofillProfile } from "@/lib/autofill-store";
import { leafOf, pathsDiffer } from "@/lib/category-path";
import { AUTOFILL_NOTICE_KEY, DEV_TOOLS } from "@/lib/config";
import { sendToBackground, type TabState } from "@/lib/messages";
import { Icon } from "../../ui/Icon";
import { Explain } from "../../ui/Explain";
import { useAutofill } from "../../hooks/useAutofill";
import { useFillRun } from "../../hooks/useFillRun";
import { CapturePreview } from "./CapturePreview";
import { FillReport } from "./FillReport";
import { LockedAutofill } from "./LockedAutofill";
import { ManageProfiles } from "./ManageProfiles";

/**
 * ── THE FIELD SCAN IS A DEV TOOL, AND A PRODUCTION BUILD MUST NOT CONTAIN IT ──
 *
 * It lists every control the adapter can see on the seller's form, with each one's
 * resolved label, section, type and CURRENT VALUE. That is exactly the instrument
 * needed to tune detection against a real Meesho form — and exactly the wrong
 * thing to ship to sellers.
 *
 * `DEV_TOOLS` is a compile-time constant (false in a production build, see
 * lib/config.ts), and the import is DYNAMIC, so Rollup drops the whole module from
 * a release rather than merely leaving it unreachable. A dead-but-present debug
 * view is still a debug view in the zip Chrome review downloads.
 *
 * Both guards matter: the dynamic import is what removes the code, and the
 * `DEV_TOOLS &&` at the render site is what makes sure nothing can ask for it.
 */
const FieldScan = DEV_TOOLS
  ? lazy(() => import("./FieldScan").then((m) => ({ default: m.FieldScan })))
  : null;
import { ProfileFieldEditor } from "./ProfileFieldEditor";
import { QuickOverrides } from "./QuickOverrides";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  LISTING AUTOFILL — save a filled Meesho form once, fill the next in one click.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Features D, E and F of Part 2, in one narrow-panel section:
 *    D  "Save current form" → capture preview → a profile in the seller's account
 *    E   pick a profile · manage (rename / duplicate / delete / edit fields)
 *    F   Autofill: quick overrides, overwrite toggle, progress, cancel, report
 *
 *  ── THREE THINGS THIS SECTION WILL NOT DO ─────────────────────────────────
 *  1. It never submits. No Next, Save, Submit or Publish is ever clicked on
 *     Meesho, and no step is advanced. The seller reviews and submits.
 *  2. It never claims a field is filled unless the value was read back off the
 *     page (the engine's rule — see content/meesho/fill/index.ts).
 *  3. It never overwrites a value the seller already typed, unless they turn the
 *     overwrite toggle on themselves.
 *
 *  Autofill costs NO credits. Credits stay reserved for the low-shipping image
 *  above. Access is by plan, enforced by RLS in the database — the locked state is
 *  reporting a decision already made server-side, not guarding the feature.
 */

type View = "main" | "capture" | "manage" | "fields" | "scan";

export function AutofillSection({ account, tab }: { account: Account; tab: TabState }) {
  const autofill = useAutofill(account.user.id);
  const run = useFillRun();

  const [view, setView] = useState<View>("main");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AutofillProfile | null>(null);

  const [newName, setNewName] = useState("");
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState<{
    fields: CapturedField[];
    categoryPath: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [noticeSeen, setNoticeSeen] = useState(true);

  const [overwrite, setOverwrite] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, FieldValue>>({});
  const [alsoSave, setAlsoSave] = useState(false);
  const [confirmMismatch, setConfirmMismatch] = useState(false);

  const tabId = tab.meeshoTabId;
  const formPresent = tab.form.present;

  const selected = useMemo(
    () => autofill.profiles.find((p) => p.id === selectedId) ?? null,
    [autofill.profiles, selectedId],
  );

  /* The panel shows the most recently used profile first; pre-select it so the
   * common case is two clicks: open the panel, press Autofill. */
  useEffect(() => {
    if (selectedId && autofill.profiles.some((p) => p.id === selectedId)) return;
    setSelectedId(autofill.profiles[0]?.id ?? null);
  }, [autofill.profiles, selectedId]);

  // Changing profile invalidates the per-run edits and the last report.
  const resetRun = run.reset;
  useEffect(() => {
    setOverrides({});
    setAlsoSave(false);
    setConfirmMismatch(false);
    resetRun();
  }, [selectedId, resetRun]);

  // "Your listing values are saved to your TarakkiHub account" — shown once.
  useEffect(() => {
    chrome.storage.local
      .get(AUTOFILL_NOTICE_KEY)
      .then((res) => setNoticeSeen(res?.[AUTOFILL_NOTICE_KEY] === true))
      .catch(() => setNoticeSeen(true));
  }, []);

  const mismatch = pathsDiffer(selected?.category_path ?? null, tab.form.categoryPath);

  /* ─── Feature D: capture ─────────────────────────────────────────────── */

  const captureForm = useCallback(async () => {
    if (tabId == null) return;
    setCapturing(true);
    setCaptureError(null);
    const res = await sendToBackground({
      type: "CAPTURE_FORM",
      tabId,
      includeEmpty,
    }).catch(() => null);
    setCapturing(false);

    if (!res?.ok) {
      setCaptureError(res?.error ?? "Couldn't read your panel. Reload that tab.");
      return;
    }
    setCaptured({ fields: res.fields, categoryPath: res.categoryPath });
    setView("capture");
  }, [tabId, includeEmpty]);

  async function saveCaptured(fields: CapturedField[]) {
    setSaving(true);
    const created = await autofill.save(newName, captured?.categoryPath ?? null, fields);
    setSaving(false);
    if (!created) return; // the error is surfaced by the hook
    if (!noticeSeen) {
      setNoticeSeen(true);
      void chrome.storage.local.set({ [AUTOFILL_NOTICE_KEY]: true }).catch(() => {});
    }
    setCaptured(null);
    setNewName("");
    setSelectedId(created.id);
    setView("main");
  }

  /* ─── Feature F: the run ─────────────────────────────────────────────── */

  async function startFill() {
    if (!selected || tabId == null) return;
    if (mismatch && !confirmMismatch) {
      setConfirmMismatch(true);
      return;
    }
    setConfirmMismatch(false);

    const fields = applyOverrides(selected.fields, overrides);
    const result = await run.start(tabId, fields, overwrite);
    if (!result) return;

    await autofill.logRun(selected.id, result.filled, result.skipped, result.failed);
    if (alsoSave && Object.keys(overrides).length) {
      await autofill.saveFields(selected.id, fields);
      setAlsoSave(false);
      setOverrides({});
    }
  }

  /* ─── locked / loading ───────────────────────────────────────────────── */

  if (autofill.loading) {
    return (
      <section className="section">
        <div className="section__title">
          <Icon name="sliders" size={18} />
          Listing autofill
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          Checking your plan…
        </p>
      </section>
    );
  }

  if (!autofill.planActive) {
    return <LockedAutofill reason={autofill.error} />;
  }

  /* ─── sub-views ──────────────────────────────────────────────────────── */

  if (view === "scan" && FieldScan) {
    return (
      <section className="section">
        <Suspense fallback={<p className="hint">Loading the field scan…</p>}>
          <FieldScan
            tabId={tabId}
            profileFields={selected?.fields ?? null}
            onClose={() => setView("main")}
          />
        </Suspense>
      </section>
    );
  }

  if (view === "capture" && captured) {
    return (
      <section className="section">
        <CapturePreview
          name={newName.trim() || "Untitled profile"}
          categoryPath={captured.categoryPath}
          fields={captured.fields}
          saving={saving}
          showStorageNotice={!noticeSeen}
          includeEmpty={includeEmpty}
          onCancel={() => {
            setCaptured(null);
            setView("main");
          }}
          onSave={saveCaptured}
        />
        {autofill.error ? <div className="alert" style={{ marginTop: 10 }}>{autofill.error}</div> : null}
      </section>
    );
  }

  if (view === "fields" && editing) {
    return (
      <section className="section">
        <ProfileFieldEditor
          profile={editing}
          saving={saving}
          onBack={() => setView("manage")}
          onSave={async (fields) => {
            setSaving(true);
            await autofill.saveFields(editing.id, fields);
            setSaving(false);
            setView("manage");
          }}
        />
      </section>
    );
  }

  if (view === "manage") {
    return (
      <section className="section">
        <ManageProfiles
          profiles={autofill.profiles}
          onBack={() => setView("main")}
          onRename={(id, name) => void autofill.rename(id, name)}
          onDuplicate={(profile) => void autofill.duplicate(profile)}
          onDelete={(id) => void autofill.remove(id)}
          onEditFields={(profile) => {
            setEditing(profile);
            setView("fields");
          }}
        />
        {autofill.error ? <div className="alert" style={{ marginTop: 10 }}>{autofill.error}</div> : null}
      </section>
    );
  }

  /* ─── main view ──────────────────────────────────────────────────────── */

  const busy = run.running;

  return (
    <section className="section">
      <div className="row spread">
        <div className="section__title">
          <Icon name="sliders" size={18} />
          Listing autofill
        </div>
        {DEV_TOOLS ? (
          <button
            type="button"
            className="btn btn-ghost btn--sm"
            onClick={() => setView("scan")}
            title="Field scan (dev)"
          >
            <Icon name="search" size={14} />
          </button>
        ) : null}
      </div>

      {tabId == null ? (
        <p className="hint" style={{ marginTop: 8 }}>
          Open your supplier panel.
        </p>
      ) : !formPresent ? (
        <p className="hint" style={{ marginTop: 8 }}>
          Open a listing form.
        </p>
      ) : (
        <p className="hint" style={{ marginTop: 8 }}>
          {tab.form.fieldCount} fields on this form
          {tab.form.filledCount ? ` · ${tab.form.filledCount} filled` : ""}
          {tab.form.categoryPath ? ` · ${tab.form.categoryPath}` : ""}
        </p>
      )}

      <Explain label="What autofill does">
        Saves a filled Meesho form once, then types it into your next listing. It never
        submits, never changes the category, and never overwrites something you typed
        unless you turn that on. Uses no credits.
      </Explain>

      {/* ── pick a profile + fill ── */}
      <div className="af-pick" style={{ marginTop: 12 }}>
        <select
          className="select af-pick__select"
          value={selectedId ?? ""}
          disabled={busy || autofill.profiles.length === 0}
          onChange={(e) => setSelectedId(e.target.value || null)}
          aria-label="Select profile"
        >
          {autofill.profiles.length === 0 ? (
            <option value="">No profiles yet</option>
          ) : (
            autofill.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} · {profile.field_count}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !selected || !formPresent || tabId == null}
          onClick={() => void startFill()}
        >
          {busy ? (
            <Icon name="refresh" size={15} className="spin" />
          ) : (
            <Icon name="spark" size={15} />
          )}
          Autofill
        </button>
      </div>

      {selected && mismatch ? (
        <div className="af-warn">
          <Icon name="alert" size={15} />
          <div>
            Saved for <b>{leafOf(selected.category_path) || "another category"}</b> · this
            listing is <b>{leafOf(tab.form.categoryPath) || "this category"}</b>.
            {confirmMismatch ? (
              <>
                {" "}
                Fill matching fields anyway?
                <div className="row" style={{ gap: 7, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn--sm"
                    style={{ flex: 1 }}
                    onClick={() => void startFill()}
                  >
                    Fill anyway
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn--sm"
                    onClick={() => setConfirmMismatch(false)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {selected ? (
        <>
          <QuickOverrides
            fields={selected.fields}
            overrides={overrides}
            onChange={(key, value) => setOverrides((prev) => ({ ...prev, [key]: value }))}
            alsoSave={alsoSave}
            onAlsoSaveChange={setAlsoSave}
            disabled={busy}
          />

          <label className="switch-row" style={{ marginTop: 10 }}>
            <span className="hint">Overwrite filled fields</span>
            <input
              type="checkbox"
              className="switch"
              checked={overwrite}
              disabled={busy}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
          </label>
        </>
      ) : null}

      {/* ── progress ── */}
      {run.progress?.running ? (
        <div className="progress" style={{ marginTop: 12 }}>
          <div className="row spread">
            <span className="hint">
              Filling {run.progress.done} / {run.progress.total}
              {run.progress.label ? ` · ${run.progress.label}` : ""}
            </span>
            <button type="button" className="btn btn-ghost btn--sm" onClick={run.cancel}>
              Cancel
            </button>
          </div>
          <div className="progress__track">
            <div
              className="progress__bar"
              style={{
                width: `${Math.round(
                  (run.progress.done / Math.max(run.progress.total, 1)) * 100,
                )}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {run.error ? <div className="alert" style={{ marginTop: 10 }}>{run.error}</div> : null}
      {autofill.error ? (
        <div className="alert" style={{ marginTop: 10 }}>
          {autofill.error}
        </div>
      ) : null}

      {run.result && !run.running ? (
        <FillReport result={run.result} tabId={tabId} onDismiss={run.reset} />
      ) : null}

      {/* ── save a new profile ── */}
      <div className="af-save">
        <label className="opt-label" htmlFor="af-new-name">
          New profile
        </label>
        <input
          id="af-new-name"
          className="input"
          placeholder="e.g. kurti"
          value={newName}
          disabled={busy}
          onChange={(e) => setNewName(e.target.value)}
        />
        <label className="switch-row" style={{ marginTop: 8 }}>
          <span className="hint">Include blank fields</span>
          <input
            type="checkbox"
            className="switch"
            checked={includeEmpty}
            disabled={busy || capturing}
            onChange={(e) => setIncludeEmpty(e.target.checked)}
          />
        </label>
        <button
          type="button"
          className="btn btn-secondary btn--block"
          disabled={busy || capturing || tabId == null}
          onClick={() => void captureForm()}
          style={{ marginTop: 8 }}
        >
          {capturing ? (
            <>
              <Icon name="refresh" size={15} className="spin" /> Reading…
            </>
          ) : (
            <>
              <Icon name="plus" size={15} /> Save current form
            </>
          )}
        </button>
        {captureError ? (
          <div className="alert" style={{ marginTop: 8 }}>
            {captureError}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="btn btn-ghost btn--sm"
        style={{ marginTop: 10 }}
        onClick={() => setView("manage")}
      >
        <Icon name="sliders" size={14} /> Manage profiles
      </button>
    </section>
  );
}

/* Category comparison lives in lib/category-path.ts — the image tool below
 * asks the same question of the same breadcrumb, and two copies of "are these
 * the same category?" is one copy too many. */
