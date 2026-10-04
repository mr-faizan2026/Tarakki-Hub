/**
 * ════════════════════════════════════════════════════════════════════════════
 *  AUTOFILL LAB — exercise the real adapter against a Meesho-shaped form.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Run: npx vite --config vite.preview.config.ts  →  http://localhost:5199/autofill-lab.html
 *
 *  WHY THIS EXISTS. Detection and filling only matter against a React SPA in a
 *  real browser: controlled inputs that revert a naive `el.value = x`, custom
 *  dropdowns that only respond to pointer events, option lists that mount
 *  asynchronously and show a slice of their options, and fields that appear only
 *  after an earlier answer. None of that can be checked in Node, and the real
 *  supplier panel needs a seller's live account.
 *
 *  So this page is a stand-in: the form below is deliberately built the awkward
 *  way Meesho builds theirs — labels as plain <div>s with no `for`, generated-
 *  looking class names, a trigger-plus-listbox dropdown, a filterable combobox
 *  that renders only five options at a time, a chips multiselect, a native
 *  select, a radio group, a checkbox, repeated "Name"/"Address" blocks in two
 *  sections, and a GST field that reveals another field when answered.
 *
 *  It imports the SHIPPING modules from src/content/meesho — nothing is
 *  reimplemented — so a pass here means the code that ships works on markup of
 *  this shape. It is NOT a substitute for running the side panel's Field scan
 *  against the real Meesho form; it is what makes that first live run boring.
 *
 *  The MAIN-world fallback cannot work here (there is no extension background to
 *  ask), so every write on this page has to succeed through the isolated-world
 *  path alone — which is the stricter test.
 */

import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CapturedField, FillResult } from "@/lib/autofill-types";
import {
  cancelFill,
  categoryPath,
  currentValue,
  discoverFields,
  formRoot,
  formStatus,
  highlightField,
  runFill,
  toCaptured,
  toScanned,
} from "@/content/meesho";

/**
 * The adapter, on the window, so a single field can be poked at from the browser
 * console while tuning:
 *
 *   tk.fields().map(f => [f.label, f.type, tk.currentValue(f)])
 *   tk.runFill({ fields: tk.capture(), overwrite: true }, { onProgress: console.log })
 */
