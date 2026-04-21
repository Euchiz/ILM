import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AppSwitcher, useAuth } from "@ilm/ui";
import type { ProtocolBlock, ProtocolDocument, ProtocolSection, ProtocolStep } from "@ilm/types";
import { getSupabaseClient, nowIso, safeJsonParse } from "@ilm/utils";
import { AI_IMPORT_INSTRUCTIONS_TEXT } from "@ilm/ai-import";
import { normalizeProtocolDocument, validateProtocolDocument, type ValidationMode } from "@ilm/validation";
import { ImportExportPanel } from "./components/ImportExportPanel";
import { OutlinePanel } from "./components/OutlinePanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { StepEditorModal } from "./components/StepEditorModal";
import {
  clearLegacyLibraryStorage,
  loadCloudWorkspaceSnapshot,
  readLegacyLibraryProtocols,
  type CloudWorkspaceSnapshot,
  type DraftRecord,
  type ProjectSummary,
  type PublishedProtocolRecord,
  type SubmissionRecord,
} from "./lib/cloudProtocolWorkspace";
import {
  createProtocolForMode,
  duplicateProtocolDocument,
  ensureProtocolMetadata,
  getProtocolMetadata,
  type LifecycleStatus,
  type NewProtocolMode,
  type SidebarTab,
  type ValidationStatus,
  type ViewMode,
  updateProtocolMetadata,
} from "./lib/protocolLibrary";
import {
  addSection,
  addStep,
  collectSectionsByIds,
  collectStepIds,
  collectStepsByIds,
  deleteSection,
  deleteSections,
  deleteStep,
  deleteSteps,
  duplicateSection,
  duplicateStep,
  findSection,
  findSectionParent,
  findStepLocation,
  insertSectionAfter,
  moveSection,
  moveStep,
  moveStepsToSection,
  pasteBlocksIntoStep,
  pasteSections,
  pasteStepsIntoSection,
  removeBlocksFromStep,
  reorderSections,
  type Selection,
} from "./state/protocolState";

const MODULE_CARDS = [
  {
    id: "protocol-manager",
    title: "Protocol Manager",
    status: "Available",
    description: "Portfolio-level protocol visibility, library organization, and structured viewing/editing workflows.",
    actionLabel: "Open module",
  },
  {
    id: "supply-manager",
    title: "Supply Manager",
    status: "Planned",
    description: "Track reagents, linked vendors, and inventory relationships against upcoming protocol runs.",
    actionLabel: "Coming soon",
  },
  {
    id: "project-manager",
    title: "Project Manager",
    status: "Planned",
    description: "Coordinate project milestones, protocol coverage, and experiment readiness across teams.",
    actionLabel: "Coming soon",
  },
  {
    id: "funding-manager",
    title: "Funding Manager",
    status: "Planned",
    description: "Connect grants and budgets to active project portfolios and protocol execution plans.",
    actionLabel: "Coming soon",
  },
] as const;

const APP_BASE_URL = import.meta.env.BASE_URL;

const buildPageUrl = (path: "" | "protocol-manager/") => new URL(path, window.location.origin + APP_BASE_URL).toString();

type ActiveModule = "home" | "protocol-manager";

type AppProps = {
  page: ActiveModule;
};

type ActiveEditor = {
  draftId: string | null;
  protocolId: string | null;
  projectId: string | null;
  document: ProtocolDocument;
};

type DraftSaveState = "idle" | "saving" | "saved" | "error";

type ReviewState = "reviewed" | "reviewing";

type ProjectGroup = {
  project: string;
  protocols: PublishedProtocolRecord[];
  reviewed: number;
  reviewing: number;
  active: number;
  archived: number;
  validated: number;
  proposed: number;
};

const STATUS_TONE_MAP: Record<string, string> = {
  active: "active",
  archived: "archived",
  reviewed: "reviewed",
  reviewing: "reviewing",
  validated: "validated",
  proposed: "proposed",
  pending: "reviewing",
  approved: "reviewed",
  rejected: "archived",
  withdrawn: "neutral",
  draft: "proposed",
};

const getStatusTone = (value: string) => STATUS_TONE_MAP[value] ?? "neutral";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

const getEditorKey = (editor: ActiveEditor) =>
  editor.protocolId ? `protocol:${editor.protocolId}` : `draft:${editor.draftId ?? editor.document.protocol.id}`;

