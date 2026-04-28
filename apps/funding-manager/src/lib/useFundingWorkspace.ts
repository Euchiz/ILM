import { useCallback, useEffect, useState } from "react";
import type { FundingSourceRecord } from "@ilm/utils";
import {
  archiveFundingSource as rpcArchive,
  createFundingSource as rpcCreate,
  listFundingWorkspace,
  restoreFundingSource as rpcRestore,
  updateFundingSource as rpcUpdate,
  type CreateFundingSourceInput,
  type FundingWorkspaceSnapshot,
  type LabMemberOption,
  type UpdateFundingSourceInput,
} from "./cloudAdapter";

export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

export interface UseFundingWorkspaceValue extends FundingWorkspaceSnapshot {
  status: WorkspaceStatus;
  error: string | null;
  refresh: () => Promise<void>;
  createFundingSource: (input: Omit<CreateFundingSourceInput, "labId">) => Promise<FundingSourceRecord>;
  updateFundingSource: (input: UpdateFundingSourceInput) => Promise<FundingSourceRecord>;
  archiveFundingSource: (id: string) => Promise<FundingSourceRecord>;
  restoreFundingSource: (id: string) => Promise<FundingSourceRecord>;
}

const EMPTY_ARRAY: [] = [];

const EMPTY_SNAPSHOT: FundingWorkspaceSnapshot = {
  fundingSources: EMPTY_ARRAY,
  labMembers: EMPTY_ARRAY,
};

export function useFundingWorkspace(labId: string | null): UseFundingWorkspaceValue {
  const [status, setStatus] = useState<WorkspaceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fundingSources, setFundingSources] = useState<FundingSourceRecord[]>(EMPTY_ARRAY);
  const [labMembers, setLabMembers] = useState<LabMemberOption[]>(EMPTY_ARRAY);

  const hydrate = useCallback(async () => {
    if (!labId) {
      setFundingSources(EMPTY_SNAPSHOT.fundingSources);
      setLabMembers(EMPTY_SNAPSHOT.labMembers);
      setStatus("idle");
      setError(null);
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const next = await listFundingWorkspace(labId);
      setFundingSources(next.fundingSources);
      setLabMembers(next.labMembers);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [labId]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const requireLab = useCallback(() => {
    if (!labId) throw new Error("No active lab selected.");
    return labId;
  }, [labId]);

  const createFundingSource = useCallback<UseFundingWorkspaceValue["createFundingSource"]>(
    async (input) => {
      const lab = requireLab();
      const created = await rpcCreate({ ...input, labId: lab });
      await hydrate();
      return created;
    },
    [hydrate, requireLab]
  );

  const updateFundingSource = useCallback<UseFundingWorkspaceValue["updateFundingSource"]>(
    async (input) => {
      requireLab();
      const updated = await rpcUpdate(input);
      await hydrate();
      return updated;
    },
    [hydrate, requireLab]
  );

  const archiveFundingSource = useCallback<UseFundingWorkspaceValue["archiveFundingSource"]>(
    async (id) => {
      requireLab();
      const updated = await rpcArchive(id);
      await hydrate();
      return updated;
    },
    [hydrate, requireLab]
  );

  const restoreFundingSource = useCallback<UseFundingWorkspaceValue["restoreFundingSource"]>(
    async (id) => {
      requireLab();
      const updated = await rpcRestore(id);
      await hydrate();
      return updated;
    },
    [hydrate, requireLab]
  );

  return {
    status,
    error,
    fundingSources,
    labMembers,
    refresh: hydrate,
    createFundingSource,
    updateFundingSource,
    archiveFundingSource,
    restoreFundingSource,
  };
}