Object.assign(window as unknown as Record<string, unknown>, {
  tk: {
    formRoot,
    formStatus,
    fields: () => discoverFields(),
    capture: () => discoverFields().filter((f) => !f.empty).map(toCaptured),
    currentValue,
    highlightField,
    runFill,
    cancelFill,
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   The synthetic supplier panel
   ══════════════════════════════════════════════════════════════════════════ */

/** A label rendered as a plain div, exactly as Meesho does it. */
function Label({ children }: { children: string }) {
  return <div className="css-1lbl">{children}</div>;
}

function TextField({
  label,
  value,
  onChange,
  numeric,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="css-9fld">
      <Label>{label}</Label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} />
      ) : (
        <input
          value={value}
          inputMode={numeric ? "numeric" : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/**
 * A custom dropdown: a trigger showing the chosen text and a listbox that mounts
 * on click. Options respond to POINTERDOWN only — a bare `.click()` misses them,
 * which is why the adapter dispatches a full pointer sequence.
 */
function Dropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useMemo(() => `dd-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <div className="css-9fld">
      <Label>{label}</Label>
      <div
        className="css-2trg"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setOpen(true);
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {value || "Select"}
      </div>
      {open ? (
        <ul id={listId} role="listbox" className="css-3lst">
          {options.map((option) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              onPointerDown={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A filterable combobox that renders only the first five matches — the shape of
 * Meesho's long lists (Fabric, Brand). Reaching option #20 is only possible by
 * typing into the filter, which is strategy (b) in the dropdown handler.
 */
function SearchCombobox({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = options
    .filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 5);

  return (
    <div className="css-9fld">
      <Label>{label}</Label>
      <div
        className="css-2trg"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(true)}
      >
        <input
          aria-autocomplete="list"
          placeholder="Select"
          value={open ? query : value}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open ? (
        <ul role="listbox" className="css-3lst">
          {shown.length === 0 ? <li className="css-empty">No match</li> : null}
          {shown.map((option) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              onPointerDown={() => {
                onChange(option);
                setQuery("");
                setOpen(false);
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Chips: several values in one widget, added one at a time from a list. */
function Chips({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="css-9fld">
      <Label>{label}</Label>
      <div
        className="css-2trg"
        role="combobox"
        aria-multiselectable="true"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
      >
        {values.length ? (
          values.map((v) => (
            <span key={v} data-tk-chip className="css-chip">
              {v}
            </span>
          ))
        ) : (
          <span>Select</span>
        )}
      </div>
      {open ? (
        <ul role="listbox" aria-multiselectable="true" className="css-3lst">
          {options.map((option) => (
            <li
              key={option}
              role="option"
              aria-selected={values.includes(option)}
              onPointerDown={(e) => {
                e.stopPropagation();
                onChange(
                  values.includes(option)
                    ? values.filter((v) => v !== option)
                    : [...values, option],
                );
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const FABRICS = [
  "Acrylic",
  "Art Silk",
  "Bamboo",
  "Chiffon",
  "Corduroy",
  "Cotton",
  "Cotton Blend",
  "Crepe",
  "Denim",
  "Georgette",
  "Jute",
  "Khadi Cotton",
  "Linen",
  "Lycra",
  "Modal",
  "Net",
  "Nylon",
  "Polycotton",
  "Rayon",
  "Satin",
  "Silk Blend",
  "Velvet",
  "Viscose Rayon",
  "Wool",
];

type FormState = {
  productName: string;
  price: string;
  mrp: string;
  description: string;
  colour: string;
  fabric: string;
  sizes: string[];
  pattern: string;
  sleeve: string;
  countryOfOrigin: string;
  imported: boolean;
  gstRegistered: string;
  gstin: string;
  manufacturerName: string;
  manufacturerAddress1: string;
  manufacturerAddress2: string;
  packerName: string;
  packerAddress1: string;
  hsn: string;
};

const BLANK: FormState = {
  productName: "",
  price: "",
  mrp: "",
  description: "",
  colour: "",
  fabric: "",
  sizes: [],
  pattern: "",
  sleeve: "",
  countryOfOrigin: "",
  imported: false,
  gstRegistered: "",
  gstin: "",
  manufacturerName: "",
  manufacturerAddress1: "",
  manufacturerAddress2: "",
  packerName: "",
  packerAddress1: "",
  hsn: "",
};

const FILLED: FormState = {
  productName: "Rayon Printed Straight Kurti",
  price: "449",
  mrp: "1299",
  description: "Soft rayon straight kurti with all-over print. Regular fit.",
  colour: "Maroon",
  fabric: "Viscose Rayon",
  sizes: ["M", "L", "XL"],
  // The native select's VALUE is an internal id; the adapter must store the
  // visible text ("Printed") and match on it when filling.
  pattern: "p-prt",
  sleeve: "Three-Quarter Sleeve",
  countryOfOrigin: "India",
  imported: false,
  gstRegistered: "Registered",
  gstin: "27ABCDE1234F1Z5",
  manufacturerName: "Tarakki Garments",
  manufacturerAddress1: "Plot 14, MIDC Phase II",
  manufacturerAddress2: "Andheri East, Mumbai 400093",
  packerName: "Tarakki Packing Co",
  packerAddress1: "Unit 7, Bhiwandi Warehouse Park",
  hsn: "6211",
};

function SupplierPanel({
  state,
  set,
}: {
  state: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  return (
    <div className="page">
      {/* Page chrome: must be excluded from discovery entirely. */}
      <header className="chrome">
        <strong>Meesho Supplier</strong>
        <input placeholder="Search orders" aria-label="Search" />
        <nav>
          <a href="#">Orders</a>
          <a href="#">Payments</a>
        </nav>
      </header>

      <nav aria-label="breadcrumb" className="crumbs">
        Catalog <span>›</span> Women Western <span>›</span> Kurtis
      </nav>

      <main className="css-8form">
        <h2>Product Details</h2>
        <TextField
          label="Product Name *"
          value={state.productName}
          onChange={(v) => set("productName", v)}
        />
        <TextField
          label="Meesho Price"
          numeric
          value={state.price}
          onChange={(v) => set("price", v)}
        />
        <TextField label="MRP" numeric value={state.mrp} onChange={(v) => set("mrp", v)} />
        <TextField
          label="Product Description"
          multiline
          value={state.description}
          onChange={(v) => set("description", v)}
        />
        <Dropdown
          label="Colour"
          options={["Beige", "Black", "Maroon", "Mustard", "Navy Blue", "Olive"]}
          value={state.colour}
          onChange={(v) => set("colour", v)}
        />
        <SearchCombobox
          label="Fabric"
          options={FABRICS}
          value={state.fabric}
          onChange={(v) => set("fabric", v)}
        />
        <Chips
          label="Size"
          options={["XS", "S", "M", "L", "XL", "XXL", "3XL"]}
          values={state.sizes}
          onChange={(v) => set("sizes", v)}
        />

        <div className="css-9fld">
          <Label>Pattern</Label>
          <select value={state.pattern} onChange={(e) => set("pattern", e.target.value)}>
            <option value="">Select</option>
            <option value="p-sol">Solid</option>
            <option value="p-prt">Printed</option>
            <option value="p-emb">Embroidered</option>
          </select>
        </div>

        <fieldset className="css-9fld">
          <legend>Sleeve Length</legend>
          {["Sleeveless", "Short Sleeve", "Three-Quarter Sleeve", "Long Sleeve"].map((opt) => (
            <label key={opt} className="css-radio">
              <input
                type="radio"
                name="sleeve"
                checked={state.sleeve === opt}
                onChange={() => set("sleeve", opt)}
              />
              {opt}
            </label>
          ))}
        </fieldset>

        <h2>Manufacturing Details</h2>
        <TextField
          label="Name"
          value={state.manufacturerName}
          onChange={(v) => set("manufacturerName", v)}
        />
        <TextField
          label="Address"
          value={state.manufacturerAddress1}
          onChange={(v) => set("manufacturerAddress1", v)}
        />
        <TextField
          label="Address"
          value={state.manufacturerAddress2}
          onChange={(v) => set("manufacturerAddress2", v)}
        />
        <TextField label="HSN Code" value={state.hsn} onChange={(v) => set("hsn", v)} />
        <Dropdown
          label="Country of Origin"
          options={["Bangladesh", "China", "India", "Vietnam"]}
          value={state.countryOfOrigin}
          onChange={(v) => set("countryOfOrigin", v)}
        />
        <label className="css-check">
          <input
            type="checkbox"
            checked={state.imported}
            onChange={(e) => set("imported", e.target.checked)}
          />
          Imported product
        </label>

        <h2>Packer Details</h2>
        {/* Same labels as Manufacturing Details — disambiguated by section. */}
        <TextField label="Name" value={state.packerName} onChange={(v) => set("packerName", v)} />
        <TextField
          label="Address"
          value={state.packerAddress1}
          onChange={(v) => set("packerAddress1", v)}
        />

        <h2>Tax Details</h2>
        <div className="css-9fld">
          <Label>GST Registration</Label>
          <select
            value={state.gstRegistered}
            onChange={(e) => set("gstRegistered", e.target.value)}
          >
            <option value="">Select</option>
            <option value="Registered">Registered</option>
            <option value="Composition">Composition</option>
            <option value="Unregistered">Unregistered</option>
          </select>
        </div>
        {/* CASCADING: only exists once GST Registration is answered "Registered". */}
        {state.gstRegistered === "Registered" ? (
          <TextField label="GSTIN Number" value={state.gstin} onChange={(v) => set("gstin", v)} />
        ) : null}

        {/* Never clicked by the extension. Present so that is visible. */}
        <button type="button" className="css-submit">
          Submit catalog
        </button>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   The lab controls
   ══════════════════════════════════════════════════════════════════════════ */

type LogLine = { tone: "ok" | "bad" | "info"; text: string };

function Lab() {
  const [state, setState] = useState<FormState>(FILLED);
  const [captured, setCaptured] = useState<CapturedField[] | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<FillResult | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const say = (tone: LogLine["tone"], text: string) =>
    setLog((prev) => [...prev, { tone, text }]);

  function scan() {
    setLog([]);
    const root = formRoot();
    if (!root) {
      say("bad", "formRoot() found no catalog form.");
      return;
    }
    const status = formStatus();
    const fields = discoverFields(root).map(toScanned);
    say("info", `root <${root.tagName.toLowerCase()} class="${root.className}">`);
    say(
      status.present ? "ok" : "bad",
      `${status.fieldCount} fields · ${status.filledCount} filled · ${status.categoryPath}`,
    );
    // The chrome search box must never appear here.
    const leak = fields.find((f) => /search/i.test(f.label));
    say(leak ? "bad" : "ok", leak ? `LEAK: captured "${leak.label}"` : "page chrome excluded");
    for (const field of fields) {
      say(
        "info",
        `${field.section} › ${field.label}${field.occurrence ? ` #${field.occurrence + 1}` : ""} · ${field.type} = ${JSON.stringify(field.value)}`,
      );
    }
  }

  function capture() {
    setLog([]);
    const root = formRoot();
    if (!root) {
      say("bad", "No form to capture.");
      return;
    }
    const live = discoverFields(root);
    const fields = live.filter((f) => !f.empty).map(toCaptured);
    setCaptured(fields);
    say("ok", `Captured ${fields.length} filled fields · ${categoryPath(root, live)}`);
  }

  async function fill() {
    if (!captured) {
      say("bad", "Capture the filled form first.");
      return;
    }
    setLog([]);
    setResult(null);
    const outcome = await runFill(
      { fields: captured, overwrite },
      {
        onProgress: (p) =>
          setProgress(p.running ? `Filling ${p.done} / ${p.total} · pass ${p.pass} · ${p.label}` : ""),
      },
    );
    setResult(outcome);

    say(
      outcome.failed === 0 && outcome.stillRequired.length === 0 ? "ok" : "bad",
      `Filled ${outcome.filled} · Skipped ${outcome.skipped} · Needs attention ${outcome.failed} · Still required ${outcome.stillRequired.length} · ${outcome.passes} pass(es)`,
    );
    // What the form says it still needs, read back off the page — the fields a
    // profile never covered show up here and nowhere else.
    for (const need of outcome.stillRequired) {
      say(
        "bad",
        `STILL REQUIRED · ${need.section} › ${need.label}${need.outsideProfile ? " — not in the profile" : ""}`,
      );
    }
    for (const item of outcome.items) {
      say(
        item.outcome === "filled" ? "ok" : item.outcome === "failed" ? "bad" : "info",
        `${item.outcome.toUpperCase()} · ${item.section} › ${item.label} — ${item.reason}`,
      );
    }
  }

  return (
    <div className="lab">
      <div className="lab__panel">
        <h1>Autofill lab</h1>
        <p className="lab__note">
          The real adapter, against a Meesho-shaped React form. Capture the filled
          form, clear it, then fill — every value has to come back through
          controlled inputs, a pointer-only dropdown, a five-at-a-time combobox, a
          chips widget and a field that only appears after the GST answer.
        </p>

        <div className="lab__row">
          <button type="button" onClick={() => setState(FILLED)}>
            Fill form (as a seller would)
          </button>
          <button type="button" onClick={() => setState(BLANK)}>
            Clear form
          </button>
        </div>
        <div className="lab__row">
          <button type="button" onClick={scan}>
            1 · Field scan
          </button>
          <button type="button" onClick={capture}>
            2 · Capture
          </button>
          <button type="button" onClick={() => void fill()} disabled={!captured}>
            3 · Autofill
          </button>
        </div>
        <label className="lab__check">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />
          Overwrite fields that already have a value
        </label>

        {captured ? <p className="lab__note">Profile holds {captured.length} fields.</p> : null}
        {progress ? <p className="lab__progress">{progress}</p> : null}
        {result ? (
          <p className={result.failed === 0 ? "lab__ok" : "lab__bad"}>
            {result.failed === 0 ? "ALL VERIFIED" : `${result.failed} need attention`}
          </p>
        ) : null}

        <div className="lab__log">
          {log.map((line, i) => (
            <div key={i} className={`lab__line lab__line--${line.tone}`}>
              {line.text}
            </div>
          ))}
        </div>
      </div>

      <div className="lab__form">
        <SupplierPanel state={state} set={set} />
      </div>
    </div>
  );
}

const CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; color: #16293b; background: #f4f5f3; }
  .lab { display: grid; grid-template-columns: 420px 1fr; min-height: 100vh; }
  .lab__panel { padding: 18px; background: #fff; border-right: 1px solid #e9ecea; overflow-y: auto; max-height: 100vh; }
  .lab__panel h1 { font-size: 19px; margin: 0 0 8px; }
  .lab__note { font-size: 12.5px; color: #5a6f7e; }
  .lab__row { display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; }
  .lab__row button { padding: 7px 11px; border: 1px solid #dbe0dc; border-radius: 6px; background: #fff; cursor: pointer; font: inherit; }
  .lab__row button:disabled { opacity: .5; cursor: not-allowed; }
  .lab__check { display: flex; align-items: center; gap: 7px; font-size: 12.5px; }
  .lab__progress { font-size: 12.5px; color: #0b7c6d; font-weight: 600; }
  .lab__ok { color: #0b7c6d; font-weight: 700; }
  .lab__bad { color: #b23a2e; font-weight: 700; }
  .lab__log { margin-top: 10px; font: 11.5px/1.5 ui-monospace, monospace; }
  .lab__line { padding: 2px 0; border-bottom: 1px solid #f0f2f0; word-break: break-word; }
  .lab__line--ok { color: #0b7c6d; }
  .lab__line--bad { color: #b23a2e; font-weight: 700; }
  .lab__line--info { color: #40566a; }
  .lab__form { overflow-y: auto; max-height: 100vh; }

  .page { padding: 0 0 60px; }
  .chrome { display: flex; align-items: center; gap: 14px; padding: 10px 18px; background: #16293b; color: #fff; }
  .chrome input { padding: 5px 8px; border-radius: 4px; border: 0; }
  .chrome nav { display: flex; gap: 12px; }
  .chrome a { color: #c7cfd5; text-decoration: none; }
  .crumbs { padding: 10px 18px; font-size: 12.5px; color: #5a6f7e; }
  .crumbs span { margin: 0 4px; }
  .css-8form { background: #fff; margin: 0 18px; padding: 18px; border: 1px solid #e9ecea; border-radius: 10px; max-width: 620px; }
  .css-8form h2 { font-size: 15px; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e9ecea; }
  .css-8form h2:first-child { margin-top: 0; }
  .css-9fld { margin-bottom: 12px; position: relative; border: 0; padding: 0; }
  .css-1lbl { font-size: 12.5px; font-weight: 600; color: #26394c; margin-bottom: 4px; }
  .css-9fld input, .css-9fld textarea, .css-9fld select { width: 100%; padding: 7px 9px; border: 1px solid #dbe0dc; border-radius: 6px; font: inherit; }
  .css-2trg { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-height: 34px; padding: 4px 9px; border: 1px solid #dbe0dc; border-radius: 6px; background: #fff; cursor: pointer; }
  .css-2trg input { border: 0 !important; padding: 0 !important; flex: 1; outline: none; }
  .css-3lst { position: absolute; z-index: 20; left: 0; right: 0; margin: 2px 0 0; padding: 4px; list-style: none; max-height: 180px; overflow-y: auto; background: #fff; border: 1px solid #dbe0dc; border-radius: 6px; box-shadow: 0 8px 24px -12px rgba(14,33,49,.4); }
  .css-3lst li { padding: 6px 8px; border-radius: 4px; cursor: pointer; }
  .css-3lst li:hover { background: #edfbf7; }
  .css-chip { padding: 1px 7px; border-radius: 999px; background: #d2f4ec; color: #0a6154; font-size: 12px; }
  .css-radio, .css-check { display: flex; align-items: center; gap: 7px; font-size: 13px; margin-bottom: 4px; }
  .css-radio input, .css-check input { width: auto !important; }
  legend { font-size: 12.5px; font-weight: 600; color: #26394c; padding: 0 0 4px; }
  .css-submit { margin-top: 18px; padding: 9px 16px; border: 0; border-radius: 6px; background: #16293b; color: #fff; font: inherit; cursor: pointer; }
`;

const style = document.createElement("style");
style.textContent = CSS;
document.head.append(style);

createRoot(document.getElementById("root")!).render(<Lab />);
