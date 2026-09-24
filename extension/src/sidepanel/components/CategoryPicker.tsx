import { useEffect, useRef, useState } from "react";
import { sendToBackground, type MeeshoCategory } from "@/lib/messages";
import { Icon } from "../ui/Icon";

/**
 * Meesho category picker. Searches with Meesho's own category search (the one
 * behind "Add Single Catalog"), so the ids are exactly the ones Meesho prices
 * shipping with. Shows each hit's full path, e.g. Men Fashion › … › Tshirts.
 */
export function CategoryPicker({
  tabId,
  value,
  onChange,
  disabled,
}: {
  tabId: number | null;
  value: MeeshoCategory | null;
  onChange: (category: MeeshoCategory) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(value == null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MeeshoCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || tabId == null) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const res = await sendToBackground({ type: "SEARCH_CATEGORIES", tabId, query: q }).catch(
        () => null,
      );
      if (!live) return;
      setLoading(false);
      if (res?.ok) {
        setResults(res.categories);
        setError(res.categories.length ? null : "No Meesho category matches that.");
      } else {
        setResults([]);
        setError(res?.error ?? "Couldn't search Meesho categories.");
      }
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query, open, tabId]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open && value) {
    return (
      <div className="cat-chosen">
        <div style={{ minWidth: 0 }}>
          <div className="cat-chosen__name">{value.name}</div>
          <div className="cat-chain">{value.chain.join(" › ")}</div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn--sm"
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="cat-picker">
      <input
        ref={inputRef}
        className="input"
        placeholder={tabId == null ? "Open your supplier panel to search" : "Search e.g. Tshirts, Sarees, Kurtis"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled || tabId == null}
      />
      {loading ? <p className="hint">Searching Meesho…</p> : null}
      {!loading && error && query.trim().length >= 2 ? <p className="hint">{error}</p> : null}
      {results.length ? (
        <ul className="cat-list" role="listbox">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="cat-option"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="cat-option__name">{c.name}</span>
                <span className="cat-chain">{c.chain.join(" › ")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {value ? (
        <button
          type="button"
          className="btn btn-ghost btn--sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setOpen(false)}
        >
          <Icon name="check" size={14} /> Keep {value.name}
        </button>
      ) : null}
    </div>
  );
}
