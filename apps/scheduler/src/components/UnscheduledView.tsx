import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  CardGrid,
  EmptyState,
  FormField,
  FormRow,
  Panel,
  SectionHeader,
  Select,
  StatusPill,
  type StatusTone,
} from "@ilm/ui";
import type {
  PlannedTaskPriority,
  PlannedTaskRecord,
  PlannedTaskStatus,
  ProjectOption,
  ResourceRecord,
} from "../lib/cloudAdapter";
import { formatDate } from "../lib/datetime";

const PRIORITY_TONES: Record<PlannedTaskPriority, StatusTone> = {
  low: "neutral",
  normal: "neutral",
  high: "submitted",
  urgent: "blocked",
};

const STATUS_TONES: Record<PlannedTaskStatus, StatusTone> = {
  planned: "draft",
  ready_to_schedule: "submitted",
  scheduled: "active",
  completed: "validated",
  cancelled: "cancelled",
};

const PRIORITY_ORDER: Record<PlannedTaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const titleCase = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export interface UnscheduledViewProps {
  tasks: PlannedTaskRecord[];
  resources: ResourceRecord[];
  projects: ProjectOption[];
  onNewTask: () => void;
  onEditTask: (task: PlannedTaskRecord) => void;
  onSchedule: (task: PlannedTaskRecord) => void;
}

const STATUS_FILTERS: Array<PlannedTaskStatus | "open"> = [
  "open",
  "planned",
  "ready_to_schedule",
  "scheduled",
  "completed",
  "cancelled",
];

export const UnscheduledView = ({
  tasks,
  resources,
  projects,
  onNewTask,
  onEditTask,
  onSchedule,
}: UnscheduledViewProps) => {
  const [statusFilter, setStatusFilter] = useState<PlannedTaskStatus | "open">("open");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const resourcesById = useMemo(
    () => new Map(resources.map((r) => [r.id, r])),
    [resources]
  );
  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
        if (statusFilter === "open") {
          if (t.status !== "planned" && t.status !== "ready_to_schedule") return false;
        } else if (t.status !== statusFilter) {
          return false;
        }
        if (projectFilter !== "all" && t.project_id !== projectFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (byPriority !== 0) return byPriority;
        const aDate = a.preferred_start_date ?? "9999-12-31";
        const bDate = b.preferred_start_date ?? "9999-12-31";
        return aDate.localeCompare(bDate);
      });
  }, [tasks, statusFilter, projectFilter]);

  return (
    <Panel>
      <SectionHeader
        title="Unscheduled tasks"
        meta={`${filtered.length} of ${tasks.length}`}
        actions={
          <Button variant="primary" size="sm" onClick={onNewTask}>
            + New task
          </Button>
        }
      />
      <FormRow className="sch-filter-row">
        <FormField label="Status">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PlannedTaskStatus | "open")}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === "open" ? "Open (planned + ready)" : titleCase(s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Project">
          <Select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
      </FormRow>
      {tasks.length === 0 ? (
        <EmptyState
          title="No planned tasks yet"
          description="Capture work that needs to happen but isn't on the calendar yet."
          action={
            <Button variant="primary" onClick={onNewTask}>
              + New task
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No tasks match these filters"
          description="Adjust the filters or create a new task."
        />
      ) : (
        <CardGrid className="sch-task-grid">
          {filtered.map((task) => {
            const project = task.project_id ? projectsById.get(task.project_id) : null;
            const taskResources = task.required_resource_ids
              .map((id) => resourcesById.get(id))
              .filter((r): r is ResourceRecord => Boolean(r));
            return (
              <Panel key={task.id} className="sch-task-card">
                <div className="sch-task-card-head">
                  <h4 className="sch-task-card-title">{task.title}</h4>
                  <StatusPill status={STATUS_TONES[task.status]}>
                    {titleCase(task.status)}
                  </StatusPill>
                </div>
                <div className="sch-task-card-row">
                  <Badge tone={
                    task.priority === "urgent"
                      ? "danger"
                      : task.priority === "high"
                      ? "warning"
                      : "neutral"
                  }>
                    {task.priority}
                  </Badge>
                  {project ? <span className="sch-cell-meta">{project.name}</span> : null}
                  {task.estimated_duration_minutes ? (
                    <span className="sch-cell-meta">~{task.estimated_duration_minutes} min</span>
                  ) : null}
                </div>
                {task.description ? (
                  <p className="sch-task-card-desc">{task.description}</p>
                ) : null}
                {taskResources.length > 0 ? (
                  <div className="sch-task-card-row">
                    <span className="sch-cell-meta">Needs:</span>
                    {taskResources.map((r) => (
                      <Badge key={r.id} tone="info">
                        {r.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {task.preferred_start_date || task.preferred_end_date ? (
                  <div className="sch-cell-meta">
                    Window {formatDate(task.preferred_start_date)} →{" "}
                    {formatDate(task.preferred_end_date)}
                  </div>
                ) : null}
                <div className="sch-actions-row sch-task-card-actions">
                  {task.status === "planned" || task.status === "ready_to_schedule" ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onSchedule(task)}
                    >
                      Schedule…
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => onEditTask(task)}>
                    Edit
                  </Button>
                </div>
              </Panel>
            );
          })}
        </CardGrid>
      )}
    </Panel>
  );
};
