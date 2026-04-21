import { useState, type FormEvent } from "react";
import { slugify } from "@ilm/utils";
import { useAuth } from "./AuthProvider";

export const LabPicker = () => {
  const { labs, selectLab, createLab, signOut, profile, user } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setErr(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Lab name is required");
      return;
    }
    setSubmitting(true);
    try {
      await createLab(trimmed, slug.trim() || slugify(trimmed));
    } catch (e) {
      const message =
        (e && typeof e === "object" && "message" in e &&
          typeof (e as { message?: unknown }).message === "string")
          ? (e as { message: string }).message
          : "Failed to create lab";
      setErr(message);
    } finally {
      setSubmitting(false);
    }
  };

  const emptyState = labs.length === 0;
  const displayName = profile?.display_name ?? user?.email ?? "";

  return (
    <div className="ilm-auth-screen">
      <div className="ilm-auth-card ilm-lab-picker">
        <div className="ilm-lab-picker-header">
          <div>
            <h1 className="ilm-auth-title">Choose a lab workspace</h1>
            {displayName && <p className="ilm-auth-hint">Signed in as {displayName}</p>}
          </div>
          <button type="button" className="ilm-text-button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>

        {emptyState ? (
          <p className="ilm-auth-note">
            You aren't a member of any labs yet. Create one below to get started.
          </p>
        ) : (
          <ul className="ilm-lab-list">
            {labs.map((lab) => (
              <li key={lab.id}>
                <button
                  type="button"
                  className="ilm-lab-list-item"
                  onClick={() => selectLab(lab.id)}
                >
                  <span className="ilm-lab-list-name">{lab.name}</span>
                  <span className="ilm-lab-list-meta">{lab.role}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleCreate} className="ilm-auth-form">
          <h2 className="ilm-lab-section-title">Create a new lab</h2>
          <label className="ilm-auth-field">
            <span>Lab name</span>
            <input
              type="text"
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!slugTouched) {
                  setSlug(slugify(event.target.value));
                }
              }}
            />
          </label>
          <label className="ilm-auth-field">
            <span>Slug (optional)</span>
            <input
              type="text"
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                setSlugTouched(true);
              }}
            />
          </label>
          <button type="submit" className="ilm-auth-submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create lab"}
          </button>
          {err && (
            <p className="ilm-auth-error" role="alert">
              {err}
            </p>
          )}
        </form>
      </div>
    </div>
  );
};
