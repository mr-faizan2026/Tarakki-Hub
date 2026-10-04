import { useState } from "react";
import type {
  FillItem,
  FillResult,
  HighlightTone,
  UnfilledRequired,
} from "@/lib/autofill-types";
import { sendToBackground } from "@/lib/messages";
import { Icon } from "../../ui/Icon";
import { Explain } from "../../ui/Explain";

/**
 * The report a run leaves behind: what was filled, what was skipped and why, and
 * which fields the seller still has to finish by hand.
 *
 * Every row is tappable: it scrolls the Meesho page to that field and rings it —
 * teal for a field we filled, dashed red for one that needs their attention. That
 * is what makes "Needs attention 1" actionable instead of worrying.
 *
 * The headline counts are honest by construction: the engine only calls a field
 * filled after reading the value back off the page.
 *
 * Honest and still misleading, though, which is what `stillRequired` is for. A
 * profile covers the fields it was captured with, so a flawless run leaves
 * Inventory, price and MRP blank whenever the form it was captured from had them
 * blank — and the seller reads a green "Filled 21 · Skipped 0" and submits. Those
 * boxes are read straight off the page once the writing stops, listed here, and
 * they turn the headline amber: a catalog Meesho will reject is not a success.
 */
export function FillReport({
  result,
  tabId,
  onDismiss,
}: {
  result: FillResult;
  tabId: number | null;
  onDismiss: () => void;
}) {
  const needsAttention = result.failed > 0 || result.stillRequired.length > 0;
  const [open, setOpen] = useState(needsAttention);
  const [missing, setMissing] = useState<string | null>(null);

  const failed = result.items.filter((i) => i.outcome === "failed");
  const skipped = result.items.filter((i) => i.outcome === "skipped");
  const filled = result.items.filter((i) => i.outcome === "filled");

  async function reveal(key: string, tone: HighlightTone) {
    if (tabId == null) return;
    setMissing(null);
    const res = await sendToBackground({
      type: "HIGHLIGHT_FIELD",
      tabId,
      key,
      tone,
    }).catch(() => null);
    if (!res?.ok) setMissing(key);
  }

  const tone = needsAttention ? "warn" : "success";

  return (
    <div className="af-report">
      <div className={`af-report__head af-report__head--${tone}`}>
        <span>
          <b>Filled {result.filled}</b>
          {" · "}Skipped {result.skipped}
          {result.failed > 0 ? (
            <>
              {" · "}
              <b>Needs attention {result.failed}</b>
            </>
          ) : null}
        </span>
        <button type="button" className="btn btn-ghost btn--sm" onClick={onDismiss} title="Dismiss">
          <Icon name="close" size={14} />
        </button>
      </div>

      {result.cancelled ? (
        <p className="hint" style={{ marginTop: 6 }}>
          Stopped — filled fields were kept.
        </p>
      ) : null}

      <p className="hint" style={{ marginTop: 6 }}>
        Nothing submitted — review and submit it yourself.
      </p>

      {failed.length ? (
        <ItemList
          title="Finish these by hand"
          items={failed}
          tone="problem"
          onPick={reveal}
          missing={missing}
        />
      ) : null}

      {result.stillRequired.length ? (
        <RequiredList items={result.stillRequired} onPick={reveal} missing={missing} />
      ) : null}

      <button
        type="button"
        className="btn btn-ghost btn--sm"
        style={{ marginTop: 8 }}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon
          name="chevron"
          size={14}
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
        {open ? "Hide details" : "Show all fields"}
      </button>

      {open ? (
        <>
          {filled.length ? (
            <ItemList title="Filled" items={filled} tone="ok" onPick={reveal} missing={missing} />
          ) : null}
          {skipped.length ? (
            <ItemList
              title="Skipped"
              items={skipped}
              tone="ok"
              onPick={reveal}
              missing={missing}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Meesho's own required fields that are still empty.
 *
 * Kept separate from "Finish these by hand" on purpose: those are fields we
 * tried and could not verify, these are mostly fields nobody ever tried, and the
 * seller's next move differs. `outsideProfile` says which, per row, and the
 * footnote says how to stop it happening again.
 */
function RequiredList({
  items,
  onPick,
  missing,
}: {
  items: UnfilledRequired[];
  onPick: (key: string, tone: HighlightTone) => void;
  missing: string | null;
}) {
  const anyOutside = items.some((i) => i.outsideProfile);
  return (
    <div className="af-report__group">
      <div className="af-list__section">
        Meesho still needs {items.length === 1 ? "this field" : `these ${items.length} fields`}
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="af-item af-item--problem"
          onClick={() => onPick(item.key, "problem")}
          title="Show this field on the page"
        >
          <span className="af-row__body">
            <span className="af-row__label">{item.label}</span>
            <span className="af-row__value">
              {/* The section is deliberately left out: the row truncates in a
                  panel this narrow, and tapping it scrolls to the field anyway. */}
              {missing === item.key
                ? "Gone from the page"
                : item.outsideProfile
                  ? "Empty — not in this profile"
                  : "Still empty"}
            </span>
          </span>
          <Icon name="crosshair" size={14} />
        </button>
      ))}
      {anyOutside ? (
        <Explain label="Why these were skipped">
          A profile only writes fields it has a value for. To cover these next time,
          finish this listing and press <b>Save current form</b> — or turn on{" "}
          <b>Include blank fields</b> first.
        </Explain>
      ) : null}
    </div>
  );
}

function ItemList({
  title,
  items,
  tone,
  onPick,
  missing,
}: {
  title: string;
  items: FillItem[];
  tone: "ok" | "problem";
  onPick: (key: string, tone: HighlightTone) => void;
  missing: string | null;
}) {
  return (
    <div className="af-report__group">
      <div className="af-list__section">{title}</div>
      {items.map((item) => (
        <button
          key={`${item.key}-${item.outcome}`}
          type="button"
          className={`af-item af-item--${tone}`}
          onClick={() => onPick(item.key, item.outcome === "failed" ? "problem" : "ok")}
          title="Show this field on the page"
        >
          <span className="af-row__body">
            <span className="af-row__label">{item.label}</span>
            <span className="af-row__value">
              {missing === item.key ? "Gone from the page" : item.reason}
            </span>
          </span>
          <Icon name="crosshair" size={14} />
        </button>
      ))}
    </div>
  );
}
