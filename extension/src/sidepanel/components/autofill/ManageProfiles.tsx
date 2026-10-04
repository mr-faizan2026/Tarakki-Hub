import { useState } from "react";
import type { AutofillProfile } from "@/lib/autofill-store";
import { Icon } from "../../ui/Icon";

/**
 * Feature E — the profile manager. Rename, duplicate, delete (with a confirm) and
 * open the field editor. Each row shows the facts that help a seller pick between
 * two similar profiles: category, how many fields, how often used, when last used.
 */
export function ManageProfiles({
  profiles,
  onBack,
  onRename,
  onDuplicate,
  onDelete,
  onEditFields,
}: {
  profiles: AutofillProfile[];
  onBack: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (profile: AutofillProfile) => void;
  onDelete: (id: string) => void;
  onEditFields: (profile: AutofillProfile) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function startRename(profile: AutofillProfile) {
    setRenaming(profile.id);
    setDraft(profile.name);
    setConfirmDelete(null);
  }

  function commitRename(id: string) {
    const name = draft.trim();
    if (name) onRename(id, name);
    setRenaming(null);
  }

  return (
    <div className="stack">
      <div className="row spread">
        <button type="button" className="btn btn-ghost btn--sm" onClick={onBack}>
          <Icon name="arrowRight" size={14} style={{ transform: "rotate(180deg)" }} />
          Back
        </button>
        <span className="hint">
          {profiles.length} profile{profiles.length === 1 ? "" : "s"}
        </span>
      </div>

      {profiles.length === 0 ? (
        <p className="hint">
          No profiles yet. Open a filled Meesho catalog form and save it as your
          first profile.
        </p>
      ) : null}

      {profiles.map((profile) => (
        <div key={profile.id} className="af-card">
          {renaming === profile.id ? (
            <div className="stack" style={{ gap: 7 }}>
              <input
                className="input"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(profile.id);
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
              <div className="row" style={{ gap: 7 }}>
                <button
                  type="button"
                  className="btn btn-primary btn--sm"
                  style={{ flex: 1 }}
                  onClick={() => commitRename(profile.id)}
                >
                  Save name
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn--sm"
                  onClick={() => setRenaming(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="af-card__name">{profile.name}</div>
              <div className="af-card__meta">
                {profile.category_path ? <span>{profile.category_path}</span> : null}
                <span>{profile.field_count} fields</span>
                <span>
                  Used {profile.used_count} time{profile.used_count === 1 ? "" : "s"}
                </span>
                {profile.last_used_at ? (
                  <span>Last {formatWhen(profile.last_used_at)}</span>
                ) : null}
              </div>

              {confirmDelete === profile.id ? (
                <div className="af-confirm">
                  <span>Delete “{profile.name}”? This cannot be undone.</span>
                  <div className="row" style={{ gap: 7, marginTop: 7 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn--sm"
                      style={{ flex: 1 }}
                      onClick={() => setConfirmDelete(null)}
                    >
                      Keep it
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm af-danger"
                      onClick={() => {
                        setConfirmDelete(null);
                        onDelete(profile.id);
                      }}
                    >
                      <Icon name="trash" size={13} /> Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div className="af-card__actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn--sm"
                    onClick={() => onEditFields(profile)}
                  >
                    <Icon name="sliders" size={13} /> Fields
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn--sm"
                    onClick={() => startRename(profile)}
                    title="Rename"
                  >
                    <Icon name="pencil" size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn--sm"
                    onClick={() => onDuplicate(profile)}
                    title="Duplicate"
                  >
                    <Icon name="copy" size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn--sm"
                    onClick={() => setConfirmDelete(profile.id)}
                    title="Delete"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** "today", "2 days ago", "12 Mar" — short enough for the narrow panel. */
function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(then).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
