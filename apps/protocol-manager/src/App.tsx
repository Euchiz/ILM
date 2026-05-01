import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Button,
  LabShell,
  LabTopbar,
  Modal,
  SubmissionHistoryLink,
  useAuth,
} from "@ilm/ui";
import type { ProtocolBlock, ProtocolDocument, ProtocolSection, ProtocolStep } from "@ilm/types";
import { getSupabaseClient, nowIso, safeJsonParse } from "@ilm/utils";
import { AI_IMPORT_INSTRUCTIONS_TEXT } from "@ilm/ai-import";
import { normalizeProtocolDocument, validateProtocolDocument, type ValidationMode } from "@ilm/validation";
import { ImportExportPanel } from "./components/ImportExportPanel";
import { OutlinePanel } from "./components/OutlinePanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { EditorPanel } from "./components/EditorPanel";
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

const APP_BASE_URL = import.meta.env.BASE_URL;

const readRequestedProtocolId = () => new URLSearchParams(window.location.search).get("protocolId");

const clearRequestedProtocolId = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete("protocolId");
  window.history.replaceState({}, "", url);
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

const SIDEBAR_TAB_LABELS: Record<Exclude<SidebarTab, "view">, string> = {
  overview: "Overview",
  library: "Library",
  reviews: "Reviews",
  recycle: "Recycle bin",
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

const buildEditorFromPublished = (record: PublishedProtocolRecord): ActiveEditor => ({
  draftId: null,
  protocolId: record.id,
  projectId: record.projectId,
  document: record.document,
});

const buildEditorFromDraft = (draft: DraftRecord): ActiveEditor => ({
  draftId: draft.id,
  protocolId: draft.protocolId,
  projectId: draft.projectId,
  document: draft.document,
});

const findPublishedProtocol = (workspace: CloudWorkspaceSnapshot | null, protocolId: string | null) =>
  protocolId ? workspace?.publishedProtocols.find((protocol) => protocol.id === protocolId) ?? null : null;

const findDraftByDocumentId = (workspace: CloudWorkspaceSnapshot | null, documentProtocolId: string) =>
  workspace?.drafts.find((draft) => draft.document.protocol.id === documentProtocolId) ?? null;

const findPublishedByDocumentId = (workspace: CloudWorkspaceSnapshot | null, documentProtocolId: string) =>
  workspace?.publishedProtocols.find((protocol) => protocol.document.protocol.id === documentProtocolId) ?? null;

const chooseInitialEditor = (workspace: CloudWorkspaceSnapshot): ActiveEditor | null => {
  const firstPublished = workspace.publishedProtocols[0];
  if (firstPublished) {
    return buildEditorFromPublished(firstPublished);
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

const getProtocolReviewState = (record: PublishedProtocolRecord): ReviewState =>
  getProtocolMetadata(record.document).reviewStatus === "reviewed" ? "reviewed" : "reviewing";

const findDraftSubmission = (draft: DraftRecord, submissions: SubmissionRecord[]) =>
  submissions.find(
    (submission) =>
      submission.status !== "approved" &&
      ((draft.protocolId && submission.protocolId === draft.protocolId) || submission.document.protocol.id === draft.document.protocol.id)
  ) ?? null;

const buildProjectGroups = (protocols: PublishedProtocolRecord[]): ProjectGroup[] => {
  const groups = new Map<string, ProjectGroup>();

  protocols.forEach((protocol) => {
    const metadata = getProtocolMetadata(protocol.document);
    const reviewState = getProtocolReviewState(protocol);
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

export const App = () => {
  const { activeLab, user } = useAuth();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const mainGridRef = useRef<HTMLDivElement | null>(null);
  const fallbackDocRef = useRef<ProtocolDocument>(createProtocolForMode("template"));
  const editorRef = useRef<ActiveEditor | null>(null);
  const requestedProtocolHandledRef = useRef(false);

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
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => {
    if (typeof window === "undefined") return "overview";
    const hash = window.location.hash.replace(/^#\/?/, "").toLowerCase();
    if (hash === "reviews" || hash === "library" || hash === "overview" || hash === "recycle") {
      return hash as SidebarTab;
    }
    return "overview";
  });
  const [viewMode, setViewMode] = useState<ViewMode>("step");
  const [importMode, setImportMode] = useState<ValidationMode>("assisted");
  const [jsonText, setJsonText] = useState("");
  const [newProtocolModalOpen, setNewProtocolModalOpen] = useState(false);
  const [outlineWidth, setOutlineWidth] = useState(460);
  const [isResizingOutline, setIsResizingOutline] = useState(false);
  const [migrationDismissed, setMigrationDismissed] = useState(false);
  const [migrationImporting, setMigrationImporting] = useState(false);
  const [libraryProjectFilter, setLibraryProjectFilter] = useState<string>("all");

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
    if (!activeLab || !user) return;

    let cancelled = false;
    void refreshWorkspace().then((nextWorkspace) => {
      if (cancelled || !nextWorkspace) return;
      if (!requestedProtocolHandledRef.current) {
        requestedProtocolHandledRef.current = true;
        const requestedProtocolId = readRequestedProtocolId();
        if (requestedProtocolId) {
          const requestedProtocol = findPublishedProtocol(nextWorkspace, requestedProtocolId);
          clearRequestedProtocolId();
          if (requestedProtocol) {
            setEditor(buildEditorFromPublished(requestedProtocol));
            setSidebarTab("view");
            setViewMode("step");
            setStatus([`Opened ${requestedProtocol.document.protocol.title} from project-manager.`]);
            return;
          }
        }
      }

      setEditor((current) => current ?? chooseInitialEditor(nextWorkspace));
    });

    return () => {
      cancelled = true;
    };
  }, [activeLab, refreshWorkspace, user]);

  useEffect(() => {
    setSelection({ type: "protocol" });
    setSelectedStepIds([]);
    setSelectedSectionIds([]);
    setBlockSelection({ stepId: "", blockIds: [] });
    setJsonText("");
  }, [activeLab?.id, editor?.draftId, editor?.protocolId, editor?.document.protocol.id]);

  const doc = editor?.document ?? fallbackDocRef.current;
  const protocolMeta = getProtocolMetadata(doc);
  const displayReviewStatus =
    editor?.protocolId && findPublishedProtocol(workspace, editor.protocolId)
      ? getProtocolReviewState(findPublishedProtocol(workspace, editor.protocolId) as PublishedProtocolRecord)
      : "reviewing";
  const archivedProtocols = useMemo(
    () => publishedProtocols.filter((protocol) => getProtocolMetadata(protocol.document).lifecycleStatus === "archived"),
    [publishedProtocols]
  );
  const activePublishedProtocols = useMemo(
    () => publishedProtocols.filter((protocol) => getProtocolMetadata(protocol.document).lifecycleStatus !== "archived"),
    [publishedProtocols]
  );
  const projectGroups = useMemo(() => buildProjectGroups(activePublishedProtocols), [activePublishedProtocols]);
  const libraryProjectOptions = useMemo(() => {
    const names = new Set<string>();
    activePublishedProtocols.forEach((protocol) => names.add(protocol.projectName));
    drafts.forEach((draft) => names.add(draft.projectName));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [activePublishedProtocols, drafts]);
  const filteredDrafts = useMemo(
    () =>
      libraryProjectFilter === "all"
        ? drafts
        : drafts.filter((draft) => !draft.projectName || draft.projectName === libraryProjectFilter),
    [drafts, libraryProjectFilter],
  );
  const filteredProjectGroups = useMemo(
    () => (libraryProjectFilter === "all" ? projectGroups : projectGroups.filter((group) => group.project === libraryProjectFilter)),
    [projectGroups, libraryProjectFilter],
  );
  const totalProjects = projects.length;
  const totalProtocols = publishedProtocols.length;
  const totalReviewed = publishedProtocols.filter((protocol) => getProtocolReviewState(protocol) === "reviewed").length;
  const totalReviewing = totalProtocols - totalReviewed;
  const totalArchived = archivedProtocols.length;
  const totalActive = activePublishedProtocols.length;
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
  const visibleReviewsTab = submissions.length > 0;
  const activeProject = projects.find((project) => project.id === editor?.projectId) ?? null;
  const activeProtocolLabel =
    viewMode === "summary" ? "Protocol summary" : viewMode === "step" ? "Inline editor" : viewMode === "preview" ? "Rendered preview" : "Transfer desk";
  const saveStatusLabel =
    !editor?.draftId
      ? "Local working copy"
      : saveState === "saving"
      ? "Saving draft..."
      : saveState === "saved"
        ? `Saved ${formatRelativeTime(lastSavedAt)}`
        : saveState === "error"
          ? "Draft save failed"
          : editor?.draftId
            ? "Draft autosave ready"
            : "Local working copy";
  const legacyProtocols = useMemo(
    () => (activeLab && !migrationDismissed ? readLegacyLibraryProtocols() : []),
    [activeLab, migrationDismissed]
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
    openViewMode("step");
  };

  const selectSection = (sectionId: string, options?: { toggle: boolean }) => {
    setSelectedStepIds([]);
    clearBlockSelection();
    openViewMode("step");

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
    openViewMode("step");
    setSelection({ type: "protocol" });
  };

  const openSectionEditor = (sectionId: string) => {
    openViewMode("step");
    setSelection({ type: "section", sectionId });
    setSelectedSectionIds([sectionId]);
    setSelectedStepIds([]);
    clearBlockSelection();
  };

  const openStepEditor = (sectionId: string, stepId: string) => {
    openViewMode("step");
    setSelection({ type: "step", sectionId, stepId });
    setSelectedStepIds([stepId]);
    setSelectedSectionIds([]);
    clearBlockSelection();
  };

  const persistEditorDraft = useCallback(
    async (target: ActiveEditor | null, options?: { announce?: boolean; createIfMissing?: boolean }) => {
      if (!target || !activeLab || !user) return null;
      if (!target.draftId && !options?.createIfMissing) return null;
      if (!target.projectId) throw new Error("Choose a project before saving.");
      if (!target.draftId && !options?.createIfMissing) return null;

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
      const existingDraft = workspace?.drafts.find((draft) => draft.id === nextDraftId);
      const nextDraft: DraftRecord = {
        id: nextDraftId,
        protocolId: target.protocolId,
        projectId: target.projectId,
        projectName: resolveProjectName(target.projectId),
        document: preparedDocument,
        updatedAt: nowIso(),
        submissionHistory: existingDraft?.submissionHistory ?? [],
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
    if (autosaveTick === 0 || !editor || !editor.draftId) return;

    const timer = window.setTimeout(() => {
      void persistEditorDraft(editorRef.current).catch((error) => {
        setStatus([`Could not save draft: ${errorMessage(error)}`]);
      });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [autosaveTick, editor, persistEditorDraft]);

  const flushActiveDraft = useCallback(async () => {
    if (!editorRef.current) return null;
    return persistEditorDraft(editorRef.current, { createIfMissing: Boolean(editorRef.current.draftId) });
  }, [persistEditorDraft]);

  const saveActiveDraft = useCallback(async () => {
    if (!editorRef.current) return null;
    return persistEditorDraft(editorRef.current, { announce: true, createIfMissing: true });
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
    openViewMode("step");
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
    if (sidebarTab !== "view" || newProtocolModalOpen) return;

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
  }, [newProtocolModalOpen, sectionClipboard.length, selection, sidebarTab, stepClipboard.length]);

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
    setEditor(buildEditorFromPublished(protocol));
    openViewMode("step");
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
    openViewMode("step");
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
    openViewMode(mode === "import-files" || mode === "import-json" ? "transfer" : "step");
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
    openViewMode("step");
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
      const draftId = await persistEditorDraft(target, { createIfMissing: true });
      if (!draftId) return;

      const submitComment = project.approvalRequired
        ? window.prompt(`Submit "${preparedDocument.protocol.title}" for review. Optional comment:`, "")
        : null;
      if (project.approvalRequired && submitComment === null) return;
      const { error } = await supabase.rpc("submit_draft", {
        p_draft_id: draftId,
        p_comment: submitComment?.trim() || null,
      });
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
          setEditor(buildEditorFromPublished(published));
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
        setEditor(buildEditorFromPublished(published));
      } else {
        setEditor({
          draftId: null,
          protocolId: submission.protocolId,
          projectId: submission.projectId,
          document: submission.document,
        });
      }
    }
    openViewMode("step");
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
        const submitResult = await supabase.rpc("submit_draft", {
          p_draft_id: draftId,
          p_comment: null,
        });
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
          <button type="button" onClick={resetSelection} disabled={selection.type === "protocol"}>
            Clear
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
            </div>
          </div>

          <div className="protocol-workspace-actions">
            {editor?.draftId ? (
              <span className="protocol-autosaved-caption" title="Draft changes are autosaved to your private workspace.">
                Autosaved
              </span>
            ) : (
              <button type="button" onClick={() => void saveActiveDraft()} disabled={!editor}>
                Save draft
              </button>
            )}
            <button className="protocol-primary-action" type="button" onClick={() => void handleSubmitForReview()} disabled={!editor?.projectId}>
              {activeProject?.approvalRequired === false ? "Publish to General" : "Submit for review"}
            </button>
            <button type="button" onClick={() => void handleDiscardDraft()} disabled={!editor}>
              Discard draft
            </button>
            {editor?.protocolId ? (
              <button className="protocol-danger-action" type="button" onClick={() => void handleDeleteProtocol(editor.protocolId as string, { fromView: true })}>
                Move to recycle bin
              </button>
            ) : null}
          </div>
        </header>

        <div className="protocol-workspace-scroll">
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

          {viewMode === "summary" ? (
            <div className="protocol-summary-view">
              <article className="protocol-content-card protocol-content-card-accent protocol-content-card-hero">
                <div className="protocol-card-heading">
                  <h3>Draft Workflow</h3>
                  <span>Project assignment, draft state, and review routing</span>
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
            <section className="protocol-tab-panel" aria-label="Protocol editor workspace">
              <div className="protocol-card-heading">
                <h3>
                  {selection.type === "protocol"
                    ? "Protocol editor"
                    : selection.type === "section"
                      ? focusedSection?.title ?? "Section editor"
                      : focusedStep?.title ?? "Step editor"}
                </h3>
                <span>
                  {selection.type === "protocol"
                    ? "Edit protocol metadata, reagents, and equipment."
                    : selection.type === "section"
                      ? "Edit the selected section directly from the workspace."
                      : `${focusedSection?.title ?? "Selected section"} / ${formatStepKind(focusedStep?.stepKind)}`}
                </span>
              </div>
              <EditorPanel
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
              />
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
        </div>
      </section>
    </div>
  );

  const libraryAndOverview = (
    <section className="protocol-main-panel">
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
        <div className="protocol-overview-pane">
          <div className="protocol-kpi-strip">
            <button type="button" className="protocol-kpi" onClick={() => setSidebarTab("library")}>
              <span className="protocol-kpi-label">Projects</span>
              <span className="protocol-kpi-value">{totalProjects}</span>
            </button>
            <button type="button" className="protocol-kpi" onClick={() => setSidebarTab("library")}>
              <span className="protocol-kpi-label">Protocols</span>
              <span className="protocol-kpi-value">{totalProtocols}</span>
            </button>
            <button type="button" className="protocol-kpi protocol-kpi--drafts" onClick={() => setSidebarTab("library")}>
              <span className="protocol-kpi-label">Drafts</span>
              <span className="protocol-kpi-value">{drafts.length}</span>
            </button>
            <button
              type="button"
              className={`protocol-kpi${pendingSubmissions.length > 0 ? " protocol-kpi--alert" : ""}`}
              onClick={() => setSidebarTab("reviews")}
            >
              <span className="protocol-kpi-label">Pending reviews</span>
              <span className="protocol-kpi-value">{pendingSubmissions.length}</span>
            </button>
          </div>

          <article className="protocol-content-card protocol-overview-projects">
            <div className="protocol-card-heading">
              <h3>Projects</h3>
              <span>{projectGroups.length}</span>
            </div>
            {projectGroups.length === 0 ? (
              <p className="protocol-observation-copy">No published protocols yet.</p>
            ) : (
              <ul className="protocol-overview-project-list">
                {projectGroups.map((group) => (
                  <li key={group.project}>
                    <button
                      type="button"
                      className="protocol-overview-project-row"
                      onClick={() => {
                        setLibraryProjectFilter(group.project);
                        setSidebarTab("library");
                      }}
                    >
                      <span className="protocol-overview-project-name">{group.project}</span>
                      <span className="protocol-overview-project-stats">
                        <span>{group.protocols.length} protocol{group.protocols.length === 1 ? "" : "s"}</span>
                        {group.active > 0 ? <span>{group.active} active</span> : null}
                        {group.reviewing > 0 ? <span className="protocol-overview-stat--alert">{group.reviewing} reviewing</span> : null}
                        {group.validated > 0 ? <span>{group.validated} validated</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      ) : sidebarTab === "library" ? (
        <div className="protocol-library-pane">
          <div className="protocol-library-toolbar">
            <label className="protocol-library-filter">
              <span>Project</span>
              <select value={libraryProjectFilter} onChange={(event) => setLibraryProjectFilter(event.target.value)}>
                <option value="all">All projects</option>
                {libraryProjectOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <span className="protocol-library-counts">
              {filteredDrafts.length} draft{filteredDrafts.length === 1 ? "" : "s"} ·{" "}
              {filteredProjectGroups.reduce((sum, group) => sum + group.protocols.length, 0)} published
            </span>
          </div>

          <div className="protocol-library-columns">
            <article className="protocol-content-card protocol-library-column protocol-library-column--drafts">
              <div className="protocol-card-heading">
                <h3>Drafts</h3>
                <span>{filteredDrafts.length}</span>
              </div>
              {filteredDrafts.length === 0 ? (
                <p className="protocol-observation-copy">No drafts in this view.</p>
              ) : (
                <ul className="protocol-library-list">
                  {filteredDrafts.map((draft) => {
                    const relatedSubmission = findDraftSubmission(draft, submissions);
                    const draftState = relatedSubmission?.status ?? "draft";
                    return (
                      <li key={draft.id}>
                        <button type="button" className="protocol-library-row" onClick={() => void openDraftFromLibrary(draft.id)}>
                          <span className="protocol-library-row-title">{draft.document.protocol.title}</span>
                          <span className="protocol-library-row-tags">
                            <span className={`protocol-status-tag protocol-status-tag-${getStatusTone(draftState)}`}>{draftState}</span>
                            {libraryProjectFilter === "all" ? (
                              <span className="protocol-library-row-meta">{draft.projectName}</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>

            <article className="protocol-content-card protocol-library-column protocol-library-column--published">
              <div className="protocol-card-heading">
                <h3>Published</h3>
                <span>{filteredProjectGroups.reduce((sum, group) => sum + group.protocols.length, 0)}</span>
              </div>
              {filteredProjectGroups.length === 0 ? (
                <p className="protocol-observation-copy">No published protocols in this view.</p>
              ) : (
                filteredProjectGroups.map((group) => (
                  <section className="protocol-library-group" key={group.project}>
                    <header className="protocol-library-group-head">
                      <strong>{group.project}</strong>
                      <span>
                        {group.protocols.length} · {group.active} active · {group.reviewing} reviewing · {group.validated} validated
                      </span>
                    </header>
                    <ul className="protocol-library-list">
                      {group.protocols.map((protocol) => {
                        const metadata = getProtocolMetadata(protocol.document);
                        const reviewState = getProtocolReviewState(protocol);
                        return (
                          <li key={protocol.id}>
                            <button type="button" className="protocol-library-row" onClick={() => void openProtocolFromLibrary(protocol.id)}>
                              <span className="protocol-library-row-title">{protocol.document.protocol.title}</span>
                              <span className="protocol-library-row-tags">
                                <span className={`protocol-status-tag protocol-status-tag-${getStatusTone(reviewState)}`}>{reviewState}</span>
                                <span className={`protocol-status-tag protocol-status-tag-${getStatusTone(metadata.lifecycleStatus)}`}>{metadata.lifecycleStatus}</span>
                                <span className={`protocol-status-tag protocol-status-tag-${getStatusTone(metadata.validationStatus)}`}>{metadata.validationStatus}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </article>
          </div>
        </div>
      ) : sidebarTab === "reviews" ? (
        (() => {
          if (submissions.length === 0) {
            return (
              <article className="protocol-content-card">
                <div className="protocol-card-heading">
                  <h3>No review traffic yet</h3>
                </div>
                <p className="protocol-observation-copy">Your own submissions and any queue items you can review will show up here.</p>
              </article>
            );
          }
          const pending = submissions.filter((s) => s.status === "pending");
          const past = submissions.filter((s) => s.status !== "pending");
          const renderRow = (submission: SubmissionRecord) => {
            const isReviewer = canReviewProject(submission.projectId);
            const isOwnSubmission = submission.submitterId === user?.id;
            return (
              <li key={submission.id} className="protocol-review-row">
                <div className="protocol-review-row-main">
                  <div className="protocol-review-row-title">
                    <strong>{submission.document.protocol.title}</strong>
                    <span className={`protocol-status-tag protocol-status-tag-${getStatusTone(submission.status)}`}>{submission.status}</span>
                  </div>
                  <div className="protocol-review-row-meta">
                    <span>{submission.projectName}</span>
                    <span>{submission.submitterLabel}</span>
                    <span>{formatRelativeTime(submission.submittedAt)}</span>
                    {submission.reviewedAt ? <span>reviewed {formatRelativeTime(submission.reviewedAt)}</span> : null}
                  </div>
                  {submission.reviewComment ? (
                    <p className="protocol-review-row-comment">{submission.reviewComment}</p>
                  ) : null}
                </div>
                <div className="protocol-review-row-actions">
                  <button type="button" onClick={() => void handleOpenSubmission(submission)}>
                    Open
                  </button>
                  {submission.status === "pending" && isReviewer ? (
                    <>
                      <button type="button" onClick={() => void handleApproveSubmission(submission)}>
                        Approve
                      </button>
                      <button className="protocol-danger-action" type="button" onClick={() => void handleRejectSubmission(submission)}>
                        Reject
                      </button>
                    </>
                  ) : null}
                  {submission.status === "pending" && isOwnSubmission ? (
                    <button type="button" onClick={() => void handleWithdrawSubmission(submission)}>
                      Withdraw
                    </button>
                  ) : null}
                </div>
              </li>
            );
          };
          return (
            <div className="protocol-reviews-pane">
              {pending.length > 0 ? (
                <article className="protocol-content-card">
                  <div className="protocol-card-heading">
                    <h3>Pending review</h3>
                    <span>{pending.length}</span>
                  </div>
                  <ul className="protocol-review-list">{pending.map(renderRow)}</ul>
                </article>
              ) : null}
              {past.length > 0 ? (
                <article className="protocol-content-card">
                  <div className="protocol-card-heading">
                    <h3>Past submissions</h3>
                    <span>{past.length}</span>
                  </div>
                  <ul className="protocol-review-list">{past.map(renderRow)}</ul>
                </article>
              ) : null}
            </div>
          );
        })()
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

  const subbar = (
    <nav className="protocol-subbar-tabs" aria-label="Protocol manager sections">
      <button className={`protocol-subtab${sidebarTab === "overview" ? " is-active" : ""}`} type="button" onClick={() => setSidebarTab("overview")}>
        Overview
      </button>
      <button className={`protocol-subtab${sidebarTab === "library" || sidebarTab === "view" ? " is-active" : ""}`} type="button" onClick={() => setSidebarTab("library")}>
        Library
      </button>
      {visibleReviewsTab ? (
        <button className={`protocol-subtab${sidebarTab === "reviews" ? " is-active" : ""}`} type="button" onClick={() => setSidebarTab("reviews")}>
          Reviews
          {pendingSubmissions.length > 0 ? (
            <span className="protocol-subtab-badge">{pendingSubmissions.length}</span>
          ) : null}
        </button>
      ) : null}
      <span className="protocol-subbar-spacer" />
      <button
        className={`protocol-subtab protocol-subtab--icon${sidebarTab === "recycle" ? " is-active" : ""}`}
        type="button"
        onClick={() => setSidebarTab("recycle")}
        aria-label="Recycle bin"
        title="Recycle bin"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
      <Button variant="primary" onClick={() => setNewProtocolModalOpen(true)}>
        + New protocol
      </Button>
    </nav>
  );

  const topbarTitle = sidebarTab === "view" ? "Editor" : SIDEBAR_TAB_LABELS[sidebarTab];

  return (
    <LabShell
      activeNavId="protocols"
      baseUrl={APP_BASE_URL}
      className="protocol-shell"
      topbar={
        <LabTopbar
          kicker="PROTOCOLS"
          title={topbarTitle}
          subtitle="Authoring, review, and rendering for the active lab's protocols."
        />
      }
      subbar={subbar}
      bodyClassName={sidebarTab === "view" ? "protocol-body--workspace" : ""}
    >
      {sidebarTab === "view" ? (
        <>
          <nav className="protocol-subsubbar-tabs" aria-label="Protocol editor modes">
            {editor?.draftId ? (
              <SubmissionHistoryLink
                visible
                history={workspace?.drafts.find((d) => d.id === editor.draftId)?.submissionHistory ?? []}
                linkLabel="Submission history"
              />
            ) : null}
            <span className="protocol-subsubbar-spacer" />
            <button className={`protocol-subsubtab${viewMode === "summary" ? " is-active" : ""}`} type="button" onClick={() => openViewMode("summary")}>
              Summary
            </button>
            <button className={`protocol-subsubtab${viewMode === "step" ? " is-active" : ""}`} type="button" onClick={() => openViewMode("step")}>
              Editor
            </button>
            <button className={`protocol-subsubtab${viewMode === "preview" ? " is-active" : ""}`} type="button" onClick={() => openViewMode("preview")}>
              Preview
            </button>
            <button className={`protocol-subsubtab${viewMode === "transfer" ? " is-active" : ""}`} type="button" onClick={() => openViewMode("transfer")}>
              Transfer
            </button>
          </nav>
          {viewWorkspace}
        </>
      ) : libraryAndOverview}

          <Modal
            open={newProtocolModalOpen}
            onClose={() => setNewProtocolModalOpen(false)}
            title="Create protocol"
            note="Choose how the next protocol draft should start."
            className="protocol-new-modal"
            labelledBy="new-protocol-modal-title"
          >
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
          </Modal>
    </LabShell>
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

const cloneBlocks = (blocks: ProtocolBlock[]): ProtocolBlock[] => JSON.parse(JSON.stringify(blocks)) as ProtocolBlock[];

const formatStepKind = (value?: ProtocolStep["stepKind"]) => {
  if (!value) return "Protocol";
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

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

  body.print-window-body {
    --print-recommended-scale: 0.8;
  }

  .print-document {
    max-width: 900px;
    margin: 0 auto;
    zoom: var(--print-recommended-scale);
    transform-origin: top center;
  }

  @supports not (zoom: 1) {
    .print-document {
      transform: scale(var(--print-recommended-scale));
      width: calc(100% / var(--print-recommended-scale));
    }
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
