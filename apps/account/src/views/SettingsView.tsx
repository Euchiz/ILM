import { useAuth } from "@ilm/ui";

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

export const SettingsView = ({ onOpenLabPicker }: { onOpenLabPicker: () => void }) => {
  const { activeLab, profile, user, signOut } = useAuth();
  const tier: MembershipTier = (activeLab?.role as MembershipTier | undefined) ?? "member";
  const displayName = profile?.display_name ?? user?.email ?? "Signed in";
  const email = profile?.email ?? user?.email ?? "";

  return (
    <div className="acct-settings-page">
      <section className="acct-card">
        <div className="acct-card-header">
          <div>
            <h2>Profile</h2>
            <p>Your personal account info as visible to lab co-workers.</p>
          </div>
        </div>
        <div className="acct-side-profile">
          <strong>{displayName}</strong>
          <span>{email}</span>
        </div>
        <div className="acct-row-actions">
          <button type="button" className="acct-danger-button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
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
            <p>Lab name, slug, and ownership transfer arrive in a future stage.</p>
          </div>
        </div>
        <p className="acct-empty">Nothing configurable here yet.</p>
      </section>
    </div>
  );
};
