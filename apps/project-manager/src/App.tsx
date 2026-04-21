import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AppSwitcher, ProjectLeadsPanel, useAuth } from "@ilm/ui";
import {
  useProjectWorkspace,
  type UseProjectWorkspaceValue,
} from "./lib/useProjectWorkspace";
import type {
  ExperimentRecord,
  ExperimentStatus,
  MilestoneRecord,
  MilestoneStatus,
  ProjectStatus,
  ProtocolOptionRecord,
} from "./lib/cloudAdapter";

const APP_BASE_URL = import.meta.env.BASE_URL;

const PROJECT_STATUSES: ProjectStatus[] = ["planning", "active", "blocked", "completed", "archived"];
const MILESTONE_STATUSES: MilestoneStatus[] = ["planned", "in_progress", "done", "cancelled"];
const EXPERIMENT_STATUSES: ExperimentStatus[] = ["planned", "running", "completed", "failed"];

const statusLabel = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

const formatDate = (value: string | null) => {
  if (!value) return "No date set";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
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
    const confirmed = window.confirm(`Delete milestone "${milestone.title}"?`);
    if (!confirmed) return;
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
    <article className="manager-detail-card manager-item-card">
      <form className="manager-item-form" onSubmit={handleSubmit}>
        <div className="manager-item-header">
          <div>
            <h3>{milestone.title}</h3>
            <p>Created {formatDateTime(milestone.created_at)}</p>
          </div>
          <span className={`manager-status-pill manager-status-${status}`}>{statusLabel(status)}</span>
        </div>

        {error ? <p className="manager-inline-error">{error}</p> : null}

        <label className="manager-field">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <div className="manager-field-row">
          <label className="manager-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as MilestoneStatus)}>
              {MILESTONE_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="manager-field">
            <span>Due date</span>
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
        </div>

        <label className="manager-field">
          <span>Description</span>
          <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>

        <div className="manager-item-footer">
          <small>Updated {formatDateTime(milestone.updated_at)}</small>
          <div className="manager-inline-actions">
            {canDelete ? (
              <button
                type="button"
                className="manager-text-button manager-text-button-danger"
                disabled={busy !== "idle"}
                onClick={() => void handleDelete()}
              >
                {busy === "deleting" ? "Deleting..." : "Delete"}
              </button>
            ) : null}
            <button type="submit" className="manager-primary-button" disabled={busy !== "idle"}>
              {busy === "saving" ? "Saving..." : "Save milestone"}
            </button>
          </div>
        </div>
      </form>
    </article>
  );
};

const ExperimentEditor = ({
  experiment,
  canDelete,
  protocols,
  protocolTitles,
  onSave,
  onDelete,
}: {
  experiment: ExperimentRecord;
  canDelete: boolean;
  protocols: ProtocolOptionRecord[];
  protocolTitles: Map<string, string>;
  onSave: (args: Parameters<UseProjectWorkspaceValue["updateExperiment"]>[0]) => Promise<void>;
  onDelete: (experimentId: string) => Promise<void>;
}) => {
  const [title, setTitle] = useState(experiment.title);
  const [notes, setNotes] = useState(experiment.notes ?? "");
  const [protocolId, setProtocolId] = useState(experiment.protocol_id ?? "");
  const [status, setStatus] = useState<ExperimentStatus>(experiment.status);
  const [startedAt, setStartedAt] = useState(toDateTimeLocalValue(experiment.started_at));
  const [completedAt, setCompletedAt] = useState(toDateTimeLocalValue(experiment.completed_at));
  const [busy, setBusy] = useState<"idle" | "saving" | "deleting">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(experiment.title);
    setNotes(experiment.notes ?? "");
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
    const confirmed = window.confirm(`Delete experiment "${experiment.title}"?`);
    if (!confirmed) return;
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
    <article className="manager-detail-card manager-item-card">
      <form className="manager-item-form" onSubmit={handleSubmit}>
        <div className="manager-item-header">
          <div>
            <h3>{experiment.title}</h3>
            <p>Updated {formatDateTime(experiment.updated_at)}</p>
          </div>
          <span className={`manager-status-pill manager-status-${status}`}>{statusLabel(status)}</span>
        </div>

        {error ? <p className="manager-inline-error">{error}</p> : null}

        <label className="manager-field">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <div className="manager-field-row">
          <label className="manager-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as ExperimentStatus)}>
              {EXPERIMENT_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="manager-field">
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
        </div>

        <div className="manager-field-row">
          <label className="manager-field">
            <span>Started</span>
            <input type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
          </label>
          <label className="manager-field">
            <span>Completed</span>
            <input type="datetime-local" value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} />
          </label>
        </div>

        <label className="manager-field">
          <span>Notes</span>
          <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>

        <div className="manager-item-footer">
          <small>{linkedProtocolTitle ? `Protocol: ${linkedProtocolTitle}` : "No protocol linked yet"}</small>
          <div className="manager-inline-actions">
            {experiment.protocol_id ? (
              <a className="manager-link-button" href={buildProtocolUrl(experiment.protocol_id)}>
                Open protocol
              </a>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                className="manager-text-button manager-text-button-danger"
                disabled={busy !== "idle"}
                onClick={() => void handleDelete()}
              >
                {busy === "deleting" ? "Deleting..." : "Delete"}
              </button>
            ) : null}
            <button type="submit" className="manager-primary-button" disabled={busy !== "idle"}>
              {busy === "saving" ? "Saving..." : "Save experiment"}
            </button>
          </div>
        </div>
      </form>
    </article>
  );
};

