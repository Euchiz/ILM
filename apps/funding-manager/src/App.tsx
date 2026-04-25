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
        kicker="Integrated Lab Manager"
        title="Funding Manager"
        subtitle="Grants, budgets, allocations, and expense approvals will connect back to projects and supply operations once the normalized funding schema lands."
        actions={<AppSwitcher currentApp="funding-manager" baseUrl={APP_BASE_URL} />}
      />
      <AppContent>
        <CardGrid>
          <Panel className="funding-hero-card">
            <SectionHeader title="Lab Context" meta={activeLab?.role ?? "member"} />
            <div className="funding-stat-grid">
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
          </Panel>

          <Panel>
            <SectionHeader title="Upcoming Scope" meta="Stage 4d" />
            <ul className="funding-list">
              <li>Grant dashboard with committed versus remaining budget</li>
              <li>Allocation proposal queue with admin commit and decline actions</li>
              <li>Expense records connected to received orders from Supply Manager</li>
            </ul>
          </Panel>

          <Panel>
            <SectionHeader title="Shared Shell Status" meta="Ready" />
            <ul className="funding-list">
              <li>Auth and lab selection gate the app</li>
              <li>Cross-app switcher links the manager surfaces</li>
              <li>Built on the shared Viridian Blue ILM shell and primitive system</li>
            </ul>
          </Panel>

          <div className="funding-hero-card">
            <AccountLinkCard baseUrl={APP_BASE_URL} />
          </div>
        </CardGrid>
      </AppContent>
    </AppShell>
  );
};
