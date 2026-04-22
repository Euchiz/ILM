import { useAuth } from "./auth/AuthProvider";
import { appUrl } from "./AppSwitcher";

// A clickable account summary that links to the shared Account shell.
// Renders the signed-in user's name + active-lab info; clicking opens
// `<site-root>/account/` where lab settings, members, join requests,
// and share links live.
export const AccountLinkCard = ({
  baseUrl,
  className,
}: {
  baseUrl: string;
  className?: string;
}) => {
  const { profile, user, activeLab } = useAuth();
  const label = profile?.display_name ?? user?.email ?? "Signed in";
  const href = appUrl("account/", baseUrl);
  return (
    <a
      href={href}
      className={className ? `ilm-account-link ${className}` : "ilm-account-link"}
      title="Open account & lab settings"
    >
      <span className="ilm-account-link-head">
        <strong>{label}</strong>
        <span>{profile?.email ?? ""}</span>
      </span>
      <span className="ilm-account-link-meta">
        <span>{activeLab?.name ?? "No lab"}</span>
        <span>{activeLab?.role ?? "member"}</span>
      </span>
      <span className="ilm-account-link-cta">Manage account →</span>
    </a>
  );
};
