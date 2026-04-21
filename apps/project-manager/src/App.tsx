import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AppSwitcher,
  ProjectLeadsPanel,
  useAuth,
  listLabMembers,
  type LabMemberRecord,
} from "@ilm/ui";
import {
  useProjectWorkspace,
  type UseProjectWorkspaceValue,
} from "./lib/useProjectWorkspace";
import type {
  ExperimentRecord,
  ExperimentStatus,
  MilestoneRecord,
  MilestoneStatus,
  ProjectRecord,
  ProjectStatus,
  ProtocolOptionRecord,
} from "./lib/cloudAdapter";

const APP_BASE_URL = import.meta.env.BASE_URL;

const PROJECT_STATUSES: ProjectStatus[] = ["planning", "active", "blocked", "completed", "archived"];
const MILESTONE_STATUSES: MilestoneStatus[] = ["planned", "in_progress", "done", "cancelled"];
const EXPERIMENT_STATUSES: ExperimentStatus[] = ["planned", "running", "completed", "failed"];

type SidebarTab = "overview" | "library" | "review" | "view";
type ViewSubTab = "info" | "personnel" | "roadmap";
type OutlineSelection =
  | { kind: "milestone"; id: string }
  | { kind: "experiment"; id: string }
  | null;

const statusLabel = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

const formatDate = (value: string | null) => {
  if (!value) return "No date set";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
};

