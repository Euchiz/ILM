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
  const {
    activeLab,
    profile,
    user,
    signOut,
    updateProfile,
    updatePassword,
    renameLab,
    deleteLab,
    deleteMyAccount,
    refreshLabs,
  } = useAuth();
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

  // Password editor state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  // Danger-zone state. We split delete-lab and delete-account into two
  // independent rows, each with a separate confirmation step. The user
  // must type the lab name (or the literal word "delete") before the
  // destructive RPC fires, mirroring GitHub's pattern.
  const [labDeleteOpen, setLabDeleteOpen] = useState(false);
  const [labDeleteText, setLabDeleteText] = useState("");
  const [labDeleteBusy, setLabDeleteBusy] = useState(false);
  const [labDeleteError, setLabDeleteError] = useState<string | null>(null);
  const [accountDeleteOpen, setAccountDeleteOpen] = useState(false);
  const [accountDeleteText, setAccountDeleteText] = useState("");
  const [accountDeleteBusy, setAccountDeleteBusy] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState<string | null>(null);

  // Reset danger-zone confirmations whenever the active lab changes — a stale
  // confirmation typed against the previous lab should not auto-apply here.
  useEffect(() => {
    setLabDeleteOpen(false);
    setLabDeleteText("");
    setLabDeleteError(null);
  }, [activeLab?.id]);

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


  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordNotice(null);
    if (!currentPassword.trim()) {
      setPasswordError("Enter your current password for confirmation.");
      return;
    }
    if (newPassword.trim().length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      await updatePassword(newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice("Password updated.");
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setPasswordBusy(false);
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

  const labDeleteConfirmationOk =
    !!activeLab && labDeleteText.trim() === activeLab.name.trim() && activeLab.name.trim().length > 0;

  const handleDeleteLab = async () => {
    if (!activeLab || !labDeleteConfirmationOk) return;
    setLabDeleteError(null);
    setLabDeleteBusy(true);
    try {
      await deleteLab(activeLab.id);
      await refreshLabs();
      setLabDeleteOpen(false);
      setLabDeleteText("");
    } catch (err) {
      setLabDeleteError(errorMessage(err));
    } finally {
      setLabDeleteBusy(false);
    }
  };

  const ACCOUNT_DELETE_PHRASE = "delete my account";
  const accountDeleteConfirmationOk =
    accountDeleteText.trim().toLowerCase() === ACCOUNT_DELETE_PHRASE;

  const handleDeleteAccount = async () => {
    if (!accountDeleteConfirmationOk) return;
    setAccountDeleteError(null);
    setAccountDeleteBusy(true);
    try {
      await deleteMyAccount();
      // The auth provider already reset session/profile state; the
      // protected-route guard will surface the sign-in screen on the next
      // render. Nothing left for this view to do.
    } catch (err) {
      setAccountDeleteError(errorMessage(err));
    } finally {
      setAccountDeleteBusy(false);
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
            <h2>Password</h2>
            <p>Change the password used to sign in to your account.</p>
          </div>
        </div>

        <form className="acct-form" onSubmit={handleChangePassword}>
          <label className="acct-field">
            <span>Current password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              disabled={passwordBusy}
            />
          </label>
          <label className="acct-field">
            <span>New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              disabled={passwordBusy}
            />
          </label>
          <label className="acct-field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              disabled={passwordBusy}
            />
          </label>

          {passwordError ? <p className="acct-error">{passwordError}</p> : null}
          {passwordNotice ? <small style={{ color: "var(--ilm-viridian)" }}>{passwordNotice}</small> : null}

          <div className="acct-row-actions">
            <button type="submit" className="acct-primary-button" disabled={passwordBusy}>
              {passwordBusy ? "Updating…" : "Change password"}
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

      <section className="acct-card acct-danger-zone" aria-label="Danger zone">
        <div className="acct-card-header">
          <div>
            <h2>Danger zone</h2>
            <p>Irreversible actions. Read the warning text and confirm carefully.</p>
          </div>
        </div>

        {isOwner && activeLab ? (
          <div className="acct-danger-row">
            <div className="acct-danger-copy">
              <strong>Delete this lab</strong>
              <p>
                Permanently removes <em>{activeLab.name}</em> and every project, protocol,
                inventory item, dataset, schedule entry, and funding record scoped to it.
                Co-workers in this lab will lose access immediately. This cannot be undone.
              </p>
            </div>
            {!labDeleteOpen ? (
              <button
                type="button"
                className="acct-danger-button"
                onClick={() => {
                  setLabDeleteOpen(true);
                  setLabDeleteError(null);
                  setLabDeleteText("");
                }}
              >
                Delete lab…
              </button>
            ) : (
              <div className="acct-danger-confirm">
                <label className="acct-field">
                  <span>
                    Type the lab name <code>{activeLab.name}</code> to confirm.
                  </span>
                  <input
                    type="text"
                    value={labDeleteText}
                    onChange={(event) => setLabDeleteText(event.target.value)}
                    placeholder={activeLab.name}
                    disabled={labDeleteBusy}
                    autoFocus
                  />
                </label>
                {labDeleteError ? <p className="acct-error">{labDeleteError}</p> : null}
                <div className="acct-row-actions">
                  <button
                    type="button"
                    className="acct-text-button"
                    onClick={() => {
                      setLabDeleteOpen(false);
                      setLabDeleteText("");
                      setLabDeleteError(null);
                    }}
                    disabled={labDeleteBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="acct-danger-button"
                    onClick={() => void handleDeleteLab()}
                    disabled={labDeleteBusy || !labDeleteConfirmationOk}
                  >
                    {labDeleteBusy ? "Deleting…" : "I understand — delete this lab"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="acct-danger-row">
          <div className="acct-danger-copy">
            <strong>Delete your account</strong>
            <p>
              Permanently removes your sign-in, profile, and lab memberships. You will be
              signed out immediately and will not be able to recover this account. Labs you
              co-own with other admins keep working; labs you are the sole owner of must be
              deleted (or transferred) first.
            </p>
          </div>
          {!accountDeleteOpen ? (
            <button
              type="button"
              className="acct-danger-button"
              onClick={() => {
                setAccountDeleteOpen(true);
                setAccountDeleteError(null);
                setAccountDeleteText("");
              }}
            >
              Delete account…
            </button>
          ) : (
            <div className="acct-danger-confirm">
              <label className="acct-field">
                <span>
                  Type <code>{ACCOUNT_DELETE_PHRASE}</code> to confirm.
                </span>
                <input
                  type="text"
                  value={accountDeleteText}
                  onChange={(event) => setAccountDeleteText(event.target.value)}
                  placeholder={ACCOUNT_DELETE_PHRASE}
                  disabled={accountDeleteBusy}
                  autoFocus
                />
              </label>
              {accountDeleteError ? <p className="acct-error">{accountDeleteError}</p> : null}
              <div className="acct-row-actions">
                <button
                  type="button"
                  className="acct-text-button"
                  onClick={() => {
                    setAccountDeleteOpen(false);
                    setAccountDeleteText("");
                    setAccountDeleteError(null);
                  }}
                  disabled={accountDeleteBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="acct-danger-button"
                  onClick={() => void handleDeleteAccount()}
                  disabled={accountDeleteBusy || !accountDeleteConfirmationOk}
                >
                  {accountDeleteBusy ? "Deleting…" : "I understand — delete my account"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
