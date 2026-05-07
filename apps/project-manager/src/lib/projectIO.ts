import type {
  ExperimentRecord,
  ExperimentStatus,
  MilestoneRecord,
  MilestoneStatus,
  ProjectRecord,
  ProjectStatus,
} from "./cloudAdapter";

// Versioned JSON shape used by the Projects import/export feature. Mirrors
// the protocol IO contract: stable schema with `version` + `kind` so future
// changes can detect (and migrate) older payloads. We deliberately avoid
// embedding lab-scoped IDs, created_by, or timestamps so a JSON exported
// from one lab can be imported into another without leaking foreign keys.

export const PROJECT_EXPORT_VERSION = 1 as const;
export const PROJECT_EXPORT_KIND = "ilm.project" as const;

export interface ExperimentExport {
  title: string;
  notes: string | null;
  status: ExperimentStatus;
  sortOrder: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface MilestoneExport {
  title: string;
  description: string | null;
  dueDate: string | null;
  status: MilestoneStatus;
  sortOrder: number;
  experiments: ExperimentExport[];
}

export interface ProjectExport {
  version: typeof PROJECT_EXPORT_VERSION;
  kind: typeof PROJECT_EXPORT_KIND;
  exportedAt: string;
  project: {
    name: string;
    description: string | null;
    status: ProjectStatus;
    approvalRequired: boolean;
  };
  milestones: MilestoneExport[];
  /** Experiments not attached to any milestone — preserved as a sibling list. */
  ungroupedExperiments: ExperimentExport[];
}

const MILESTONE_STATUSES: ReadonlyArray<MilestoneStatus> = [
  "planned",
  "in_progress",
  "done",
  "cancelled",
];
const EXPERIMENT_STATUSES: ReadonlyArray<ExperimentStatus> = [
  "planned",
  "running",
  "completed",
  "failed",
];
const PROJECT_STATUSES: ReadonlyArray<ProjectStatus> = [
  "planning",
  "active",
  "blocked",
  "completed",
  "archived",
];

const isMilestoneStatus = (value: unknown): value is MilestoneStatus =>
  typeof value === "string" && (MILESTONE_STATUSES as readonly string[]).includes(value);

const isExperimentStatus = (value: unknown): value is ExperimentStatus =>
  typeof value === "string" && (EXPERIMENT_STATUSES as readonly string[]).includes(value);

const isProjectStatus = (value: unknown): value is ProjectStatus =>
  typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const toExperimentExport = (row: ExperimentRecord): ExperimentExport => ({
  title: row.title,
  notes: row.notes,
  status: row.status,
  sortOrder: row.sort_order,
  startedAt: row.started_at,
  completedAt: row.completed_at,
});

const toMilestoneExport = (
  milestone: MilestoneRecord,
  childExperiments: ExperimentRecord[]
): MilestoneExport => ({
  title: milestone.title,
  description: milestone.description,
  dueDate: milestone.due_date,
  status: milestone.status,
  sortOrder: milestone.sort_order,
  experiments: childExperiments
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map(toExperimentExport),
});

export const buildProjectExport = (args: {
  project: ProjectRecord;
  milestones: MilestoneRecord[];
  experiments: ExperimentRecord[];
}): ProjectExport => {
  const projectStatus: ProjectStatus = isProjectStatus(args.project.status)
    ? args.project.status
    : "planning";
  const milestonesByProject = args.milestones
    .filter((m) => m.project_id === args.project.id)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const projectExperiments = args.experiments.filter((e) => e.project_id === args.project.id);
  const milestoneIds = new Set(milestonesByProject.map((m) => m.id));
  const grouped: Record<string, ExperimentRecord[]> = {};
  const ungrouped: ExperimentRecord[] = [];
  for (const exp of projectExperiments) {
    if (exp.milestone_id && milestoneIds.has(exp.milestone_id)) {
      const list = grouped[exp.milestone_id] ?? [];
      list.push(exp);
      grouped[exp.milestone_id] = list;
    } else {
      ungrouped.push(exp);
    }
  }
  return {
    version: PROJECT_EXPORT_VERSION,
    kind: PROJECT_EXPORT_KIND,
    exportedAt: new Date().toISOString(),
    project: {
      name: args.project.name,
      description: args.project.description,
      status: projectStatus,
      approvalRequired: args.project.approval_required,
    },
    milestones: milestonesByProject.map((m) => toMilestoneExport(m, grouped[m.id] ?? [])),
    ungroupedExperiments: ungrouped
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
      .map(toExperimentExport),
  };
};

export const stringifyProjectExport = (payload: ProjectExport): string =>
  JSON.stringify(payload, null, 2);

// ---------------------------------------------------------------------------
// Import — strict schema validation. Returns a normalized "plan" the App can
// hand to the cloud adapter (createProjectDraft → milestones → experiments).
// ---------------------------------------------------------------------------

export interface NormalizedExperimentPlan {
  title: string;
  notes: string | null;
  status: ExperimentStatus;
  sortOrder: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface NormalizedMilestonePlan {
  title: string;
  description: string | null;
  dueDate: string | null;
  status: MilestoneStatus;
  sortOrder: number;
  experiments: NormalizedExperimentPlan[];
}

export interface NormalizedProjectImportPlan {
  project: {
    name: string;
    description: string | null;
    status: ProjectStatus;
    approvalRequired: boolean;
  };
  milestones: NormalizedMilestonePlan[];
  ungroupedExperiments: NormalizedExperimentPlan[];
}

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} cannot be empty`);
  return trimmed;
};

const optionalString = (value: unknown, label: string): string | null => {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`${label} must be a string or null`);
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const optionalIso = (value: unknown, label: string): string | null => {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`${label} must be an ISO date string or null`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is not a valid date`);
  return trimmed;
};

