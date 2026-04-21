export type AppId = "home" | "protocol-manager" | "project-manager" | "supply-manager" | "funding-manager";

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
];

const APP_ROOT_SEGMENTS = new Set(APP_LINKS.map((link) => link.href).filter(Boolean));

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
