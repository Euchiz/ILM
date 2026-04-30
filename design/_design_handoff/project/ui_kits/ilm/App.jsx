/* global React, ReactDOM, AuthScreen, LabPicker, LabShell, LabTopbar, OverviewView, TeamView, SettingsView */
const { useState: useStateApp } = React;

const ROUTE_TITLE = {
  overview:  "INTEGRATED LAB. INTELLIGENTLY MANAGED.",
  team:      "TEAM",
  settings:  "SETTINGS",
  calendar:  "CALENDAR",
  analytics: "ANALYTICS",
  reports:   "REPORTS",
  projects:  "PROJECTS",
  protocols: "PROTOCOLS",
  inventory: "INVENTORY",
  funding:   "FUNDING",
};
const ROUTE_KICKER = Object.fromEntries(Object.keys(ROUTE_TITLE).map(k => [k, k.toUpperCase()]));
const ROUTE_SUBTITLE = {
  overview: "Project data. Protocol systems. Resource orchestration.",
  team: "Lab members, invitations, and join requests.",
  settings: "Profile, lab, and workspace configuration.",
  calendar: "Schedule, equipment slots, and review windows.",
  analytics: "Cross-app metrics and trends.",
  reports: "Exports, audits, and shareable summaries.",
  projects: "Track active investigations across the lab.",
  protocols: "Authoring, review, and publication.",
  inventory: "Reagents, consumables, and equipment.",
  funding: "Grants, budgets, and expenditures.",
};

function Placeholder({ title, blurb }) {
  return (
    <div className="ovw-card" style={{padding: "2rem 2.4rem"}}>
      <span className="ovw-label">FUTURE STAGE</span>
      <h2 style={{fontFamily:"var(--ilm-font-display)", fontSize:"1.6rem", margin:"0.4rem 0"}}>{title}</h2>
      <p style={{color:"var(--ilm-muted)", maxWidth: 540, margin:0}}>{blurb}</p>
    </div>
  );
}

function App() {
  const [stage, setStage] = useStateApp("auth"); // auth | picker | home
  const [activeNav, setActiveNav] = useStateApp("overview");
  const [lab, setLab] = useStateApp(null);

  if (stage === "auth") return <AuthScreen onSignedIn={() => setStage("picker")} />;
  if (stage === "picker" || !lab) return <LabPicker onPick={(l) => { setLab(l); setStage("home"); }} onClose={lab ? () => setStage("home") : undefined} />;

  const renderBody = () => {
    switch (activeNav) {
      case "overview":  return <OverviewView />;
      case "team":      return <TeamView />;
      case "settings":  return <SettingsView onOpenLabPicker={() => setStage("picker")} />;
      case "calendar":  return <Placeholder title="Calendar" blurb="Lab events, equipment booking, and review windows will live here." />;
      case "analytics": return <Placeholder title="Analytics" blurb="Cross-app metrics — protocol throughput, project velocity, supply burn." />;
      case "reports":   return <Placeholder title="Reports" blurb="Exports and shareable lab summaries." />;
      case "projects":  return <Placeholder title="Projects" blurb="Opens the Project Manager app." />;
      case "protocols": return <Placeholder title="Protocols" blurb="Opens the Protocol Manager app." />;
      case "inventory": return <Placeholder title="Inventory" blurb="Opens the Supply Manager app." />;
      case "funding":   return <Placeholder title="Funding" blurb="Funding Manager — coming soon." />;
      default: return null;
    }
  };

  return (
    <LabShell
      activeNavId={activeNav}
      onNav={setActiveNav}
      displayName="Anika Mendez"
      labName={lab.name}
      role={lab.role}
      onOpenProfile={() => setStage("picker")}
      onSignOut={() => { setLab(null); setStage("auth"); }}
      topbar={<LabTopbar kicker={ROUTE_KICKER[activeNav]} title={ROUTE_TITLE[activeNav]} subtitle={ROUTE_SUBTITLE[activeNav]} labName={lab.name} />}
    >
      {renderBody()}
    </LabShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
