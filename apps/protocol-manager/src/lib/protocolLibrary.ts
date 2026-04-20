import type { ProtocolDocument } from "@ilm/types";
import { createStableId, nowIso } from "@ilm/utils";
import { createBlankProtocol, createDefaultProtocol } from "./defaultProtocol";

export const LIBRARY_STORAGE_KEY = "ilm.protocol-manager.library.v2";
export const LEGACY_STORAGE_KEY = "ilm.protocol-manager.document";

export type SidebarTab = "overview" | "library" | "view";
export type ViewMode = "summary" | "step" | "preview" | "transfer";
export type ReviewStatus = "reviewed" | "reviewing";
export type LifecycleStatus = "active" | "archived";
export type ValidationStatus = "validated" | "proposed";
export type NewProtocolMode = "blank" | "template" | "import-json" | "import-files";

export interface ProtocolLibraryState {
  activeProtocolId: string;
  protocols: ProtocolDocument[];
}

export interface ProtocolMetadataState {
  project: string;
  reviewStatus: ReviewStatus;
  lifecycleStatus: LifecycleStatus;
  validationStatus: ValidationStatus;
}

const DEFAULT_PROTOCOL_METADATA: ProtocolMetadataState = {
  project: "Unassigned Project",
  reviewStatus: "reviewing",
  lifecycleStatus: "active",
  validationStatus: "proposed"
};

const createUniqueProtocolId = (label: string) =>
  createStableId("protocol", `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

export const getProtocolMetadata = (doc: ProtocolDocument): ProtocolMetadataState => {
  const metadata = doc.protocol.metadata ?? {};

  return {
    project: typeof metadata.project === "string" && metadata.project.trim() ? metadata.project : DEFAULT_PROTOCOL_METADATA.project,
    reviewStatus: metadata.reviewStatus === "reviewed" ? "reviewed" : DEFAULT_PROTOCOL_METADATA.reviewStatus,
    lifecycleStatus: metadata.lifecycleStatus === "archived" ? "archived" : DEFAULT_PROTOCOL_METADATA.lifecycleStatus,
    validationStatus: metadata.validationStatus === "validated" ? "validated" : DEFAULT_PROTOCOL_METADATA.validationStatus
  };
};

export const ensureProtocolMetadata = (doc: ProtocolDocument): ProtocolDocument => {
  const status = getProtocolMetadata(doc);

  return {
    ...doc,
    protocol: {
      ...doc.protocol,
      metadata: {
        ...(doc.protocol.metadata ?? {}),
        project: status.project,
        reviewStatus: status.reviewStatus,
        lifecycleStatus: status.lifecycleStatus,
        validationStatus: status.validationStatus
      }
    }
  };
};

export const updateProtocolMetadata = (
  doc: ProtocolDocument,
  patch: Partial<ProtocolMetadataState>
): ProtocolDocument => {
  const next = { ...getProtocolMetadata(doc), ...patch };

  return {
    ...doc,
    protocol: {
      ...doc.protocol,
      updatedAt: nowIso(),
      metadata: {
        ...(doc.protocol.metadata ?? {}),
        project: next.project,
        reviewStatus: next.reviewStatus,
        lifecycleStatus: next.lifecycleStatus,
        validationStatus: next.validationStatus
      }
    }
  };
};

export const createProtocolForMode = (mode: NewProtocolMode): ProtocolDocument =>
  ensureProtocolMetadata(mode === "template" ? createDefaultProtocol() : createBlankProtocol());

export const duplicateProtocolDocument = (doc: ProtocolDocument): ProtocolDocument => {
  const cloned = JSON.parse(JSON.stringify(doc)) as ProtocolDocument;
  const now = nowIso();

  return ensureProtocolMetadata({
    ...cloned,
    protocol: {
      ...cloned.protocol,
      id: createUniqueProtocolId(cloned.protocol.title || "protocol-copy"),
      title: `${cloned.protocol.title} Copy`,
      createdAt: now,
      updatedAt: now
    }
  });
};

export const createInitialLibrary = (): ProtocolLibraryState => {
  const initialProtocol = ensureProtocolMetadata(createDefaultProtocol());
  return {
    activeProtocolId: initialProtocol.protocol.id,
    protocols: [initialProtocol]
  };
};

export const normalizeLibraryState = (protocols: ProtocolDocument[], activeProtocolId?: string): ProtocolLibraryState => {
  const normalizedProtocols = protocols.map((doc) => ensureProtocolMetadata(doc));
  const activeId =
    normalizedProtocols.find((doc) => doc.protocol.id === activeProtocolId)?.protocol.id ??
    normalizedProtocols[0]?.protocol.id;

  if (!activeId) return createInitialLibrary();

  return {
    activeProtocolId: activeId,
    protocols: normalizedProtocols
  };
};

export const appendProtocolToLibrary = (
  state: ProtocolLibraryState,
  doc: ProtocolDocument
): ProtocolLibraryState => {
  const normalizedDoc = ensureProtocolMetadata(doc);

  return {
    activeProtocolId: normalizedDoc.protocol.id,
    protocols: [...state.protocols, normalizedDoc]
  };
};

export const replaceActiveProtocol = (
  state: ProtocolLibraryState,
  nextDoc: ProtocolDocument
): ProtocolLibraryState => {
  const normalizedDoc = ensureProtocolMetadata(nextDoc);

  return {
    ...state,
    activeProtocolId: normalizedDoc.protocol.id,
    protocols: state.protocols.map((doc) => (doc.protocol.id === state.activeProtocolId ? normalizedDoc : doc))
  };
};
