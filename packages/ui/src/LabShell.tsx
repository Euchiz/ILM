import type { ReactNode } from "react";
import { appUrl } from "./AppSwitcher";
import { useAuth } from "./auth/AuthProvider";

export type LabNavId =
  | "overview"
  | "projects"
  | "protocols"
  | "inventory"
  | "funding"
  | "calendar"
  | "team"
  | "analytics"
  | "reports"
  | "settings";

type NavTone = "internal" | "external" | "soon";

type NavItem = {
  id: LabNavId;
  label: string;
  glyph: string;
  /** Resolved at render time given the home root + this app's baseUrl. */
  buildHref: (homeRoot: string, baseUrl: string) => string;
  tone: NavTone;
};

const NAV_ITEMS: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    glyph: "▢",
    buildHref: (root) => root,
    tone: "internal",
  },
  {
    id: "projects",
    label: "Projects",
    glyph: "⊞",
    buildHref: (_, base) => appUrl("project-manager/", base),
    tone: "external",
  },
  {
    id: "protocols",
    label: "Protocols",
    glyph: "▤",
    buildHref: (_, base) => appUrl("protocol-manager/", base),
    tone: "external",
  },
  {
    id: "inventory",
    label: "Inventory",
    glyph: "◇",
    buildHref: (_, base) => appUrl("supply-manager/", base),
    tone: "external",
  },
  {
    id: "funding",
    label: "Funding",
    glyph: "$",
    buildHref: (_, base) => appUrl("funding-manager/", base),
    tone: "external",
  },
  {
    id: "calendar",
    label: "Calendar",
    glyph: "▣",
    buildHref: (_, base) => appUrl("scheduler/", base),
    tone: "external",
  },
  {
    id: "team",
    label: "Team",
    glyph: "⊙",
    buildHref: (root) => `${root}#/team`,
    tone: "internal",
  },
  {
    id: "analytics",
    label: "Analytics",
    glyph: "∿",
    buildHref: (root) => `${root}#/analytics`,
    tone: "soon",
  },
  {
    id: "reports",
    label: "Reports",
    glyph: "≡",
    buildHref: (root) => `${root}#/reports`,
    tone: "soon",
  },
  {
    id: "settings",
    label: "Settings",
    glyph: "⚙",
    buildHref: (root) => `${root}#/settings`,
    tone: "internal",
  },
];

const computeInitials = (name: string): string =>
  name
    .split(/\s+/)
    .map((p) => p.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export interface LabSidebarProps {
  /** Which nav item is currently active. */
  activeNavId: LabNavId;
  /** This app's base URL (typically `import.meta.env.BASE_URL`). Used to resolve external-app hrefs. */
  baseUrl: string;
  /** Optional click handler for the profile orb (e.g. opens lab picker). */
  onOpenProfile?: () => void;
}

export const LabSidebar = ({ activeNavId, baseUrl, onOpenProfile }: LabSidebarProps) => {
  const { profile, user, activeLab, signOut } = useAuth();
  const displayName = profile?.display_name ?? user?.email ?? "Signed in";
  const labName = activeLab?.name ?? "No lab";
  const role = (activeLab?.role ?? "—").toString().toUpperCase();
  const initials = computeInitials(displayName) || "·";

  const homeRoot = appUrl("", baseUrl);

  return (
    <aside className="ils-sidebar" aria-label="Primary navigation">
      <div className="ils-brand">
        <div className="ils-brand-mark">
          <strong>{labName}</strong>
          <span>— ∞</span>
        </div>
        <p className="ils-brand-tag">
          INTEGRATED LAB MANAGER <b>OS</b>
        </p>
      </div>

      <nav className="ils-nav">
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeNavId;
          const isExternal = item.tone === "external";
          const className = [
            "ils-nav-item",
            active ? "is-active" : "",
            item.tone === "soon" ? "is-soon" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <a
              key={item.id}
              href={item.buildHref(homeRoot, baseUrl)}
              className={className}
              aria-current={active ? "page" : undefined}
              rel={isExternal ? "noopener" : undefined}
            >
              <span className="ils-nav-glyph-cell">
                <span className="ils-nav-glyph">{item.glyph}</span>
              </span>
              <span className="ils-nav-label">{item.label}</span>
              {item.tone === "soon" ? <span className="ils-nav-pip">SOON</span> : null}
              {active ? <span className="ils-nav-dot" aria-hidden="true" /> : null}
            </a>
          );
        })}
      </nav>

      <div className="ils-side-status">
        <div className="ils-side-status-mark" aria-hidden="true">
          <span className="ils-side-status-dot" />
        </div>
        <div>
          <p className="ils-side-status-title">SYSTEM STATUS</p>
          <p className="ils-side-status-copy">All systems nominal</p>
        </div>
      </div>

      <button type="button" className="ils-side-profile" onClick={onOpenProfile}>
        <span className="ils-side-orb" aria-hidden="true">
          {initials}
        </span>
        <span className="ils-side-profile-copy">
          <strong>{displayName}</strong>
          <span>{role}</span>
        </span>
        <span className="ils-side-profile-chev" aria-hidden="true">
          ⌄
        </span>
      </button>

      <button type="button" className="ils-side-signout" onClick={() => void signOut()}>
        Sign out
      </button>
    </aside>
  );
};

