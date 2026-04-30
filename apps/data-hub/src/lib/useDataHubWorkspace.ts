import { useCallback, useEffect, useState } from "react";
import {
  archiveDataset as rpcArchiveDataset,
  createDataset as rpcCreateDataset,
  createDatasetAccessRequest as rpcCreateDatasetAccessRequest,
  createDatasetVersion as rpcCreateDatasetVersion,
  listDataHubWorkspace,
  restoreDataset as rpcRestoreDataset,
  reviewDatasetAccessRequest as rpcReviewDatasetAccessRequest,
  updateDataset as rpcUpdateDataset,
  withdrawDatasetAccessRequest as rpcWithdrawDatasetAccessRequest,
  type DataHubWorkspaceSnapshot,
  type DatasetAccessRequestRecord,
  type DatasetInput,
  type DatasetRecord,
  type DatasetVersionRecord,
  type ProjectLinkInput,
  type RequestAccessType,
  type VersionInput,
} from "./cloudAdapter";

export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

export interface UseDataHubWorkspaceValue extends DataHubWorkspaceSnapshot {
  status: WorkspaceStatus;
  error: string | null;
  refresh: () => Promise<void>;
  createDataset: (args: {
    data: DatasetInput;
    tags: string[];
    projectLinks: ProjectLinkInput[];
    storageUri?: string | null;
  }) => Promise<DatasetRecord>;
  updateDataset: (args: {
    datasetId: string;
    data: DatasetInput;
    tags: string[];
    projectLinks: ProjectLinkInput[];
    storageUri?: string | null;
  }) => Promise<DatasetRecord>;
  archiveDataset: (datasetId: string) => Promise<DatasetRecord>;
  restoreDataset: (datasetId: string) => Promise<DatasetRecord>;
  createDatasetVersion: (args: {
    datasetId: string;
    data: VersionInput;
    storageUri?: string | null;
  }) => Promise<DatasetVersionRecord>;
  createDatasetAccessRequest: (args: {
    datasetId: string;
    datasetVersionId?: string | null;
    projectId?: string | null;
    intendedUse: string;
    requestedAccessType: RequestAccessType;
  }) => Promise<DatasetAccessRequestRecord>;
  withdrawDatasetAccessRequest: (requestId: string) => Promise<DatasetAccessRequestRecord>;
  reviewDatasetAccessRequest: (args: {
    requestId: string;
    status: "approved" | "denied";
    decisionNote?: string | null;
    conditions?: string | null;
    createProjectLink?: boolean;
  }) => Promise<DatasetAccessRequestRecord>;
}

const EMPTY_SNAPSHOT: DataHubWorkspaceSnapshot = {
  datasets: [],
  versions: [],
  projectLinks: [],
  requests: [],
  tags: [],
  storageLinks: [],
  projects: [],
  labMembers: [],
};

export function useDataHubWorkspace(args: {
  labId: string | null;
  userId: string | null;
}): UseDataHubWorkspaceValue {
  const { labId, userId } = args;
  const [snapshot, setSnapshot] = useState<DataHubWorkspaceSnapshot>(EMPTY_SNAPSHOT);
  const [status, setStatus] = useState<WorkspaceStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    if (!labId) {
      setSnapshot(EMPTY_SNAPSHOT);
      setStatus("idle");
      setError(null);
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const next = await listDataHubWorkspace(labId);
      setSnapshot(next);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [labId]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const requireIdentity = useCallback(() => {
    if (!labId) throw new Error("No active lab selected.");
    if (!userId) throw new Error("No signed-in user available.");
    return { labId, userId };
  }, [labId, userId]);

  const createDataset = useCallback<UseDataHubWorkspaceValue["createDataset"]>(
    async (input) => {
      const identity = requireIdentity();
      const created = await rpcCreateDataset({ ...identity, ...input });
      await hydrate();
      return created;
    },
    [hydrate, requireIdentity]
  );

  const updateDataset = useCallback<UseDataHubWorkspaceValue["updateDataset"]>(
    async (input) => {
      const identity = requireIdentity();
      const updated = await rpcUpdateDataset({ ...identity, ...input });
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const archiveDataset = useCallback<UseDataHubWorkspaceValue["archiveDataset"]>(
    async (datasetId) => {
      requireIdentity();
      const updated = await rpcArchiveDataset(datasetId);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const restoreDataset = useCallback<UseDataHubWorkspaceValue["restoreDataset"]>(
    async (datasetId) => {
      requireIdentity();
      const updated = await rpcRestoreDataset(datasetId);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const createDatasetVersion = useCallback<UseDataHubWorkspaceValue["createDatasetVersion"]>(
    async (input) => {
      const identity = requireIdentity();
      const created = await rpcCreateDatasetVersion({ ...identity, ...input });
      await hydrate();
      return created;
    },
    [hydrate, requireIdentity]
  );

  const createDatasetAccessRequest = useCallback<UseDataHubWorkspaceValue["createDatasetAccessRequest"]>(
    async (input) => {
      const identity = requireIdentity();
      const created = await rpcCreateDatasetAccessRequest({ ...identity, ...input });
      await hydrate();
      return created;
    },
    [hydrate, requireIdentity]
  );

  const withdrawDatasetAccessRequest = useCallback<UseDataHubWorkspaceValue["withdrawDatasetAccessRequest"]>(
    async (requestId) => {
      requireIdentity();
      const updated = await rpcWithdrawDatasetAccessRequest(requestId);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const reviewDatasetAccessRequest = useCallback<UseDataHubWorkspaceValue["reviewDatasetAccessRequest"]>(
    async (input) => {
      requireIdentity();
      const updated = await rpcReviewDatasetAccessRequest(input);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  return {
    ...snapshot,
    status,
    error,
    refresh: hydrate,
    createDataset,
    updateDataset,
    archiveDataset,
    restoreDataset,
    createDatasetVersion,
    createDatasetAccessRequest,
    withdrawDatasetAccessRequest,
    reviewDatasetAccessRequest,
  };
}
