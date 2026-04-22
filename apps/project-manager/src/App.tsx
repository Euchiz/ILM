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
import {
  ProjectOutlinePanel,
  type ProjectOutlineSelection,
} from "./components/ProjectOutlinePanel";

const APP_BASE_URL = import.meta.env.BASE_URL;

const PROJECT_STATUSES: ProjectStatus[] = ["planning", "active", "blocked", "completed", "archived"];
const MILESTONE_STATUSES: MilestoneStatus[] = ["planned", "in_progress", "done", "cancelled"];
const EXPERIMENT_STATUSES: ExperimentStatus[] = ["planned", "running", "completed", "failed"];

type SidebarTab = "overview" | "library" | "review" | "view";
type ViewSubTab = "info" | "personnel" | "edit" | "roadmap";

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

const normalizeSortOrders = <T extends { id: string }>(items: T[]) =>
  items.map((item, index) => ({
    id: item.id,
    sortOrder: (index + 1) * 1024,
  }));

const moveItemBeforeTarget = <T extends { id: string }>(items: T[], movingId: string, targetId: string) => {
  const movingIndex = items.findIndex((item) => item.id === movingId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (movingIndex === -1 || targetIndex === -1 || movingIndex === targetIndex) return items;

  const next = [...items];
  const [movingItem] = next.splice(movingIndex, 1);
  const insertionIndex = movingIndex < targetIndex ? targetIndex - 1 : targetIndex;
  next.splice(insertionIndex, 0, movingItem);
  return next;
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
          It stays private until you choose to publish it for the first time.
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
    submitProjectForReview,
    rejectProject,
    recycleProject,
    restoreProject,
    permanentDeleteProject,
    updateProject,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    reorderMilestones,
    createExperiment,
    updateExperiment,
    deleteExperiment,
    reorderExperiments,
  } = workspace;

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("overview");
  const [viewSubTab, setViewSubTab] = useState<ViewSubTab>("info");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [outlineSelection, setOutlineSelection] = useState<ProjectOutlineSelection>(null);
  const [labMembers, setLabMembers] = useState<LabMemberRecord[]>([]);
  const [projectSaveError, setProjectSaveError] = useState<string | null>(null);
  const [projectSaveBusy, setProjectSaveBusy] = useState<"idle" | "saving">("idle");
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
  const activePublishedProjects = useMemo(
    () => publishedProjects.filter((project) => project.status !== "archived"),
    [publishedProjects]
  );
  const archivedProjects = useMemo(
    () => publishedProjects.filter((project) => project.status === "archived"),
    [publishedProjects]
  );
  const draftProjects = useMemo(() => projects.filter((p) => p.state === "draft"), [projects]);
  const myDraftProjects = useMemo(
    () => draftProjects.filter((p) => p.created_by === user?.id),
    [draftProjects, user?.id]
  );
  const pendingForReview = useMemo(
    () => draftProjects.filter((project) => project.review_requested_at),
    [draftProjects]
  );

  // Auto-select first project when the active tab needs one
  useEffect(() => {
    if (sidebarTab !== "view") return;
    if (!projects.length) {
      setActiveProjectId(null);
      return;
    }
    if (!activeProjectId || !projects.some((p) => p.id === activeProjectId)) {
      setActiveProjectId(activePublishedProjects[0]?.id ?? publishedProjects[0]?.id ?? projects[0].id);
    }
  }, [sidebarTab, projects, activePublishedProjects, publishedProjects, activeProjectId]);

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
  const selectedMilestone = useMemo(
    () =>
      outlineSelection?.kind === "milestone"
        ? activeProjectMilestones.find((milestone) => milestone.id === outlineSelection.id) ?? null
        : null,
    [activeProjectMilestones, outlineSelection]
  );
  const selectedExperiment = useMemo(
    () =>
      outlineSelection?.kind === "experiment"
        ? activeProjectExperiments.find((experiment) => experiment.id === outlineSelection.id) ?? null
        : null,
    [activeProjectExperiments, outlineSelection]
  );

  useEffect(() => {
    if (outlineSelection?.kind === "milestone" && !selectedMilestone) {
      setOutlineSelection(null);
    }
    if (outlineSelection?.kind === "experiment" && !selectedExperiment) {
      setOutlineSelection(null);
    }
  }, [outlineSelection, selectedExperiment, selectedMilestone]);

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

  const handleSubmitProjectForReview = useCallback(
    async (project: ProjectRecord) => {
      setActionError(null);
      try {
        await submitProjectForReview(project.id);
      } catch (err) {
        setActionError(errorMessage(err));
      }
    },
    [submitProjectForReview]
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

  const persistMilestoneOrder = useCallback(
    async (orderedMilestones: MilestoneRecord[]) => {
      await reorderMilestones(
        normalizeSortOrders(orderedMilestones).map(({ id, sortOrder }) => ({
          milestoneId: id,
          sortOrder,
        }))
      );
    },
    [reorderMilestones]
  );

  const persistExperimentLayout = useCallback(
    async (
      nextGroups: Array<{ milestoneId: string | null; experiments: ExperimentRecord[] }>
    ) => {
      const flattened = nextGroups.flatMap((group) =>
        group.experiments.map((experiment) => ({
          experimentId: experiment.id,
          milestoneId: group.milestoneId,
        }))
      );
      await reorderExperiments(
        flattened.map((item, index) => ({
          ...item,
          sortOrder: (index + 1) * 1024,
        }))
      );
    },
    [reorderExperiments]
  );

  const handleCreateExperiment = async (milestoneId: string | null, title: string) => {
    if (!activeProject) return;
    if (!title.trim()) return;
    const created = await createExperiment({
      projectId: activeProject.id,
      milestoneId,
      title: title.trim(),
    });
    setOutlineSelection({ kind: "experiment", id: created.id });
    setViewSubTab("edit");
  };

  const handleMoveMilestone = useCallback(
    async (movingMilestoneId: string, targetMilestoneId: string) => {
      const reordered = moveItemBeforeTarget(activeProjectMilestones, movingMilestoneId, targetMilestoneId);
      if (reordered === activeProjectMilestones) return;
      try {
        setActionError(null);
        await persistMilestoneOrder(reordered);
      } catch (err) {
        setActionError(errorMessage(err));
      }
    },
    [activeProjectMilestones, persistMilestoneOrder]
  );

  const experimentGroups = useMemo(
    () => [
      ...activeProjectMilestones.map((milestone) => ({
        milestoneId: milestone.id,
        experiments: experimentsByMilestone.get(milestone.id) ?? [],
      })),
      { milestoneId: null as string | null, experiments: activeUnassignedExperiments },
    ],
    [activeProjectMilestones, activeUnassignedExperiments, experimentsByMilestone]
  );

  const handleMoveExperiment = useCallback(
    async (experimentId: string, destinationMilestoneId: string | null, targetExperimentId?: string) => {
      const sourceExperiment = activeProjectExperiments.find((experiment) => experiment.id === experimentId);
      if (!sourceExperiment) return;

      const nextGroups = experimentGroups.map((group) => ({
        milestoneId: group.milestoneId,
        experiments: group.experiments.filter((experiment) => experiment.id !== experimentId),
      }));
      const destinationGroup = nextGroups.find((group) => group.milestoneId === destinationMilestoneId);
      if (!destinationGroup) return;

      const movedExperiment = { ...sourceExperiment, milestone_id: destinationMilestoneId };
      if (!targetExperimentId) {
        destinationGroup.experiments.push(movedExperiment);
      } else {
        const targetIndex = destinationGroup.experiments.findIndex((experiment) => experiment.id === targetExperimentId);
        if (targetIndex === -1) {
          destinationGroup.experiments.push(movedExperiment);
        } else {
          destinationGroup.experiments.splice(targetIndex, 0, movedExperiment);
        }
      }

      try {
        setActionError(null);
        await persistExperimentLayout(nextGroups);
      } catch (err) {
        setActionError(errorMessage(err));
      }
    },
    [activeProjectExperiments, experimentGroups, persistExperimentLayout]
  );

  const handleOutlineAddMilestone = useCallback(async () => {
    if (!activeProject || !canManageRoadmap) return;
    try {
      setActionError(null);
      const created = await createMilestone({
        projectId: activeProject.id,
        title: `Milestone ${activeProjectMilestones.length + 1}`,
      });
      setOutlineSelection({ kind: "milestone", id: created.id });
      setViewSubTab("edit");
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }, [activeProject, activeProjectMilestones.length, canManageRoadmap, createMilestone]);

  const handleOutlineAddExperiment = useCallback(
    async (milestoneId: string | null) => {
      if (!activeProject || !canManageRoadmap) return;
      try {
        setActionError(null);
        await handleCreateExperiment(milestoneId, "New experiment");
      } catch (err) {
        setActionError(errorMessage(err));
      }
    },
    [activeProject, canManageRoadmap, handleCreateExperiment]
  );

  const handleDuplicateSelection = useCallback(async () => {
    if (!activeProject || !outlineSelection || !canManageRoadmap) return;
    try {
      setActionError(null);
      if (outlineSelection.kind === "milestone") {
        const sourceMilestone = activeProjectMilestones.find((milestone) => milestone.id === outlineSelection.id);
        if (!sourceMilestone) return;
        const createdMilestone = await createMilestone({
          projectId: activeProject.id,
          title: `${sourceMilestone.title} copy`,
          description: sourceMilestone.description ?? "",
          dueDate: sourceMilestone.due_date,
          status: sourceMilestone.status,
        });

        const sourceExperiments = experimentsByMilestone.get(sourceMilestone.id) ?? [];
        for (const experiment of sourceExperiments) {
          await createExperiment({
            projectId: activeProject.id,
            milestoneId: createdMilestone.id,
            title: `${experiment.title} copy`,
            notes: experiment.notes ?? "",
            protocolId: experiment.protocol_id,
            status: experiment.status,
            startedAt: experiment.started_at,
            completedAt: experiment.completed_at,
          });
        }

        const inserted = [...activeProjectMilestones];
        const sourceIndex = inserted.findIndex((milestone) => milestone.id === sourceMilestone.id);
        inserted.splice(sourceIndex + 1, 0, { ...createdMilestone, sort_order: sourceMilestone.sort_order + 1 });
        await persistMilestoneOrder(inserted);
        setOutlineSelection({ kind: "milestone", id: createdMilestone.id });
      } else {
        const sourceExperiment = activeProjectExperiments.find((experiment) => experiment.id === outlineSelection.id);
        if (!sourceExperiment) return;
        const createdExperiment = await createExperiment({
          projectId: activeProject.id,
          milestoneId: sourceExperiment.milestone_id,
          title: `${sourceExperiment.title} copy`,
          notes: sourceExperiment.notes ?? "",
          protocolId: sourceExperiment.protocol_id,
          status: sourceExperiment.status,
          startedAt: sourceExperiment.started_at,
          completedAt: sourceExperiment.completed_at,
        });
        const nextGroups = experimentGroups.map((group) => ({
          milestoneId: group.milestoneId,
          experiments: [...group.experiments],
        }));
        const destinationGroup = nextGroups.find((group) => group.milestoneId === sourceExperiment.milestone_id);
        if (destinationGroup) {
          const sourceIndex = destinationGroup.experiments.findIndex((experiment) => experiment.id === sourceExperiment.id);
          destinationGroup.experiments.splice(sourceIndex + 1, 0, {
            ...createdExperiment,
            milestone_id: sourceExperiment.milestone_id,
            sort_order: sourceExperiment.sort_order + 1,
          });
          await persistExperimentLayout(nextGroups);
        }
        setOutlineSelection({ kind: "experiment", id: createdExperiment.id });
      }
      setViewSubTab("edit");
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }, [
    activeProject,
    activeProjectExperiments,
    activeProjectMilestones,
    canManageRoadmap,
    createExperiment,
    createMilestone,
    experimentsByMilestone,
    experimentGroups,
    outlineSelection,
    persistExperimentLayout,
    persistMilestoneOrder,
  ]);

  const handleCutSelection = useCallback(async () => {
    if (!outlineSelection || !canManageRoadmap) return;
    try {
      setActionError(null);
      if (outlineSelection.kind === "milestone") {
        const targetMilestone = activeProjectMilestones.find((milestone) => milestone.id === outlineSelection.id);
        if (!targetMilestone) return;
        if (!window.confirm(`Cut milestone "${targetMilestone.title}" from this roadmap?`)) return;
        await deleteMilestone(targetMilestone.id);
      } else {
        const targetExperiment = activeProjectExperiments.find((experiment) => experiment.id === outlineSelection.id);
        if (!targetExperiment) return;
        if (!window.confirm(`Cut experiment "${targetExperiment.title}" from this roadmap?`)) return;
        await deleteExperiment(targetExperiment.id);
      }
      setOutlineSelection(null);
      setViewSubTab("roadmap");
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }, [
    activeProjectExperiments,
    activeProjectMilestones,
    canManageRoadmap,
    deleteExperiment,
    deleteMilestone,
    outlineSelection,
  ]);

  // ---------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------

  const projectStateTag = (project: ProjectRecord) => {
    if (project.state === "draft") return <span className="pm-state-tag pm-state-tag-draft">Draft</span>;
    if (project.state === "deleted") return <span className="pm-state-tag pm-state-tag-deleted">Recycled</span>;
    return <span className="pm-state-tag pm-state-tag-published">Published</span>;
  };

  const projectReviewTag = (project: ProjectRecord) => {
    if (project.state !== "draft") return null;
    return project.review_requested_at ? (
      <span className="pm-status-tag pm-status-tag-active">In review</span>
    ) : (
      <span className="pm-status-tag pm-status-tag-planning">Private draft</span>
    );
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
            {projectReviewTag(project)}
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
          {project.state === "draft" && !project.review_requested_at && isMine && !isAdmin ? (
            <button type="button" className="pm-text-button" onClick={() => void handleSubmitProjectForReview(project)}>
              Publish for review
            </button>
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
          <strong>{activePublishedProjects.length}</strong>
          <small>{archivedProjects.length} archived</small>
        </article>
        <article className="pm-summary-card">
          <span className="pm-summary-kicker">Milestones</span>
          <strong>{milestones.length}</strong>
          <small>{experiments.length} experiments lab-wide</small>
        </article>
        <article className="pm-summary-card">
          <span className="pm-summary-kicker">Review queue</span>
          <strong>{pendingForReview.length}</strong>
          <small>{isAdmin ? "Submitted drafts awaiting approval" : "Only submitted drafts enter review"}</small>
        </article>
      </section>

      <section className="pm-panel-section">
        <div className="pm-panel-section-head">
          <h3>Recent projects</h3>
          <span>{activePublishedProjects.length} active</span>
        </div>
        {activePublishedProjects.length === 0 ? (
          <p className="pm-empty">No published projects yet.</p>
        ) : (
          <div className="pm-card-grid">
            {activePublishedProjects.slice(0, 6).map((p) => projectCard(p))}
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
          <span>{myDraftProjects.filter((project) => project.review_requested_at).length} submitted</span>
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
          <span>{activePublishedProjects.length} active</span>
        </div>
        {activePublishedProjects.length === 0 ? (
          <p className="pm-empty">No published projects yet.</p>
        ) : (
          <div className="pm-card-grid">{activePublishedProjects.map((p) => projectCard(p))}</div>
        )}
      </section>

      {archivedProjects.length > 0 ? (
        <details className="pm-collapsible-section">
          <summary>
            <span>Archived</span>
            <span>{archivedProjects.length}</span>
          </summary>
          <div className="pm-card-grid">
            {archivedProjects.map((project) => projectCard(project))}
          </div>
        </details>
      ) : null}

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
          <p>Only drafts that have been explicitly submitted for first publication appear here.</p>
        </div>
      </header>
      {actionError ? <p className="pm-page-error">{actionError}</p> : null}
      {!isAdmin ? (
        <section className="pm-panel-section">
          <p className="pm-empty">
            You're a member of this lab. Drafts stay private until you choose Publish for review.
          </p>
          {myDraftProjects.filter((project) => project.review_requested_at).length > 0 ? (
            <div className="pm-card-grid">
              {myDraftProjects.filter((project) => project.review_requested_at).map((p) => projectCard(p))}
            </div>
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
        <ProjectOutlinePanel
          projectName={activeProject.name}
          milestones={activeProjectMilestones}
          experimentsByMilestone={experimentsByMilestone}
          unassignedExperiments={activeUnassignedExperiments}
          selection={outlineSelection}
          canManage={canManageRoadmap}
          onSelectMilestone={(milestoneId) => {
            setOutlineSelection({ kind: "milestone", id: milestoneId });
            setViewSubTab("edit");
          }}
          onOpenMilestone={(milestoneId) => {
            setOutlineSelection({ kind: "milestone", id: milestoneId });
            setViewSubTab("edit");
          }}
          onSelectExperiment={(experimentId) => {
            setOutlineSelection({ kind: "experiment", id: experimentId });
            setViewSubTab("edit");
          }}
          onOpenExperiment={(experimentId) => {
            setOutlineSelection({ kind: "experiment", id: experimentId });
            setViewSubTab("edit");
          }}
          onClearSelection={() => setOutlineSelection(null)}
          onMoveMilestone={(movingMilestoneId, targetMilestoneId) => void handleMoveMilestone(movingMilestoneId, targetMilestoneId)}
          onMoveExperiment={(experimentId, destinationMilestoneId, targetExperimentId) =>
            void handleMoveExperiment(experimentId, destinationMilestoneId, targetExperimentId)
          }
          onAddMilestone={() => void handleOutlineAddMilestone()}
          onAddExperiment={(milestoneId) => void handleOutlineAddExperiment(milestoneId)}
          onDuplicateSelection={() => void handleDuplicateSelection()}
          onCutSelection={() => void handleCutSelection()}
        />
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
            className={`pm-tab-link${viewSubTab === "edit" ? " active" : ""}`}
            onClick={() => setViewSubTab("edit")}
          >
            Edit
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
          {actionError ? <p className="pm-page-error">{actionError}</p> : null}
          {activeProject.state === "draft" ? (
            <section className="pm-draft-actions">
              <div>
                <strong>Draft workflow</strong>
                <p>
                  Save ongoing work privately, abort the draft, or publish it for the first time.
                  Published projects update directly afterwards without re-entering review.
                </p>
              </div>
              <div className="pm-inline-actions">
                <button
                  type="button"
                  className="pm-text-button"
                  onClick={() => window.alert("Draft changes are already reflected in your private workspace.")}
                >
                  Save draft
                </button>
                <button type="button" className="pm-text-button pm-text-button-danger" onClick={() => void handleWithdraw(activeProject)}>
                  Abort
                </button>
                <button
                  type="button"
                  className="pm-primary-button"
                  onClick={() => {
                    if (isAdmin) {
                      void handleApprove(activeProject);
                      return;
                    }
                    void handleSubmitProjectForReview(activeProject);
                  }}
                >
                  {isAdmin ? "Publish now" : "Publish for review"}
                </button>
              </div>
            </section>
          ) : null}

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

          {viewSubTab === "edit" ? (
            selectedMilestone ? (
              <div className="pm-item-wrap highlight">
                <MilestoneEditor
                  milestone={selectedMilestone}
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
            ) : selectedExperiment ? (
              <div className="pm-item-wrap highlight">
                <ExperimentEditor
                  experiment={selectedExperiment}
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
            ) : (
              <section className="pm-panel-section">
                <div className="pm-panel-section-head">
                  <h3>Edit selection</h3>
                  <span>Outline driven</span>
                </div>
                <p className="pm-empty">
                  Select a milestone or experiment from the outline, or create a new one from the outline toolbar.
                </p>
              </section>
            )
          ) : null}

          {viewSubTab === "roadmap" ? (
            <ProjectRoadmapPreview
              milestones={activeProjectMilestones}
              experimentsByMilestone={experimentsByMilestone}
              protocolTitles={protocolTitles}
              unassignedExperiments={activeUnassignedExperiments}
            />
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
// Roadmap preview
// ---------------------------------------------------------------------------

const ProjectRoadmapPreview = ({
  milestones,
  experimentsByMilestone,
  unassignedExperiments,
  protocolTitles,
}: {
  milestones: MilestoneRecord[];
  experimentsByMilestone: Map<string, ExperimentRecord[]>;
  unassignedExperiments: ExperimentRecord[];
  protocolTitles: Map<string, string>;
}) => (
  <div className="pm-roadmap-preview">
    {milestones.length === 0 && unassignedExperiments.length === 0 ? (
      <section className="pm-panel-section">
        <div className="pm-panel-section-head">
          <h3>Roadmap</h3>
          <span>Rendered view</span>
        </div>
        <p className="pm-empty">No milestones or experiments yet. Build the roadmap from the outline toolbar.</p>
      </section>
    ) : (
      <>
        {milestones.map((milestone, index) => {
          const milestoneExperiments = experimentsByMilestone.get(milestone.id) ?? [];
          return (
            <section key={milestone.id} className="pm-roadmap-section">
              <header className="pm-roadmap-section-head">
                <div>
                  <span className="pm-outline-marker">Milestone {index + 1}</span>
                  <h3>{milestone.title}</h3>
                  <p>{milestone.description || "No milestone description yet."}</p>
                </div>
                <div className="pm-roadmap-section-meta">
                  <span className={`pm-status-tag pm-status-tag-${milestone.status}`}>{statusLabel(milestone.status)}</span>
                  <span>{milestone.due_date ? `Due ${formatDate(milestone.due_date)}` : "No due date"}</span>
                </div>
              </header>

              {milestoneExperiments.length === 0 ? (
                <p className="pm-empty">No experiments assigned to this milestone yet.</p>
              ) : (
                <div className="pm-roadmap-card-grid">
                  {milestoneExperiments.map((experiment, experimentIndex) => (
                    <article key={experiment.id} className="pm-roadmap-card">
                      <div className="pm-roadmap-card-head">
                        <div>
                          <span className="pm-outline-marker">Experiment {index + 1}.{experimentIndex + 1}</span>
                          <strong>{experiment.title}</strong>
                        </div>
                        <span className={`pm-status-tag pm-status-tag-${experiment.status}`}>{statusLabel(experiment.status)}</span>
                      </div>
                      <p>{experiment.notes || "No experiment notes yet."}</p>
                      <div className="pm-roadmap-card-meta">
                        <span>{experiment.protocol_id ? protocolTitles.get(experiment.protocol_id) ?? "Linked protocol" : "No linked protocol"}</span>
                        <span>{experiment.started_at ? `Started ${formatDateTime(experiment.started_at)}` : "Not started"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {unassignedExperiments.length > 0 ? (
          <section className="pm-roadmap-section">
            <header className="pm-roadmap-section-head">
              <div>
                <span className="pm-outline-marker">Unassigned</span>
                <h3>Unassigned experiments</h3>
                <p>These experiments are not yet attached to a milestone.</p>
              </div>
            </header>
            <div className="pm-roadmap-card-grid">
              {unassignedExperiments.map((experiment) => (
                <article key={experiment.id} className="pm-roadmap-card">
                  <div className="pm-roadmap-card-head">
                    <strong>{experiment.title}</strong>
                    <span className={`pm-status-tag pm-status-tag-${experiment.status}`}>{statusLabel(experiment.status)}</span>
                  </div>
                  <p>{experiment.notes || "No experiment notes yet."}</p>
                  <div className="pm-roadmap-card-meta">
                    <span>{experiment.protocol_id ? protocolTitles.get(experiment.protocol_id) ?? "Linked protocol" : "No linked protocol"}</span>
                    <span>{experiment.completed_at ? `Completed ${formatDateTime(experiment.completed_at)}` : "In progress"}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </>
    )}
  </div>
);

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
