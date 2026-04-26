import { CardGrid, LabShell, LabTopbar, Panel, SectionHeader, useAuth } from "@ilm/ui";

const APP_BASE_URL = import.meta.env.BASE_URL;

export const App = () => {
  const { activeLab, profile } = useAuth();

  return (
    <LabShell
      activeNavId="funding"
      baseUrl={APP_BASE_URL}
      topbar={
        <LabTopbar
          kicker="FUNDING"
          title="Funding Manager"
          subtitle="Grants, budgets, allocations, and expense approvals will connect back to projects and supply operations once the normalized funding schema lands."
        />
      }
    >
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
            <li>The shared sidebar / topbar from @ilm/ui's LabShell now wraps every ILM app</li>
            <li>Built on the shared Viridian Blue ILM shell and primitive system</li>
          </ul>
        </Panel>
      </CardGrid>
    </LabShell>
  );
};
