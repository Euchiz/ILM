import { AppSwitcher, useAuth } from "@ilm/ui";

const APP_BASE_URL = import.meta.env.BASE_URL;

export const App = () => {
  const { activeLab, profile, signOut } = useAuth();

  return (
    <main className="manager-shell">
      <header className="manager-header">
        <div className="manager-header-copy">
          <p className="manager-kicker">Stage 4 Foundation</p>
          <h1>Funding Manager</h1>
          <p className="manager-subtitle">
            Grants, budgets, allocations, and expense approvals will move here on a shared lab-scoped shell with admin review for committed spend.
          </p>
        </div>
        <div className="manager-header-actions">
          <AppSwitcher currentApp="funding-manager" baseUrl={APP_BASE_URL} />
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
              <small>Shared auth shell is active</small>
            </div>
            <div>
              <span>Next cutover</span>
              <strong>Funding tables</strong>
              <small>`grants`, `budgets`, `allocations`, `expenses`</small>
            </div>
          </div>
        </article>

        <article className="manager-card">
          <div className="manager-card-header">
            <h2>Upcoming Scope</h2>
            <span>PR-4.C</span>
          </div>
          <ul className="manager-list">
            <li>Grant dashboard with committed versus remaining budget</li>
            <li>Allocation proposal queue with admin commit and decline actions</li>
            <li>Expense records connected to received orders from supply-manager</li>
          </ul>
        </article>

        <article className="manager-card">
          <div className="manager-card-header">
            <h2>Shared Shell Status</h2>
            <span>Ready</span>
          </div>
          <ul className="manager-list">
            <li>Auth and lab selection now gate the app</li>
            <li>Cross-app switcher links the four manager surfaces</li>
            <li>Placeholder shell is ready for the funding adapter and RPC wiring</li>
          </ul>
        </article>
      </section>
    </main>
  );
};
