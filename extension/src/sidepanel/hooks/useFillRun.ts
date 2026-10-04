import { useCallback, useEffect, useRef, useState } from "react";
import type { CapturedField, FillProgress, FillResult } from "@/lib/autofill-types";
import { sendToBackground, type BgToPanel } from "@/lib/messages";
import { clearBusy, markBusy } from "@/lib/busy";

/**
 * Drives one autofill run: start it, watch it, cancel it, read the report.
 *
 * Progress arrives as a broadcast from the content script (via the background),
 * not as a return value, because a run takes seconds and the seller deserves to
 * see it move. The final report comes back as the resolved response, so a panel
 * that was closed mid-run does not lose it — reopening shows the last report this
 * hook still holds for as long as the panel lives.
 */

export type FillRunApi = {
  running: boolean;
  progress: FillProgress | null;
  result: FillResult | null;
  error: string | null;
  /** Start a run on `tabId`. Resolves with the report, or null on failure. */
  start: (
    tabId: number,
    fields: CapturedField[],
    overwrite: boolean,
  ) => Promise<FillResult | null>;
  cancel: () => void;
  /** Clear the last report (e.g. when the seller picks another profile). */
  reset: () => void;
};

export function useFillRun(): FillRunApi {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<FillProgress | null>(null);
  const [result, setResult] = useState<FillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tabRef = useRef<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const onMessage = (msg: BgToPanel, sender: chrome.runtime.MessageSender) => {
      // Only trust the background's relay. A content script's own broadcast also
      // reaches this listener and could come from a tab we are not running on.
      if (sender.tab) return;
      if (msg.type !== "FILL_PROGRESS") return;
      setProgress(msg.progress);
      if (!msg.progress.running) setRunning(false);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  const start = useCallback(
    async (tabId: number, fields: CapturedField[], overwrite: boolean) => {
      if (!fields.length) {
        setError("This profile has no fields to fill.");
        return null;
      }
      tabRef.current = tabId;
      setRunning(true);
      setResult(null);
      setError(null);
      setProgress({ running: true, done: 0, total: fields.length, label: "", pass: 1 });

      // Tell the background not to apply a pending extension update right now: a
      // reload mid-fill would tear down the content script with the seller's form
      // half-written and no report of what landed (see lib/busy.ts).
      await markBusy();

      try {
        const res = await sendToBackground({
          type: "FILL_FORM",
          tabId,
          fields,
          overwrite,
        });
        if (!alive.current) return null;
        if (!res?.ok) {
          setError(res?.error ?? "Couldn't reach your supplier panel.");
          return null;
        }
        setResult(res.result);
        return res.result;
      } catch {
        if (alive.current) setError("Couldn't reach your supplier panel. Reload that tab.");
        return null;
      } finally {
        // Outside the `alive` check on purpose: the flag must be cleared even if
        // the panel was closed mid-run, or a stale "busy" would defer updates
        // until it ages out.
        await clearBusy();
        if (alive.current) {
          setRunning(false);
          setProgress(null);
        }
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    const tabId = tabRef.current;
    if (tabId == null) return;
    // Fire-and-forget: the run answers with its report, which is what updates the
    // UI. Fields already written stay written — see the engine's header comment.
    void sendToBackground({ type: "CANCEL_FILL", tabId }).catch(() => {});
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
  }, []);

  return { running, progress, result, error, start, cancel, reset };
}