const numberOr = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
};

const parseExperiment = (raw: unknown, idx: number): NormalizedExperimentPlan => {
  if (!raw || typeof raw !== "object") {
    throw new Error(`experiments[${idx}] must be an object`);
  }
  const r = raw as Record<string, unknown>;
  const status = r.status;
  if (!isExperimentStatus(status)) {
    throw new Error(`experiments[${idx}].status must be one of ${EXPERIMENT_STATUSES.join(", ")}`);
  }
  return {
    title: requireString(r.title, `experiments[${idx}].title`),
    notes: optionalString(r.notes, `experiments[${idx}].notes`),
    status,
    sortOrder: numberOr(r.sortOrder, (idx + 1) * 1024),
    startedAt: optionalIso(r.startedAt, `experiments[${idx}].startedAt`),
    completedAt: optionalIso(r.completedAt, `experiments[${idx}].completedAt`),
  };
};

const parseMilestone = (raw: unknown, idx: number): NormalizedMilestonePlan => {
  if (!raw || typeof raw !== "object") {
    throw new Error(`milestones[${idx}] must be an object`);
  }
  const r = raw as Record<string, unknown>;
  const status = r.status;
  if (!isMilestoneStatus(status)) {
    throw new Error(`milestones[${idx}].status must be one of ${MILESTONE_STATUSES.join(", ")}`);
  }
  const experimentsRaw = Array.isArray(r.experiments) ? r.experiments : [];
  return {
    title: requireString(r.title, `milestones[${idx}].title`),
    description: optionalString(r.description, `milestones[${idx}].description`),
    dueDate: optionalIso(r.dueDate, `milestones[${idx}].dueDate`),
    status,
    sortOrder: numberOr(r.sortOrder, (idx + 1) * 1024),
    experiments: experimentsRaw.map((row, i) => parseExperiment(row, i)),
  };
};

export const parseProjectImport = (raw: unknown): NormalizedProjectImportPlan => {
  if (!raw || typeof raw !== "object") throw new Error("Import payload must be a JSON object");
  const r = raw as Record<string, unknown>;
  if (r.kind !== PROJECT_EXPORT_KIND) {
    throw new Error(`Expected kind "${PROJECT_EXPORT_KIND}", got "${String(r.kind)}"`);
  }
  if (typeof r.version !== "number") {
    throw new Error("version must be a number");
  }
  if (r.version > PROJECT_EXPORT_VERSION) {
    throw new Error(
      `Unsupported export version ${r.version}; this client only knows up to v${PROJECT_EXPORT_VERSION}`
    );
  }
  const projectRaw = r.project;
  if (!projectRaw || typeof projectRaw !== "object") throw new Error("project object missing");
  const p = projectRaw as Record<string, unknown>;
  const status: ProjectStatus = isProjectStatus(p.status) ? p.status : "planning";
  const milestonesRaw = Array.isArray(r.milestones) ? r.milestones : [];
  const ungroupedRaw = Array.isArray(r.ungroupedExperiments) ? r.ungroupedExperiments : [];
  return {
    project: {
      name: requireString(p.name, "project.name"),
      description: optionalString(p.description, "project.description"),
      status,
      approvalRequired:
        typeof p.approvalRequired === "boolean" ? p.approvalRequired : true,
    },
    milestones: milestonesRaw.map((row, idx) => parseMilestone(row, idx)),
    ungroupedExperiments: ungroupedRaw.map((row, idx) => parseExperiment(row, idx)),
  };
};

export const parseProjectImportFromText = (text: string): NormalizedProjectImportPlan => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid JSON";
    throw new Error(`Could not parse JSON: ${message}`);
  }
  return parseProjectImport(raw);
};
