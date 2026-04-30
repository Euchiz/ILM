/* global React */
const { useState } = React;

const NAV_ITEMS = [
  { id: "overview", label: "Overview", glyph: "O", tone: "internal" },
  { id: "projects", label: "Projects", glyph: "P", tone: "external" },
  { id: "protocols", label: "Protocols", glyph: "R", tone: "external" },
  { id: "inventory", label: "Inventory", glyph: "I", tone: "external" },
  { id: "funding", label: "Funding", glyph: "F", tone: "external" },
  { id: "calendar", label: "Calendar", glyph: "C", tone: "external" },
  { id: "team", label: "Team", glyph: "T", tone: "internal" },
  { id: "analytics", label: "Analytics", glyph: "A", tone: "soon" },
  { id: "reports", label: "Reports", glyph: "R", tone: "soon" },
  { id: "settings", label: "Settings", glyph: "S", tone: "internal" },
];

function Avatar({ name, size = "md" }) {
  const initials = (name || "·")
    .split(/\s+/).map(p => p.charAt(0)).filter(Boolean).slice(0,2).join("").toUpperCase();
  return <span className={`kit-avatar ${size === "lg" ? "lg" : ""}`}>{initials}</span>;
}

function LabSidebar({ activeNavId, onNav, displayName, labName, role, onOpenProfile, onSignOut }) {
  const initials = (displayName || "·").split(/\s+/).map(p=>p.charAt(0)).filter(Boolean).slice(0,2).join("").toUpperCase();
  return (
    <aside className="ils-sidebar" aria-label="Primary navigation">
      <div className="ils-brand">
        <div className="ils-brand-mark">
          <strong>{labName}</strong>
          <span>— ∞</span>
        </div>
        <p className="ils-brand-tag">INTEGRATED <b>LAB MANAGER</b> OS</p>
      </div>
      <nav className="ils-nav">
        {NAV_ITEMS.map(item => {
          const active = item.id === activeNavId;
          const cls = ["ils-nav-item", active && "is-active", item.tone === "soon" && "is-soon"].filter(Boolean).join(" ");
          return (
            <a key={item.id} className={cls} onClick={(e) => { e.preventDefault(); onNav && onNav(item.id); }} href="#" aria-current={active ? "page" : undefined}>
              <span className="ils-nav-glyph-cell"><span className="ils-nav-glyph">{item.glyph}</span></span>
              <span className="ils-nav-label">{item.label}</span>
              {item.tone === "soon" ? <span className="ils-nav-pip">SOON</span> : null}
              {active ? <span className="ils-nav-dot" aria-hidden="true" /> : null}
            </a>
          );
        })}
      </nav>
      <div className="ils-side-status">
        <div className="ils-side-status-mark"><span className="ils-side-status-dot" /></div>
        <div>
          <p className="ils-side-status-title">SYSTEM STATUS</p>
          <p className="ils-side-status-copy">All systems nominal</p>
        </div>
      </div>
      <button type="button" className="ils-side-profile" onClick={onOpenProfile}>
        <span className="ils-side-orb" aria-hidden="true">{initials}</span>
        <span className="ils-side-profile-copy">
          <strong>{displayName}</strong>
          <span>{(role || "—").toUpperCase()}</span>
        </span>
        <span className="ils-side-profile-chev" aria-hidden="true">⌄</span>
      </button>
      <button type="button" className="ils-side-signout" onClick={onSignOut}>Sign out</button>
    </aside>
  );
}

function LabTopbar({ kicker, title, subtitle, labName }) {
  return (
    <header className="ils-topbar">
      <div className="ils-topbar-copy">
        {kicker ? <span className="ils-kicker">{kicker}</span> : null}
        <h1 className="ils-title">{title}</h1>
        {subtitle ? <p className="ils-subtitle">{subtitle}</p> : null}
      </div>
      <div className="ils-search" role="search">
        <span>Search projects, protocols, inventory…</span>
        <span aria-hidden="true">⌕</span>
      </div>
      <div className="ils-org">
        <strong>{labName}</strong>
        <span className="ils-org-pill">SECTOR OS</span>
        <small>LAB MANAGER SYSTEM</small>
      </div>
    </header>
  );
}

function LabShell({ activeNavId, onNav, topbar, children, displayName, labName, role, onOpenProfile, onSignOut }) {
  return (
    <div className="ils-shell">
      <LabSidebar activeNavId={activeNavId} onNav={onNav} displayName={displayName} labName={labName} role={role} onOpenProfile={onOpenProfile} onSignOut={onSignOut} />
      <main className="ils-main">
        {topbar}
        <div className="ils-body">{children}</div>
      </main>
    </div>
  );
}

Object.assign(window, { Avatar, LabSidebar, LabTopbar, LabShell, NAV_ITEMS });
