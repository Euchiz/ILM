import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

const resolveSiteRoot = (baseUrl: string) => {
  if (typeof window === "undefined") return "/";
  const base = baseUrl.trim() || "/";
  const withLeadingSlash = base.startsWith("/") ? base : `/${base}`;
  const normalized = withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
  const url = new URL(normalized, window.location.origin);
  const knownAppRoots = ["protocol-manager/", "project-manager/", "supply-manager/", "funding-manager/", "scheduler/"];
  const matchedAppRoot = knownAppRoots.find((segment) => url.pathname.endsWith(segment));
  const root = matchedAppRoot ? new URL("../", url) : url;
  return root.toString();
};

export const buildLabShareUrl = (labId: string, baseUrl: string): string => {
  const root = resolveSiteRoot(baseUrl);
  return new URL(`join/${labId}`, root).toString();
};

export const LabShareLinkPanel = ({
  baseUrl,
  title = "Lab Share Link",
}: {
  baseUrl: string;
  title?: string;
}) => {
  const { activeLab } = useAuth();
  const canManage = activeLab?.role === "owner" || activeLab?.role === "admin";
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    if (!activeLab) return "";
    return buildLabShareUrl(activeLab.id, baseUrl);
  }, [activeLab, baseUrl]);

  if (!canManage || !activeLab) return null;

  const handleCopy = async () => {
    if (!shareUrl || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="ilm-admin-card">
      <div className="ilm-admin-header">
        <div>
          <h2>{title}</h2>
          <p className="ilm-auth-note">
            Share this link with teammates. Visitors will need to sign in and request approval before they become members.
          </p>
        </div>
      </div>
      <div className="ilm-admin-field-row" style={{ alignItems: "center" }}>
        <input
          type="text"
          readOnly
          value={shareUrl}
          onFocus={(event) => event.currentTarget.select()}
          style={{ flex: 1 }}
        />
        <button type="button" className="ilm-text-button" onClick={() => void handleCopy()}>
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </section>
  );
};
