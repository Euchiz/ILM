import { AppSwitcher, useAuth } from "@ilm/ui";

const APP_BASE_URL = import.meta.env.BASE_URL;

export const App = () => {
  const { activeLab, profile, signOut } = useAuth();

  return (
    <main className="manager-shell">
      <header className="manager-header">
        <div className="manager-header-copy">
          <p className="manager-kicker">Stage 4 Foundation</p>
          <h1>Project Manager</h1>
          <p className="manager-subtitle">
            Projects, milestones, experiments, and project-lead assignment will live here on the shared Supabase lab shell.
          </p>
        </div>
        <div className="manager-header-actions">
          <AppSwitcher currentApp="project-manager" baseUrl={APP_BASE_URL} />
          <button type="button" className="manager-ghost-button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <section className="manager-grid">
        <article className="manager-card manager-card-hero">
          <div className="manager-card-header">
            <h2>Lab Context</h2>
            <span>{activeLab?.role ?? "member"}</span>
          </div>
          <div className="manager-stat-grid">
            <div>
              <span>Active lab</span>
              <strong>{activeLab?.name ?? "No lab selected"}</strong>
              <small>{activeLab?.slug ?? "Slug pending"}</small>
            </div>
            <div>
              <span>User</span>
              <strong>{profile?.display_name || profile?.email || "Signed-in user"}</strong>
              <small>AuthGate + lab picker are live</small>
            </div>
            <div>
              <span>Next cutover</span>
              <strong>Projects</strong>
              <small>`projects`, `milestones`, `experiments`</small>
            </div>
          </div>
        </article>

        <article className="manager-card">
          <div className="manager-card-header">
            <h2>Upcoming Scope</h2>
            <span>PR-4.A</span>
          </div>
          <ul className="manager-list">
            <li>Project detail views with milestones and experiments</li>
            <li>Project-lead assignment panel mounted per project</li>
            <li>Protocol links from experiments into protocol-manager</li>
          </ul>
        </article>

        <article className="manager-card">
          <div className="manager-card-header">
            <h2>Shared Shell Status</h2>
            <span>Ready</span>
          </div>
          <ul className="manager-list">
            <li>Auth and lab selection now gate the app</li>
            <li>Cross-app switcher is available from every manager surface</li>
            <li>Placeholder shell is ready for the normalized-table cutover</li>
          </ul>
        </article>
      </section>
    </main>
  );
};
