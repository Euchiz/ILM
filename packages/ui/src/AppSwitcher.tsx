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

const resolveSiteRoot = (baseUrl: string) => {
  const base = baseUrl.trim() || "/";
  const normalized = base.startsWith("/") ? base : `/${base}`;
  const currentBase = new URL(normalized, window.location.origin);
  return normalized === "/" ? currentBase : new URL("../", currentBase);
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
