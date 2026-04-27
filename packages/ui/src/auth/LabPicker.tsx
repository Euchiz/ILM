import { useState, type FormEvent } from "react";
import { slugify } from "@ilm/utils";
import { useAuth } from "./AuthProvider";

type Mode = "choose" | "create" | "join";

const extractLabIdFromInput = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Accept a raw UUID or a share URL that ends with …/join/<uuid>.
  const uuidMatch = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return uuidMatch ? uuidMatch[0] : null;
};

export const LabPicker = () => {
  const { labs, selectLab, createLab, signOut, profile, user } = useAuth();
  const [mode, setMode] = useState<Mode>(labs.length === 0 ? "choose" : "choose");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [linkInput, setLinkInput] = useState("");
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

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    setErr(null);
    const labId = extractLabIdFromInput(linkInput);
    if (!labId) {
      setErr("Paste an invite link or a lab id.");
      return;
    }
    // Navigate to the join-by-link screen in the Account app. The current app
    // may or may not be the Account app — either way, a sibling-app URL works.
    const baseHref = typeof window !== "undefined" ? window.location.href : "/";
    const base = new URL(baseHref);
    // Walk up the base URL to the site root: remove a trailing "<app>/"
    // segment. The home (account) shell lives at the bare root, so it has no
    // segment to strip.
    const pathSegments = base.pathname.split("/").filter(Boolean);
    const knownApps = new Set([
      "protocol-manager",
      "project-manager",
      "supply-manager",
      "funding-manager",
      "scheduler",
    ]);
    if (pathSegments.length > 0 && knownApps.has(pathSegments[pathSegments.length - 1])) {
      pathSegments.pop();
    }
    const rootPath = pathSegments.length > 0 ? `/${pathSegments.join("/")}/` : "/";
    window.location.assign(new URL(`${rootPath}join/${labId}`, base.origin).toString());
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

        {!emptyState ? (
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
        ) : null}

        {mode === "choose" ? (
          <div className="ilm-auth-form">
            {emptyState ? (
              <p className="ilm-auth-note">
                You aren't a member of any labs yet. Create a new lab or join an existing one.
              </p>
            ) : null}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" className="ilm-auth-submit" onClick={() => setMode("create")}>
                Create a new lab
              </button>
              <button type="button" className="ilm-text-button" onClick={() => setMode("join")}>
                I have an invite link
              </button>
            </div>
          </div>
        ) : null}

        {mode === "create" ? (
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
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="ilm-auth-submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create lab"}
              </button>
              <button type="button" className="ilm-text-button" onClick={() => setMode("choose")}>
                Back
              </button>
            </div>
            {err && (
              <p className="ilm-auth-error" role="alert">
                {err}
              </p>
            )}
          </form>
        ) : null}

        {mode === "join" ? (
          <form onSubmit={handleJoin} className="ilm-auth-form">
            <h2 className="ilm-lab-section-title">Join an existing lab</h2>
            <p className="ilm-auth-hint">Paste the share link (or lab id) your admin sent you.</p>
            <label className="ilm-auth-field">
              <span>Invite link or lab id</span>
              <input
                type="text"
                required
                value={linkInput}
                onChange={(event) => setLinkInput(event.target.value)}
                placeholder="https://…/join/<uuid>"
              />
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="ilm-auth-submit">
                Continue
              </button>
              <button type="button" className="ilm-text-button" onClick={() => setMode("choose")}>
                Back
              </button>
            </div>
            {err && (
              <p className="ilm-auth-error" role="alert">
                {err}
              </p>
            )}
          </form>
        ) : null}
      </div>
    </div>
  );
};
