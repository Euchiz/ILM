import { useState } from "react";
import {
  CardGrid,
  LabShell,
  LabTopbar,
  Panel,
  SectionHeader,
  useAuth,
} from "@ilm/ui";

const APP_BASE_URL = import.meta.env.BASE_URL;

type SchedulerTab = "calendar" | "bookings" | "unscheduled" | "resources";

const TAB_LABELS: Record<SchedulerTab, string> = {
  calendar: "Calendar",
  bookings: "Bookings",
  unscheduled: "Unscheduled",
  resources: "Resources",
};

export const App = () => {
  const { activeLab, profile } = useAuth();
  const [tab, setTab] = useState<SchedulerTab>("calendar");

  return (
    <LabShell
      activeNavId="calendar"
      baseUrl={APP_BASE_URL}
      topbar={
        <LabTopbar
          kicker="SCHEDULER"
          title="Scheduler"
          subtitle="Plan lab work, meetings, and equipment usage."
        />
      }
      subbar={
        <nav className="sch-subbar" aria-label="Scheduler sections">
          {(Object.keys(TAB_LABELS) as SchedulerTab[]).map((id) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "sch-subtab is-active" : "sch-subtab"}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              {TAB_LABELS[id]}
            </button>
          ))}
          <span className="sch-subbar-spacer" aria-hidden="true" />
        </nav>
      }
    >
      <CardGrid>
        <Panel>
          <SectionHeader title="Lab context" meta={activeLab?.role ?? "member"} />
          <div className="sch-stat-grid">
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
              <span>Active tab</span>
              <strong>{TAB_LABELS[tab]}</strong>
              <small>Foundation scaffold — view UI lands next</small>
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Coming up" meta="Stage 4e" />
          <ul className="sch-list">
            <li>Weekly calendar with event create / edit / delete and basic recurrence</li>
            <li>Equipment booking form with server-side conflict detection</li>
            <li>Unscheduled task queue that converts into events and bookings</li>
            <li>Resource registry with status, buffers, and policy controls</li>
          </ul>
        </Panel>

        <Panel>
          <SectionHeader title="Schema status" meta="Migrated" />
          <ul className="sch-list">
            <li><code>resources</code>, <code>calendar_events</code>, <code>bookings</code>, <code>planned_tasks</code> with RLS</li>
            <li>
              <code>book_resource</code>, <code>cancel_booking</code>, <code>complete_booking</code>,
              <code>approve_booking</code>, <code>deny_booking</code>, <code>schedule_planned_task</code> RPCs
            </li>
            <li><code>find_booking_conflicts</code> helper applies setup / cleanup buffers</li>
          </ul>
        </Panel>
      </CardGrid>
    </LabShell>
  );
};