export const App = () => {
  const { activeLab, profile, user, signOut } = useAuth();
  const workspace = useProjectWorkspace(activeLab?.id ?? null, user?.id ?? null);
  const {
    status,
    error,
    projects,
    milestones,
    experiments,
    protocols,
    createProject,
    updateProject,
    deleteProject,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    createExperiment,
    updateExperiment,
    deleteExperiment,
  } = workspace;

  const canDelete = activeLab?.role === "owner" || activeLab?.role === "admin";
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectBusy, setProjectBusy] = useState<"idle" | "creating" | "saving" | "deleting">("idle");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectStatus, setNewProjectStatus] = useState<ProjectStatus>("planning");
  const [newProjectApprovalRequired, setNewProjectApprovalRequired] = useState(true);
  const [projectFormName, setProjectFormName] = useState("");
  const [projectFormDescription, setProjectFormDescription] = useState("");
  const [projectFormStatus, setProjectFormStatus] = useState<ProjectStatus>("planning");
  const [projectFormApprovalRequired, setProjectFormApprovalRequired] = useState(true);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDescription, setNewMilestoneDescription] = useState("");
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState("");
  const [newMilestoneStatus, setNewMilestoneStatus] = useState<MilestoneStatus>("planned");
  const [milestoneCreateBusy, setMilestoneCreateBusy] = useState(false);
  const [milestoneCreateError, setMilestoneCreateError] = useState<string | null>(null);
  const [newExperimentTitle, setNewExperimentTitle] = useState("");
  const [newExperimentNotes, setNewExperimentNotes] = useState("");
  const [newExperimentProtocolId, setNewExperimentProtocolId] = useState("");
  const [newExperimentStatus, setNewExperimentStatus] = useState<ExperimentStatus>("planned");
  const [newExperimentStartedAt, setNewExperimentStartedAt] = useState("");
  const [newExperimentCompletedAt, setNewExperimentCompletedAt] = useState("");
  const [experimentCreateBusy, setExperimentCreateBusy] = useState(false);
  const [experimentCreateError, setExperimentCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!projects.length) {
      setSelectedProjectId(null);
      return;
    }
    if (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    if (!selectedProject) return;
    setProjectFormName(selectedProject.name);
    setProjectFormDescription(selectedProject.description ?? "");
    setProjectFormStatus((selectedProject.status as ProjectStatus | null) ?? "planning");
    setProjectFormApprovalRequired(selectedProject.approval_required);
    setProjectError(null);
  }, [selectedProject]);

  const projectMilestones = useMemo(
    () => milestones.filter((milestone) => milestone.project_id === selectedProjectId),
    [milestones, selectedProjectId]
  );
  const projectExperiments = useMemo(
    () => experiments.filter((experiment) => experiment.project_id === selectedProjectId),
    [experiments, selectedProjectId]
  );
  const protocolTitles = useMemo(() => new Map(protocols.map((protocol) => [protocol.id, protocol.title])), [protocols]);

  const projectCards = useMemo(() => {
    const milestoneCounts = new Map<string, number>();
    const experimentCounts = new Map<string, number>();
    const linkedProtocolCounts = new Map<string, number>();

    milestones.forEach((milestone) => {
      milestoneCounts.set(milestone.project_id, (milestoneCounts.get(milestone.project_id) ?? 0) + 1);
    });
    experiments.forEach((experiment) => {
      experimentCounts.set(experiment.project_id, (experimentCounts.get(experiment.project_id) ?? 0) + 1);
      if (experiment.protocol_id) {
        linkedProtocolCounts.set(experiment.project_id, (linkedProtocolCounts.get(experiment.project_id) ?? 0) + 1);
      }
    });

    return projects.map((project) => ({
      project,
      milestoneCount: milestoneCounts.get(project.id) ?? 0,
      experimentCount: experimentCounts.get(project.id) ?? 0,
      linkedProtocolCount: linkedProtocolCounts.get(project.id) ?? 0,
    }));
  }, [experiments, milestones, projects]);

  const isGeneralProject = selectedProject?.name === "General";

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProjectBusy("creating");
    setProjectError(null);
    try {
      const created = await createProject({
        name: newProjectName.trim() || "Untitled project",
        description: newProjectDescription,
        status: newProjectStatus,
        approvalRequired: newProjectApprovalRequired,
      });
      setNewProjectName("");
      setNewProjectDescription("");
      setNewProjectStatus("planning");
      setNewProjectApprovalRequired(true);
      setSelectedProjectId(created.id);
    } catch (err) {
      setProjectError(errorMessage(err));
    } finally {
      setProjectBusy("idle");
    }
  };

  const handleSaveProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProject) return;
    setProjectBusy("saving");
    setProjectError(null);
    try {
      await updateProject({
        projectId: selectedProject.id,
        name: projectFormName.trim() || "Untitled project",
        description: projectFormDescription,
        status: projectFormStatus,
        approvalRequired: projectFormApprovalRequired,
      });
    } catch (err) {
      setProjectError(errorMessage(err));
    } finally {
      setProjectBusy("idle");
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProject || !canDelete || isGeneralProject) return;
    const confirmed = window.confirm(
      `Delete project "${selectedProject.name}"? Milestones and experiments will be removed, and linked protocols will become unassigned.`
    );
    if (!confirmed) return;
    setProjectBusy("deleting");
    setProjectError(null);
    try {
      await deleteProject(selectedProject.id);
    } catch (err) {
      setProjectError(errorMessage(err));
    } finally {
      setProjectBusy("idle");
    }
  };

  const handleCreateMilestone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProject) return;
    setMilestoneCreateBusy(true);
    setMilestoneCreateError(null);
    try {
      await createMilestone({
        projectId: selectedProject.id,
        title: newMilestoneTitle.trim() || "Untitled milestone",
        description: newMilestoneDescription,
        dueDate: newMilestoneDueDate || null,
        status: newMilestoneStatus,
      });
      setNewMilestoneTitle("");
      setNewMilestoneDescription("");
      setNewMilestoneDueDate("");
      setNewMilestoneStatus("planned");
    } catch (err) {
      setMilestoneCreateError(errorMessage(err));
    } finally {
      setMilestoneCreateBusy(false);
    }
  };

  const handleCreateExperiment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProject) return;
    setExperimentCreateBusy(true);
    setExperimentCreateError(null);
    try {
      await createExperiment({
        projectId: selectedProject.id,
        title: newExperimentTitle.trim() || "Untitled experiment",
        notes: newExperimentNotes,
        protocolId: newExperimentProtocolId || null,
        status: newExperimentStatus,
        startedAt: fromDateTimeLocalValue(newExperimentStartedAt),
        completedAt: fromDateTimeLocalValue(newExperimentCompletedAt),
      });
      setNewExperimentTitle("");
      setNewExperimentNotes("");
      setNewExperimentProtocolId("");
      setNewExperimentStatus("planned");
      setNewExperimentStartedAt("");
      setNewExperimentCompletedAt("");
    } catch (err) {
      setExperimentCreateError(errorMessage(err));
    } finally {
      setExperimentCreateBusy(false);
    }
  };

  return (
    <main className="manager-shell">
      <header className="manager-header">
        <div className="manager-header-copy">
          <p className="manager-kicker">Stage 4.A</p>
          <h1>Project Manager</h1>
          <p className="manager-subtitle">
            Coordinate lab projects, track milestones, and connect experiments back to published protocols without leaving the shared Supabase shell.
          </p>
        </div>
        <div className="manager-header-actions">
          <AppSwitcher currentApp="project-manager" baseUrl={APP_BASE_URL} />
          <button type="button" className="manager-ghost-button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <section className="manager-overview-grid">
        <article className="manager-hero-card">
          <div className="manager-card-header">
            <h2>Lab context</h2>
            <span>{activeLab?.role ?? "member"}</span>
          </div>
          <div className="manager-stat-grid">
            <div>
              <span>Active lab</span>
              <strong>{activeLab?.name ?? "No lab selected"}</strong>
              <small>{activeLab?.slug ?? "Slug pending"}</small>
            </div>
            <div>
              <span>Operator</span>
              <strong>{profile?.display_name || profile?.email || "Signed-in user"}</strong>
              <small>{projects.length} project(s) loaded</small>
            </div>
            <div>
              <span>Workspace status</span>
              <strong>{status === "ready" ? "Live" : statusLabel(status)}</strong>
              <small>{milestones.length} milestone(s), {experiments.length} experiment(s)</small>
            </div>
          </div>
        </article>

        <article className="manager-create-card">
          <div className="manager-card-header">
            <h2>Create project</h2>
            <span>Normalized tables</span>
          </div>
          <form className="manager-item-form" onSubmit={handleCreateProject}>
            <label className="manager-field">
              <span>Name</span>
              <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Genome Atlas" />
            </label>
            <label className="manager-field">
              <span>Description</span>
              <textarea rows={3} value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} />
            </label>
            <div className="manager-field-row">
              <label className="manager-field">
                <span>Status</span>
                <select value={newProjectStatus} onChange={(event) => setNewProjectStatus(event.target.value as ProjectStatus)}>
                  {PROJECT_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {statusLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="manager-checkbox-field">
                <input
                  type="checkbox"
                  checked={newProjectApprovalRequired}
                  onChange={(event) => setNewProjectApprovalRequired(event.target.checked)}
                />
                <span>Require review for protocol publication</span>
              </label>
            </div>
            {projectError ? <p className="manager-inline-error">{projectError}</p> : null}
            <button type="submit" className="manager-primary-button" disabled={projectBusy !== "idle"}>
              {projectBusy === "creating" ? "Creating..." : "Create project"}
            </button>
          </form>
        </article>
      </section>

      {error ? <p className="manager-page-error">{error}</p> : null}

      <section className="manager-workspace">
        <aside className="manager-project-rail">
          <div className="manager-card-header">
            <h2>Project list</h2>
            <span>{projectCards.length} cards</span>
          </div>
          {status === "loading" ? (
            <p className="manager-empty">Loading projects, milestones, experiments, and linked protocols...</p>
          ) : projectCards.length === 0 ? (
            <p className="manager-empty">No projects are available for this lab yet.</p>
          ) : (
            <div className="manager-project-list">
              {projectCards.map(({ project, milestoneCount, experimentCount, linkedProtocolCount }) => (
                <button
                  key={project.id}
                  type="button"
                  className={project.id === selectedProjectId ? "manager-project-card manager-project-card-active" : "manager-project-card"}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <div className="manager-project-card-top">
                    <div>
                      <strong>{project.name}</strong>
                      <span>{project.description || "No description yet."}</span>
                    </div>
                    <span className={`manager-status-pill manager-status-${(project.status as string | null) ?? "planning"}`}>
                      {statusLabel(project.status || "planning")}
                    </span>
                  </div>
                  <div className="manager-project-card-metrics">
                    <div>
                      <small>Milestones</small>
                      <strong>{milestoneCount}</strong>
                    </div>
                    <div>
                      <small>Experiments</small>
                      <strong>{experimentCount}</strong>
                    </div>
                    <div>
                      <small>Protocol links</small>
                      <strong>{linkedProtocolCount}</strong>
                    </div>
                  </div>
                  <div className="manager-project-card-meta">
                    <span>{project.approval_required ? "Review required" : "No review gate"}</span>
                    <span>Updated {formatDate(project.updated_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="manager-detail-column">
          {!selectedProject ? (
            <article className="manager-detail-card">
              <div className="manager-card-header">
                <h2>No project selected</h2>
                <span>Waiting</span>
              </div>
              <p className="manager-empty">Choose a project from the rail to edit metadata, milestones, experiments, and project leads.</p>
            </article>
          ) : (
            <>
              <article className="manager-detail-card">
                <div className="manager-card-header">
                  <h2>{selectedProject.name}</h2>
                  <span>{isGeneralProject ? "Shared workspace" : "Project detail"}</span>
                </div>
                <form className="manager-item-form" onSubmit={handleSaveProject}>
                  <label className="manager-field">
                    <span>Name</span>
                    <input value={projectFormName} onChange={(event) => setProjectFormName(event.target.value)} />
                  </label>
                  <label className="manager-field">
                    <span>Description</span>
                    <textarea rows={4} value={projectFormDescription} onChange={(event) => setProjectFormDescription(event.target.value)} />
                  </label>
                  <div className="manager-field-row">
                    <label className="manager-field">
                      <span>Status</span>
                      <select value={projectFormStatus} onChange={(event) => setProjectFormStatus(event.target.value as ProjectStatus)}>
                        {PROJECT_STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {statusLabel(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="manager-checkbox-field">
                      <input
                        type="checkbox"
                        checked={projectFormApprovalRequired}
                        onChange={(event) => setProjectFormApprovalRequired(event.target.checked)}
                      />
                      <span>Require review before protocol publication</span>
                    </label>
                  </div>

                  {isGeneralProject ? (
                    <p className="manager-inline-note">
                      The General project stays available as the shared no-review workspace for each lab.
                    </p>
                  ) : null}
                  {projectError ? <p className="manager-inline-error">{projectError}</p> : null}

                  <div className="manager-item-footer">
                    <small>Created {formatDateTime(selectedProject.created_at)}. Updated {formatDateTime(selectedProject.updated_at)}.</small>
                    <div className="manager-inline-actions">
                      {canDelete && !isGeneralProject ? (
                        <button
                          type="button"
                          className="manager-text-button manager-text-button-danger"
                          disabled={projectBusy !== "idle"}
                          onClick={() => void handleDeleteProject()}
                        >
                          {projectBusy === "deleting" ? "Deleting..." : "Delete project"}
                        </button>
                      ) : null}
                      <button type="submit" className="manager-primary-button" disabled={projectBusy !== "idle"}>
                        {projectBusy === "saving" ? "Saving..." : "Save project"}
                      </button>
                    </div>
                  </div>
                </form>
              </article>

              <ProjectLeadsPanel projectId={selectedProject.id} title="Project Leads" />

              <article className="manager-detail-card">
                <div className="manager-card-header">
                  <h2>Milestones</h2>
                  <span>{projectMilestones.length} item(s)</span>
                </div>
                <form className="manager-item-form manager-create-form" onSubmit={handleCreateMilestone}>
                  <label className="manager-field">
                    <span>Title</span>
                    <input value={newMilestoneTitle} onChange={(event) => setNewMilestoneTitle(event.target.value)} placeholder="Secure pilot data" />
                  </label>
                  <div className="manager-field-row">
                    <label className="manager-field">
                      <span>Status</span>
                      <select value={newMilestoneStatus} onChange={(event) => setNewMilestoneStatus(event.target.value as MilestoneStatus)}>
                        {MILESTONE_STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {statusLabel(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="manager-field">
                      <span>Due date</span>
                      <input type="date" value={newMilestoneDueDate} onChange={(event) => setNewMilestoneDueDate(event.target.value)} />
                    </label>
                  </div>
                  <label className="manager-field">
                    <span>Description</span>
                    <textarea rows={3} value={newMilestoneDescription} onChange={(event) => setNewMilestoneDescription(event.target.value)} />
                  </label>
                  {milestoneCreateError ? <p className="manager-inline-error">{milestoneCreateError}</p> : null}
                  <button type="submit" className="manager-primary-button" disabled={milestoneCreateBusy}>
                    {milestoneCreateBusy ? "Creating..." : "Add milestone"}
                  </button>
                </form>

                {projectMilestones.length === 0 ? (
                  <p className="manager-empty">No milestones yet for this project.</p>
                ) : (
                  <div className="manager-item-list">
                    {projectMilestones.map((milestone) => (
                      <MilestoneEditor
                        key={milestone.id}
                        milestone={milestone}
                        canDelete={canDelete}
                        onSave={async (args) => {
                          await updateMilestone(args);
                        }}
                        onDelete={async (milestoneId) => {
                          await deleteMilestone(milestoneId);
                        }}
                      />
                    ))}
                  </div>
                )}
              </article>

              <article className="manager-detail-card">
                <div className="manager-card-header">
                  <h2>Experiments</h2>
                  <span>{projectExperiments.length} run(s)</span>
                </div>
                <form className="manager-item-form manager-create-form" onSubmit={handleCreateExperiment}>
                  <label className="manager-field">
                    <span>Title</span>
                    <input value={newExperimentTitle} onChange={(event) => setNewExperimentTitle(event.target.value)} placeholder="Week 1 sequencing run" />
                  </label>
                  <div className="manager-field-row">
                    <label className="manager-field">
                      <span>Status</span>
                      <select value={newExperimentStatus} onChange={(event) => setNewExperimentStatus(event.target.value as ExperimentStatus)}>
                        {EXPERIMENT_STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {statusLabel(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="manager-field">
                      <span>Linked protocol</span>
                      <select value={newExperimentProtocolId} onChange={(event) => setNewExperimentProtocolId(event.target.value)}>
                        <option value="">No linked protocol</option>
                        {protocols.map((protocol) => (
                          <option key={protocol.id} value={protocol.id}>
                            {protocol.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="manager-field-row">
                    <label className="manager-field">
                      <span>Started</span>
                      <input type="datetime-local" value={newExperimentStartedAt} onChange={(event) => setNewExperimentStartedAt(event.target.value)} />
                    </label>
                    <label className="manager-field">
                      <span>Completed</span>
                      <input type="datetime-local" value={newExperimentCompletedAt} onChange={(event) => setNewExperimentCompletedAt(event.target.value)} />
                    </label>
                  </div>
                  <label className="manager-field">
                    <span>Notes</span>
                    <textarea rows={3} value={newExperimentNotes} onChange={(event) => setNewExperimentNotes(event.target.value)} />
                  </label>
                  {experimentCreateError ? <p className="manager-inline-error">{experimentCreateError}</p> : null}
                  <button type="submit" className="manager-primary-button" disabled={experimentCreateBusy}>
                    {experimentCreateBusy ? "Creating..." : "Add experiment"}
                  </button>
                </form>

                {projectExperiments.length === 0 ? (
                  <p className="manager-empty">No experiments yet for this project.</p>
                ) : (
                  <div className="manager-item-list">
                    {projectExperiments.map((experiment) => (
                      <ExperimentEditor
                        key={experiment.id}
                        experiment={experiment}
                        canDelete={canDelete}
                        protocols={protocols}
                        protocolTitles={protocolTitles}
                        onSave={async (args) => {
                          await updateExperiment(args);
                        }}
                        onDelete={async (experimentId) => {
                          await deleteExperiment(experimentId);
                        }}
                      />
                    ))}
                  </div>
                )}
              </article>
            </>
          )}
        </section>
      </section>
    </main>
  );
};
