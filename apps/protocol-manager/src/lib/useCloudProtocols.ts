import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProtocolDocument } from "@ilm/types";
import {
  discardDraft as rpcDiscardDraft,
  listDrafts,
  listProjects,
  listProtocols,
  saveDraft as rpcSaveDraft,
  submitDraft as rpcSubmitDraft,
  softDeleteProtocol as rpcSoftDeleteProtocol,
  type CloudProjectRow,
} from "./cloudAdapter";
import { ensureProtocolMetadata } from "./protocolLibrary";

/**
 * Cloud-side identity for a client-side ProtocolDocument. The document's
 * `protocol.id` (client stable key) maps to some combination of a
 * published protocol row and/or a draft row.
 */
interface Binding {
  serverProtocolId: string | null;
  draftId: string | null;
  projectId: string;
  /** Local edits not yet saved to the cloud. */
  dirty: boolean;
  /** Save or submit in flight. */
  busy: boolean;
  lastError: string | null;
  /** Last document the cloud confirmed (draft or published). Used as the
   *  baseline to detect dirtiness vs the in-memory doc. */
  cloudDocumentHash: string;
}

export type CloudStatus = "idle" | "loading" | "ready" | "error";

export interface UseCloudProtocolsValue {
  status: CloudStatus;
  error: string | null;
  protocols: ProtocolDocument[];
  bindings: Record<string, Binding>;
  projects: CloudProjectRow[];
  generalProjectId: string | null;

  /** Update a protocol in memory. Does NOT touch the cloud. */
  replaceProtocol: (clientId: string, doc: ProtocolDocument) => void;
  /** Add a new protocol locally. Persists a draft on the cloud immediately
   *  so another device / refresh can recover it. */
  addProtocol: (doc: ProtocolDocument, projectId?: string) => Promise<void>;
  /** Soft-delete a published protocol (or drop a draft-only one). */
  removeProtocol: (clientId: string) => Promise<void>;

  /** Explicit save — writes the current in-memory doc to the user's draft. */
  saveDraft: (clientId: string) => Promise<void>;
  /** Throw away the user's draft and revert to the published version. */
  discardDraft: (clientId: string) => Promise<void>;
  /** Save then submit. Free-write projects publish immediately. */
  submitDraft: (clientId: string) => Promise<string>;

  /** Assign a protocol to a different project. Marks it dirty. */
  setProject: (clientId: string, projectId: string) => void;
  /** Reload from the server. */
  refresh: () => Promise<void>;
}

const hashDocument = (doc: ProtocolDocument): string => {
  // Stable-ish fingerprint: stringify with sorted top-level protocol keys is
  // overkill here; JSON.stringify is deterministic enough for dirtiness
  // detection against the baseline we stored.
  return JSON.stringify(doc);
};

