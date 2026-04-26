import { useCallback, useEffect, useState } from "react";
import {
  approveProject as rpcApproveProject,
  clearLabGithubPat as rpcClearLabGithubPat,
  createExperiment as rpcCreateExperiment,
  createMilestone as rpcCreateMilestone,
  createProjectDraft as rpcCreateProjectDraft,
  deleteExperiment as rpcDeleteExperiment,
  deleteMilestone as rpcDeleteMilestone,
  labGithubPatConfigured as rpcLabGithubPatConfigured,
  listDeletedProjects,
  listProjectWorkspace,
  permanentDeleteProject as rpcPermanentDeleteProject,
  refreshProjectRepoStatus as rpcRefreshProjectRepoStatus,
  reorderExperiments as rpcReorderExperiments,
  reorderMilestones as rpcReorderMilestones,
  recycleProject as rpcRecycleProject,
  rejectProject as rpcRejectProject,
  restoreProject as rpcRestoreProject,
  setLabGithubPat as rpcSetLabGithubPat,
  submitProjectForReview as rpcSubmitProjectForReview,
  updateExperiment as rpcUpdateExperiment,
  updateMilestone as rpcUpdateMilestone,
  updateProject as rpcUpdateProject,
  withdrawProjectDraft as rpcWithdrawProjectDraft,
  type ExperimentRecord,
  type ExperimentStatus,
  type MilestoneRecord,
  type MilestoneStatus,
  type ProjectLeadLinkRecord,
  type ProjectMemberLinkRecord,
  type ProjectRecord,
  type ProjectRepoStatusRecord,
  type ProjectStatus,
  type ProjectWorkspaceSnapshot,
  type ProtocolOptionRecord,
} from "./cloudAdapter";

export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

export interface UseProjectWorkspaceValue extends ProjectWorkspaceSnapshot {
  status: WorkspaceStatus;
  error: string | null;
  deletedProjects: ProjectRecord[];
  refresh: () => Promise<void>;

  createProjectDraft: (args: {
    name: string;
    description?: string;
    status?: ProjectStatus | null;
    approvalRequired?: boolean;
  }) => Promise<ProjectRecord>;
  withdrawProjectDraft: (projectId: string) => Promise<void>;
  approveProject: (projectId: string, comment?: string | null) => Promise<ProjectRecord>;
  submitProjectForReview: (projectId: string, comment?: string | null) => Promise<ProjectRecord>;
  rejectProject: (projectId: string, comment: string) => Promise<ProjectRecord>;
  recycleProject: (projectId: string) => Promise<ProjectRecord>;
  restoreProject: (projectId: string) => Promise<ProjectRecord>;
  permanentDeleteProject: (projectId: string) => Promise<void>;

  updateProject: (args: {
    projectId: string;
    name: string;
    description?: string;
    status?: string;
    approvalRequired: boolean;
    githubRepoUrl?: string | null;
  }) => Promise<ProjectRecord>;

  refreshRepoStatus: (projectId: string) => Promise<ProjectRepoStatusRecord>;
  setLabGithubPat: (pat: string) => Promise<void>;
  clearLabGithubPat: () => Promise<void>;
  refreshLabGithubPatConfigured: () => Promise<void>;
  labGithubPatConfigured: boolean;

  createMilestone: (args: {
    projectId: string;
    title: string;
    description?: string;
    dueDate?: string | null;
    status?: MilestoneStatus;
  }) => Promise<MilestoneRecord>;
  updateMilestone: (args: {
    milestoneId: string;
    title: string;
    description?: string;
    dueDate?: string | null;
    status: MilestoneStatus;
  }) => Promise<MilestoneRecord>;
  deleteMilestone: (milestoneId: string) => Promise<void>;
  reorderMilestones: (items: Array<{ milestoneId: string; sortOrder: number }>) => Promise<void>;
  createExperiment: (args: {
    projectId: string;
    milestoneId?: string | null;
    title: string;
    notes?: string;
    protocolId?: string | null;
    status?: ExperimentStatus;
    startedAt?: string | null;
    completedAt?: string | null;
  }) => Promise<ExperimentRecord>;
  updateExperiment: (args: {
    experimentId: string;
    milestoneId?: string | null;
    title: string;
    notes?: string;
    protocolId?: string | null;
    status: ExperimentStatus;
    startedAt?: string | null;
    completedAt?: string | null;
  }) => Promise<ExperimentRecord>;
  deleteExperiment: (experimentId: string) => Promise<void>;
  reorderExperiments: (items: Array<{ experimentId: string; milestoneId: string | null; sortOrder: number }>) => Promise<void>;
}

const EMPTY_ARRAY: [] = [];

