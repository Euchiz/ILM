export type AppId =
  | "home"
  | "protocol-manager"
  | "project-manager"
  | "supply-manager"
  | "funding-manager"
  | "scheduler"
  | "account";

type AppLink = {
  id: AppId;
  label: string;
  href: string;
};

const APP_LINKS: AppLink[] = [
  { id: "home", label: "Home", href: "" },
  { id: "protocol-manager", label: "Protocols", href: "protocol-manager/" },
  { id: "project-manager", label: "Projects", href: "project-manager/" },
  { id: "supply-manager", label: "Supply", href: "supply-manager/" },
  { id: "funding-manager", label: "Funding", href: "funding-manager/" },
  { id: "scheduler", label: "Scheduler", href: "scheduler/" },
];

// Root segments recognized when walking back to the site root. The home app
// (Account) lives at the bare site root, so it has no segment to walk back
// from — only the named sub-apps appear here.
const APP_ROOT_SEGMENTS = new Set<string>([
  "protocol-manager/",
  "project-manager/",
  "supply-manager/",
  "funding-manager/",
  "scheduler/",
]);

const resolveSiteRoot = (baseUrl: string) => {
  const base = baseUrl.trim() || "/";
  const withLeadingSlash = base.startsWith("/") ? base : `/${base}`;
  const normalized = withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
  const currentBase = new URL(normalized, window.location.origin);

  if (normalized === "/") return currentBase;
  const pathname = currentBase.pathname;
  const matchedAppRoot = Array.from(APP_ROOT_SEGMENTS).find((segment) => pathname.endsWith(segment));
  return matchedAppRoot ? new URL("../", currentBase) : currentBase;
};

const buildAppUrl = (href: string, baseUrl: string) => new URL(href || ".", resolveSiteRoot(baseUrl)).toString();

export const appUrl = (href: string, baseUrl: string) => buildAppUrl(href, baseUrl);

export const AppSwitcher = ({
  currentApp,
  baseUrl,
  className,
}: {
  currentApp: AppId;
  baseUrl: string;
  className?: string;
}) => (
  <nav className={className ? `ilm-app-switcher ${className}` : "ilm-app-switcher"} aria-label="App navigation">
    {APP_LINKS.map((link) => (
      <a
        key={link.id}
        href={buildAppUrl(link.href, baseUrl)}
        className={link.id === currentApp ? "ilm-app-switcher-link ilm-app-switcher-link-active" : "ilm-app-switcher-link"}
        aria-current={link.id === currentApp ? "page" : undefined}
      >
        {link.label}
      </a>
    ))}
  </nav>
);
