import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Avatar, useAuth } from "@ilm/ui";

type MembershipTier = "owner" | "admin" | "member";

const TIER_LABEL: Record<MembershipTier, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const TIER_DESCRIPTION: Record<MembershipTier, string> = {
  owner: "Full control: promote or demote admins, remove any non-owner, and manage the lab.",
  admin: "Can promote members to admin and remove members. Cannot touch other admins.",
  member: "Read-only in the lab management surface.",
};

// Headshots are stored inline as data URLs. We downsample any uploaded
// image to a small square so the encoded payload stays a few KB.
const HEADSHOT_PX = 96;
const MAX_HEADSHOT_BYTES = 64 * 1024;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Unexpected error");

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });

const downscaleToDataUrl = (dataUrl: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = HEADSHOT_PX;
      canvas.height = HEADSHOT_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, HEADSHOT_PX, HEADSHOT_PX);
      // Try PNG first; fall back to JPEG if too large.
      let out = canvas.toDataURL("image/png");
      if (out.length > MAX_HEADSHOT_BYTES) {
        out = canvas.toDataURL("image/jpeg", 0.85);
      }
      resolve(out);
    };
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = dataUrl;
  });

export const SettingsView = ({ onOpenLabPicker }: { onOpenLabPicker: () => void }) => {
  const { activeLab, profile, user, signOut, updateProfile, renameLab, refreshLabs } = useAuth();
  const tier: MembershipTier = (activeLab?.role as MembershipTier | undefined) ?? "member";
  const isOwner = tier === "owner";
  const email = profile?.email ?? user?.email ?? "";
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Profile editor state
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(profile?.headshot_url ?? null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  // Lab editor state
  const [labName, setLabName] = useState(activeLab?.name ?? "");
  const [labBusy, setLabBusy] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [labNotice, setLabNotice] = useState<string | null>(null);

  // Re-sync local state when the underlying profile/lab changes.
  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setHeadshotUrl(profile?.headshot_url ?? null);
  }, [profile?.display_name, profile?.headshot_url]);

  useEffect(() => {
    setLabName(activeLab?.name ?? "");
    setLabError(null);
    setLabNotice(null);
  }, [activeLab?.id, activeLab?.name]);

  const profileDirty =
    (displayName.trim() || null) !== (profile?.display_name?.trim() || null) ||
    (headshotUrl ?? null) !== (profile?.headshot_url ?? null);

  const labDirty = labName.trim() !== (activeLab?.name ?? "").trim() && labName.trim().length > 0;

  const handlePickHeadshot = () => fileInputRef.current?.click();

  const handleHeadshotChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProfileError(null);
    setProfileNotice(null);
    try {
      const raw = await fileToDataUrl(file);
      const small = await downscaleToDataUrl(raw);
      setHeadshotUrl(small);
    } catch (err) {
      setProfileError(errorMessage(err));
    }
  };

  const handleClearHeadshot = () => {
    setProfileError(null);
    setProfileNotice(null);
    setHeadshotUrl(null);
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError(null);
    setProfileNotice(null);
    setProfileBusy(true);
    try {
      await updateProfile({ display_name: displayName, headshot_url: headshotUrl });
      setProfileNotice("Profile saved.");
    } catch (err) {
      setProfileError(errorMessage(err));
    } finally {
      setProfileBusy(false);
    }
  };

  const handleRenameLab = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeLab) return;
    const next = labName.trim();
    if (!next || next === activeLab.name) return;
    setLabError(null);
    setLabNotice(null);
    setLabBusy(true);
    try {
      await renameLab(activeLab.id, next);
      await refreshLabs();
      setLabNotice("Lab renamed.");
    } catch (err) {
      setLabError(errorMessage(err));
    } finally {
      setLabBusy(false);
    }
  };

  return (
    <div className="acct-settings-page">
      <section className="acct-card">
        <div className="acct-card-header">
          <div>
            <h2>Profile</h2>
            <p>Your name and headshot as visible to lab co-workers.</p>
          </div>
        </div>

        <form className="acct-form" onSubmit={handleSaveProfile}>
          <div className="acct-profile-edit">
            <Avatar
              size="lg"
              name={displayName || profile?.display_name}
              email={email}
              url={headshotUrl}
            />
            <div className="acct-profile-edit-actions">
              <button
                type="button"
                className="acct-text-button"
                onClick={handlePickHeadshot}
                disabled={profileBusy}
              >
                {headshotUrl ? "Replace headshot…" : "Upload headshot…"}
              </button>
              {headshotUrl ? (
                <button
                  type="button"
                  className="acct-text-button"
                  onClick={handleClearHeadshot}
                  disabled={profileBusy}
                >
                  Remove
                </button>
              ) : null}
              <small style={{ color: "var(--ilm-muted)" }}>
                Square images work best. We resize to {HEADSHOT_PX}×{HEADSHOT_PX}. Leave empty
                to show initials only.
              </small>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleHeadshotChange}
            style={{ display: "none" }}
          />

          <label className="acct-field">
            <span>Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={email || "Your name"}
              maxLength={120}
              disabled={profileBusy}
            />
          </label>

          <label className="acct-field">
            <span>Email</span>
            <input type="email" value={email} disabled readOnly />
          </label>

          {profileError ? <p className="acct-error">{profileError}</p> : null}
          {profileNotice ? <small style={{ color: "var(--ilm-viridian)" }}>{profileNotice}</small> : null}

          <div className="acct-row-actions">
            <button
              type="submit"
              className="acct-primary-button"
              disabled={profileBusy || !profileDirty}
            >
              {profileBusy ? "Saving…" : "Save profile"}
            </button>
            <button
              type="button"
              className="acct-danger-button"
              onClick={() => void signOut()}
              disabled={profileBusy}
            >
              Sign out
            </button>
          </div>
        </form>
      </section>

      <section className="acct-card">
        <div className="acct-card-header">
          <div>
            <h2>Active lab</h2>
            <p>Switch labs or join another workspace from the picker.</p>
          </div>
          {activeLab ? <span className={`acct-badge ${tier}`}>{TIER_LABEL[tier]}</span> : null}
        </div>
        {activeLab ? (
          <>
            <h3 style={{ margin: 0 }}>{activeLab.name}</h3>
            <small style={{ color: "var(--rl-muted)" }}>{TIER_DESCRIPTION[tier]}</small>
          </>
        ) : (
          <p className="acct-empty">No lab selected.</p>
        )}
        <div className="acct-row-actions">
          <button type="button" className="acct-text-button" onClick={onOpenLabPicker}>
            Join or create another lab…
          </button>
        </div>
      </section>

      <section className="acct-card">
        <div className="acct-card-header">
          <div>
            <h2>Lab settings</h2>
            <p>
              {isOwner
                ? "Rename your lab. Only the owner can change this."
                : "Only the lab owner can change the lab name."}
            </p>
          </div>
        </div>
        {!activeLab ? (
          <p className="acct-empty">No lab selected.</p>
        ) : (
          <form className="acct-form" onSubmit={handleRenameLab}>
            <label className="acct-field">
              <span>Lab name</span>
              <input
                type="text"
                value={labName}
                onChange={(event) => setLabName(event.target.value)}
                maxLength={120}
                disabled={!isOwner || labBusy}
              />
            </label>
            {labError ? <p className="acct-error">{labError}</p> : null}
            {labNotice ? <small style={{ color: "var(--ilm-viridian)" }}>{labNotice}</small> : null}
            {isOwner ? (
              <div className="acct-row-actions">
                <button
                  type="submit"
                  className="acct-primary-button"
                  disabled={labBusy || !labDirty}
                >
                  {labBusy ? "Saving…" : "Rename lab"}
                </button>
              </div>
            ) : null}
          </form>
        )}
      </section>
    </div>
  );
};