export function useProjectWorkspace(
  labId: string | null,
  userId: string | null,
  isAdmin: boolean
): UseProjectWorkspaceValue {
  const [status, setStatus] = useState<WorkspaceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>(EMPTY_ARRAY);
  const [milestones, setMilestones] = useState<MilestoneRecord[]>(EMPTY_ARRAY);
  const [experiments, setExperiments] = useState<ExperimentRecord[]>(EMPTY_ARRAY);
  const [protocols, setProtocols] = useState<ProtocolOptionRecord[]>(EMPTY_ARRAY);
  const [leads, setLeads] = useState<ProjectLeadLinkRecord[]>(EMPTY_ARRAY);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberLinkRecord[]>(EMPTY_ARRAY);
  const [deletedProjects, setDeletedProjects] = useState<ProjectRecord[]>(EMPTY_ARRAY);
  const [repoStatuses, setRepoStatuses] = useState<ProjectRepoStatusRecord[]>(EMPTY_ARRAY);
  const [labGithubPatConfigured, setLabGithubPatConfiguredState] = useState<boolean>(false);

  const hydrate = useCallback(async () => {
    if (!labId) {
      setProjects(EMPTY_ARRAY);
      setMilestones(EMPTY_ARRAY);
      setExperiments(EMPTY_ARRAY);
      setProtocols(EMPTY_ARRAY);
      setLeads(EMPTY_ARRAY);
      setProjectMembers(EMPTY_ARRAY);
      setDeletedProjects(EMPTY_ARRAY);
      setRepoStatuses(EMPTY_ARRAY);
      setLabGithubPatConfiguredState(false);
      setStatus("idle");
      setError(null);
      return;
    }

    setStatus("loading");
    setError(null);
    try {
      const next = await listProjectWorkspace(labId);
      setProjects(next.projects);
      setMilestones(next.milestones);
      setExperiments(next.experiments);
      setProtocols(next.protocols);
      setLeads(next.leads);
      setProjectMembers(next.projectMembers);
      setRepoStatuses(next.repoStatuses ?? EMPTY_ARRAY);
      try {
        setLabGithubPatConfiguredState(await rpcLabGithubPatConfigured(labId));
      } catch {
        // RPC missing or PAT read failed — treat as "not configured" and carry on.
        setLabGithubPatConfiguredState(false);
      }
      if (isAdmin) {
        try {
          const deleted = await listDeletedProjects(labId);
          setDeletedProjects(deleted);
        } catch {
          setDeletedProjects(EMPTY_ARRAY);
        }
      } else {
        setDeletedProjects(EMPTY_ARRAY);
      }
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [labId, isAdmin]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const requireIdentity = useCallback(() => {
    if (!labId) throw new Error("No active lab selected.");
    if (!userId) throw new Error("No signed-in user available.");
    return { labId, userId };
  }, [labId, userId]);

  const createProjectDraft = useCallback<UseProjectWorkspaceValue["createProjectDraft"]>(async (args) => {
    const { labId: lab } = requireIdentity();
    const created = await rpcCreateProjectDraft({ labId: lab, ...args });
    await hydrate();
    return created;
  }, [hydrate, requireIdentity]);

  const withdrawProjectDraft = useCallback<UseProjectWorkspaceValue["withdrawProjectDraft"]>(async (projectId) => {
    requireIdentity();
    await rpcWithdrawProjectDraft(projectId);
    await hydrate();
  }, [hydrate, requireIdentity]);

  const approveProject = useCallback<UseProjectWorkspaceValue["approveProject"]>(async (projectId, comment) => {
    requireIdentity();
    const updated = await rpcApproveProject(projectId, comment);
    await hydrate();
    return updated;
  }, [hydrate, requireIdentity]);

  const submitProjectForReview = useCallback<UseProjectWorkspaceValue["submitProjectForReview"]>(async (projectId, comment) => {
    requireIdentity();
    const updated = await rpcSubmitProjectForReview(projectId, comment);
    await hydrate();
    return updated;
  }, [hydrate, requireIdentity]);

  const rejectProject = useCallback<UseProjectWorkspaceValue["rejectProject"]>(async (projectId, comment) => {
    requireIdentity();
    const updated = await rpcRejectProject(projectId, comment);
    await hydrate();
    return updated;
  }, [hydrate, requireIdentity]);

  const recycleProject = useCallback<UseProjectWorkspaceValue["recycleProject"]>(async (projectId) => {
    requireIdentity();
    const updated = await rpcRecycleProject(projectId);
    await hydrate();
    return updated;
  }, [hydrate, requireIdentity]);

  const restoreProject = useCallback<UseProjectWorkspaceValue["restoreProject"]>(async (projectId) => {
    requireIdentity();
    const updated = await rpcRestoreProject(projectId);
    await hydrate();
    return updated;
  }, [hydrate, requireIdentity]);

  const permanentDeleteProject = useCallback<UseProjectWorkspaceValue["permanentDeleteProject"]>(async (projectId) => {
    requireIdentity();
    await rpcPermanentDeleteProject(projectId);
    await hydrate();
  }, [hydrate, requireIdentity]);

  const updateProject = useCallback<UseProjectWorkspaceValue["updateProject"]>(async (args) => {
    const { userId: uid } = requireIdentity();
    const updated = await rpcUpdateProject({ ...args, userId: uid });
    await hydrate();
    return updated;
  }, [hydrate, requireIdentity]);

  const createMilestone = useCallback<UseProjectWorkspaceValue["createMilestone"]>(async (args) => {
    const identity = requireIdentity();
    const siblingMilestones = milestones.filter((milestone) => milestone.project_id === args.projectId);
    const sortOrder = (siblingMilestones.at(-1)?.sort_order ?? 0) + 1024;
    const created = await rpcCreateMilestone({ ...identity, ...args, sortOrder });
    await hydrate();
    return created;
  }, [hydrate, milestones, requireIdentity]);

  const updateMilestone = useCallback<UseProjectWorkspaceValue["updateMilestone"]>(async (args) => {
    const { userId: uid } = requireIdentity();
    const updated = await rpcUpdateMilestone({ ...args, userId: uid });
    await hydrate();
    return updated;
  }, [hydrate, requireIdentity]);

  const deleteMilestone = useCallback<UseProjectWorkspaceValue["deleteMilestone"]>(async (milestoneId) => {
    requireIdentity();
    await rpcDeleteMilestone(milestoneId);
    await hydrate();
  }, [hydrate, requireIdentity]);

  const reorderMilestones = useCallback<UseProjectWorkspaceValue["reorderMilestones"]>(async (items) => {
    const { userId: uid } = requireIdentity();
    await rpcReorderMilestones({ userId: uid, items });
    await hydrate();
  }, [hydrate, requireIdentity]);

  const createExperiment = useCallback<UseProjectWorkspaceValue["createExperiment"]>(async (args) => {
    const identity = requireIdentity();
    const siblingExperiments = experiments.filter((experiment) => experiment.project_id === args.projectId);
    const sortOrder = (siblingExperiments.at(-1)?.sort_order ?? 0) + 1024;
    const created = await rpcCreateExperiment({ ...identity, ...args, sortOrder });
    await hydrate();
    return created;
  }, [experiments, hydrate, requireIdentity]);

  const updateExperiment = useCallback<UseProjectWorkspaceValue["updateExperiment"]>(async (args) => {
    const { userId: uid } = requireIdentity();
    const updated = await rpcUpdateExperiment({ ...args, userId: uid });
    await hydrate();
    return updated;
  }, [hydrate, requireIdentity]);

  const deleteExperiment = useCallback<UseProjectWorkspaceValue["deleteExperiment"]>(async (experimentId) => {
    requireIdentity();
    await rpcDeleteExperiment(experimentId);
    await hydrate();
  }, [hydrate, requireIdentity]);

  const reorderExperiments = useCallback<UseProjectWorkspaceValue["reorderExperiments"]>(async (items) => {
    const { userId: uid } = requireIdentity();
    await rpcReorderExperiments({ userId: uid, items });
    await hydrate();
  }, [hydrate, requireIdentity]);

  const refreshRepoStatus = useCallback<UseProjectWorkspaceValue["refreshRepoStatus"]>(async (projectId) => {
    requireIdentity();
    const next = await rpcRefreshProjectRepoStatus(projectId);
    setRepoStatuses((prev) => {
      const without = prev.filter((row) => row.project_id !== projectId);
      return [...without, next];
    });
    return next;
  }, [requireIdentity]);

  const setLabGithubPat = useCallback<UseProjectWorkspaceValue["setLabGithubPat"]>(async (pat) => {
    const { labId: lab } = requireIdentity();
    await rpcSetLabGithubPat(lab, pat);
    setLabGithubPatConfiguredState(true);
  }, [requireIdentity]);

  const clearLabGithubPat = useCallback<UseProjectWorkspaceValue["clearLabGithubPat"]>(async () => {
    const { labId: lab } = requireIdentity();
    await rpcClearLabGithubPat(lab);
    setLabGithubPatConfiguredState(false);
  }, [requireIdentity]);

  const refreshLabGithubPatConfigured = useCallback<UseProjectWorkspaceValue["refreshLabGithubPatConfigured"]>(async () => {
    if (!labId) {
      setLabGithubPatConfiguredState(false);
      return;
    }
    try {
      setLabGithubPatConfiguredState(await rpcLabGithubPatConfigured(labId));
    } catch {
      setLabGithubPatConfiguredState(false);
    }
  }, [labId]);

  return {
    status,
    error,
    projects,
    milestones,
    experiments,
    protocols,
    leads,
    projectMembers,
    repoStatuses,
    deletedProjects,
    labGithubPatConfigured,
    refresh: hydrate,
    refreshRepoStatus,
    setLabGithubPat,
    clearLabGithubPat,
    refreshLabGithubPatConfigured,
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
  };
}