export interface LabTopbarProps {
  kicker?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Replaces the search field on the right. Passing null hides it entirely. */
  search?: ReactNode | null;
  /** Far-right slot. Defaults to the active lab name + "SECTOR OS" pill. */
  meta?: ReactNode;
}

export const LabTopbar = ({ kicker, title, subtitle, search, meta }: LabTopbarProps) => {
  const { activeLab } = useAuth();

  const defaultMeta = (
    <div className="ils-org">
      <strong>{activeLab?.name ?? "—"}</strong>
      <span className="ils-org-pill">SECTOR OS</span>
      <small>LAB MANAGER SYSTEM</small>
    </div>
  );

  const defaultSearch = (
    <div className="ils-search" role="search">
      <span>Search projects, protocols, inventory…</span>
      <span aria-hidden="true">⌕</span>
    </div>
  );

  return (
    <header className="ils-topbar">
      <div className="ils-topbar-copy">
        {kicker ? <span className="ils-kicker">{kicker}</span> : null}
        <h1 className="ils-title">{title}</h1>
        {subtitle ? <p className="ils-subtitle">{subtitle}</p> : null}
      </div>
      {search === null ? null : search ?? defaultSearch}
      {meta ?? defaultMeta}
    </header>
  );
};

export interface LabShellProps {
  /** Which sidebar item to highlight. */
  activeNavId: LabNavId;
  /** This app's base URL (typically `import.meta.env.BASE_URL`). */
  baseUrl: string;
  /** Topbar content. If omitted, the shell renders no topbar. */
  topbar?: ReactNode;
  /** Optional secondary bar slot below the topbar (tabs, app-local nav, etc.). */
  subbar?: ReactNode;
  /** Click handler for the profile orb. Defaults to a no-op. */
  onOpenProfile?: () => void;
  /** Main content area. */
  children: ReactNode;
  /** Optional className appended to the shell root. */
  className?: string;
  /** Optional className appended to the body wrapper around children. */
  bodyClassName?: string;
}

export const LabShell = ({
  activeNavId,
  baseUrl,
  topbar,
  subbar,
  onOpenProfile,
  children,
  className,
  bodyClassName,
}: LabShellProps) => (
  <div className={`ils-shell${className ? ` ${className}` : ""}`}>
    <LabSidebar activeNavId={activeNavId} baseUrl={baseUrl} onOpenProfile={onOpenProfile} />
    <main className="ils-main">
      {topbar}
      {subbar ? <div className="ils-subbar">{subbar}</div> : null}
      <div className={`ils-body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
    </main>
  </div>
);
