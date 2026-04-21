import { useCallback, useEffect, useState } from "react";
import {
  createExperiment as rpcCreateExperiment,
  createMilestone as rpcCreateMilestone,
  createProject as rpcCreateProject,
  deleteExperiment as rpcDeleteExperiment,
  deleteMilestone as rpcDeleteMilestone,
  deleteProject as rpcDeleteProject,
  listProjectWorkspace,
  updateExperiment as rpcUpdateExperiment,
  updateMilestone as rpcUpdateMilestone,
  updateProject as rpcUpdateProject,
  type ExperimentRecord,
  type ExperimentStatus,
  type MilestoneRecord,
  type MilestoneStatus,
  type ProjectRecord,
  type ProjectWorkspaceSnapshot,
  type ProtocolOptionRecord,
} from "./cloudAdapter";

export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

export interface UseProjectWorkspaceValue extends ProjectWorkspaceSnapshot {
  status: WorkspaceStatus;
  error: string | null;
  refresh: () => Promise<void>;
  createProject: (args: {
    name: string;
    description?: string;
    status?: string;
    approvalRequired?: boolean;
  }) => Promise<ProjectRecord>;
  updateProject: (args: {
    projectId: string;
    name: string;
    description?: string;
    status?: string;
    approvalRequired: boolean;
  }) => Promise<ProjectRecord>;
  deleteProject: (projectId: string) => Promise<void>;
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
    title: string;
    notes?: string;
    protocolId?: string | null;
    status?: ExperimentStatus;
    startedAt?: string | null;
    completedAt?: string | null;
  }) => Promise<ExperimentRecord>;
  updateExperiment: (args: {
    experimentId: string;
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

export function useProjectWorkspace(labId: string | null, userId: string | null): UseProjectWorkspaceValue {
  const [status, setStatus] = useState<WorkspaceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>(EMPTY_ARRAY);
  const [milestones, setMilestones] = useState<MilestoneRecord[]>(EMPTY_ARRAY);
  const [experiments, setExperiments] = useState<ExperimentRecord[]>(EMPTY_ARRAY);
  const [protocols, setProtocols] = useState<ProtocolOptionRecord[]>(EMPTY_ARRAY);

  const hydrate = useCallback(async () => {
    if (!labId) {
      setProjects(EMPTY_ARRAY);
      setMilestones(EMPTY_ARRAY);
      setExperiments(EMPTY_ARRAY);
      setProtocols(EMPTY_ARRAY);
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
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [labId]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const requireIdentity = () => {
    if (!labId) throw new Error("No active lab selected.");
    if (!userId) throw new Error("No signed-in user available.");
    return { labId, userId };
  };

  const createProject = useCallback<UseProjectWorkspaceValue["createProject"]>(async (args) => {
    const identity = requireIdentity();
    const created = await rpcCreateProject({ ...identity, ...args });
    await hydrate();
    return created;
  }, [hydrate, labId, userId]);

  const updateProject = useCallback<UseProjectWorkspaceValue["updateProject"]>(async (args) => {
    requireIdentity();
    const updated = await rpcUpdateProject({ ...args, userId: userId as string });
    await hydrate();
    return updated;
  }, [hydrate, labId, userId]);

  const deleteProject = useCallback<UseProjectWorkspaceValue["deleteProject"]>(async (projectId) => {
    requireIdentity();
    await rpcDeleteProject(projectId);
    await hydrate();
  }, [hydrate, labId, userId]);

  const createMilestone = useCallback<UseProjectWorkspaceValue["createMilestone"]>(async (args) => {
    const identity = requireIdentity();
    const created = await rpcCreateMilestone({ ...identity, ...args });
    await hydrate();
    return created;
  }, [hydrate, labId, userId]);

  const updateMilestone = useCallback<UseProjectWorkspaceValue["updateMilestone"]>(async (args) => {
    requireIdentity();
    const updated = await rpcUpdateMilestone({ ...args, userId: userId as string });
    await hydrate();
    return updated;
  }, [hydrate, labId, userId]);

  const deleteMilestone = useCallback<UseProjectWorkspaceValue["deleteMilestone"]>(async (milestoneId) => {
    requireIdentity();
    await rpcDeleteMilestone(milestoneId);
    await hydrate();
  }, [hydrate, labId, userId]);

  const createExperiment = useCallback<UseProjectWorkspaceValue["createExperiment"]>(async (args) => {
    const identity = requireIdentity();
    const created = await rpcCreateExperiment({ ...identity, ...args });
    await hydrate();
    return created;
  }, [hydrate, labId, userId]);

  const updateExperiment = useCallback<UseProjectWorkspaceValue["updateExperiment"]>(async (args) => {
    requireIdentity();
    const updated = await rpcUpdateExperiment({ ...args, userId: userId as string });
    await hydrate();
    return updated;
  }, [hydrate, labId, userId]);

  const deleteExperiment = useCallback<UseProjectWorkspaceValue["deleteExperiment"]>(async (experimentId) => {
    requireIdentity();
    await rpcDeleteExperiment(experimentId);
    await hydrate();
  }, [hydrate, labId, userId]);

  return {
    status,
    error,
    projects,
    milestones,
    experiments,
    protocols,
    refresh: hydrate,
    createProject,
    updateProject,
    deleteProject,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    createExperiment,
    updateExperiment,
    deleteExperiment,
  };
}
