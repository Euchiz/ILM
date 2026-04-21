import { useCallback, useEffect, useState } from "react";
import {
  approveProject as rpcApproveProject,
  createExperiment as rpcCreateExperiment,
  createMilestone as rpcCreateMilestone,
  createProjectDraft as rpcCreateProjectDraft,
  deleteExperiment as rpcDeleteExperiment,
  deleteMilestone as rpcDeleteMilestone,
  listDeletedProjects,
  listProjectWorkspace,
  permanentDeleteProject as rpcPermanentDeleteProject,
  recycleProject as rpcRecycleProject,
  rejectProject as rpcRejectProject,
  restoreProject as rpcRestoreProject,
  updateExperiment as rpcUpdateExperiment,
  updateMilestone as rpcUpdateMilestone,
  updateProject as rpcUpdateProject,
  withdrawProjectDraft as rpcWithdrawProjectDraft,
  type ExperimentRecord,
  type ExperimentStatus,
  type MilestoneRecord,
  type MilestoneStatus,
  type ProjectLeadLinkRecord,
  type ProjectRecord,
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
  approveProject: (projectId: string) => Promise<ProjectRecord>;
  rejectProject: (projectId: string) => Promise<void>;
  recycleProject: (projectId: string) => Promise<ProjectRecord>;
  restoreProject: (projectId: string) => Promise<ProjectRecord>;
  permanentDeleteProject: (projectId: string) => Promise<void>;

  updateProject: (args: {
    projectId: string;
    name: string;
    description?: string;
    status?: string;
    approvalRequired: boolean;
  }) => Promise<ProjectRecord>;

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
  const [deletedProjects, setDeletedProjects] = useState<ProjectRecord[]>(EMPTY_ARRAY);

  const hydrate = useCallback(async () => {
    if (!labId) {
      setProjects(EMPTY_ARRAY);
      setMilestones(EMPTY_ARRAY);
      setExperiments(EMPTY_ARRAY);
      setProtocols(EMPTY_ARRAY);
      setLeads(EMPTY_ARRAY);
      setDeletedProjects(EMPTY_ARRAY);
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

  const approveProject = useCallback<UseProjectWorkspaceValue["approveProject"]>(async (projectId) => {
    requireIdentity();
    const updated = await rpcApproveProject(projectId);
    await hydrate();
    return updated;
  }, [hydrate, requireIdentity]);

  const rejectProject = useCallback<UseProjectWorkspaceValue["rejectProject"]>(async (projectId) => {
    requireIdentity();
    await rpcRejectProject(projectId);
    await hydrate();
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
    const created = await rpcCreateMilestone({ ...identity, ...args });
    await hydrate();
    return created;
  }, [hydrate, requireIdentity]);

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

  const createExperiment = useCallback<UseProjectWorkspaceValue["createExperiment"]>(async (args) => {
    const identity = requireIdentity();
    const created = await rpcCreateExperiment({ ...identity, ...args });
    await hydrate();
    return created;
  }, [hydrate, requireIdentity]);

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

  return {
    status,
    error,
    projects,
    milestones,
    experiments,
    protocols,
    leads,
    deletedProjects,
    refresh: hydrate,
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
  };
}