const formatDateTime = (value: string | null) => {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const toDateInputValue = (value: string | null) => value ?? "";

const toDateTimeLocalValue = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const fromDateTimeLocalValue = (value: string) => (value ? new Date(value).toISOString() : null);

const resolveSiteRoot = (baseUrl: string) => {
  const normalized = (baseUrl.trim() || "/").replace(/\/?$/, "/");
  const currentBase = new URL(normalized.startsWith("/") ? normalized : `/${normalized}`, window.location.origin);
  return normalized === "/" ? currentBase : new URL("../", currentBase);
};

const buildProtocolUrl = (protocolId: string) => {
  const url = new URL("protocol-manager/", resolveSiteRoot(APP_BASE_URL));
  url.searchParams.set("protocolId", protocolId);
  return url.toString();
};

// ---------------------------------------------------------------------------
// MilestoneEditor / ExperimentEditor (roadmap pane sub-editors)
// ---------------------------------------------------------------------------

const MilestoneEditor = ({
  milestone,
  canDelete,
  onSave,
  onDelete,
}: {
  milestone: MilestoneRecord;
  canDelete: boolean;
  onSave: (args: Parameters<UseProjectWorkspaceValue["updateMilestone"]>[0]) => Promise<void>;
  onDelete: (milestoneId: string) => Promise<void>;
}) => {
  const [title, setTitle] = useState(milestone.title);
  const [description, setDescription] = useState(milestone.description ?? "");
  const [dueDate, setDueDate] = useState(toDateInputValue(milestone.due_date));
  const [status, setStatus] = useState<MilestoneStatus>(milestone.status);
  const [busy, setBusy] = useState<"idle" | "saving" | "deleting">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(milestone.title);
    setDescription(milestone.description ?? "");
    setDueDate(toDateInputValue(milestone.due_date));
    setStatus(milestone.status);
    setError(null);
    setBusy("idle");
  }, [milestone]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("saving");
    setError(null);
    try {
      await onSave({
        milestoneId: milestone.id,
        title: title.trim() || "Untitled milestone",
        description,
        dueDate: dueDate || null,
        status,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("idle");
    }
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    if (!window.confirm(`Delete milestone "${milestone.title}"?`)) return;
    setBusy("deleting");
    setError(null);
    try {
      await onDelete(milestone.id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy("idle");
    }
  };

  return (
    <form className="pm-inline-form" onSubmit={handleSubmit}>
      <div className="pm-form-head">
        <h3>{milestone.title}</h3>
        <span className={`pm-status-tag pm-status-tag-${status}`}>{statusLabel(status)}</span>
      </div>
      {error ? <p className="pm-inline-error">{error}</p> : null}
      <label className="pm-field">
        <span>Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className="pm-field-row">
        <label className="pm-field">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as MilestoneStatus)}>
            {MILESTONE_STATUSES.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="pm-field">
          <span>Due date</span>
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
      </div>
      <label className="pm-field">
        <span>Description</span>
        <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="pm-form-footer">
        <small>Updated {formatDateTime(milestone.updated_at)}</small>
        <div className="pm-inline-actions">
          {canDelete ? (
            <button type="button" className="pm-text-button pm-text-button-danger" disabled={busy !== "idle"} onClick={() => void handleDelete()}>
              {busy === "deleting" ? "Deleting..." : "Delete"}
            </button>
          ) : null}
          <button type="submit" className="pm-primary-button" disabled={busy !== "idle"}>
            {busy === "saving" ? "Saving..." : "Save milestone"}
          </button>
        </div>
      </div>
    </form>
  );
};

const ExperimentEditor = ({
  experiment,
  canDelete,
  milestones,
  protocols,
  protocolTitles,
  onSave,
  onDelete,
}: {
  experiment: ExperimentRecord;
  canDelete: boolean;
  milestones: MilestoneRecord[];
  protocols: ProtocolOptionRecord[];
  protocolTitles: Map<string, string>;
  onSave: (args: Parameters<UseProjectWorkspaceValue["updateExperiment"]>[0]) => Promise<void>;
  onDelete: (experimentId: string) => Promise<void>;
}) => {
  const [title, setTitle] = useState(experiment.title);
  const [notes, setNotes] = useState(experiment.notes ?? "");
  const [milestoneId, setMilestoneId] = useState(experiment.milestone_id ?? "");
  const [protocolId, setProtocolId] = useState(experiment.protocol_id ?? "");
  const [status, setStatus] = useState<ExperimentStatus>(experiment.status);
  const [startedAt, setStartedAt] = useState(toDateTimeLocalValue(experiment.started_at));
  const [completedAt, setCompletedAt] = useState(toDateTimeLocalValue(experiment.completed_at));
  const [busy, setBusy] = useState<"idle" | "saving" | "deleting">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(experiment.title);
    setNotes(experiment.notes ?? "");
    setMilestoneId(experiment.milestone_id ?? "");
    setProtocolId(experiment.protocol_id ?? "");
    setStatus(experiment.status);
    setStartedAt(toDateTimeLocalValue(experiment.started_at));
    setCompletedAt(toDateTimeLocalValue(experiment.completed_at));
    setError(null);
    setBusy("idle");
  }, [experiment]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("saving");
    setError(null);
    try {
      await onSave({
        experimentId: experiment.id,
        title: title.trim() || "Untitled experiment",
        notes,
        milestoneId: milestoneId || null,
        protocolId: protocolId || null,
        status,
        startedAt: fromDateTimeLocalValue(startedAt),
        completedAt: fromDateTimeLocalValue(completedAt),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("idle");
    }
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    if (!window.confirm(`Delete experiment "${experiment.title}"?`)) return;
    setBusy("deleting");
    setError(null);
    try {
      await onDelete(experiment.id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy("idle");
    }
  };

  const linkedProtocolTitle = experiment.protocol_id ? protocolTitles.get(experiment.protocol_id) ?? "Linked protocol" : null;

  return (
    <form className="pm-inline-form" onSubmit={handleSubmit}>
      <div className="pm-form-head">
        <h3>{experiment.title}</h3>
        <span className={`pm-status-tag pm-status-tag-${status}`}>{statusLabel(status)}</span>
      </div>
      {error ? <p className="pm-inline-error">{error}</p> : null}
      <label className="pm-field">
        <span>Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className="pm-field-row">
        <label className="pm-field">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as ExperimentStatus)}>
            {EXPERIMENT_STATUSES.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="pm-field">
          <span>Milestone</span>
          <select value={milestoneId} onChange={(event) => setMilestoneId(event.target.value)}>
            <option value="">Unassigned</option>
            {milestones.map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                {milestone.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pm-field-row">
        <label className="pm-field">
          <span>Linked protocol</span>
          <select value={protocolId} onChange={(event) => setProtocolId(event.target.value)}>
            <option value="">No linked protocol</option>
            {protocols.map((protocol) => (
              <option key={protocol.id} value={protocol.id}>
                {protocol.title}
              </option>
            ))}
          </select>
        </label>
        <label className="pm-field">
          <span>Started</span>
          <input type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
        </label>
        <label className="pm-field">
          <span>Completed</span>
          <input type="datetime-local" value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} />
        </label>
      </div>
      <label className="pm-field">
        <span>Notes</span>
        <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <div className="pm-form-footer">
        <small>{linkedProtocolTitle ? `Protocol: ${linkedProtocolTitle}` : "No protocol linked yet"}</small>
        <div className="pm-inline-actions">
          {experiment.protocol_id ? (
            <a className="pm-link-button" href={buildProtocolUrl(experiment.protocol_id)}>
              Open protocol
            </a>
          ) : null}
          {canDelete ? (
            <button type="button" className="pm-text-button pm-text-button-danger" disabled={busy !== "idle"} onClick={() => void handleDelete()}>
              {busy === "deleting" ? "Deleting..." : "Delete"}
            </button>
          ) : null}
          <button type="submit" className="pm-primary-button" disabled={busy !== "idle"}>
            {busy === "saving" ? "Saving..." : "Save experiment"}
          </button>
        </div>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// New Project modal
// ---------------------------------------------------------------------------

const NewProjectModal = ({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (args: { name: string; description: string; status: ProjectStatus; approvalRequired: boolean }) => Promise<void>;
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name: name.trim() || "Untitled project", description, status, approvalRequired });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pm-modal-backdrop" role="dialog" aria-modal="true">
      <form className="pm-modal" onSubmit={handleSubmit}>
        <div className="pm-modal-head">
          <h2>New project (draft)</h2>
          <button type="button" className="pm-text-button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        <p className="pm-modal-note">
          Creates a private draft visible to you and lab admins. You'll be auto-assigned as a project lead.
          An admin must approve before it becomes visible to the rest of the lab.
        </p>
        {error ? <p className="pm-inline-error">{error}</p> : null}
        <label className="pm-field">
          <span>Name</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Genome Atlas" />
        </label>
        <label className="pm-field">
          <span>Description</span>
          <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="pm-field-row">
          <label className="pm-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>
              {PROJECT_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="pm-checkbox-field">
            <input type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)} />
            <span>Require review for protocol publication inside this project</span>
          </label>
        </div>
        <div className="pm-form-footer">
          <small>You'll be listed as the creator and a project lead on approval.</small>
          <div className="pm-inline-actions">
            <button type="button" className="pm-text-button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="pm-primary-button" disabled={busy}>
              {busy ? "Creating..." : "Create draft"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

export const App = () => {
  const { activeLab, profile, user, signOut } = useAuth();
  const isAdmin = activeLab?.role === "owner" || activeLab?.role === "admin";
  const workspace = useProjectWorkspace(activeLab?.id ?? null, user?.id ?? null, isAdmin);
  const {
    status,
    error,
    projects,
    milestones,
    experiments,
    protocols,
    leads,
    deletedProjects,
    refresh,
    createProjectDraft,
    withdrawProjectDraft,
    approveProject,
    rejectProject,
    recycleProject,
    restoreProject,
    permanentDeleteProject,
    updateProject,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    createExperiment,
    updateExperiment,
    deleteExperiment,
  } = workspace;

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("overview");
  const [viewSubTab, setViewSubTab] = useState<ViewSubTab>("info");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [outlineSelection, setOutlineSelection] = useState<OutlineSelection>(null);
  const [labMembers, setLabMembers] = useState<LabMemberRecord[]>([]);
  const [projectSaveError, setProjectSaveError] = useState<string | null>(null);
  const [projectSaveBusy, setProjectSaveBusy] = useState<"idle" | "saving">("idle");
  const [milestoneDraftTitle, setMilestoneDraftTitle] = useState("");
  const [experimentDraftTitle, setExperimentDraftTitle] = useState("");
  const [experimentDraftMilestoneId, setExperimentDraftMilestoneId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Lab roster (for lead-name resolution + personnel lists)
  useEffect(() => {
    if (!activeLab?.id) {
      setLabMembers([]);
      return;
    }
    let cancelled = false;
    listLabMembers(activeLab.id)
      .then((rows) => {
        if (!cancelled) setLabMembers(rows);
      })
      .catch(() => {
        if (!cancelled) setLabMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeLab?.id]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    labMembers.forEach((m) => map.set(m.user_id, m.display_name || m.email || m.user_id));
    return map;
  }, [labMembers]);

  // Project slices
  const publishedProjects = useMemo(() => projects.filter((p) => p.state === "published"), [projects]);
  const draftProjects = useMemo(() => projects.filter((p) => p.state === "draft"), [projects]);
  const myDraftProjects = useMemo(
    () => draftProjects.filter((p) => p.created_by === user?.id),
    [draftProjects, user?.id]
  );
  const pendingForReview = draftProjects; // admin visibility of all drafts

  // Auto-select first project when the active tab needs one
  useEffect(() => {
    if (sidebarTab !== "view") return;
    if (!projects.length) {
      setActiveProjectId(null);
      return;
    }
    if (!activeProjectId || !projects.some((p) => p.id === activeProjectId)) {
      setActiveProjectId(publishedProjects[0]?.id ?? projects[0].id);
    }
  }, [sidebarTab, projects, publishedProjects, activeProjectId]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  // Aggregates
  const milestonesByProject = useMemo(() => {
    const map = new Map<string, MilestoneRecord[]>();
    milestones.forEach((m) => {
      const list = map.get(m.project_id) ?? [];
      list.push(m);
      map.set(m.project_id, list);
    });
    return map;
  }, [milestones]);

  const experimentsByProject = useMemo(() => {
    const map = new Map<string, ExperimentRecord[]>();
    experiments.forEach((ex) => {
      const list = map.get(ex.project_id) ?? [];
      list.push(ex);
      map.set(ex.project_id, list);
    });
    return map;
  }, [experiments]);

  const experimentsByMilestone = useMemo(() => {
    const map = new Map<string, ExperimentRecord[]>();
    experiments.forEach((experiment) => {
      if (!experiment.milestone_id) return;
      const list = map.get(experiment.milestone_id) ?? [];
      list.push(experiment);
      map.set(experiment.milestone_id, list);
    });
    return map;
  }, [experiments]);

  const leadsByProject = useMemo(() => {
    const map = new Map<string, string[]>();
    leads.forEach((l) => {
      const list = map.get(l.project_id) ?? [];
      list.push(l.user_id);
      map.set(l.project_id, list);
    });
    return map;
  }, [leads]);

  const protocolTitles = useMemo(
    () => new Map(protocols.map((p) => [p.id, p.title])),
    [protocols]
  );

  const activeProjectMilestones = activeProject ? milestonesByProject.get(activeProject.id) ?? [] : [];
  const activeProjectExperiments = activeProject ? experimentsByProject.get(activeProject.id) ?? [] : [];
  const activeUnassignedExperiments = useMemo(
    () => activeProjectExperiments.filter((experiment) => !experiment.milestone_id),
    [activeProjectExperiments]
  );
  const canManageRoadmap =
    isAdmin || (activeProject?.state === "draft" && activeProject.created_by === user?.id);

  useEffect(() => {
    if (outlineSelection?.kind === "milestone") {
      setExperimentDraftMilestoneId(outlineSelection.id);
      return;
    }
    if (!activeProjectMilestones.some((milestone) => milestone.id === experimentDraftMilestoneId)) {
      setExperimentDraftMilestoneId("");
    }
  }, [activeProjectMilestones, experimentDraftMilestoneId, outlineSelection]);

  const leadNamesForProject = useCallback(
    (projectId: string) => {
      const userIds = leadsByProject.get(projectId) ?? [];
      const names = userIds.map((uid) => memberNameById.get(uid)).filter((n): n is string => !!n);
      return names.length ? names : ["No explicit lead"];
    },
    [leadsByProject, memberNameById]
  );

  // Open a project in View tab
  const openProject = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    setSidebarTab("view");
    setViewSubTab("info");
    setOutlineSelection(null);
  }, []);

  // New project handlers
  const handleCreateProject = useCallback(
    async (args: { name: string; description: string; status: ProjectStatus; approvalRequired: boolean }) => {
      const created = await createProjectDraft(args);
      openProject(created.id);
    },
    [createProjectDraft, openProject]
  );

  const handleWithdraw = useCallback(
    async (project: ProjectRecord) => {
      if (!window.confirm(`Withdraw draft "${project.name}"? This will delete it entirely.`)) return;
      setActionError(null);
      try {
        await withdrawProjectDraft(project.id);
        if (activeProjectId === project.id) setActiveProjectId(null);
      } catch (err) {
        setActionError(errorMessage(err));
      }
    },
    [withdrawProjectDraft, activeProjectId]
  );

  const handleApprove = useCallback(
    async (project: ProjectRecord) => {
      setActionError(null);
      try {
        await approveProject(project.id);
      } catch (err) {
        setActionError(errorMessage(err));
      }
    },
    [approveProject]
  );

  const handleReject = useCallback(
    async (project: ProjectRecord) => {
      if (!window.confirm(`Reject and delete draft "${project.name}"? This cannot be undone.`)) return;
      setActionError(null);
      try {
        await rejectProject(project.id);
        if (activeProjectId === project.id) setActiveProjectId(null);
      } catch (err) {
        setActionError(errorMessage(err));
      }
    },
    [rejectProject, activeProjectId]
  );

  const handleRecycle = useCallback(
    async (project: ProjectRecord) => {
      if (!window.confirm(`Move "${project.name}" to the recycle bin?`)) return;
      setActionError(null);
      try {
        await recycleProject(project.id);
        if (activeProjectId === project.id) setActiveProjectId(null);
      } catch (err) {
        setActionError(errorMessage(err));
      }
    },
    [recycleProject, activeProjectId]
  );

  const handleRestore = useCallback(
    async (project: ProjectRecord) => {
      setActionError(null);
      try {
        await restoreProject(project.id);
      } catch (err) {
        setActionError(errorMessage(err));
      }
    },
    [restoreProject]
  );

  const handlePurge = useCallback(
    async (project: ProjectRecord) => {
      if (!window.confirm(`Permanently delete "${project.name}"? This cannot be undone.`)) return;
      setActionError(null);
      try {
        await permanentDeleteProject(project.id);
      } catch (err) {
        setActionError(errorMessage(err));
      }
    },
    [permanentDeleteProject]
  );

  // Info editor handlers
  const handleSaveMetadata = useCallback(
    async (args: { name: string; description: string; status: ProjectStatus; approvalRequired: boolean }) => {
      if (!activeProject) return;
      setProjectSaveBusy("saving");
      setProjectSaveError(null);
      try {
        await updateProject({
          projectId: activeProject.id,
          name: args.name.trim() || "Untitled project",
          description: args.description,
          status: args.status,
          approvalRequired: args.approvalRequired,
        });
      } catch (err) {
        setProjectSaveError(errorMessage(err));
      } finally {
        setProjectSaveBusy("idle");
      }
    },
    [activeProject, updateProject]
  );

  // Roadmap inline creation
  const handleCreateMilestone = async () => {
    if (!activeProject) return;
    if (!milestoneDraftTitle.trim()) return;
    await createMilestone({ projectId: activeProject.id, title: milestoneDraftTitle.trim() });
    setMilestoneDraftTitle("");
  };
  const handleCreateExperiment = async () => {
    if (!activeProject) return;
    if (!experimentDraftTitle.trim()) return;
    await createExperiment({
      projectId: activeProject.id,
      milestoneId: experimentDraftMilestoneId || null,
      title: experimentDraftTitle.trim(),
    });
    setExperimentDraftTitle("");
    setExperimentDraftMilestoneId("");
  };

  // ---------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------

  const projectStateTag = (project: ProjectRecord) => {
    if (project.state === "draft") return <span className="pm-state-tag pm-state-tag-draft">Draft</span>;
    if (project.state === "deleted") return <span className="pm-state-tag pm-state-tag-deleted">Recycled</span>;
    return <span className="pm-state-tag pm-state-tag-published">Published</span>;
  };

  const projectCard = (project: ProjectRecord, opts: { showReviewActions?: boolean } = {}) => {
    const leadNames = leadNamesForProject(project.id);
    const ms = milestonesByProject.get(project.id) ?? [];
    const ex = experimentsByProject.get(project.id) ?? [];
    const isGeneral = project.name === "General";
    const isMine = project.created_by === user?.id;
    return (
      <article key={project.id} className="pm-library-card">
        <div className="pm-library-card-head">
          <div>
            <strong>{project.name}</strong>
            <span>{project.description || "No description yet."}</span>
          </div>
          <div className="pm-library-card-tags">
            {projectStateTag(project)}
            <span className={`pm-status-tag pm-status-tag-${(project.status || "planning").replace(/\s+/g, "_")}`}>
              {statusLabel(project.status || "planning")}
            </span>
          </div>
        </div>
        <dl className="pm-library-card-meta">
          <div>
            <dt>Lead</dt>
            <dd>{leadNames.join(", ")}</dd>
          </div>
          <div>
            <dt>Milestones</dt>
            <dd>{ms.length}</dd>
          </div>
          <div>
            <dt>Experiments</dt>
            <dd>{ex.length}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{formatDate(project.updated_at)}</dd>
          </div>
        </dl>
        <div className="pm-library-card-actions">
          <button type="button" className="pm-primary-button" onClick={() => openProject(project.id)}>
            Open
          </button>
          {opts.showReviewActions && isAdmin ? (
            <>
              <button type="button" className="pm-text-button" onClick={() => void handleApprove(project)}>
                Approve
              </button>
              <button type="button" className="pm-text-button pm-text-button-danger" onClick={() => void handleReject(project)}>
                Reject
              </button>
            </>
          ) : null}
          {project.state === "draft" && (isMine || isAdmin) ? (
            <button type="button" className="pm-text-button" onClick={() => void handleWithdraw(project)}>
              Withdraw
            </button>
          ) : null}
          {project.state === "published" && isAdmin && !isGeneral ? (
            <button type="button" className="pm-text-button pm-text-button-danger" onClick={() => void handleRecycle(project)}>
              Recycle
            </button>
          ) : null}
        </div>
      </article>
    );
  };

  // ---------------------------------------------------------------------
  // Panel renderers
  // ---------------------------------------------------------------------

  const overviewPanel = (
    <div className="pm-panel-body">
      <header className="pm-panel-header">
        <div>
          <h2>Overview</h2>
          <p>Lab projects at a glance.</p>
        </div>
      </header>
      <section className="pm-summary-grid">
        <article className="pm-summary-card">
          <span className="pm-summary-kicker">Active lab</span>
          <strong>{activeLab?.name ?? "No lab selected"}</strong>
          <small>{activeLab?.slug ?? "Slug pending"}</small>
        </article>
        <article className="pm-summary-card">
          <span className="pm-summary-kicker">Published projects</span>
          <strong>{publishedProjects.length}</strong>
          <small>{myDraftProjects.length} of your drafts pending</small>
        </article>
        <article className="pm-summary-card">
          <span className="pm-summary-kicker">Milestones</span>
          <strong>{milestones.length}</strong>
          <small>{experiments.length} experiments lab-wide</small>
        </article>
        <article className="pm-summary-card">
          <span className="pm-summary-kicker">Review queue</span>
          <strong>{pendingForReview.length}</strong>
          <small>{isAdmin ? "You can approve from the Review tab" : "Admins handle reviews"}</small>
        </article>
      </section>

      <section className="pm-panel-section">
        <div className="pm-panel-section-head">
          <h3>Recent projects</h3>
          <span>{publishedProjects.length} published</span>
        </div>
        {publishedProjects.length === 0 ? (
          <p className="pm-empty">No published projects yet.</p>
        ) : (
          <div className="pm-card-grid">
            {publishedProjects.slice(0, 6).map((p) => projectCard(p))}
          </div>
        )}
      </section>
    </div>
  );

  const libraryPanel = (
    <div className="pm-panel-body">
      <header className="pm-panel-header">
        <div>
          <h2>Library</h2>
          <p>Browse drafts and published projects. Open one to edit in the View tab.</p>
        </div>
      </header>
      {actionError ? <p className="pm-page-error">{actionError}</p> : null}

      <section className="pm-panel-section">
        <div className="pm-panel-section-head">
          <h3>My drafts</h3>
          <span>{myDraftProjects.length} in review</span>
        </div>
        {myDraftProjects.length === 0 ? (
          <p className="pm-empty">You have no pending drafts. Use "+ New Project" to start one.</p>
        ) : (
          <div className="pm-card-grid">{myDraftProjects.map((p) => projectCard(p))}</div>
        )}
      </section>

      <section className="pm-panel-section">
        <div className="pm-panel-section-head">
          <h3>Published</h3>
          <span>{publishedProjects.length} live</span>
        </div>
        {publishedProjects.length === 0 ? (
          <p className="pm-empty">No published projects yet.</p>
        ) : (
          <div className="pm-card-grid">{publishedProjects.map((p) => projectCard(p))}</div>
        )}
      </section>

      {isAdmin && deletedProjects.length > 0 ? (
        <section className="pm-panel-section">
          <div className="pm-panel-section-head">
            <h3>Recycle bin</h3>
            <span>{deletedProjects.length} projects</span>
          </div>
          <div className="pm-card-grid">
            {deletedProjects.map((project) => (
              <article key={project.id} className="pm-library-card">
                <div className="pm-library-card-head">
                  <div>
                    <strong>{project.name}</strong>
                    <span>Recycled {formatDate(project.deleted_at)}</span>
                  </div>
                  <div className="pm-library-card-tags">{projectStateTag(project)}</div>
                </div>
                <div className="pm-library-card-actions">
                  <button type="button" className="pm-primary-button" onClick={() => void handleRestore(project)}>
                    Restore
                  </button>
                  <button type="button" className="pm-text-button pm-text-button-danger" onClick={() => void handlePurge(project)}>
                    Delete permanently
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );

  const reviewPanel = (
    <div className="pm-panel-body">
      <header className="pm-panel-header">
        <div>
          <h2>Review</h2>
          <p>Project drafts awaiting admin approval.</p>
        </div>
      </header>
      {actionError ? <p className="pm-page-error">{actionError}</p> : null}
      {!isAdmin ? (
        <section className="pm-panel-section">
          <p className="pm-empty">
            You're a member of this lab. Lab admins handle project approvals; your own drafts remain visible here only to you.
          </p>
          {myDraftProjects.length > 0 ? (
            <div className="pm-card-grid">{myDraftProjects.map((p) => projectCard(p))}</div>
          ) : null}
        </section>
      ) : pendingForReview.length === 0 ? (
        <p className="pm-empty">No drafts pending review.</p>
      ) : (
        <div className="pm-card-grid">
          {pendingForReview.map((p) => projectCard(p, { showReviewActions: true }))}
        </div>
      )}
    </div>
  );

  // View tab: outline + sub-tabs
  const viewPanel = activeProject ? (
    <div className="pm-view-grid">
      <aside className="pm-outline-pane">
        <div className="pm-outline-head">
          <div>
            <small>{activeProject.state === "draft" ? "Draft" : "Project"}</small>
            <strong>{activeProject.name}</strong>
          </div>
        </div>
        <div className="pm-outline-body">
          {activeProjectMilestones.length === 0 && activeProjectExperiments.length === 0 ? (
            <p className="pm-empty">No milestones or experiments yet. Add some from the Roadmap tab.</p>
          ) : (
            <>
              {activeProjectMilestones.map((m) => {
                const relatedExperiments = experimentsByMilestone.get(m.id) ?? [];
                const selected = outlineSelection?.kind === "milestone" && outlineSelection.id === m.id;
                return (
                  <div key={m.id} className="pm-outline-group">
                    <button
                      type="button"
                      className={`pm-outline-row pm-outline-row-milestone${selected ? " selected" : ""}`}
                      onClick={() => {
                        setOutlineSelection({ kind: "milestone", id: m.id });
                        setViewSubTab("roadmap");
                      }}
                    >
                      <span className={`pm-status-dot pm-status-dot-${m.status}`} aria-hidden />
                      <span className="pm-outline-row-copy">
                        <strong>{m.title}</strong>
                        <small>{m.due_date ? `Due ${formatDate(m.due_date)}` : "No due date"}</small>
                      </span>
                      <span className={`pm-status-tag pm-status-tag-${m.status}`}>{statusLabel(m.status)}</span>
                    </button>

                    {relatedExperiments.map((experiment) => {
                      const experimentSelected =
                        outlineSelection?.kind === "experiment" && outlineSelection.id === experiment.id;
                      return (
                        <button
                          key={experiment.id}
                          type="button"
                          className={`pm-outline-row pm-outline-row-experiment${experimentSelected ? " selected" : ""}`}
                          onClick={() => {
                            setOutlineSelection({ kind: "experiment", id: experiment.id });
                            setViewSubTab("roadmap");
                          }}
                        >
                          <span className={`pm-status-dot pm-status-dot-${experiment.status}`} aria-hidden />
                          <span className="pm-outline-row-copy">
                            <strong>{experiment.title}</strong>
                            <small>{experiment.protocol_id ? protocolTitles.get(experiment.protocol_id) ?? "Linked protocol" : "No protocol"}</small>
                          </span>
                          <span className={`pm-status-tag pm-status-tag-${experiment.status}`}>{statusLabel(experiment.status)}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {activeUnassignedExperiments.length > 0 ? (
                <div className="pm-outline-group">
                  <div className="pm-outline-subhead">Unassigned experiments</div>
                  {activeUnassignedExperiments.map((ex) => {
                    const selected = outlineSelection?.kind === "experiment" && outlineSelection.id === ex.id;
                    return (
                      <button
                        key={ex.id}
                        type="button"
                        className={`pm-outline-row pm-outline-row-experiment${selected ? " selected" : ""}`}
                        onClick={() => {
                          setOutlineSelection({ kind: "experiment", id: ex.id });
                          setViewSubTab("roadmap");
                        }}
                      >
                        <span className={`pm-status-dot pm-status-dot-${ex.status}`} aria-hidden />
                        <span className="pm-outline-row-copy">
                          <strong>{ex.title}</strong>
                          <small>{ex.protocol_id ? protocolTitles.get(ex.protocol_id) ?? "Linked protocol" : "No protocol"}</small>
                        </span>
                        <span className={`pm-status-tag pm-status-tag-${ex.status}`}>{statusLabel(ex.status)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </div>
      </aside>

      <section className="pm-detail-pane">
        <nav className="pm-tab-nav" aria-label="Project view tabs">
          <button
            type="button"
            className={`pm-tab-link${viewSubTab === "info" ? " active" : ""}`}
            onClick={() => setViewSubTab("info")}
          >
            Info
          </button>
          <button
            type="button"
            className={`pm-tab-link${viewSubTab === "personnel" ? " active" : ""}`}
            onClick={() => setViewSubTab("personnel")}
          >
            Personnel
          </button>
          <button
            type="button"
            className={`pm-tab-link${viewSubTab === "roadmap" ? " active" : ""}`}
            onClick={() => setViewSubTab("roadmap")}
          >
            Roadmap
          </button>
          <div className="pm-tab-nav-right">{projectStateTag(activeProject)}</div>
        </nav>

        <div className="pm-detail-body">
          {viewSubTab === "info" ? (
            <InfoTab
              project={activeProject}
              busy={projectSaveBusy}
              error={projectSaveError}
              onSave={handleSaveMetadata}
            />
          ) : null}

          {viewSubTab === "personnel" ? (
            <div className="pm-personnel-body">
              <ProjectLeadsPanel projectId={activeProject.id} title="Project leads" />
              <section className="pm-panel-section">
                <div className="pm-panel-section-head">
                  <h3>Lab roster</h3>
                  <span>{labMembers.length} total</span>
                </div>
                {labMembers.length === 0 ? (
                  <p className="pm-empty">Loading lab roster...</p>
                ) : (
                  <ul className="pm-roster-list">
                    {labMembers.map((m) => (
                      <li key={m.user_id} className="pm-roster-row">
                        <div>
                          <strong>{m.display_name || m.email || m.user_id}</strong>
                          <span>{m.email}</span>
                        </div>
                        <span className={`pm-role-tag pm-role-tag-${m.role}`}>{m.role}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}

          {viewSubTab === "roadmap" ? (
            <div className="pm-roadmap-body">
              <section className="pm-panel-section">
                <div className="pm-panel-section-head">
                  <h3>Milestones</h3>
                  <span>{activeProjectMilestones.length}</span>
                </div>
                <div className="pm-inline-create">
                  <input
                    value={milestoneDraftTitle}
                    onChange={(event) => setMilestoneDraftTitle(event.target.value)}
                    placeholder="New milestone title"
                  />
                  <button
                    type="button"
                    className="pm-primary-button"
                    disabled={!milestoneDraftTitle.trim()}
                    onClick={() => void handleCreateMilestone()}
                  >
                    Add
                  </button>
                </div>
                {activeProjectMilestones.length === 0 ? (
                  <p className="pm-empty">No milestones yet.</p>
                ) : (
                  <div className="pm-item-list">
                    {activeProjectMilestones.map((milestone) => {
                      const highlight =
                        outlineSelection?.kind === "milestone" && outlineSelection.id === milestone.id;
                      return (
                        <div key={milestone.id} className={`pm-item-wrap${highlight ? " highlight" : ""}`}>
                          <MilestoneEditor
                            milestone={milestone}
                            canDelete={canManageRoadmap}
                            onSave={async (args) => {
                              await updateMilestone(args);
                            }}
                            onDelete={async (id) => {
                              await deleteMilestone(id);
                              if (outlineSelection?.kind === "milestone" && outlineSelection.id === id) {
                                setOutlineSelection(null);
                              }
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="pm-panel-section">
                <div className="pm-panel-section-head">
                  <h3>Experiments</h3>
                  <span>{activeProjectExperiments.length}</span>
                </div>
                <div className="pm-inline-create">
                  <input
                    value={experimentDraftTitle}
                    onChange={(event) => setExperimentDraftTitle(event.target.value)}
                    placeholder="New experiment title"
                  />
                  <select
                    className="pm-inline-select"
                    value={experimentDraftMilestoneId}
                    onChange={(event) => setExperimentDraftMilestoneId(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {activeProjectMilestones.map((milestone) => (
                      <option key={milestone.id} value={milestone.id}>
                        {milestone.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="pm-primary-button"
                    disabled={!experimentDraftTitle.trim()}
                    onClick={() => void handleCreateExperiment()}
                  >
                    Add
                  </button>
                </div>
                {activeProjectExperiments.length === 0 ? (
                  <p className="pm-empty">No experiments yet.</p>
                ) : (
                  <div className="pm-item-list">
                    {activeProjectExperiments.map((experiment) => {
                      const highlight =
                        outlineSelection?.kind === "experiment" && outlineSelection.id === experiment.id;
                      return (
                        <div key={experiment.id} className={`pm-item-wrap${highlight ? " highlight" : ""}`}>
                          <ExperimentEditor
                            experiment={experiment}
                            canDelete={canManageRoadmap}
                            milestones={activeProjectMilestones}
                            protocols={protocols}
                            protocolTitles={protocolTitles}
                            onSave={async (args) => {
                              await updateExperiment(args);
                            }}
                            onDelete={async (id) => {
                              await deleteExperiment(id);
                              if (outlineSelection?.kind === "experiment" && outlineSelection.id === id) {
                                setOutlineSelection(null);
                              }
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  ) : (
    <div className="pm-panel-body">
      <p className="pm-empty">Select a project from the Library tab, or create a new one.</p>
    </div>
  );

  // ---------------------------------------------------------------------
  // Shell
  // ---------------------------------------------------------------------

  const signedInLabel = profile?.display_name || profile?.email || "Signed in";

  return (
    <div className="pm-shell">
      <aside className="pm-side-rail" aria-label="Project manager navigation">
        <div className="pm-side-rail-header">
          <strong>Project Manager</strong>
          <small>Stage 4.A</small>
        </div>
        <nav className="pm-side-rail-nav" aria-label="Primary">
          <button
            type="button"
            className={`pm-rail-item${sidebarTab === "overview" ? " active" : ""}`}
            onClick={() => setSidebarTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            className={`pm-rail-item${sidebarTab === "library" ? " active" : ""}`}
            onClick={() => setSidebarTab("library")}
          >
            Library
          </button>
          <button
            type="button"
            className={`pm-rail-item${sidebarTab === "review" ? " active" : ""}`}
            onClick={() => setSidebarTab("review")}
          >
            Review
            {pendingForReview.length > 0 ? (
              <span className="pm-rail-badge">{pendingForReview.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={`pm-rail-item${sidebarTab === "view" ? " active" : ""}`}
            onClick={() => setSidebarTab("view")}
            disabled={!activeProject}
          >
            View
          </button>
        </nav>
        <div className="pm-side-rail-footer">
          <button
            type="button"
            className="pm-rail-item pm-rail-item-strong"
            onClick={() => setNewProjectOpen(true)}
          >
            + New project
          </button>
          <section className="pm-side-account">
            <div className="pm-side-account-head">
              <strong>{signedInLabel}</strong>
              <span>{profile?.email}</span>
            </div>
            <div className="pm-side-account-meta">
              <span>{activeLab?.name ?? "No lab"}</span>
              <span>{activeLab?.role ?? "member"}</span>
            </div>
            <button type="button" className="pm-side-account-action" onClick={() => void signOut()}>
              Log out
            </button>
          </section>
        </div>
      </aside>

      <main className="pm-main">
        <header className="pm-topbar">
          <div className="pm-topbar-copy">
            <p className="pm-kicker">Project Manager</p>
            <h1>
              {sidebarTab === "view" && activeProject ? activeProject.name : statusLabel(sidebarTab)}
            </h1>
          </div>
          <div className="pm-topbar-actions">
            <AppSwitcher currentApp="project-manager" baseUrl={APP_BASE_URL} />
            <button
              type="button"
              className="pm-text-button"
              onClick={() => void refresh()}
              disabled={status === "loading"}
            >
              {status === "loading" ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </header>

        {error ? <p className="pm-page-error">{error}</p> : null}

        <div className="pm-main-body">
          {sidebarTab === "overview" ? overviewPanel : null}
          {sidebarTab === "library" ? libraryPanel : null}
          {sidebarTab === "review" ? reviewPanel : null}
          {sidebarTab === "view" ? viewPanel : null}
        </div>
      </main>

      {newProjectOpen ? (
        <NewProjectModal
          onClose={() => setNewProjectOpen(false)}
          onCreate={handleCreateProject}
        />
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// InfoTab (project metadata editor)
// ---------------------------------------------------------------------------

const InfoTab = ({
  project,
  busy,
  error,
  onSave,
}: {
  project: ProjectRecord;
  busy: "idle" | "saving";
  error: string | null;
  onSave: (args: { name: string; description: string; status: ProjectStatus; approvalRequired: boolean }) => Promise<void>;
}) => {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>((project.status as ProjectStatus | null) ?? "planning");
  const [approvalRequired, setApprovalRequired] = useState(project.approval_required);
  const isGeneral = project.name === "General";

  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
    setStatus((project.status as ProjectStatus | null) ?? "planning");
    setApprovalRequired(project.approval_required);
  }, [project]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave({ name, description, status, approvalRequired });
  };

  return (
    <form className="pm-inline-form" onSubmit={handleSubmit}>
      <div className="pm-form-head">
        <h3>Project details</h3>
        <small>
          Created {formatDateTime(project.created_at)} | Updated {formatDateTime(project.updated_at)}
        </small>
      </div>
      {error ? <p className="pm-inline-error">{error}</p> : null}
      <label className="pm-field">
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="pm-field">
        <span>Description</span>
        <textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="pm-field-row">
        <label className="pm-field">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>
            {PROJECT_STATUSES.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="pm-checkbox-field">
          <input
            type="checkbox"
            checked={approvalRequired}
            onChange={(event) => setApprovalRequired(event.target.checked)}
          />
          <span>Require review before protocol publication inside this project</span>
        </label>
      </div>
      {isGeneral ? (
        <p className="pm-inline-note">
          The General project is the shared no-review workspace for each lab. Protocols published here skip review.
        </p>
      ) : null}
      <div className="pm-form-footer">
        <small>
          {project.state === "draft"
            ? "Draft: visible to you and lab admins only."
            : project.state === "deleted"
              ? "Recycled project."
              : "Published: visible to the whole lab."}
        </small>
        <div className="pm-inline-actions">
          <button type="submit" className="pm-primary-button" disabled={busy === "saving"}>
            {busy === "saving" ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
};
