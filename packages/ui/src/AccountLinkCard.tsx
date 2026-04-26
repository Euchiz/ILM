import { appUrl } from "./AppSwitcher";
import { useAuth } from "./auth/AuthProvider";

// A clickable account summary that links to the shared Account shell.
// It renders the signed-in user plus active-lab context so every app has
// the same path back to membership and lab settings.
export const AccountLinkCard = ({
  baseUrl,
  className,
}: {
  baseUrl: string;
  className?: string;
}) => {
  const { profile, user, activeLab } = useAuth();
  const label = profile?.display_name ?? user?.email ?? "Signed in";
  const href = appUrl("", baseUrl);

  return (
    <a
      href={href}
      className={className ? `ilm-account-link ${className}` : "ilm-account-link"}
      title="Open account and lab settings"
    >
      <span className="ilm-account-link-head">
        <strong>{label}</strong>
        <span>{profile?.email ?? ""}</span>
      </span>
      <span className="ilm-account-link-meta">
        <span>{activeLab?.name ?? "No lab"}</span>
        <span>{activeLab?.role ?? "member"}</span>
      </span>
      <span className="ilm-account-link-cta">Manage account</span>
    </a>
  );
};
