import { useState } from "react";
import {
  ErrorBanner,
  LabShell,
  LabTopbar,
  useAuth,
} from "@ilm/ui";
import { useSchedulerWorkspace } from "./lib/useSchedulerWorkspace";
import { startOfWeek } from "./lib/datetime";
import { CalendarView } from "./components/CalendarView";
import { EventFormModal } from "./components/EventFormModal";
import { BookingsView } from "./components/BookingsView";
import { BookingFormModal } from "./components/BookingFormModal";
import { UnscheduledView } from "./components/UnscheduledView";
import { PlannedTaskFormModal } from "./components/PlannedTaskFormModal";
import { ScheduleTaskModal } from "./components/ScheduleTaskModal";
import { ResourcesView } from "./components/ResourcesView";
import { ResourceFormModal } from "./components/ResourceFormModal";
import type {
  CalendarEventRecord,
  PlannedTaskRecord,
  ResourceRecord,
} from "./lib/cloudAdapter";

const APP_BASE_URL = import.meta.env.BASE_URL;

type SchedulerTab = "calendar" | "bookings" | "unscheduled" | "resources";

const TAB_LABELS: Record<SchedulerTab, string> = {
  calendar: "Calendar",
  bookings: "Bookings",
  unscheduled: "Unscheduled",
  resources: "Resources",
};

type ModalState =
  | { kind: "none" }
  | {
      kind: "event-form";
      event: CalendarEventRecord | null;
      startIso?: string | null;
      endIso?: string | null;
    }
  | {
      kind: "booking-form";
      resourceId?: string | null;
      startIso?: string | null;
      endIso?: string | null;
    }
  | { kind: "task-form"; task: PlannedTaskRecord | null }
  | { kind: "schedule-task"; task: PlannedTaskRecord }
  | { kind: "resource-form"; resource: ResourceRecord | null };

export const App = () => {
  const { user, activeLab } = useAuth();
  const isAdmin = activeLab?.role === "owner" || activeLab?.role === "admin";
  const workspace = useSchedulerWorkspace({
    labId: activeLab?.id ?? null,
    userId: user?.id ?? null,
  });

  const [tab, setTab] = useState<SchedulerTab>(() => {
    if (typeof window === "undefined") return "calendar";
    const hash = window.location.hash.replace(/^#\/?/, "").toLowerCase();
    if (hash === "bookings" || hash === "calendar" || hash === "unscheduled" || hash === "resources") {
      return hash as SchedulerTab;
    }
    return "calendar";
  });
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));

  const closeModal = () => setModal({ kind: "none" });

  const renderTab = () => {
    switch (tab) {
      case "calendar":
        return (
          <CalendarView
            events={workspace.events}
            weekStart={weekStart}
            onChangeWeek={setWeekStart}
            onCreateEvent={(startIso, endIso) =>
              setModal({
                kind: "event-form",
                event: null,
                startIso: startIso ?? null,
                endIso: endIso ?? null,
              })
            }
            onSelectEvent={(event) =>
              setModal({ kind: "event-form", event, startIso: null, endIso: null })
            }
          />
        );
      case "bookings":
        return (
          <BookingsView
            bookings={workspace.bookings}
            resources={workspace.resources}
            projects={workspace.projects}
            currentUserId={user?.id ?? null}
            isAdmin={isAdmin}
            onNewBooking={() =>
              setModal({ kind: "booking-form", resourceId: null })
            }
            onCancel={(bookingId) => workspace.cancelBooking(bookingId)}
            onComplete={(bookingId, usageRecord) =>
              workspace.completeBooking({ bookingId, usageRecord })
            }
            onApprove={(bookingId) => workspace.approveBooking(bookingId)}
            onDeny={(bookingId, note) => workspace.denyBooking(bookingId, note)}
          />
        );
      case "unscheduled":
        return (
          <UnscheduledView
            tasks={workspace.plannedTasks}
            resources={workspace.resources}
            projects={workspace.projects}
            onNewTask={() => setModal({ kind: "task-form", task: null })}
            onEditTask={(task) => setModal({ kind: "task-form", task })}
            onSchedule={(task) => setModal({ kind: "schedule-task", task })}
          />
        );
      case "resources":
        return (
          <ResourcesView
            resources={workspace.resources}
            bookings={workspace.bookings}
            isAdmin={isAdmin}
            onNewResource={() => setModal({ kind: "resource-form", resource: null })}
            onEditResource={(resource) =>
              setModal({ kind: "resource-form", resource })
            }
          />
        );
    }
  };

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
      {workspace.error ? <ErrorBanner>{workspace.error}</ErrorBanner> : null}
      {workspace.status === "loading" && workspace.events.length === 0 ? (
        <p className="sch-loading">Loading scheduler…</p>
      ) : null}
      {renderTab()}

      <EventFormModal
        open={modal.kind === "event-form"}
        onClose={closeModal}
        onCreate={(data) => workspace.createCalendarEvent(data)}
        onUpdate={(eventId, data) => workspace.updateCalendarEvent(eventId, data)}
        onDelete={(eventId) => workspace.deleteCalendarEvent(eventId)}
        initial={modal.kind === "event-form" ? modal.event : null}
        initialStartIso={modal.kind === "event-form" ? modal.startIso : null}
        initialEndIso={modal.kind === "event-form" ? modal.endIso : null}
        projects={workspace.projects}
        protocols={workspace.protocols}
      />

      <BookingFormModal
        open={modal.kind === "booking-form"}
        onClose={closeModal}
        onBook={(args) => workspace.bookResource(args)}
        onCheckConflicts={(args) => workspace.findBookingConflicts(args)}
        resources={workspace.resources}
        projects={workspace.projects}
        protocols={workspace.protocols}
        initialResourceId={modal.kind === "booking-form" ? modal.resourceId : null}
        initialStartIso={modal.kind === "booking-form" ? modal.startIso : null}
        initialEndIso={modal.kind === "booking-form" ? modal.endIso : null}
      />

      <PlannedTaskFormModal
        open={modal.kind === "task-form"}
        onClose={closeModal}
        onCreate={(data) => workspace.createPlannedTask(data)}
        onUpdate={(taskId, data) => workspace.updatePlannedTask(taskId, data)}
        onDelete={(taskId) => workspace.deletePlannedTask(taskId)}
        initial={modal.kind === "task-form" ? modal.task : null}
        projects={workspace.projects}
        protocols={workspace.protocols}
        resources={workspace.resources}
      />

      <ScheduleTaskModal
        open={modal.kind === "schedule-task"}
        onClose={closeModal}
        task={modal.kind === "schedule-task" ? modal.task : null}
        resources={workspace.resources}
        projects={workspace.projects}
        protocols={workspace.protocols}
        onSchedule={(args) => workspace.schedulePlannedTask(args)}
      />

      <ResourceFormModal
        open={modal.kind === "resource-form"}
        onClose={closeModal}
        onCreate={(data) => workspace.createResource(data)}
        onUpdate={(resourceId, data) => workspace.updateResource(resourceId, data)}
        onArchive={(resourceId) => workspace.archiveResource(resourceId)}
        initial={modal.kind === "resource-form" ? modal.resource : null}
        protocols={workspace.protocols}
      />
    </LabShell>
  );
};
