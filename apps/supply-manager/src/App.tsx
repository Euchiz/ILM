import {
  AccountLinkCard,
  AppContent,
  AppShell,
  AppSwitcher,
  AppTopbar,
  CardGrid,
  Panel,
  SectionHeader,
  useAuth,
} from "@ilm/ui";

const APP_BASE_URL = import.meta.env.BASE_URL;

export const App = () => {
  const { activeLab, profile } = useAuth();

  return (
    <AppShell>
      <AppTopbar
        kicker="Stage 4 Foundation"
        title="Supply Manager"
        subtitle="Vendors, reagents, inventory counts, and order flow will cut over here once the normalized supply schema lands."
        actions={<AppSwitcher currentApp="supply-manager" baseUrl={APP_BASE_URL} />}
      />
      <AppContent>
        <CardGrid>
          <Panel className="supply-hero-card">
            <SectionHeader title="Lab Context" meta={activeLab?.role ?? "member"} />
            <div className="supply-stat-grid">
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
          </Panel>

          <Panel>
            <SectionHeader title="Upcoming Scope" meta="PR-4.B" />
            <ul className="supply-list">
              <li>Reagent table with server-side search and stock health</li>
              <li>Order queue with status transitions and vendor links</li>
              <li>Canonical reagent ids for later protocol references</li>
            </ul>
          </Panel>

          <Panel>
            <SectionHeader title="Shared Shell Status" meta="Ready" />
            <ul className="supply-list">
              <li>Auth and lab selection now gate the app</li>
              <li>Cross-app switcher links the four manager surfaces</li>
              <li>Built on the @ilm/ui AppShell — no more one-off shell CSS</li>
            </ul>
          </Panel>

          <div className="supply-hero-card">
            <AccountLinkCard baseUrl={APP_BASE_URL} />
          </div>
        </CardGrid>
      </AppContent>
    </AppShell>
  );
};