const formatRelativeTime = (timestamp: string | null) => {
  if (!timestamp) return "just now";
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.max(1, Math.round(diff / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const buildEditorFromPublished = (record: PublishedProtocolRecord, draft?: DraftRecord | null): ActiveEditor => ({
  draftId: draft?.id ?? null,
  protocolId: record.id,
  projectId: draft?.projectId ?? record.projectId,
  document: draft?.document ?? record.document,
});

const buildEditorFromDraft = (draft: DraftRecord): ActiveEditor => ({
  draftId: draft.id,
  protocolId: draft.protocolId,
  projectId: draft.projectId,
  document: draft.document,
});

const findPublishedProtocol = (workspace: CloudWorkspaceSnapshot | null, protocolId: string | null) =>
  protocolId ? workspace?.publishedProtocols.find((protocol) => protocol.id === protocolId) ?? null : null;

const findDraftByProtocol = (workspace: CloudWorkspaceSnapshot | null, protocolId: string | null) =>
  protocolId ? workspace?.drafts.find((draft) => draft.protocolId === protocolId) ?? null : null;

const findDraftByDocumentId = (workspace: CloudWorkspaceSnapshot | null, documentProtocolId: string) =>
  workspace?.drafts.find((draft) => draft.document.protocol.id === documentProtocolId) ?? null;

const findPublishedByDocumentId = (workspace: CloudWorkspaceSnapshot | null, documentProtocolId: string) =>
  workspace?.publishedProtocols.find((protocol) => protocol.document.protocol.id === documentProtocolId) ?? null;

const chooseInitialEditor = (workspace: CloudWorkspaceSnapshot): ActiveEditor | null => {
  const firstPublished = workspace.publishedProtocols[0];
  if (firstPublished) {
    return buildEditorFromPublished(firstPublished, findDraftByProtocol(workspace, firstPublished.id));
  }

  const firstDraft = workspace.drafts[0];
  if (firstDraft) return buildEditorFromDraft(firstDraft);

  if (!workspace.generalProjectId) return null;
  return {
    draftId: null,
    protocolId: null,
    projectId: workspace.generalProjectId,
    document: createProtocolForMode("template"),
  };
};

const upsertDraftRecord = (drafts: DraftRecord[], nextDraft: DraftRecord) => {
  const remaining = drafts.filter((draft) => draft.id !== nextDraft.id);
  return [nextDraft, ...remaining].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

const removeDraftRecord = (drafts: DraftRecord[], draftId: string) => drafts.filter((draft) => draft.id !== draftId);

const getProtocolReviewState = (record: PublishedProtocolRecord, pendingSubmissions: SubmissionRecord[]): ReviewState =>
  pendingSubmissions.some((submission) => submission.protocolId === record.id) ? "reviewing" : "reviewed";

const buildProjectGroups = (protocols: PublishedProtocolRecord[], pendingSubmissions: SubmissionRecord[]): ProjectGroup[] => {
  const groups = new Map<string, ProjectGroup>();

  protocols.forEach((protocol) => {
    const metadata = getProtocolMetadata(protocol.document);
    const reviewState = getProtocolReviewState(protocol, pendingSubmissions);
    const current =
      groups.get(protocol.projectName) ??
      {
        project: protocol.projectName,
        protocols: [],
        reviewed: 0,
        reviewing: 0,
        active: 0,
        archived: 0,
        validated: 0,
        proposed: 0,
      };

    current.protocols.push(protocol);
    current.reviewed += reviewState === "reviewed" ? 1 : 0;
    current.reviewing += reviewState === "reviewing" ? 1 : 0;
    current.active += metadata.lifecycleStatus === "active" ? 1 : 0;
    current.archived += metadata.lifecycleStatus === "archived" ? 1 : 0;
    current.validated += metadata.validationStatus === "validated" ? 1 : 0;
    current.proposed += metadata.validationStatus === "proposed" ? 1 : 0;
    groups.set(protocol.projectName, current);
  });

  return Array.from(groups.values()).sort((left, right) => left.project.localeCompare(right.project));
};

export const App = ({ page }: AppProps) => {
  const { activeLab, user } = useAuth();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const mainGridRef = useRef<HTMLDivElement | null>(null);
  const fallbackDocRef = useRef<ProtocolDocument>(createProtocolForMode("template"));
  const editorRef = useRef<ActiveEditor | null>(null);

  const [workspace, setWorkspace] = useState<CloudWorkspaceSnapshot | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [editor, setEditor] = useState<ActiveEditor | null>(null);
  const [selection, setSelection] = useState<Selection>({ type: "protocol" });
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [blockSelection, setBlockSelection] = useState<{ stepId: string; blockIds: string[] }>({ stepId: "", blockIds: [] });
  const [blockClipboard, setBlockClipboard] = useState<ProtocolBlock[]>([]);
  const [stepClipboard, setStepClipboard] = useState<ProtocolStep[]>([]);
  const [sectionClipboard, setSectionClipboard] = useState<ProtocolSection[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<DraftSaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [autosaveTick, setAutosaveTick] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("overview");
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [importMode, setImportMode] = useState<ValidationMode>("assisted");
  const [jsonText, setJsonText] = useState("");
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [newProtocolModalOpen, setNewProtocolModalOpen] = useState(false);
  const [outlineWidth, setOutlineWidth] = useState(460);
  const [isResizingOutline, setIsResizingOutline] = useState(false);
  const [migrationDismissed, setMigrationDismissed] = useState(false);
  const [migrationImporting, setMigrationImporting] = useState(false);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const projects = workspace?.projects ?? [];
  const publishedProtocols = workspace?.publishedProtocols ?? [];
  const drafts = workspace?.drafts ?? [];
  const submissions = workspace?.submissions ?? [];
  const pendingSubmissions = useMemo(() => submissions.filter((submission) => submission.status === "pending"), [submissions]);
  const deletedProtocols = workspace?.deletedProtocols ?? [];
  const generalProjectId = workspace?.generalProjectId ?? projects[0]?.id ?? null;

  const resolveProjectName = useCallback(
    (projectId: string | null) => projects.find((project) => project.id === projectId)?.name ?? (projectId === generalProjectId ? "General" : "Unassigned Project"),
    [generalProjectId, projects]
  );

  const normalizeEditorDocument = useCallback(
    (
      nextDoc: ProtocolDocument,
      projectId: string | null,
      patch?: Partial<{ lifecycleStatus: LifecycleStatus; validationStatus: ValidationStatus; reviewStatus: ReviewState }>
    ) =>
      ensureProtocolMetadata(
        updateProtocolMetadata(
          {
            ...nextDoc,
            protocol: {
              ...nextDoc.protocol,
              updatedAt: nowIso(),
            },
          },
          {
            project: resolveProjectName(projectId),
            ...patch,
          }
        )
      ),
    [resolveProjectName]
  );

  const canReviewProject = useCallback(
    (projectId: string | null) => {
      if (!projectId || !activeLab) return false;
      if (activeLab.role === "owner" || activeLab.role === "admin") return true;
      return workspace?.leadProjectIds.includes(projectId) ?? false;
    },
    [activeLab, workspace?.leadProjectIds]
  );

  const refreshWorkspace = useCallback(async (): Promise<CloudWorkspaceSnapshot | null> => {
    if (!activeLab || !user) {
      setWorkspace(null);
      setEditor(null);
      return null;
    }

    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const nextWorkspace = await loadCloudWorkspaceSnapshot(supabase, activeLab.id, user.id);
      setWorkspace(nextWorkspace);
      return nextWorkspace;
    } catch (error) {
      const message = errorMessage(error);
      setWorkspaceError(message);
      setStatus([`Could not load workspace: ${message}`]);
      return null;
    } finally {
      setWorkspaceLoading(false);
    }
  }, [activeLab, supabase, user]);

  useEffect(() => {
    if (page !== "protocol-manager" || !activeLab || !user) return;

    let cancelled = false;
    void refreshWorkspace().then((nextWorkspace) => {
      if (cancelled || !nextWorkspace) return;
      setEditor((current) => current ?? chooseInitialEditor(nextWorkspace));
    });

    return () => {
      cancelled = true;
    };
  }, [activeLab, page, refreshWorkspace, user]);

  useEffect(() => {
    setSelection({ type: "protocol" });
    setSelectedStepIds([]);
    setSelectedSectionIds([]);
    setBlockSelection({ stepId: "", blockIds: [] });
    setEditorModalOpen(false);
    setJsonText("");
  }, [activeLab?.id, editor?.draftId, editor?.protocolId, editor?.document.protocol.id]);

  const doc = editor?.document ?? fallbackDocRef.current;
  const protocolMeta = getProtocolMetadata(doc);
  const displayReviewStatus =
    editor?.protocolId && findPublishedProtocol(workspace, editor.protocolId)
      ? getProtocolReviewState(findPublishedProtocol(workspace, editor.protocolId) as PublishedProtocolRecord, pendingSubmissions)
      : "reviewing";
  const projectGroups = useMemo(() => buildProjectGroups(publishedProtocols, pendingSubmissions), [pendingSubmissions, publishedProtocols]);
  const totalProjects = projects.length;
  const totalProtocols = publishedProtocols.length;
  const totalReviewed = publishedProtocols.filter((protocol) => getProtocolReviewState(protocol, pendingSubmissions) === "reviewed").length;
  const totalReviewing = totalProtocols - totalReviewed;
  const totalArchived = publishedProtocols.filter((protocol) => getProtocolMetadata(protocol.document).lifecycleStatus === "archived").length;
  const totalActive = totalProtocols - totalArchived;
  const totalValidated = publishedProtocols.filter((protocol) => getProtocolMetadata(protocol.document).validationStatus === "validated").length;
  const totalProposed = totalProtocols - totalValidated;
  const sectionCount = useMemo(() => countSections(doc.protocol.sections), [doc]);
  const stepCount = useMemo(() => countSteps(doc.protocol.sections), [doc]);
  const allStepIds = useMemo(() => collectStepIds(doc.protocol.sections), [doc]);
  const focusedStepLocation = selection.type === "step" ? findStepLocation(doc.protocol.sections, selection.stepId) : null;
  const focusedSection =
    selection.type === "protocol"
      ? null
      : findSection(doc.protocol.sections, selection.type === "section" ? selection.sectionId : focusedStepLocation?.sectionId ?? selection.sectionId);
  const focusedStep = focusedStepLocation?.step ?? null;
  const firstStepRecord = getFirstStepRecord(doc.protocol.sections);
  const selectedStepCount = selection.type === "step" ? (selectedStepIds.length > 0 ? selectedStepIds.length : 1) : 0;
  const singleStepSelected = selection.type === "step" && selectedStepCount === 1 && Boolean(focusedStep);
  const visibleReviewsTab = submissions.length > 0;
  const activeProject = projects.find((project) => project.id === editor?.projectId) ?? null;
  const activeProtocolLabel =
    viewMode === "summary" ? "Protocol summary" : viewMode === "step" ? "Single-step focus" : viewMode === "preview" ? "Rendered preview" : "Transfer desk";
  const openEditorLabel = selection.type === "protocol" ? "Edit protocol" : selection.type === "section" ? "Edit section" : "Edit step";
  const saveStatusLabel =
    saveState === "saving"
      ? "Saving draft..."
      : saveState === "saved"
        ? `Saved ${formatRelativeTime(lastSavedAt)}`
        : saveState === "error"
          ? "Draft save failed"
          : "Draft autosave ready";
  const legacyProtocols = useMemo(
    () => (page === "protocol-manager" && activeLab && !migrationDismissed ? readLegacyLibraryProtocols() : []),
    [activeLab, migrationDismissed, page]
  );

  useEffect(() => {
    const validStepIds = new Set(allStepIds);
    setSelectedStepIds((current) => current.filter((stepId) => validStepIds.has(stepId)));

    if (!blockSelection.stepId || !validStepIds.has(blockSelection.stepId)) {
      setBlockSelection({ stepId: "", blockIds: [] });
      return;
    }

    const stepLocation = findStepLocation(doc.protocol.sections, blockSelection.stepId);
    if (!stepLocation) {
      setBlockSelection({ stepId: "", blockIds: [] });
      return;
    }

    const validBlockIds = new Set(stepLocation.step.blocks.map((block) => block.id));
    setBlockSelection((current) => ({
      stepId: current.stepId,
      blockIds: current.blockIds.filter((blockId) => validBlockIds.has(blockId)),
    }));
  }, [allStepIds, blockSelection.stepId, doc.protocol.sections]);

  const updateDoc = (nextDoc: ProtocolDocument) => {
    setEditor((current) =>
      current
        ? {
            ...current,
            document: normalizeEditorDocument(nextDoc, current.projectId),
          }
        : current
    );
    setAutosaveTick((current) => current + 1);
  };

  const clearBlockSelection = () => setBlockSelection({ stepId: "", blockIds: [] });

  const openViewMode = (mode: ViewMode) => {
    setSidebarTab("view");
    setViewMode(mode);
  };

  const resetSelection = () => {
    setSelection({ type: "protocol" });
    setSelectedStepIds([]);
    setSelectedSectionIds([]);
    clearBlockSelection();
  };

  const selectProtocol = () => {
    resetSelection();
    openViewMode("summary");
  };

  const selectSection = (sectionId: string, options?: { toggle: boolean }) => {
    setSelectedStepIds([]);
    clearBlockSelection();
    openViewMode("summary");

    if (options?.toggle) {
      setSelectedSectionIds((current) => {
        if (current.includes(sectionId)) {
          const next = current.filter((id) => id !== sectionId);
          if (next.length === 0) {
            setSelection({ type: "protocol" });
            return [];
          }
          setSelection({ type: "section", sectionId: next[0] });
          return next;
        }

        setSelection({ type: "section", sectionId });
        return [...current, sectionId];
      });
      return;
    }

    setSelection({ type: "section", sectionId });
    setSelectedSectionIds([sectionId]);
  };

  const selectStep = (sectionId: string, stepId: string, options?: { toggle: boolean }) => {
    setSelectedSectionIds([]);
    clearBlockSelection();
    openViewMode("step");

    if (options?.toggle) {
      setSelectedStepIds((current) => {
        if (current.includes(stepId)) {
          const next = current.filter((id) => id !== stepId);
          if (next.length === 0) {
            setSelection({ type: "protocol" });
            return [];
          }

          const nextPrimary = next[0];
          const nextLocation = findStepLocation(doc.protocol.sections, nextPrimary);
          if (nextLocation) {
            setSelection({ type: "step", sectionId: nextLocation.sectionId, stepId: nextPrimary });
          }
          return next;
        }

        setSelection({ type: "step", sectionId, stepId });
        return [...current, stepId];
      });
      return;
    }

    setSelection({ type: "step", sectionId, stepId });
    setSelectedStepIds([stepId]);
  };

  const openProtocolEditor = () => {
    openViewMode("summary");
    setSelection({ type: "protocol" });
    setEditorModalOpen(true);
  };

  const openSectionEditor = (sectionId: string) => {
    openViewMode("summary");
    setSelection({ type: "section", sectionId });
    setSelectedSectionIds([sectionId]);
    setSelectedStepIds([]);
    clearBlockSelection();
    setEditorModalOpen(true);
  };

  const openStepEditor = (sectionId: string, stepId: string) => {
    openViewMode("step");
    setSelection({ type: "step", sectionId, stepId });
    setSelectedStepIds([stepId]);
    setSelectedSectionIds([]);
    clearBlockSelection();
    setEditorModalOpen(true);
  };

  const persistEditorDraft = useCallback(
    async (target: ActiveEditor | null, options?: { announce?: boolean }) => {
      if (!target || !activeLab || !user) return null;
      if (!target.projectId) throw new Error("Choose a project before saving.");

      const preparedDocument = normalizeEditorDocument(target.document, target.projectId);
      const targetKey = getEditorKey(target);
      setSaveState("saving");

      const { data, error } = await supabase.rpc("save_draft", {
        p_protocol_id: target.protocolId,
        p_project_id: target.projectId,
        p_document: preparedDocument,
        p_draft_id: target.draftId,
      });

      if (error) {
        setSaveState("error");
        throw error;
      }

      const nextDraftId = typeof data === "string" ? data : String(data ?? "");
      const nextDraft: DraftRecord = {
        id: nextDraftId,
        protocolId: target.protocolId,
        projectId: target.projectId,
        projectName: resolveProjectName(target.projectId),
        document: preparedDocument,
        updatedAt: nowIso(),
      };

      setEditor((current) =>
        current && getEditorKey(current) === targetKey
          ? {
              ...current,
              draftId: nextDraftId,
              document: preparedDocument,
            }
          : current
      );
      setWorkspace((current) => (current ? { ...current, drafts: upsertDraftRecord(current.drafts, nextDraft) } : current));
      setLastSavedAt(nextDraft.updatedAt);
      setSaveState("saved");
      if (options?.announce) {
        setStatus([`Draft saved to ${nextDraft.projectName}.`]);
      }
      return nextDraftId;
    },
    [activeLab, normalizeEditorDocument, resolveProjectName, supabase, user]
  );

  useEffect(() => {
    if (page !== "protocol-manager" || autosaveTick === 0 || !editor) return;

    const timer = window.setTimeout(() => {
      void persistEditorDraft(editorRef.current).catch((error) => {
        setStatus([`Could not save draft: ${errorMessage(error)}`]);
      });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [autosaveTick, editor, page, persistEditorDraft]);

  const flushActiveDraft = useCallback(async () => {
    if (!editorRef.current) return null;
    return persistEditorDraft(editorRef.current);
  }, [persistEditorDraft]);

  const importParsed = (value: unknown) => {
    const result = validateProtocolDocument(value, { mode: importMode });
    if (!result.success || !result.data) {
      setStatus([
        `Import failed (${importMode} mode).`,
        ...result.errors,
        ...result.warnings.map((warning) => `Warning: ${warning}`),
      ]);
      return;
    }

    updateDoc(
      normalizeEditorDocument(normalizeProtocolDocument(result.data), editor?.projectId ?? generalProjectId, {
        lifecycleStatus: protocolMeta.lifecycleStatus,
        validationStatus: protocolMeta.validationStatus,
        reviewStatus: displayReviewStatus,
      })
    );
    resetSelection();
    openViewMode("summary");
    setStatus([
      `Import successful (${importMode} mode).`,
      ...result.warnings.map((warning) => `Warning: ${warning}`),
    ]);
  };

  const handleDeleteSelection = () => {
    if (selection.type === "section") {
      updateDoc(deleteSection(doc, selection.sectionId));
      resetSelection();
      return;
    }

    if (selection.type === "step") {
      const stepIdsToDelete = selectedStepIds.includes(selection.stepId) ? selectedStepIds : [selection.stepId];
      updateDoc(deleteSteps(doc, stepIdsToDelete));
      resetSelection();
    }
  };

  const handleDuplicateSelection = () => {
    if (selection.type === "section") {
      updateDoc(duplicateSection(doc, selection.sectionId));
      return;
    }

    if (selection.type === "step") {
      const orderedIds = orderStepIdsByDocument(doc, selectedStepIds.includes(selection.stepId) ? selectedStepIds : [selection.stepId]);
      const duplicatedDoc = orderedIds.reduce((nextDoc, stepId) => {
        const location = findStepLocation(nextDoc.protocol.sections, stepId);
        return location ? duplicateStep(nextDoc, location.sectionId, stepId) : nextDoc;
      }, doc);
      updateDoc(duplicatedDoc);
    }
  };

  const handleDeleteSingleStep = (sectionId: string, stepId: string) => {
    updateDoc(deleteStep(doc, sectionId, stepId));
    setSelectedStepIds((current) => current.filter((id) => id !== stepId));
    clearBlockSelection();
    if (selection.type === "step" && selection.stepId === stepId) {
      setSelection({ type: "section", sectionId });
    }
  };

  const handleMoveSteps = (stepIds: string[], destinationSectionId: string, targetStepId?: string) => {
    const primaryStepId = selection.type === "step" && stepIds.includes(selection.stepId) ? selection.stepId : stepIds[0];

    setSelection({ type: "step", sectionId: destinationSectionId, stepId: primaryStepId });
    setSelectedStepIds(stepIds);
    setSelectedSectionIds([]);
    clearBlockSelection();
    updateDoc(moveStepsToSection(doc, stepIds, destinationSectionId, targetStepId));
  };

  const handleSetSelectedBlockIds = (stepId: string, blockIds: string[]) => {
    setBlockSelection({ stepId, blockIds });
  };

  const handleCutBlocks = (sectionId: string, stepId: string, blockIds: string[]) => {
    const location = findStepLocation(doc.protocol.sections, stepId);
    if (!location || blockIds.length === 0) return;

    const selectedBlocks = location.step.blocks.filter((block) => blockIds.includes(block.id));
    setBlockClipboard(cloneBlocks(selectedBlocks));
    updateDoc(removeBlocksFromStep(doc, sectionId, stepId, blockIds));
    clearBlockSelection();
    setStatus([`Cut ${selectedBlocks.length} block(s).`, "Paste them into any step using the block toolbar."]);
  };

  const handleCopyBlocks = (stepId: string, blockIds: string[]) => {
    const location = findStepLocation(doc.protocol.sections, stepId);
    if (!location || blockIds.length === 0) return;

    const selectedBlocks = location.step.blocks.filter((block) => blockIds.includes(block.id));
    setBlockClipboard(cloneBlocks(selectedBlocks));
    setStatus([`Copied ${selectedBlocks.length} block(s).`, "Paste them into any step using the block toolbar."]);
  };

  const handlePasteBlocks = (sectionId: string, stepId: string, afterBlockId?: string) => {
    if (blockClipboard.length === 0) return;
    updateDoc(pasteBlocksIntoStep(doc, sectionId, stepId, blockClipboard, afterBlockId));
    clearBlockSelection();
    setStatus([`Pasted ${blockClipboard.length} block(s).`]);
  };

  const getActiveStepIds = () => {
    if (selection.type !== "step") return [];
    return selectedStepIds.length > 0 ? selectedStepIds : [selection.stepId];
  };

  const getActiveSectionIds = () => {
    if (selection.type !== "section") return [];
    return selectedSectionIds.length > 0 ? selectedSectionIds : [selection.sectionId];
  };

  const handleCopyOutline = () => {
    if (selection.type === "step") {
      const ids = getActiveStepIds();
      const steps = collectStepsByIds(doc.protocol.sections, ids);
      if (steps.length === 0) return;
      setStepClipboard(steps);
      setSectionClipboard([]);
      setStatus([`Copied ${steps.length} step(s).`, "Paste with Ctrl/Cmd+V."]);
    } else if (selection.type === "section") {
      const ids = getActiveSectionIds();
      const sections = collectSectionsByIds(doc.protocol.sections, ids);
      if (sections.length === 0) return;
      setSectionClipboard(sections);
      setStepClipboard([]);
      setStatus([`Copied ${sections.length} section(s).`, "Paste with Ctrl/Cmd+V."]);
    }
  };

  const handleCutOutline = () => {
    if (selection.type === "step") {
      const ids = getActiveStepIds();
      const steps = collectStepsByIds(doc.protocol.sections, ids);
      if (steps.length === 0) return;
      setStepClipboard(steps);
      setSectionClipboard([]);
      updateDoc(deleteSteps(doc, ids));
      resetSelection();
      setStatus([`Cut ${steps.length} step(s).`, "Paste with Ctrl/Cmd+V."]);
    } else if (selection.type === "section") {
      const ids = getActiveSectionIds();
      const sections = collectSectionsByIds(doc.protocol.sections, ids);
      if (sections.length === 0) return;
      setSectionClipboard(sections);
      setStepClipboard([]);
      updateDoc(deleteSections(doc, ids));
      resetSelection();
      setStatus([`Cut ${sections.length} section(s).`, "Paste with Ctrl/Cmd+V."]);
    }
  };

  const handlePasteOutline = () => {
    if (stepClipboard.length > 0) {
      if (selection.type === "step") {
        updateDoc(pasteStepsIntoSection(doc, selection.sectionId, stepClipboard, selection.stepId));
      } else if (selection.type === "section") {
        updateDoc(pasteStepsIntoSection(doc, selection.sectionId, stepClipboard));
      } else {
        return;
      }
      setStatus([`Pasted ${stepClipboard.length} step(s).`]);
      return;
    }

    if (sectionClipboard.length > 0) {
      if (selection.type === "section") {
        const parent = findSectionParent(doc.protocol.sections, selection.sectionId);
        const parentId = parent ? parent.parentId : null;
        updateDoc(pasteSections(doc, parentId, sectionClipboard, selection.sectionId));
      } else {
        updateDoc(pasteSections(doc, null, sectionClipboard));
      }
      setStatus([`Pasted ${sectionClipboard.length} section(s).`]);
    }
  };

  useEffect(() => {
    if (sidebarTab !== "view" || editorModalOpen || newProtocolModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      const key = event.key.toLowerCase();
      if (key === "c") {
        if (selection.type === "step" || selection.type === "section") {
          event.preventDefault();
          handleCopyOutline();
        }
      } else if (key === "x") {
        if (selection.type === "step" || selection.type === "section") {
          event.preventDefault();
          handleCutOutline();
        }
      } else if (key === "v") {
        if (stepClipboard.length > 0 || sectionClipboard.length > 0) {
          event.preventDefault();
          handlePasteOutline();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editorModalOpen, newProtocolModalOpen, sectionClipboard.length, selection, sidebarTab, stepClipboard.length]);

  const handleProjectChange = (projectId: string) => {
    setEditor((current) =>
      current
        ? {
            ...current,
            projectId,
            document: normalizeEditorDocument(current.document, projectId),
          }
        : current
    );
    setAutosaveTick((current) => current + 1);
  };

  const handleLifecycleStatusChange = (lifecycleStatus: LifecycleStatus) => {
    updateDoc(updateProtocolMetadata(doc, { lifecycleStatus }));
  };

  const handleValidationStatusChange = (validationStatus: ValidationStatus) => {
    updateDoc(updateProtocolMetadata(doc, { validationStatus }));
  };

  const handleProtocolDescriptionChange = (description: string) => {
    updateDoc({
      ...doc,
      protocol: {
        ...doc.protocol,
        description: description.replace(/\r?\n/g, " "),
      },
    });
  };

  const openProtocolFromLibrary = async (protocolId: string) => {
    try {
      await flushActiveDraft();
    } catch {
      // ignore save failure during navigation
    }

    const protocol = findPublishedProtocol(workspace, protocolId);
    if (!protocol) return;
    setEditor(buildEditorFromPublished(protocol, findDraftByProtocol(workspace, protocolId)));
    openViewMode("summary");
    setStatus(["Protocol loaded into the VIEW workspace."]);
  };

  const openDraftFromLibrary = async (draftId: string) => {
    try {
      await flushActiveDraft();
    } catch {
      // ignore save failure during navigation
    }

    const draft = drafts.find((candidate) => candidate.id === draftId);
    if (!draft) return;
    setEditor(buildEditorFromDraft(draft));
    openViewMode("summary");
    setStatus(["Draft loaded into the VIEW workspace."]);
  };

  const handleCreateProtocol = async (mode: NewProtocolMode) => {
    try {
      await flushActiveDraft();
    } catch {
      // ignore save failure during navigation
    }

    const nextProjectId = editor?.projectId ?? generalProjectId;
    const nextDoc = normalizeEditorDocument(createProtocolForMode(mode), nextProjectId);
    setEditor({
      draftId: null,
      protocolId: null,
      projectId: nextProjectId,
      document: nextDoc,
    });
    setNewProtocolModalOpen(false);
    resetSelection();
    setEditorModalOpen(false);
    openViewMode(mode === "import-files" || mode === "import-json" ? "transfer" : "summary");
    setJsonText("");
    setStatus([
      mode === "blank"
        ? "Started a blank protocol draft."
        : mode === "template"
          ? "Loaded a template protocol draft."
          : "Started a blank protocol draft and opened Transfer.",
    ]);
  };

  const handleAddSection = () => {
    if (selection.type === "protocol") {
      updateDoc(addSection(doc, "New section"));
      return;
    }

    updateDoc(insertSectionAfter(doc, selection.sectionId, "New section"));
  };

  const handleDuplicateProtocol = async (protocolId: string) => {
    const source = findPublishedProtocol(workspace, protocolId);
    if (!source) return;

    try {
      await flushActiveDraft();
    } catch {
      // ignore save failure during navigation
    }

    setEditor({
      draftId: null,
      protocolId: null,
      projectId: source.projectId,
      document: normalizeEditorDocument(duplicateProtocolDocument(source.document), source.projectId),
    });
    openViewMode("summary");
    setStatus([`Duplicated ${source.document.protocol.title} into a new draft.`]);
  };

  const handleDeleteProtocol = async (protocolId: string, options?: { fromView?: boolean }) => {
    const target = findPublishedProtocol(workspace, protocolId);
    if (!target) return;

    const confirmed = window.confirm(`Move "${target.document.protocol.title}" to the recycle bin?`);
    if (!confirmed) return;

    try {
      await flushActiveDraft();
      const { error } = await supabase.rpc("soft_delete_protocol", { p_id: protocolId });
      if (error) throw error;
      const nextWorkspace = await refreshWorkspace();
      if (options?.fromView && nextWorkspace) {
        setEditor(chooseInitialEditor(nextWorkspace));
        setSidebarTab("library");
      }
      setStatus([`Moved ${target.document.protocol.title} to the recycle bin.`]);
    } catch (error) {
      setStatus([`Could not recycle protocol: ${errorMessage(error)}`]);
    }
  };

  const handleDiscardDraft = async () => {
    if (!editor) return;

    if (!editor.draftId) {
      if (editor.protocolId) {
        const published = findPublishedProtocol(workspace, editor.protocolId);
        if (published) {
          setEditor(buildEditorFromPublished(published));
          setStatus(["Reverted back to the published protocol."]);
        }
        return;
      }

      const confirmed = window.confirm("Discard this unsaved draft?");
      if (!confirmed) return;
      if (workspace) setEditor(chooseInitialEditor(workspace));
      setSidebarTab("library");
      setStatus(["Discarded the unsaved draft."]);
      return;
    }

    const confirmed = window.confirm("Discard this server-side draft?");
    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc("discard_draft", { p_draft_id: editor.draftId });
      if (error) throw error;

      const currentDraftId = editor.draftId;
      const linkedProtocolId = editor.protocolId;
      const nextWorkspace = await refreshWorkspace();
      setWorkspace((current) => (current ? { ...current, drafts: removeDraftRecord(current.drafts, currentDraftId) } : current));

      if (nextWorkspace) {
        if (linkedProtocolId) {
          const published = findPublishedProtocol(nextWorkspace, linkedProtocolId);
          setEditor(published ? buildEditorFromPublished(published) : chooseInitialEditor(nextWorkspace));
        } else {
          setEditor(chooseInitialEditor(nextWorkspace));
          setSidebarTab("library");
        }
      }
      setStatus(["Discarded the server draft."]);
    } catch (error) {
      setStatus([`Could not discard draft: ${errorMessage(error)}`]);
    }
  };

  const handleSubmitForReview = async () => {
    if (!editor) return;
    const project = projects.find((candidate) => candidate.id === editor.projectId);
    if (!project) {
      setStatus(["Choose a project before submitting."]);
      return;
    }

    try {
      const preparedDocument = normalizeEditorDocument(editor.document, editor.projectId, {
        reviewStatus: project.approvalRequired ? "reviewing" : "reviewed",
      });
      const target: ActiveEditor = { ...editor, document: preparedDocument };
      setEditor(target);
      const draftId = await persistEditorDraft(target);
      if (!draftId) return;

      const { error } = await supabase.rpc("submit_draft", { p_draft_id: draftId });
      if (error) throw error;

      const nextWorkspace = await refreshWorkspace();
      if (nextWorkspace) {
        if (project.approvalRequired) {
          const draft =
            nextWorkspace.drafts.find((candidate) => candidate.id === draftId) ??
            findDraftByDocumentId(nextWorkspace, preparedDocument.protocol.id);
          setEditor(draft ? buildEditorFromDraft(draft) : chooseInitialEditor(nextWorkspace));
        } else {
          const published = findPublishedByDocumentId(nextWorkspace, preparedDocument.protocol.id);
          setEditor(published ? buildEditorFromPublished(published) : chooseInitialEditor(nextWorkspace));
        }
      }

      setStatus([
        project.approvalRequired
          ? `Submitted ${preparedDocument.protocol.title} for review in ${project.name}.`
          : `Published ${preparedDocument.protocol.title} directly into ${project.name}.`,
      ]);
    } catch (error) {
      setStatus([`Could not submit draft: ${errorMessage(error)}`]);
    }
  };

  const handleRestoreProtocol = async (protocolId: string) => {
    try {
      const { error } = await supabase.rpc("restore_protocol", { p_id: protocolId });
      if (error) throw error;
      await refreshWorkspace();
      setStatus(["Restored protocol from the recycle bin."]);
    } catch (error) {
      setStatus([`Could not restore protocol: ${errorMessage(error)}`]);
    }
  };

  const handlePermanentDelete = async (protocolId: string) => {
    const confirmed = window.confirm("Permanently delete this protocol?");
    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc("permanent_delete_protocol", { p_id: protocolId });
      if (error) throw error;
      await refreshWorkspace();
      setStatus(["Permanently deleted the protocol."]);
    } catch (error) {
      setStatus([`Could not permanently delete protocol: ${errorMessage(error)}`]);
    }
  };

  const handleApproveSubmission = async (submission: SubmissionRecord) => {
    const comment = window.prompt(`Approve "${submission.document.protocol.title}" with an optional comment:`, submission.reviewComment ?? "");
    if (comment === null) return;

    try {
      const { error } = await supabase.rpc("approve_submission", {
        p_submission_id: submission.id,
        p_comment: comment.trim() || null,
      });
      if (error) throw error;
      const nextWorkspace = await refreshWorkspace();
      if (nextWorkspace) {
        const published = findPublishedByDocumentId(nextWorkspace, submission.document.protocol.id);
        if (published) {
          setEditor(buildEditorFromPublished(published, findDraftByProtocol(nextWorkspace, published.id)));
        }
      }
      setStatus([`Approved ${submission.document.protocol.title}.`]);
    } catch (error) {
      setStatus([`Could not approve submission: ${errorMessage(error)}`]);
    }
  };

  const handleRejectSubmission = async (submission: SubmissionRecord) => {
    const comment = window.prompt(`Reject "${submission.document.protocol.title}" with a review comment:`, submission.reviewComment ?? "");
    if (comment === null) return;

    try {
      const { error } = await supabase.rpc("reject_submission", {
        p_submission_id: submission.id,
        p_comment: comment.trim() || null,
      });
      if (error) throw error;
      await refreshWorkspace();
      setStatus([`Rejected ${submission.document.protocol.title}.`]);
    } catch (error) {
      setStatus([`Could not reject submission: ${errorMessage(error)}`]);
    }
  };

  const handleWithdrawSubmission = async (submission: SubmissionRecord) => {
    const confirmed = window.confirm(`Withdraw "${submission.document.protocol.title}" from review?`);
    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc("withdraw_submission", { p_submission_id: submission.id });
      if (error) throw error;
      await refreshWorkspace();
      setStatus([`Withdrew ${submission.document.protocol.title} from review.`]);
    } catch (error) {
      setStatus([`Could not withdraw submission: ${errorMessage(error)}`]);
    }
  };

  const handleOpenSubmission = async (submission: SubmissionRecord) => {
    try {
      await flushActiveDraft();
    } catch {
      // ignore save failure during navigation
    }

    const draft =
      drafts.find((candidate) => candidate.protocolId === submission.protocolId) ??
      findDraftByDocumentId(workspace, submission.document.protocol.id);
    if (draft) {
      setEditor(buildEditorFromDraft(draft));
    } else {
      const published = submission.protocolId ? findPublishedProtocol(workspace, submission.protocolId) : null;
      if (published) {
        setEditor(buildEditorFromPublished(published, findDraftByProtocol(workspace, submission.protocolId)));
      } else {
        setEditor({
          draftId: null,
          protocolId: submission.protocolId,
          projectId: submission.projectId,
          document: submission.document,
        });
      }
    }
    openViewMode("summary");
  };

  const handleImportLegacyLibrary = async () => {
    if (!generalProjectId) {
      setStatus(["Could not find the General project for migration."]);
      return;
    }
    if (legacyProtocols.length === 0) {
      setMigrationDismissed(true);
      return;
    }

    setMigrationImporting(true);
    try {
      for (const protocol of legacyProtocols) {
        const prepared = normalizeEditorDocument(protocol, generalProjectId, { reviewStatus: "reviewed" });
        const { data, error } = await supabase.rpc("save_draft", {
          p_protocol_id: null,
          p_project_id: generalProjectId,
          p_document: prepared,
          p_draft_id: null,
        });
        if (error) throw error;
        const draftId = typeof data === "string" ? data : String(data ?? "");
        const submitResult = await supabase.rpc("submit_draft", { p_draft_id: draftId });
        if (submitResult.error) throw submitResult.error;
      }

      clearLegacyLibraryStorage();
      setMigrationDismissed(true);
      await refreshWorkspace();
      setStatus([`Migrated ${legacyProtocols.length} local protocol(s) into the General project.`]);
    } catch (error) {
      setStatus([`Could not migrate local protocols: ${errorMessage(error)}`]);
    } finally {
      setMigrationImporting(false);
    }
  };

  const startOutlineResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsResizingOutline(true);
  };

  useEffect(() => {
    if (!isResizingOutline) return;

    const handlePointerMove = (event: MouseEvent) => {
      const container = mainGridRef.current;
      if (!container) return;

      const bounds = container.getBoundingClientRect();
      const nextWidth = Math.min(Math.max(event.clientX - bounds.left, 300), Math.max(300, bounds.width - 420));
      setOutlineWidth(nextWidth);
    };

    const stopResize = () => setIsResizingOutline(false);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", stopResize);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, [isResizingOutline]);

  const downloadTextFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPreview = () => {
    const previewMarkup = previewRef.current?.innerHTML;
    if (!previewMarkup) {
      setStatus(["Preview content is not ready for printing yet."]);
      return;
    }

    const printWindow = window.open("", "_blank", "width=1100,height=900");
    if (!printWindow) {
      setStatus(["Could not open the print window. Please allow pop-ups and try again."]);
      return;
    }

    printWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(doc.protocol.title)} - Print</title>
    <style>${PRINT_WINDOW_STYLES}</style>
  </head>
  <body class="print-window-body">
    <main class="print-document">
      ${previewMarkup}
    </main>
  </body>
</html>`);
    printWindow.document.close();
    setStatus(["Opened a print-ready document in a separate window. Use the browser dialog to save as PDF."]);
  };

  const openProtocolManager = () => {
    window.location.href = buildPageUrl("protocol-manager/");
  };

  const openModuleHome = () => {
    window.location.href = buildPageUrl("");
  };

  const handleImportText = () => {
    const parsed = safeJsonParse<unknown>(jsonText);
    if (!parsed.ok) {
      setStatus([`Import failed: ${parsed.error}`]);
      return;
    }
    importParsed(parsed.value);
  };

  const handleFileUpload = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = safeJsonParse<unknown>(text);
      if (!parsed.ok) {
        setStatus([`Import failed: ${parsed.error}`]);
        return;
      }
      importParsed(parsed.value);
    } catch (error) {
      setStatus([`Could not read file: ${errorMessage(error)}`]);
    }
  };

  const migrationBanner =
    legacyProtocols.length > 0 && !migrationDismissed ? (
      <article className="protocol-content-card protocol-callout protocol-callout-warning">
        <div className="protocol-card-heading">
          <h3>Migration Ready</h3>
          <span>{legacyProtocols.length} local protocol(s) detected</span>
        </div>
        <p className="protocol-observation-copy">
          We found browser-local protocols from the pre-Supabase build. Import them into this lab's General project to make them visible in the cloud-backed library.
        </p>
        <div className="protocol-inline-actions">
          <button type="button" onClick={() => void handleImportLegacyLibrary()} disabled={migrationImporting}>
            {migrationImporting ? "Importing..." : "Import into General"}
          </button>
          <button className="protocol-secondary-action" type="button" onClick={() => setMigrationDismissed(true)} disabled={migrationImporting}>
            Dismiss
          </button>
        </div>
      </article>
    ) : null;

  const homeView = (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <div className="dashboard-brand">
          <div className="dashboard-brand-mark">ILM</div>
          <div>
            <p className="dashboard-brand-subtitle">Integrated Lab Manager</p>
            <h1 className="dashboard-brand-title">Control Surface</h1>
          </div>
        </div>

        <nav className="dashboard-nav" aria-label="Primary module navigation">
          <a className="active" href={buildPageUrl("")}>
            Modules
          </a>
          <a href={buildPageUrl("protocol-manager/")}>Protocol Manager</a>
          <a href="#roadmap">Roadmap</a>
        </nav>

        <div className="dashboard-actions">
          <AppSwitcher currentApp="home" baseUrl={APP_BASE_URL} />
          <div className="dashboard-connection-badge">
            <span>Workspace</span>
            <strong>{MODULE_CARDS.filter((module) => module.status === "Available").length} active module(s)</strong>
          </div>
        </div>
      </header>

      <section className="dashboard-hero">
        <div>
          <h1>Protocol Operations Reframed Around Portfolio Visibility.</h1>
          <div className="dashboard-hero-meta">
            <span className="dashboard-status-live">1 live module</span>
            <span>Library-centric navigation</span>
            <span>Structured protocol editing</span>
          </div>
        </div>

        <div className="dashboard-hero-actions">
          <span>Protocol workspace ready</span>
          <button className="protocol-primary-action" type="button" onClick={openProtocolManager}>
            Open Protocol Manager
          </button>
        </div>
      </section>

      <section className="module-grid">
        {MODULE_CARDS.map((module) => (
          <article className={`module-card ${module.status === "Available" ? "live" : ""}`} key={module.id}>
            <div className="module-card-header">
              <h2>{module.title}</h2>
              <span className={module.status === "Available" ? "ilm-tag ilm-tag-success" : "ilm-tag ilm-tag-neutral"}>{module.status}</span>
            </div>
            <p>{module.description}</p>
            <div className="module-toolbar">
              <button type="button" onClick={module.id === "protocol-manager" ? openProtocolManager : undefined} disabled={module.id !== "protocol-manager"}>
                {module.actionLabel}
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );

  const viewWorkspace = (
    <div
      className={isResizingOutline ? "protocol-main-grid is-resizing" : "protocol-main-grid"}
      ref={mainGridRef}
      style={{ gridTemplateColumns: `${outlineWidth}px 10px minmax(0, 1fr)` }}
    >
      <aside className="protocol-outline-pane">
        <div className="protocol-outline-header">
          <div>
            <h2>{doc.protocol.title}</h2>
            <p className="helper-text">Project: {resolveProjectName(editor?.projectId ?? generalProjectId)}</p>
          </div>
          <button type="button" onClick={resetSelection}>
            Clear
          </button>
        </div>

        <div className="protocol-outline-toolbar">
          <button type="button" onClick={handleAddSection}>
            Add section
          </button>
          <button type="button" onClick={() => selection.type === "section" && updateDoc(addSection(doc, "New subsection", selection.sectionId))} disabled={selection.type !== "section"}>
            Add subsection
          </button>
          <button type="button" onClick={() => selection.type === "section" && updateDoc(addStep(doc, selection.sectionId, "New step"))} disabled={selection.type !== "section"}>
            Add step
          </button>
          <button type="button" onClick={handleDuplicateSelection} disabled={selection.type === "protocol"}>
            Duplicate
          </button>
          <button type="button" onClick={handleDeleteSelection} disabled={selection.type === "protocol"}>
            Delete
          </button>
          <button
            type="button"
            onClick={() => selection.type !== "protocol" && updateDoc(selection.type === "section" ? moveSection(doc, selection.sectionId, "up") : moveStep(doc, selection.sectionId, selection.stepId, "up"))}
            disabled={selection.type === "protocol"}
          >
            Move up
          </button>
          <button
            type="button"
            onClick={() => selection.type !== "protocol" && updateDoc(selection.type === "section" ? moveSection(doc, selection.sectionId, "down") : moveStep(doc, selection.sectionId, selection.stepId, "down"))}
            disabled={selection.type === "protocol"}
          >
            Move down
          </button>
        </div>

        <div className="protocol-outline-scroll">
          <OutlinePanel
            sections={doc.protocol.sections}
            selection={selection}
            selectedStepIds={selectedStepIds}
            selectedSectionIds={selectedSectionIds}
            onSelectProtocol={selectProtocol}
            onOpenProtocol={openProtocolEditor}
            onSelectSection={selectSection}
            onOpenSection={openSectionEditor}
            onSelectStep={selectStep}
            onOpenStep={openStepEditor}
            onClearOutlineSelection={resetSelection}
            onReorderSection={(parentSectionId, sectionIds, targetSectionId) => updateDoc(reorderSections(doc, parentSectionId, sectionIds, targetSectionId))}
            onMoveSteps={handleMoveSteps}
            onAddSubsection={(sectionId) => updateDoc(addSection(doc, "New subsection", sectionId))}
            onAddStep={(sectionId) => updateDoc(addStep(doc, sectionId, "New step"))}
            onDuplicateSection={(sectionId) => updateDoc(duplicateSection(doc, sectionId))}
            onDeleteSection={(sectionId) => {
              updateDoc(deleteSection(doc, sectionId));
              resetSelection();
            }}
            onDuplicateStep={(sectionId, stepId) => updateDoc(duplicateStep(doc, sectionId, stepId))}
            onDeleteStep={handleDeleteSingleStep}
          />
        </div>
      </aside>

      <div className="protocol-resize-handle" onMouseDown={startOutlineResize} role="separator" aria-orientation="vertical" aria-label="Resize outline panel" />

      <section className="protocol-workspace">
        {migrationBanner}
        {workspaceError ? (
          <article className="protocol-content-card protocol-callout protocol-callout-warning">
            <div className="protocol-card-heading">
              <h3>Cloud Loading Error</h3>
              <span>Supabase</span>
            </div>
            <p className="protocol-observation-copy">{workspaceError}</p>
            <div className="protocol-inline-actions">
              <button type="button" onClick={() => void refreshWorkspace()}>
                Retry
              </button>
            </div>
          </article>
        ) : null}

        <header className="protocol-workspace-header">
          <div>
            <h1>{doc.protocol.title}</h1>
            <div className="protocol-workspace-meta">
              <span className={`protocol-status-badge protocol-status-badge-${getStatusTone(protocolMeta.lifecycleStatus)}`}>{protocolMeta.lifecycleStatus.toUpperCase()}</span>
              <span className={`protocol-status-badge protocol-status-badge-${getStatusTone(displayReviewStatus)}`}>{displayReviewStatus.toUpperCase()}</span>
              <span className={`protocol-status-badge protocol-status-badge-${getStatusTone(protocolMeta.validationStatus)}`}>{protocolMeta.validationStatus.toUpperCase()}</span>
              <span>{resolveProjectName(editor?.projectId ?? generalProjectId)}</span>
              <span>{sectionCount} sections</span>
              <span>{stepCount} steps</span>
              <span>{activeProtocolLabel}</span>
              <span>{editor?.draftId || !editor?.protocolId ? "Working draft" : "Published protocol"}</span>
              <span>{saveStatusLabel}</span>
            </div>
          </div>

          <div className="protocol-workspace-actions">
            <button type="button" onClick={() => void flushActiveDraft()} disabled={!editor}>
              Save draft
            </button>
            <button className="protocol-primary-action" type="button" onClick={() => void handleSubmitForReview()} disabled={!editor?.projectId}>
              {activeProject?.approvalRequired === false ? "Publish to General" : "Submit for review"}
            </button>
            <button type="button" onClick={() => void handleDiscardDraft()} disabled={!editor}>
              Discard draft
            </button>
            <button type="button" onClick={() => setEditorModalOpen(true)} disabled={!editor}>
              {openEditorLabel}
            </button>
            {editor?.protocolId ? (
              <button className="protocol-danger-action" type="button" onClick={() => void handleDeleteProtocol(editor.protocolId as string, { fromView: true })}>
                Move to recycle bin
              </button>
            ) : null}
            <button type="button" onClick={openModuleHome}>
              Back to dashboard
            </button>
          </div>
        </header>

        {viewMode === "summary" ? (
          <div className="protocol-summary-view">
            <article className="protocol-content-card protocol-content-card-accent protocol-content-card-hero">
              <div className="protocol-card-heading">
                <h3>Draft Workflow</h3>
                <span>Project assignment, autosave, and review routing</span>
              </div>
              <div className="protocol-form-grid protocol-form-grid-wide">
                <label className="protocol-project-field">
                  Project
                  <select className="field" value={editor?.projectId ?? ""} onChange={(event) => handleProjectChange(event.target.value)} disabled={projects.length === 0}>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                        {project.approvalRequired ? " - review required" : " - auto publish"}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="protocol-switch-row">
                  <div>
                    <strong>Archived</strong>
                    <span>{protocolMeta.lifecycleStatus === "archived" ? "Hidden from active operations." : "Included in active operations."}</span>
                  </div>
                  <span className="protocol-switch-control">
                    <input
                      type="checkbox"
                      checked={protocolMeta.lifecycleStatus === "archived"}
                      onChange={(event) => handleLifecycleStatusChange(event.target.checked ? "archived" : "active")}
                    />
                    <span className="protocol-switch-slider" aria-hidden="true" />
                  </span>
                </label>

                <label className="protocol-switch-row">
                  <div>
                    <strong>Validated</strong>
                    <span>{protocolMeta.validationStatus === "validated" ? "Validation is complete." : "Validation is still proposed."}</span>
                  </div>
                  <span className="protocol-switch-control">
                    <input
                      type="checkbox"
                      checked={protocolMeta.validationStatus === "validated"}
                      onChange={(event) => handleValidationStatusChange(event.target.checked ? "validated" : "proposed")}
                    />
                    <span className="protocol-switch-slider" aria-hidden="true" />
                  </span>
                </label>

                <div className="protocol-switch-row">
                  <div>
                    <strong>Draft state</strong>
                    <span>{editor?.draftId ? `Saved in Supabase ${formatRelativeTime(lastSavedAt)}.` : "No server draft yet. The next save creates one."}</span>
                  </div>
                  <span className={`protocol-status-tag protocol-status-tag-${getStatusTone(saveState === "error" ? "withdrawn" : displayReviewStatus)}`}>{saveStatusLabel}</span>
                </div>

                <div className="protocol-switch-row">
                  <div>
                    <strong>Submission route</strong>
                    <span>
                      {activeProject?.approvalRequired === false
                        ? "General publishes immediately after submit."
                        : "This project freezes a submission and routes it to project leads."}
                    </span>
                  </div>
                  <span className={`protocol-status-tag protocol-status-tag-${getStatusTone(activeProject?.approvalRequired === false ? "approved" : "pending")}`}>
                    {activeProject?.approvalRequired === false ? "auto publish" : "review gate"}
                  </span>
                </div>
              </div>
            </article>

            <article className="protocol-content-card">
              <div className="protocol-card-heading">
                <h3>Portfolio Snapshot</h3>
                <span>{publishedProtocols.length} published protocol(s) in this lab</span>
              </div>
              <div className="protocol-summary-grid protocol-portfolio-grid">
                <div className="protocol-portfolio-project">
                  <span>Project</span>
                  <strong>{resolveProjectName(editor?.projectId ?? generalProjectId)}</strong>
                  <small>Current project grouping</small>
                </div>
                <div className={`protocol-status-panel protocol-status-panel-${getStatusTone(displayReviewStatus)}`}>
                  <span>Reviewed / reviewing</span>
                  <strong>
                    {totalReviewed} / {totalReviewing}
                  </strong>
                  <small>Workspace review split</small>
                </div>
                <div className={`protocol-status-panel protocol-status-panel-${getStatusTone(protocolMeta.lifecycleStatus)}`}>
                  <span>Active / archived</span>
                  <strong>
                    {totalActive} / {totalArchived}
                  </strong>
                  <small>Published lifecycle split</small>
                </div>
                <div className={`protocol-status-panel protocol-status-panel-${getStatusTone(protocolMeta.validationStatus)}`}>
                  <span>Validated / proposed</span>
                  <strong>
                    {totalValidated} / {totalProposed}
                  </strong>
                  <small>Published validation split</small>
                </div>
              </div>
            </article>

            <article className="protocol-content-card">
              <div className="protocol-card-heading">
                <h3>Current Protocol</h3>
                <span>{doc.protocol.id}</span>
              </div>
              <label className="protocol-inline-field">
                One-line description
                <input
                  className="field"
                  value={doc.protocol.description ?? ""}
                  maxLength={160}
                  placeholder="Add a short one-line description for this protocol"
                  onChange={(event) => handleProtocolDescriptionChange(event.target.value)}
                />
              </label>
              <div className="protocol-summary-grid">
                <div>
                  <span>Sections</span>
                  <strong>{sectionCount}</strong>
                  <small>All nested sections included</small>
                </div>
                <div>
                  <span>Steps</span>
                  <strong>{stepCount}</strong>
                  <small>All nested steps included</small>
                </div>
                <div>
                  <span>Workflow</span>
                  <strong>{displayReviewStatus}</strong>
                  <small>Derived from the review queue</small>
                </div>
                <div>
                  <span>Draft location</span>
                  <strong>{editor?.draftId ? "Server draft" : editor?.protocolId ? "Published copy" : "Local only"}</strong>
                  <small>Where your working copy currently lives</small>
                </div>
              </div>
            </article>

            {pendingSubmissions.length > 0 ? (
              <article className="protocol-content-card">
                <div className="protocol-card-heading">
                  <h3>Pending Review Queue</h3>
                  <span>{pendingSubmissions.length} submission(s) awaiting action</span>
                </div>
                <div className="protocol-compact-list">
                  {pendingSubmissions.slice(0, 5).map((submission) => (
                    <div className="protocol-compact-row" key={submission.id}>
                      <div>
                        <strong>{submission.document.protocol.title}</strong>
                        <span>{submission.projectName}</span>
                        <span>Submitted by {submission.submitterLabel}</span>
                      </div>
                      <div className="protocol-inline-actions">
                        <button type="button" onClick={() => void handleOpenSubmission(submission)}>
                          Open
                        </button>
                        {canReviewProject(submission.projectId) ? (
                          <>
                            <button type="button" onClick={() => void handleApproveSubmission(submission)}>
                              Approve
                            </button>
                            <button className="protocol-danger-action" type="button" onClick={() => void handleRejectSubmission(submission)}>
                              Reject
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}
          </div>
        ) : viewMode === "step" ? (
          <section className="protocol-tab-panel" aria-label="Focused step view">
            <div className="protocol-card-heading">
              <h3>{singleStepSelected && focusedStep ? focusedStep.title : "Select a single step from the outline"}</h3>
              <span>{singleStepSelected && focusedSection ? focusedSection.title : "Step focus mode"}</span>
            </div>
            {singleStepSelected && focusedStep ? (
              <div className="editor-stack">
                <div className="card">
                  <div className="card-header">
                    <strong>{focusedStep.title}</strong>
                    <span>{formatStepKind(focusedStep.stepKind)}</span>
                  </div>
                  <p className="helper-text">{getQuickSummaryText(focusedStep)}</p>
                  <div className="protocol-summary-grid">
                    <div>
                      <span>Section</span>
                      <strong>{focusedSection?.title ?? "Unknown section"}</strong>
                      <small>Current parent section</small>
                    </div>
                    <div>
                      <span>Blocks</span>
                      <strong>{focusedStep.blocks.length}</strong>
                      <small>Total content blocks</small>
                    </div>
                    <div>
                      <span>Special blocks</span>
                      <strong>{countSpecialBlocks(focusedStep)}</strong>
                      <small>Non-paragraph content blocks</small>
                    </div>
                    <div>
                      <span>Project</span>
                      <strong>{resolveProjectName(editor?.projectId ?? generalProjectId)}</strong>
                      <small>Current protocol project</small>
                    </div>
                  </div>
                </div>

                {focusedStep.blocks.map((block) => (
                  <div className="card" key={block.id}>
                    <div className="card-header">
                      <strong>{formatBlockType(block.type)}</strong>
                      <span>{block.id}</span>
                    </div>
                    <p className="helper-text">{getBlockSummary(block)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="protocol-observation-copy">Select exactly one step from the outline to inspect it here.</p>
            )}
          </section>
        ) : viewMode === "preview" ? (
          <section className="protocol-tab-panel" aria-label="Preview and print workspace">
            <div className="protocol-card-heading">
              <h3>Rendered Preview</h3>
              <span>Print-ready protocol rendering</span>
            </div>
            <div className="protocol-inline-actions">
              <button type="button" onClick={handlePrintPreview}>
                Export PDF / Print
              </button>
            </div>
            <div className="print-surface protocol-preview-surface" ref={previewRef}>
              <PreviewPanel doc={doc} />
            </div>
          </section>
        ) : (
          <section className="protocol-tab-panel" aria-label="Transfer workspace">
            <div className="protocol-card-heading">
              <h3>Transfer</h3>
              <span>Import and export this draft as structured JSON</span>
            </div>
            <ImportExportPanel
              importMode={importMode}
              setImportMode={setImportMode}
              jsonText={jsonText}
              setJsonText={setJsonText}
              onImportText={handleImportText}
              onFileUpload={(file) => void handleFileUpload(file)}
              onCopyExport={() => {
                void navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
                setStatus(["Copied protocol JSON to the clipboard."]);
              }}
              onDownloadExport={() => downloadTextFile(`${doc.protocol.title || "protocol"}.json`, JSON.stringify(doc, null, 2))}
              onCopyAiInstructions={() => {
                void navigator.clipboard.writeText(AI_IMPORT_INSTRUCTIONS_TEXT);
                setStatus(["Copied AI import instructions to the clipboard."]);
              }}
              onDownloadTemplate={() => downloadTextFile("protocol-template.json", JSON.stringify(createProtocolForMode("template"), null, 2))}
              status={status}
            />
          </section>
        )}
      </section>
    </div>
  );

  const libraryAndOverview = (
    <section className="protocol-main-panel">
      <header className="protocol-page-header">
        <div>
          <p className="protocol-page-kicker">
            {sidebarTab === "overview" ? "Portfolio overview" : sidebarTab === "library" ? "Published library" : sidebarTab === "reviews" ? "Review queue" : "Recycle bin"}
          </p>
          <h1>{sidebarTab === "overview" ? "OVERVIEW" : sidebarTab === "library" ? "LIBRARY" : sidebarTab === "reviews" ? "REVIEWS" : "RECYCLE BIN"}</h1>
          <p className="hero-subtitle">
            {sidebarTab === "overview"
              ? "Track published protocols, server-side drafts, review traffic, and deleted inventory across the active lab."
              : sidebarTab === "library"
                ? "Browse the published protocol inventory, see which items already have drafts, and jump any record straight into VIEW."
                : sidebarTab === "reviews"
                  ? "Review pending submissions, withdraw your own requests, and reopen draft context when you need to keep editing."
                  : "Restore recently deleted protocols or permanently purge rows you no longer need."}
          </p>
        </div>

        <div className="protocol-workspace-meta">
          <span>{totalProjects} project(s)</span>
          <span>{totalProtocols} protocol(s)</span>
          <span>{totalActive} active</span>
          <span>{drafts.length} draft(s)</span>
        </div>
      </header>

      {migrationBanner}

      {workspaceLoading && !workspace ? (
        <article className="protocol-content-card protocol-content-card-accent">
          <div className="protocol-card-heading">
            <h3>Loading Workspace</h3>
            <span>{activeLab?.name ?? "Current lab"}</span>
          </div>
          <p className="protocol-observation-copy">Fetching projects, published protocols, drafts, submissions, and recycle-bin rows from Supabase.</p>
        </article>
      ) : sidebarTab === "overview" ? (
        <div className="protocol-summary-view">
          <article className="protocol-content-card protocol-content-card-accent protocol-content-card-hero">
            <div className="protocol-card-heading">
              <h3>Workspace Totals</h3>
              <span>Across every published protocol</span>
            </div>
            <div className="protocol-summary-grid">
              <div>
                <span>Projects</span>
                <strong>{totalProjects}</strong>
                <small>Distinct project buckets</small>
              </div>
              <div>
                <span>Protocols</span>
                <strong>{totalProtocols}</strong>
                <small>Published library size</small>
              </div>
              <div>
                <span>Reviewed / reviewing</span>
                <strong>
                  {totalReviewed} / {totalReviewing}
                </strong>
                <small>Review queue split</small>
              </div>
              <div>
                <span>Validated / proposed</span>
                <strong>
                  {totalValidated} / {totalProposed}
                </strong>
                <small>Validation maturity</small>
              </div>
            </div>
          </article>

          <article className="protocol-content-card">
            <div className="protocol-card-heading">
              <h3>Drafts And Queue</h3>
              <span>Server-side drafts + submissions</span>
            </div>
            <div className="protocol-summary-grid">
              <div>
                <span>Drafts</span>
                <strong>{drafts.length}</strong>
                <small>Private working copies in Supabase</small>
              </div>
              <div>
                <span>Pending submissions</span>
                <strong>{pendingSubmissions.length}</strong>
                <small>Frozen snapshots awaiting review</small>
              </div>
              <div>
                <span>Reviewable now</span>
                <strong>{pendingSubmissions.filter((submission) => canReviewProject(submission.projectId)).length}</strong>
                <small>Items you can approve or reject</small>
              </div>
              <div>
                <span>Recycle bin</span>
                <strong>{deletedProtocols.length}</strong>
                <small>Soft-deleted rows retained for 30 days</small>
              </div>
            </div>
          </article>

          {projectGroups.map((group) => (
            <article className="protocol-content-card" key={group.project}>
              <div className="protocol-card-heading">
                <h3>{group.project}</h3>
                <span>{group.protocols.length} protocol(s)</span>
              </div>
              <div className="protocol-summary-grid">
                <div>
                  <span>Reviewed / reviewing</span>
                  <strong>
                    {group.reviewed} / {group.reviewing}
                  </strong>
                  <small>Review queue split</small>
                </div>
                <div>
                  <span>Active / archived</span>
                  <strong>
                    {group.active} / {group.archived}
                  </strong>
                  <small>Lifecycle split</small>
                </div>
                <div>
                  <span>Validated / proposed</span>
                  <strong>
                    {group.validated} / {group.proposed}
                  </strong>
                  <small>Validation split</small>
                </div>
                <div>
                  <span>Lead protocol</span>
                  <strong>{group.protocols[0]?.document.protocol.title ?? "None"}</strong>
                  <small>First published protocol in this project</small>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : sidebarTab === "library" ? (
        <div className="protocol-library-grid">
          <article className="protocol-content-card">
            <div className="protocol-card-heading">
              <h3>My Drafts</h3>
              <span>{drafts.length} server-side draft(s)</span>
            </div>
            {drafts.length === 0 ? (
              <p className="protocol-observation-copy">No drafts yet. Open a published protocol or create a new one to start a private working copy.</p>
            ) : (
              <div className="protocol-compact-list">
                {drafts.map((draft) => (
                  <div className="protocol-compact-row" key={draft.id}>
                    <div>
                      <strong>{draft.document.protocol.title}</strong>
                      <span>{draft.projectName}</span>
                      <span>{draft.protocolId ? "Linked to published protocol" : "New protocol draft"}</span>
                    </div>
                    <div className="protocol-compact-meta">
                      <span>{formatRelativeTime(draft.updatedAt)}</span>
                      <div className="protocol-inline-actions">
                        <button type="button" onClick={() => void openDraftFromLibrary(draft.id)}>
                          Open draft
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          {projectGroups.map((group) => (
            <article className="protocol-content-card" key={group.project}>
              <div className="protocol-card-heading">
                <h3>{group.project}</h3>
                <span>{group.protocols.length} protocol(s)</span>
              </div>
              <div className="protocol-summary-grid">
                <div>
                  <span>Reviewed / reviewing</span>
                  <strong>
                    {group.reviewed} / {group.reviewing}
                  </strong>
                  <small>Status across this project</small>
                </div>
                <div>
                  <span>Active / archived</span>
                  <strong>
                    {group.active} / {group.archived}
                  </strong>
                  <small>Lifecycle balance</small>
                </div>
                <div>
                  <span>Validated / proposed</span>
                  <strong>
                    {group.validated} / {group.proposed}
                  </strong>
                  <small>Validation mix</small>
                </div>
              </div>

              <div className="protocol-compact-list">
                {group.protocols.map((protocol) => {
                  const metadata = getProtocolMetadata(protocol.document);
                  const draft = drafts.find((candidate) => candidate.protocolId === protocol.id);
                  const protocolPendingSubmissions = pendingSubmissions.filter((submission) => submission.protocolId === protocol.id);
                  return (
                    <article className="protocol-library-card" key={protocol.id}>
                      <button className="protocol-library-card-main" type="button" onClick={() => void openProtocolFromLibrary(protocol.id)}>
                        <div>
                          <strong>{protocol.document.protocol.title}</strong>
                          <span>{protocol.document.protocol.description || "No description yet."}</span>
                        </div>
                        <div className="protocol-library-statuses">
                          <span className={`protocol-status-tag protocol-status-tag-${getStatusTone(getProtocolReviewState(protocol, pendingSubmissions))}`}>
                            {getProtocolReviewState(protocol, pendingSubmissions)}
                          </span>
                          <span className={`protocol-status-tag protocol-status-tag-${getStatusTone(metadata.lifecycleStatus)}`}>{metadata.lifecycleStatus}</span>
                          <span className={`protocol-status-tag protocol-status-tag-${getStatusTone(metadata.validationStatus)}`}>{metadata.validationStatus}</span>
                          {draft ? <span className={`protocol-status-tag protocol-status-tag-${getStatusTone("draft")}`}>draft</span> : null}
                          {protocolPendingSubmissions.length > 0 ? (
                            <span className={`protocol-status-tag protocol-status-tag-${getStatusTone("pending")}`}>{protocolPendingSubmissions.length} pending</span>
                          ) : null}
                        </div>
                      </button>
                      <div className="protocol-library-card-actions">
                        <button className="protocol-inline-action" type="button" onClick={() => void openProtocolFromLibrary(protocol.id)}>
                          {draft ? "Open draft" : "Open"}
                        </button>
                        <button className="protocol-inline-action" type="button" onClick={() => void handleDuplicateProtocol(protocol.id)}>
                          Duplicate
                        </button>
                        <button className="protocol-inline-action protocol-danger-action" type="button" onClick={() => void handleDeleteProtocol(protocol.id)}>
                          Recycle
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : sidebarTab === "reviews" ? (
        <div className="protocol-library-grid">
          {submissions.length === 0 ? (
            <article className="protocol-content-card">
              <div className="protocol-card-heading">
                <h3>No Review Traffic Yet</h3>
                <span>Submissions appear here after the first review-gated send</span>
              </div>
              <p className="protocol-observation-copy">Your own submissions and any queue items you can review will show up here.</p>
            </article>
          ) : (
            submissions.map((submission) => (
              <article className="protocol-content-card" key={submission.id}>
                <div className="protocol-card-heading">
                  <h3>{submission.document.protocol.title}</h3>
                  <span className={`protocol-status-tag protocol-status-tag-${getStatusTone(submission.status)}`}>{submission.status}</span>
                </div>
                <div className="protocol-summary-grid">
                  <div>
                    <span>Project</span>
                    <strong>{submission.projectName}</strong>
                    <small>Submission destination</small>
                  </div>
                  <div>
                    <span>Submitter</span>
                    <strong>{submission.submitterLabel}</strong>
                    <small>Visible via RLS</small>
                  </div>
                  <div>
                    <span>Submitted</span>
                    <strong>{formatRelativeTime(submission.submittedAt)}</strong>
                    <small>{submission.submittedAt}</small>
                  </div>
                  <div>
                    <span>Reviewed</span>
                    <strong>{submission.reviewedAt ? formatRelativeTime(submission.reviewedAt) : "Not yet"}</strong>
                    <small>{submission.reviewComment || "No review comment yet."}</small>
                  </div>
                </div>
                <div className="protocol-inline-actions">
                  <button type="button" onClick={() => void handleOpenSubmission(submission)}>
                    Open
                  </button>
                  {submission.status === "pending" && canReviewProject(submission.projectId) ? (
                    <>
                      <button type="button" onClick={() => void handleApproveSubmission(submission)}>
                        Approve
                      </button>
                      <button className="protocol-danger-action" type="button" onClick={() => void handleRejectSubmission(submission)}>
                        Reject
                      </button>
                    </>
                  ) : null}
                  {submission.status === "pending" && submission.submitterId === user?.id ? (
                    <button type="button" onClick={() => void handleWithdrawSubmission(submission)}>
                      Withdraw
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="protocol-library-grid">
          {deletedProtocols.length === 0 ? (
            <article className="protocol-content-card">
              <div className="protocol-card-heading">
                <h3>Recycle Bin Empty</h3>
                <span>No soft-deleted protocols in this lab</span>
              </div>
              <p className="protocol-observation-copy">Protocols moved here stay restorable for 30 days before they need a permanent purge.</p>
            </article>
          ) : (
            deletedProtocols.map((protocol) => (
              <article className="protocol-content-card" key={protocol.id}>
                <div className="protocol-card-heading">
                  <h3>{protocol.document.protocol.title}</h3>
                  <span>{protocol.projectName}</span>
                </div>
                <div className="protocol-summary-grid">
                  <div>
                    <span>Deleted</span>
                    <strong>{formatRelativeTime(protocol.deletedAt)}</strong>
                    <small>{protocol.deletedAt ?? "Unknown timestamp"}</small>
                  </div>
                  <div>
                    <span>Sections</span>
                    <strong>{countSections(protocol.document.protocol.sections)}</strong>
                    <small>Current document payload</small>
                  </div>
                  <div>
                    <span>Steps</span>
                    <strong>{countSteps(protocol.document.protocol.sections)}</strong>
                    <small>Structured procedure content</small>
                  </div>
                  <div>
                    <span>Project</span>
                    <strong>{protocol.projectName}</strong>
                    <small>Original published location</small>
                  </div>
                </div>
                <div className="protocol-inline-actions">
                  <button type="button" onClick={() => void handleRestoreProtocol(protocol.id)}>
                    Restore
                  </button>
                  {canReviewProject(protocol.projectId) ? (
                    <button className="protocol-danger-action" type="button" onClick={() => void handlePermanentDelete(protocol.id)}>
                      Permanently delete
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );

  return (
    <>
      {page === "home" ? (
        homeView
      ) : (
        <main className="protocol-shell">
          <header className="protocol-topbar">
            <button className="protocol-wordmark" type="button" onClick={openModuleHome} aria-label="Return to module home">
              <span className="material-symbols-outlined protocol-wordmark-glyph" aria-hidden="true">
                biotech
              </span>
              <span className="protocol-wordmark-text">RHINE_PROTOCOL_V4</span>
            </button>

            <div className="protocol-topbar-controls">
              <AppSwitcher currentApp="protocol-manager" baseUrl={APP_BASE_URL} />
              <div className="protocol-tab-nav" role="tablist" aria-label="Protocol-specific views">
                <button className={sidebarTab === "view" && viewMode === "step" ? "protocol-tab-link active" : "protocol-tab-link"} type="button" onClick={() => openViewMode("step")}>
                  Step
                </button>
                <button className={sidebarTab === "view" && viewMode === "summary" ? "protocol-tab-link active" : "protocol-tab-link"} type="button" onClick={() => openViewMode("summary")}>
                  Summary
                </button>
                <button className={sidebarTab === "view" && viewMode === "preview" ? "protocol-tab-link active" : "protocol-tab-link"} type="button" onClick={() => openViewMode("preview")}>
                  Preview
                </button>
                <button className={sidebarTab === "view" && viewMode === "transfer" ? "protocol-tab-link active" : "protocol-tab-link"} type="button" onClick={() => openViewMode("transfer")}>
                  Transfer
                </button>
              </div>
            </div>
          </header>

          <div className="protocol-body">
            <aside className="protocol-side-rail" aria-label="Protocol manager navigation">
              <button className={sidebarTab === "overview" ? "protocol-rail-item active" : "protocol-rail-item"} type="button" onClick={() => setSidebarTab("overview")}>
                <span className="material-symbols-outlined protocol-rail-glyph" aria-hidden="true">
                  analytics
                </span>
                <span>Overview</span>
              </button>
              <button className={sidebarTab === "library" ? "protocol-rail-item active" : "protocol-rail-item"} type="button" onClick={() => setSidebarTab("library")}>
                <span className="material-symbols-outlined protocol-rail-glyph" aria-hidden="true">
                  folder_open
                </span>
                <span>Library</span>
              </button>
              {visibleReviewsTab ? (
                <button className={sidebarTab === "reviews" ? "protocol-rail-item active" : "protocol-rail-item"} type="button" onClick={() => setSidebarTab("reviews")}>
                  <span className="material-symbols-outlined protocol-rail-glyph" aria-hidden="true">
                    assignment
                  </span>
                  <span>Reviews</span>
                </button>
              ) : null}
              <button className={sidebarTab === "recycle" ? "protocol-rail-item active" : "protocol-rail-item"} type="button" onClick={() => setSidebarTab("recycle")}>
                <span className="material-symbols-outlined protocol-rail-glyph" aria-hidden="true">
                  delete
                </span>
                <span>Recycle Bin</span>
              </button>
              <button className={sidebarTab === "view" ? "protocol-rail-item active" : "protocol-rail-item"} type="button" onClick={() => setSidebarTab("view")}>
                <span className="material-symbols-outlined protocol-rail-glyph" aria-hidden="true">
                  visibility
                </span>
                <span>View</span>
              </button>
              <button className="protocol-rail-item protocol-rail-item-strong" type="button" onClick={() => setNewProtocolModalOpen(true)}>
                <span className="material-symbols-outlined protocol-rail-glyph" aria-hidden="true">
                  add_box
                </span>
                <span>New Protocol</span>
              </button>
            </aside>

            {sidebarTab === "view" ? viewWorkspace : libraryAndOverview}
          </div>

          {newProtocolModalOpen ? (
            <div className="step-modal-overlay" onClick={() => setNewProtocolModalOpen(false)}>
              <div className="step-modal protocol-new-modal" role="dialog" aria-modal="true" aria-label="Create a new protocol" onClick={(event) => event.stopPropagation()}>
                <div className="step-modal-header">
                  <span className="outline-marker">Create Protocol</span>
                  <button className="step-modal-close" onClick={() => setNewProtocolModalOpen(false)} aria-label="Close create protocol dialog">
                    X
                  </button>
                </div>
                <div className="step-modal-body protocol-new-modal-body">
                  <p className="protocol-observation-copy">Choose how the next protocol draft should start.</p>
                  <div className="protocol-new-grid">
                    <button className="protocol-new-choice" type="button" onClick={() => void handleCreateProtocol("blank")}>
                      <strong>Blank</strong>
                      <span>Open VIEW with a clean draft shell.</span>
                    </button>
                    <button className="protocol-new-choice" type="button" onClick={() => void handleCreateProtocol("template")}>
                      <strong>Template</strong>
                      <span>Open VIEW with the starter protocol template loaded.</span>
                    </button>
                    <button className="protocol-new-choice" type="button" onClick={() => void handleCreateProtocol("import-files")}>
                      <strong>Import files</strong>
                      <span>Start blank, jump to Transfer, then upload an existing file.</span>
                    </button>
                    <button className="protocol-new-choice" type="button" onClick={() => void handleCreateProtocol("import-json")}>
                      <strong>Import JSON</strong>
                      <span>Start blank, jump to Transfer, then paste or upload JSON.</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {editorModalOpen ? (
            <StepEditorModal
              doc={doc}
              selection={selection}
              selectedBlockIds={selection.type === "step" && blockSelection.stepId === selection.stepId ? blockSelection.blockIds : []}
              canPasteBlocks={blockClipboard.length > 0}
              clipboardBlockCount={blockClipboard.length}
              onDocChange={updateDoc}
              onSetSelectedBlockIds={handleSetSelectedBlockIds}
              onClearBlockSelection={clearBlockSelection}
              onCutBlocks={handleCutBlocks}
              onCopyBlocks={handleCopyBlocks}
              onPasteBlocks={handlePasteBlocks}
              onClose={() => setEditorModalOpen(false)}
            />
          ) : null}
        </main>
      )}
    </>
  );
};

const countSections = (sections: ProtocolDocument["protocol"]["sections"]): number =>
  sections.reduce((total, section) => total + 1 + countSections(section.sections), 0);

const countSteps = (sections: ProtocolDocument["protocol"]["sections"]): number =>
  sections.reduce((total, section) => total + section.steps.length + countSteps(section.sections), 0);

const orderStepIdsByDocument = (doc: ProtocolDocument, stepIds: string[]) => {
  const selectedIds = new Set(stepIds);
  return collectStepIds(doc.protocol.sections).filter((stepId) => selectedIds.has(stepId));
};

const getFirstStepRecord = (sections: ProtocolSection[]): { section: ProtocolSection; step: ProtocolStep } | null => {
  for (const section of sections) {
    if (section.steps.length > 0) {
      return { section, step: section.steps[0] };
    }

    const nested = getFirstStepRecord(section.sections);
    if (nested) return nested;
  }

  return null;
};

const cloneBlocks = (blocks: ProtocolBlock[]): ProtocolBlock[] => JSON.parse(JSON.stringify(blocks)) as ProtocolBlock[];

const formatStepKind = (value?: ProtocolStep["stepKind"]) => {
  if (!value) return "Protocol";
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const formatBlockType = (value: ProtocolBlock["type"]) => value.replace(/([A-Z])/g, " $1").replace(/\b\w/g, (letter) => letter.toUpperCase());

const getBlockSummary = (block: ProtocolBlock) => {
  if (block.type === "paragraph" || block.type === "note" || block.type === "caution") return block.text;
  if (block.type === "qc") return `${block.checkpoint}${block.acceptanceCriteria ? ` - ${block.acceptanceCriteria}` : ""}`;
  if (block.type === "recipe") return `${block.items.length} item(s)${block.title ? ` in ${block.title}` : ""}`;
  if (block.type === "timeline") return `${block.stages.length} stage(s)`;
  if (block.type === "link") return `${block.label} (${block.url})`;
  if (block.type === "table") return `${block.columns.length} column(s) x ${block.rows.length} row(s)`;
  if (block.type === "fileReference") return `${block.label} (${block.path})`;
  return `If ${block.condition}, then ${block.thenStepIds.join(", ") || "no target step"}`;
};

const getQuickSummaryText = (step: ProtocolStep) => {
  const block = step.blocks.find((candidate) => candidate.type === "note" || candidate.type === "paragraph" || candidate.type === "caution");
  if (!block) return "This step does not have a narrative summary block yet. Open the editor if you want to add descriptive content.";
  return getBlockSummary(block);
};

const countSpecialBlocks = (step: ProtocolStep) => step.blocks.filter((block) => block.type !== "paragraph" && block.type !== "note").length;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const PRINT_WINDOW_STYLES = `
  :root {
    color: #1e1e1e;
    background: #ffffff;
  }

  * {
    box-sizing: border-box;
  }

  body.print-window-body {
    margin: 0;
    padding: 24px;
    background: #ffffff;
    color: #1e1e1e;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .print-document {
    max-width: 900px;
    margin: 0 auto;
  }

  .preview-section,
  .preview-step,
  .preview-subcard,
  .preview-note,
  .preview-caution,
  .preview-qc {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .preview-step {
    border-top: 1px solid #d6d0c3;
    padding-top: 14px;
  }
`;
