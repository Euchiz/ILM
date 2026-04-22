import { AccountLinkCard, AppSwitcher, useAuth } from "@ilm/ui";
import "@ilm/ui/auth.css";

const APP_BASE_URL = import.meta.env.BASE_URL;

export const App = () => {
  const { activeLab, profile } = useAuth();

  return (
    <main className="manager-shell">
      <header className="manager-header">
        <div className="manager-header-copy">
          <p className="manager-kicker">Stage 4 Foundation</p>
          <h1>Supply Manager</h1>
          <p className="manager-subtitle">
            Vendors, reagents, inventory counts, and order flow will cut over here once the normalized supply schema lands.
          </p>
        </div>
        <div className="manager-header-actions">
          <AppSwitcher currentApp="supply-manager" baseUrl={APP_BASE_URL} />
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
              <strong>Supply tables</strong>
              <small>`vendors`, `reagents`, `inventory_counts`, `orders`</small>
            </div>
          </div>
        </article>

        <article className="manager-card">
          <div className="manager-card-header">
            <h2>Upcoming Scope</h2>
            <span>PR-4.B</span>
          </div>
          <ul className="manager-list">
            <li>Reagent table with server-side search and stock health</li>
            <li>Order queue with status transitions and vendor links</li>
            <li>Canonical reagent ids for later protocol references</li>
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
            <li>Placeholder shell is ready for the supply adapter and hooks</li>
          </ul>
        </article>

        <div className="manager-card manager-card-hero manager-admin-stack">
          <AccountLinkCard baseUrl={APP_BASE_URL} />
        </div>
      </section>
    </main>
  );
};