export function useCloudProtocols(labId: string | null): UseCloudProtocolsValue {
  const [status, setStatus] = useState<CloudStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [protocols, setProtocols] = useState<ProtocolDocument[]>([]);
  const [bindings, setBindings] = useState<Record<string, Binding>>({});
  const [projects, setProjects] = useState<CloudProjectRow[]>([]);

  const docsRef = useRef<Record<string, ProtocolDocument>>({});
  const bindingsRef = useRef<Record<string, Binding>>({});

  const generalProjectId = useMemo(
    () => projects.find((p) => p.name === "General")?.id ?? null,
    [projects]
  );

  const updateBinding = useCallback((clientId: string, patch: Partial<Binding>) => {
    setBindings((current) => {
      const prev = current[clientId];
      if (!prev) return current;
      const next = { ...prev, ...patch };
      bindingsRef.current = { ...bindingsRef.current, [clientId]: next };
      return { ...current, [clientId]: next };
    });
  }, []);

  const hydrate = useCallback(async () => {
    if (!labId) return;
    setStatus("loading");
    setError(null);
    try {
      const [cloudProtocols, cloudDrafts, cloudProjects] = await Promise.all([
        listProtocols(labId),
        listDrafts(labId),
        listProjects(labId),
      ]);

      const general = cloudProjects.find((p) => p.name === "General") ?? cloudProjects[0] ?? null;

      const nextDocs: ProtocolDocument[] = [];
      const nextBindings: Record<string, Binding> = {};

      for (const row of cloudProtocols) {
        const draft = cloudDrafts.find((d) => d.protocol_id === row.id);
        const doc = ensureProtocolMetadata(draft?.document_json ?? row.document_json);
        nextDocs.push(doc);
        nextBindings[doc.protocol.id] = {
          serverProtocolId: row.id,
          draftId: draft?.id ?? null,
          projectId: draft?.project_id ?? row.project_id ?? general?.id ?? "",
          dirty: false,
          busy: false,
          lastError: null,
          cloudDocumentHash: hashDocument(doc),
        };
      }

      for (const draft of cloudDrafts.filter((d) => d.protocol_id === null)) {
        const doc = ensureProtocolMetadata(draft.document_json);
        if (nextBindings[doc.protocol.id]) continue;
        nextDocs.push(doc);
        nextBindings[doc.protocol.id] = {
          serverProtocolId: null,
          draftId: draft.id,
          projectId: draft.project_id ?? general?.id ?? "",
          dirty: false,
          busy: false,
          lastError: null,
          cloudDocumentHash: hashDocument(doc),
        };
      }

      docsRef.current = Object.fromEntries(nextDocs.map((d) => [d.protocol.id, d]));
      bindingsRef.current = nextBindings;
      setProtocols(nextDocs);
      setBindings(nextBindings);
      setProjects(cloudProjects);
      setStatus("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
    }
  }, [labId]);

  useEffect(() => {
    if (!labId) {
      docsRef.current = {};
      bindingsRef.current = {};
      setProtocols([]);
      setBindings({});
      setProjects([]);
      setStatus("idle");
      return;
    }
    void hydrate();
  }, [labId, hydrate]);

  const replaceProtocol = useCallback((clientId: string, doc: ProtocolDocument) => {
    setProtocols((current) => current.map((d) => (d.protocol.id === clientId ? doc : d)));
    docsRef.current = { ...docsRef.current, [doc.protocol.id]: doc };
    if (clientId !== doc.protocol.id) {
      // id renamed (duplicate flow). carry binding.
      const binding = bindingsRef.current[clientId];
      if (binding) {
        const { [clientId]: _removed, ...rest } = bindingsRef.current;
        bindingsRef.current = { ...rest, [doc.protocol.id]: binding };
        setBindings((current) => {
          const { [clientId]: _, ...keep } = current;
          return { ...keep, [doc.protocol.id]: binding };
        });
      }
    }
    const binding = bindingsRef.current[doc.protocol.id];
    if (binding) {
      const nextDirty = hashDocument(doc) !== binding.cloudDocumentHash;
      if (nextDirty !== binding.dirty) updateBinding(doc.protocol.id, { dirty: nextDirty });
    }
  }, [updateBinding]);

  const addProtocol = useCallback(async (doc: ProtocolDocument, projectId?: string) => {
    if (!labId) throw new Error("no active lab");
    const targetProject = projectId ?? generalProjectId;
    if (!targetProject) throw new Error("no General project available");

    // Persist as a draft immediately so the new protocol survives refresh.
    const draftId = await rpcSaveDraft({
      protocolId: null,
      projectId: targetProject,
      document: doc,
      draftId: null,
    });
    const binding: Binding = {
      serverProtocolId: null,
      draftId,
      projectId: targetProject,
      dirty: false,
      busy: false,
      lastError: null,
      cloudDocumentHash: hashDocument(doc),
    };
    docsRef.current = { ...docsRef.current, [doc.protocol.id]: doc };
    bindingsRef.current = { ...bindingsRef.current, [doc.protocol.id]: binding };
    setProtocols((current) => [...current, doc]);
    setBindings((current) => ({ ...current, [doc.protocol.id]: binding }));
  }, [generalProjectId, labId]);

  const removeProtocol = useCallback(async (clientId: string) => {
    const binding = bindingsRef.current[clientId];
    if (!binding) return;

    if (binding.draftId) {
      try { await rpcDiscardDraft(binding.draftId); } catch (_) { /* best effort */ }
    }
    if (binding.serverProtocolId) {
      await rpcSoftDeleteProtocol(binding.serverProtocolId);
    }

    const { [clientId]: _doc, ...restDocs } = docsRef.current;
    const { [clientId]: _binding, ...restBindings } = bindingsRef.current;
    docsRef.current = restDocs;
    bindingsRef.current = restBindings;
    setProtocols((current) => current.filter((d) => d.protocol.id !== clientId));
    setBindings((current) => {
      const { [clientId]: _, ...rest } = current;
      return rest;
    });
  }, []);

  const saveDraftAction = useCallback(async (clientId: string) => {
    const doc = docsRef.current[clientId];
    const binding = bindingsRef.current[clientId];
    if (!doc || !binding) return;
    if (!binding.projectId) throw new Error("no project assigned");

    updateBinding(clientId, { busy: true, lastError: null });
    try {
      const draftId = await rpcSaveDraft({
        protocolId: binding.serverProtocolId,
        projectId: binding.projectId,
        document: doc,
        draftId: binding.draftId,
      });
      updateBinding(clientId, {
        draftId,
        dirty: false,
        busy: false,
        cloudDocumentHash: hashDocument(doc),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateBinding(clientId, { busy: false, lastError: message });
      throw err;
    }
  }, [updateBinding]);

  const discardDraftAction = useCallback(async (clientId: string) => {
    const binding = bindingsRef.current[clientId];
    if (!binding?.draftId) return;
    await rpcDiscardDraft(binding.draftId);
    updateBinding(clientId, { draftId: null, dirty: false });
    await hydrate();
  }, [hydrate, updateBinding]);

  const submitDraftAction = useCallback(async (clientId: string): Promise<string> => {
    const binding = bindingsRef.current[clientId];
    if (!binding) throw new Error("unknown protocol");

    // Always save-then-submit so the cloud has the freshest bits.
    await saveDraftAction(clientId);
    const refreshed = bindingsRef.current[clientId];
    if (!refreshed?.draftId) throw new Error("nothing to submit");

    updateBinding(clientId, { busy: true, lastError: null });
    try {
      const submissionId = await rpcSubmitDraft(refreshed.draftId);
      await hydrate();
      return submissionId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateBinding(clientId, { busy: false, lastError: message });
      throw err;
    }
  }, [hydrate, saveDraftAction, updateBinding]);

  const setProject = useCallback((clientId: string, projectId: string) => {
    updateBinding(clientId, { projectId, dirty: true });
  }, [updateBinding]);

  return {
    status,
    error,
    protocols,
    bindings,
    projects,
    generalProjectId,
    replaceProtocol,
    addProtocol,
    removeProtocol,
    saveDraft: saveDraftAction,
    discardDraft: discardDraftAction,
    submitDraft: submitDraftAction,
    setProject,
    refresh: hydrate,
  };
}
