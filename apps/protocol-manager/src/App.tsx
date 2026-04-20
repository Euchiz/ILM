import { useEffect, useMemo, useRef, useState } from "react";
import type { ProtocolBlock, ProtocolDocument, ProtocolSection, ProtocolStep } from "@ilm/types";
import { nowIso, safeJsonParse } from "@ilm/utils";
import { AI_IMPORT_INSTRUCTIONS_TEXT } from "@ilm/ai-import";
import { normalizeProtocolDocument, validateProtocolDocument, type ValidationMode } from "@ilm/validation";
import { ImportExportPanel } from "./components/ImportExportPanel";
import { OutlinePanel } from "./components/OutlinePanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { StepEditorModal } from "./components/StepEditorModal";
import { createInitialLibrary, appendProtocolToLibrary, createProtocolForMode, ensureProtocolMetadata, getProtocolMetadata, LEGACY_STORAGE_KEY, LIBRARY_STORAGE_KEY, normalizeLibraryState, replaceActiveProtocol, type LifecycleStatus, type NewProtocolMode, type ProtocolLibraryState, type ReviewStatus, type SidebarTab, type ValidationStatus, type ViewMode, updateProtocolMetadata } from "./lib/protocolLibrary";
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
  moveSection,
  moveStep,
  moveStepsToSection,
  pasteBlocksIntoStep,
  pasteSections,
  pasteStepsIntoSection,
  removeBlocksFromStep,
  reorderSections,
  type Selection
} from "./state/protocolState";

const MODULE_CARDS = [
  {
    id: "protocol-manager",
    title: "Protocol Manager",
    status: "Available",
    description: "Portfolio-level protocol visibility, library organization, and structured viewing/editing workflows.",
    actionLabel: "Open module"
  },
  {
    id: "supply-manager",
    title: "Supply Manager",
    status: "Planned",
    description: "Track reagents, linked vendors, and inventory relationships against upcoming protocol runs.",
    actionLabel: "Coming soon"
  },
  {
    id: "project-manager",
    title: "Project Manager",
    status: "Planned",
    description: "Coordinate project milestones, protocol coverage, and experiment readiness across teams.",
    actionLabel: "Coming soon"
  },
  {
    id: "funding-manager",
    title: "Funding Manager",
    status: "Planned",
    description: "Connect grants and budgets to active project portfolios and protocol execution plans.",
    actionLabel: "Coming soon"
  }
] as const;

const APP_BASE_URL = import.meta.env.BASE_URL;

const buildPageUrl = (path: "" | "protocol-manager/") => new URL(path, window.location.origin + APP_BASE_URL).toString();

type ActiveModule = "home" | "protocol-manager";

type AppProps = {
  page: ActiveModule;
};

export const App = ({ page }: AppProps) => {
  const [libraryState, setLibraryState] = useState<ProtocolLibraryState>(() => loadLibraryState());
  const [selection, setSelection] = useState<Selection>({ type: "protocol" });
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [blockSelection, setBlockSelection] = useState<{ stepId: string; blockIds: string[] }>({ stepId: "", blockIds: [] });
  const [blockClipboard, setBlockClipboard] = useState<ProtocolBlock[]>([]);
  const [stepClipboard, setStepClipboard] = useState<ProtocolStep[]>([]);
  const [sectionClipboard, setSectionClipboard] = useState<ProtocolSection[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("overview");
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [importMode, setImportMode] = useState<ValidationMode>("assisted");
  const [jsonText, setJsonText] = useState("");
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [newProtocolModalOpen, setNewProtocolModalOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const doc =
    libraryState.protocols.find((candidate) => candidate.protocol.id === libraryState.activeProtocolId) ??
    libraryState.protocols[0];
  const protocolMeta = getProtocolMetadata(doc);
  const projectGroups = useMemo(() => groupProtocolsByProject(libraryState.protocols), [libraryState.protocols]);
  const totalProjects = projectGroups.length;
  const totalProtocols = libraryState.protocols.length;
  const totalReviewed = libraryState.protocols.filter((protocol) => getProtocolMetadata(protocol).reviewStatus === "reviewed").length;
  const totalReviewing = totalProtocols - totalReviewed;
  const totalArchived = libraryState.protocols.filter((protocol) => getProtocolMetadata(protocol).lifecycleStatus === "archived").length;
  const totalActive = totalProtocols - totalArchived;
  const totalValidated = libraryState.protocols.filter((protocol) => getProtocolMetadata(protocol).validationStatus === "validated").length;
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

  useEffect(() => {
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(libraryState, null, 2));
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(doc, null, 2));
  }, [doc, libraryState]);

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
      blockIds: current.blockIds.filter((blockId) => validBlockIds.has(blockId))
    }));
  }, [allStepIds, blockSelection.stepId, doc.protocol.sections]);

  useEffect(() => {
    setSelection({ type: "protocol" });
    setSelectedStepIds([]);
    setSelectedSectionIds([]);
    setBlockSelection({ stepId: "", blockIds: [] });
    setEditorModalOpen(false);
    setJsonText("");
  }, [libraryState.activeProtocolId]);

  const updateDoc = (nextDoc: ProtocolDocument) => {
    const normalizedDoc = ensureProtocolMetadata({
      ...nextDoc,
      protocol: { ...nextDoc.protocol, updatedAt: nowIso() }
    });

    setLibraryState((current) => replaceActiveProtocol(current, normalizedDoc));
  };

  const clearBlockSelection = () => setBlockSelection({ stepId: "", blockIds: [] });

  const resetSelection = () => {
    setSelection({ type: "protocol" });
    setSelectedStepIds([]);
    setSelectedSectionIds([]);
    clearBlockSelection();
  };

  const selectProtocol = () => {
    resetSelection();
    setViewMode("summary");
  };

  const selectSection = (sectionId: string, options?: { toggle: boolean }) => {
    setSelectedStepIds([]);
    clearBlockSelection();
    setSidebarTab("view");
    setViewMode("summary");

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
    setSidebarTab("view");
    setViewMode("summary");

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
    setSidebarTab("view");
    setViewMode("summary");
    setSelection({ type: "protocol" });
    setEditorModalOpen(true);
  };

  const openSectionEditor = (sectionId: string) => {
    setSidebarTab("view");
    setViewMode("summary");
    setSelection({ type: "section", sectionId });
    setSelectedSectionIds([sectionId]);
    setSelectedStepIds([]);
    clearBlockSelection();
    setEditorModalOpen(true);
  };

  const openStepEditor = (sectionId: string, stepId: string) => {
    setSidebarTab("view");
    setViewMode("summary");
    setSelection({ type: "step", sectionId, stepId });
    setSelectedStepIds([stepId]);
    setSelectedSectionIds([]);
    clearBlockSelection();
    setEditorModalOpen(true);
  };

  const importParsed = (value: unknown) => {
    const result = validateProtocolDocument(value, { mode: importMode });
    if (!result.success || !result.data) {
      setStatus([
        `Import failed (${importMode} mode).`,
        ...result.errors,
        ...result.warnings.map((warning) => `Warning: ${warning}`)
      ]);
      return;
    }

    const normalized = ensureProtocolMetadata(
      updateProtocolMetadata(normalizeProtocolDocument(result.data), {
        project: protocolMeta.project,
        reviewStatus: protocolMeta.reviewStatus,
        lifecycleStatus: protocolMeta.lifecycleStatus,
        validationStatus: protocolMeta.validationStatus
      })
    );

    setLibraryState((current) => replaceActiveProtocol(current, normalized));
    resetSelection();
    setViewMode("summary");
    setStatus([
      `Import successful (${importMode} mode).`,
      ...result.warnings.map((warning) => `Warning: ${warning}`)
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

  const getActiveStepIds = (): string[] => {
    if (selection.type !== "step") return [];
    return selectedStepIds.length > 0 ? selectedStepIds : [selection.stepId];
  };

  const getActiveSectionIds = (): string[] => {
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
    if (sidebarTab !== "view" || viewMode !== "summary") return;

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
  }, [selection, sidebarTab, stepClipboard.length, sectionClipboard.length, viewMode]);

  const handleProjectChange = (project: string) => {
    updateDoc(updateProtocolMetadata(doc, { project: project.trim() || "Unassigned Project" }));
  };

  const handleReviewStatusChange = (reviewStatus: ReviewStatus) => {
    updateDoc(updateProtocolMetadata(doc, { reviewStatus }));
  };

  const handleLifecycleStatusChange = (lifecycleStatus: LifecycleStatus) => {
    updateDoc(updateProtocolMetadata(doc, { lifecycleStatus }));
  };

  const handleValidationStatusChange = (validationStatus: ValidationStatus) => {
    updateDoc(updateProtocolMetadata(doc, { validationStatus }));
  };

  const openProtocolFromLibrary = (protocolId: string) => {
    setLibraryState((current) => ({ ...current, activeProtocolId: protocolId }));
    setSidebarTab("view");
    setViewMode("summary");
    setStatus(["Protocol loaded into the VIEW workspace."]);
  };

  const handleProtocolExport = () => {
    setSidebarTab("view");
    if (viewMode !== "preview") {
      setViewMode("preview");
      setStatus(["Switched to preview mode. Use Export Protocol again to open the print-ready document."]);
      return;
    }

    handlePrintPreview();
  };

  const handleSaveDraft = () => {
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(libraryState, null, 2));
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(doc, null, 2));
    setStatus(["Workspace library saved locally. Autosave remains active in this browser session."]);
  };

  const handleCreateProtocol = (mode: NewProtocolMode) => {
    const nextDoc = createProtocolForMode(mode);
    setLibraryState((current) => appendProtocolToLibrary(current, nextDoc));
    setNewProtocolModalOpen(false);
    resetSelection();
    setEditorModalOpen(false);
    setSidebarTab("view");
    setViewMode(mode === "import-files" || mode === "import-json" ? "transfer" : "summary");
    setJsonText("");

    if (mode === "blank") {
      setStatus(["Started a blank protocol in the VIEW workspace."]);
    } else if (mode === "template") {
      setStatus(["Loaded a template protocol in the VIEW workspace."]);
    } else {
      setStatus(["Started a blank protocol and opened Transfer so you can import files or JSON right away."]);
    }
  };

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

    const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']")).map((node) => node.outerHTML).join("\n");
    printWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(doc.protocol.title)} - Print</title>
    ${styles}
    <style>${PRINT_WINDOW_STYLES}</style>
  </head>
  <body class="print-window-body">
    <main class="print-document">
      <header class="print-document-header">
        <p>Protocol Manager / View Export</p>
        <h1>${escapeHtml(doc.protocol.title)}</h1>
      </header>
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

  const activeProtocolLabel = selection.type === "protocol" ? "Protocol summary" : selection.type === "section" ? "Section summary" : "Step summary";
  const openEditorLabel =
    selection.type === "protocol" ? "Edit protocol" : selection.type === "section" ? "Edit section" : "Edit step";

  return (
    <>
      {page === "home" ? (
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
              <div className="protocol-placeholder-nav" aria-label="Future module controls">
                <button className="protocol-placeholder-link" type="button" onClick={() => setStatus(["Activity feed placeholder reserved for future release."])}>
                  Activity
                </button>
                <button className="protocol-placeholder-link" type="button" onClick={() => setStatus(["Approvals workspace placeholder reserved for future release."])}>
                  Approvals
                </button>
                <button className="protocol-placeholder-link" type="button" onClick={() => setStatus(["Template gallery placeholder reserved for future release."])}>
                  Templates
                </button>
              </div>

              <button className="protocol-primary-action" type="button" onClick={handleProtocolExport}>
                Export Protocol
              </button>
              <button className="protocol-secondary-action" type="button" onClick={handleSaveDraft}>
                Save Library
              </button>
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

            {sidebarTab === "view" ? (
              <div className="protocol-main-grid">
                <aside className="protocol-outline-pane">
                  <div className="protocol-outline-header">
                    <div>
                      <h2>{doc.protocol.title}</h2>
                      <p className="helper-text">Project: {protocolMeta.project}</p>
                    </div>
                    <button type="button" onClick={resetSelection}>
                      Clear
                    </button>
                  </div>

                  <div className="protocol-outline-toolbar">
                    <button type="button" onClick={() => updateDoc(addSection(doc, "New top-level section"))}>
                      Add section
                    </button>
                    <button
                      type="button"
                      onClick={() => selection.type === "section" && updateDoc(addSection(doc, "New subsection", selection.sectionId))}
                      disabled={selection.type !== "section"}
                    >
                      Add subsection
                    </button>
                    <button
                      type="button"
                      onClick={() => selection.type === "section" && updateDoc(addStep(doc, selection.sectionId, "New step"))}
                      disabled={selection.type !== "section"}
                    >
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
                      onReorderSection={(parentSectionId, sectionIds, targetSectionId) =>
                        updateDoc(reorderSections(doc, parentSectionId, sectionIds, targetSectionId))
                      }
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

                <section className="protocol-workspace">
                  <header className="protocol-workspace-header">
                    <div>
                      <h1>{doc.protocol.title}</h1>
                      <div className="protocol-workspace-meta">
                        <span className="protocol-status-badge">{protocolMeta.lifecycleStatus.toUpperCase()}</span>
                        <span>{protocolMeta.project}</span>
                        <span>{sectionCount} sections</span>
                        <span>{stepCount} steps</span>
                        <span>{activeProtocolLabel}</span>
                      </div>
                    </div>

                    <div className="protocol-workspace-actions">
                      <div className="protocol-workspace-switcher" role="tablist" aria-label="View workspace modes">
                        <button className={viewMode === "summary" ? "protocol-view-toggle active" : "protocol-view-toggle"} type="button" onClick={() => setViewMode("summary")}>
                          Summary
                        </button>
                        <button className={viewMode === "preview" ? "protocol-view-toggle active" : "protocol-view-toggle"} type="button" onClick={() => setViewMode("preview")}>
                          Preview
                        </button>
                        <button className={viewMode === "transfer" ? "protocol-view-toggle active" : "protocol-view-toggle"} type="button" onClick={() => setViewMode("transfer")}>
                          Transfer
                        </button>
                      </div>

                      <button type="button" onClick={() => setEditorModalOpen(true)}>
                        {openEditorLabel}
                      </button>
                      <button type="button" onClick={openModuleHome}>
                        Back to dashboard
                      </button>
                    </div>
                  </header>

                  {viewMode === "summary" && (
                    <div className="protocol-summary-view">
                      <article className="protocol-content-card protocol-content-card-accent protocol-content-card-hero">
                        <div className="protocol-card-heading">
                          <h3>Protocol Status</h3>
                          <span>Project assignment and workflow state</span>
                        </div>

                        <div className="protocol-form-grid">
                          <label>
                            Project
                            <input className="field" value={protocolMeta.project} onChange={(event) => handleProjectChange(event.target.value)} />
                          </label>
                          <label>
                            Review
                            <select className="field" value={protocolMeta.reviewStatus} onChange={(event) => handleReviewStatusChange(event.target.value as ReviewStatus)}>
                              <option value="reviewing">Reviewing</option>
                              <option value="reviewed">Reviewed</option>
                            </select>
                          </label>
                          <label>
                            Lifecycle
                            <select className="field" value={protocolMeta.lifecycleStatus} onChange={(event) => handleLifecycleStatusChange(event.target.value as LifecycleStatus)}>
                              <option value="active">Active</option>
                              <option value="archived">Archived</option>
                            </select>
                          </label>
                          <label>
                            Validation
                            <select className="field" value={protocolMeta.validationStatus} onChange={(event) => handleValidationStatusChange(event.target.value as ValidationStatus)}>
                              <option value="proposed">Proposed</option>
                              <option value="validated">Validated</option>
                            </select>
                          </label>
                        </div>
                      </article>

                      <article className="protocol-content-card">
                        <div className="protocol-card-heading">
                          <h3>Portfolio Snapshot</h3>
                          <span>{libraryState.protocols.length} protocol(s) in workspace</span>
                        </div>
                        <div className="protocol-summary-grid">
                          <div>
                            <span>Project</span>
                            <strong>{protocolMeta.project}</strong>
                            <small>Current project grouping</small>
                          </div>
                          <div>
                            <span>Reviewed</span>
                            <strong>{protocolMeta.reviewStatus === "reviewed" ? "Yes" : "No"}</strong>
                            <small>{protocolMeta.reviewStatus === "reviewed" ? "Ready for reuse" : "Still in review cycle"}</small>
                          </div>
                          <div>
                            <span>Archived</span>
                            <strong>{protocolMeta.lifecycleStatus === "archived" ? "Yes" : "No"}</strong>
                            <small>{protocolMeta.lifecycleStatus === "archived" ? "Hidden from active queue" : "Shown in active queue"}</small>
                          </div>
                          <div>
                            <span>Validated</span>
                            <strong>{protocolMeta.validationStatus === "validated" ? "Yes" : "No"}</strong>
                            <small>{protocolMeta.validationStatus === "validated" ? "Validation complete" : "Still proposed"}</small>
                          </div>
                        </div>
                      </article>

                      <article className="protocol-content-card">
                        <div className="protocol-card-heading">
                          <h3>Current Protocol</h3>
                          <span>{doc.protocol.id}</span>
                        </div>
                        <p className="protocol-observation-copy">
                          {doc.protocol.description || "Use the editor to add a protocol description, then organize sections and steps from the outline."}
                        </p>
                        <div className="protocol-summary-grid">
                          <div>
                            <span>Sections</span>
                            <strong>{sectionCount}</strong>
                            <small>All nested sections included</small>
                          </div>
                          <div>
                            <span>Steps</span>
                            <strong>{stepCount}</strong>
                            <small>Procedural steps in this protocol</small>
                          </div>
                          <div>
                            <span>Reagents</span>
                            <strong>{doc.protocol.reagents.length}</strong>
                            <small>Tracked reagent records</small>
                          </div>
                          <div>
                            <span>Equipment</span>
                            <strong>{doc.protocol.equipment.length}</strong>
                            <small>Tracked equipment records</small>
                          </div>
                        </div>
                      </article>

                      {selection.type === "protocol" && (
                        <>
                          <article className="protocol-content-card">
                            <div className="protocol-card-heading">
                              <h3>Section Library</h3>
                              <span>{doc.protocol.sections.length} top-level section(s)</span>
                            </div>
                            {doc.protocol.sections.length === 0 ? (
                              <p className="helper-text">No sections yet. Use the outline toolbar to add the first section.</p>
                            ) : (
                              <div className="protocol-compact-list">
                                {doc.protocol.sections.map((section) => (
                                  <button className="protocol-library-link" type="button" key={section.id} onClick={() => selectSection(section.id)}>
                                    <span>{section.title}</span>
                                    <strong>{countStepsInSection(section)} step(s)</strong>
                                  </button>
                                ))}
                              </div>
                            )}
                          </article>

                          <article className="protocol-content-card">
                            <div className="protocol-card-heading">
                              <h3>Lead Step</h3>
                              <span>{firstStepRecord ? firstStepRecord.section.title : "No step selected yet"}</span>
                            </div>
                            <p className="protocol-observation-copy">
                              {firstStepRecord
                                ? getQuickSummaryText(firstStepRecord.step)
                                : "Add a step to the outline to start building the procedural body of this protocol."}
                            </p>
                          </article>
                        </>
                      )}

                      {selection.type === "section" && focusedSection && (
                        <>
                          <article className="protocol-content-card protocol-content-card-accent">
                            <div className="protocol-card-heading">
                              <h3>{focusedSection.title}</h3>
                              <span>Section</span>
                            </div>
                            <p className="protocol-observation-copy">
                              {focusedSection.description || "No section description yet. Open the editor if you want to add context for this section."}
                            </p>
                            <div className="protocol-summary-grid">
                              <div>
                                <span>Direct steps</span>
                                <strong>{focusedSection.steps.length}</strong>
                                <small>Immediate steps inside this section</small>
                              </div>
                              <div>
                                <span>Total steps</span>
                                <strong>{countStepsInSection(focusedSection)}</strong>
                                <small>Includes nested subsections</small>
                              </div>
                              <div>
                                <span>Subsections</span>
                                <strong>{focusedSection.sections.length}</strong>
                                <small>Immediate nested groups</small>
                              </div>
                              <div>
                                <span>Selection</span>
                                <strong>Section</strong>
                                <small>Editing scope for the modal editor</small>
                              </div>
                            </div>
                          </article>

                          <article className="protocol-content-card">
                            <div className="protocol-card-heading">
                              <h3>Contained Steps</h3>
                              <span>{focusedSection.steps.length} step(s)</span>
                            </div>
                            {focusedSection.steps.length === 0 ? (
                              <p className="helper-text">No steps in this section yet.</p>
                            ) : (
                              <div className="protocol-compact-list">
                                {focusedSection.steps.map((step) => (
                                  <button className="protocol-library-link" type="button" key={step.id} onClick={() => selectStep(focusedSection.id, step.id)}>
                                    <span>{step.title}</span>
                                    <strong>{formatStepKind(step.stepKind)}</strong>
                                  </button>
                                ))}
                              </div>
                            )}
                          </article>
                        </>
                      )}

                      {selection.type === "step" && focusedStep && (
                        <>
                          <article className="protocol-content-card protocol-content-card-accent">
                            <div className="protocol-card-heading">
                              <h3>{focusedStep.title}</h3>
                              <span>{formatStepKind(focusedStep.stepKind)}</span>
                            </div>
                            <p className="protocol-observation-copy">{getQuickSummaryText(focusedStep)}</p>
                            <div className="protocol-summary-grid">
                              <div>
                                <span>Section</span>
                                <strong>{focusedSection?.title ?? "Unknown section"}</strong>
                                <small>Current parent section</small>
                              </div>
                              <div>
                                <span>Blocks</span>
                                <strong>{focusedStep.blocks.length}</strong>
                                <small>Structured content blocks</small>
                              </div>
                              <div>
                                <span>Special blocks</span>
                                <strong>{countSpecialBlocks(focusedStep)}</strong>
                                <small>Non-paragraph support blocks</small>
                              </div>
                              <div>
                                <span>Optional</span>
                                <strong>{focusedStep.optional ? "Yes" : "No"}</strong>
                                <small>{focusedStep.optional ? "Can be skipped" : "Required in standard workflow"}</small>
                              </div>
                            </div>
                          </article>

                          <article className="protocol-content-card">
                            <div className="protocol-card-heading">
                              <h3>Block Outline</h3>
                              <span>{focusedStep.blocks.length} block(s)</span>
                            </div>
                            <div className="protocol-compact-list">
                              {focusedStep.blocks.map((block, index) => (
                                <div className="protocol-compact-row" key={block.id}>
                                  <div>
                                    <strong>
                                      {index + 1}. {formatBlockType(block.type)}
                                    </strong>
                                    <span>{getBlockSummary(block)}</span>
                                  </div>
                                  <div className="protocol-compact-meta">
                                    <span>{block.type}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </article>
                        </>
                      )}
                    </div>
                  )}

                  {viewMode === "preview" && (
                    <section className="protocol-tab-panel" aria-label="Preview and print workspace">
                      <div className="protocol-panel-header">
                        <h3>Render Preview</h3>
                        <button type="button" onClick={handlePrintPreview}>
                          Export PDF / Print
                        </button>
                      </div>
                      <p className="section-intro">
                        The export opens a print-ready document so the PDF renderer only sees the protocol content and its print styles.
                      </p>
                      <div className="print-surface protocol-preview-surface" ref={previewRef}>
                        <PreviewPanel doc={doc} />
                      </div>
                    </section>
                  )}

                  {viewMode === "transfer" && (
                    <section className="protocol-tab-panel" aria-label="Import and export workspace">
                      <div className="protocol-panel-header">
                        <h3>Import / Export</h3>
                        <span className="protocol-transfer-kicker">JSON pipelines, templates, and assisted AI imports</span>
                      </div>
                      <ImportExportPanel
                        importMode={importMode}
                        setImportMode={setImportMode}
                        jsonText={jsonText}
                        setJsonText={setJsonText}
                        onImportText={() => {
                          const parsed = safeJsonParse<unknown>(jsonText);
                          if (!parsed.ok) {
                            setStatus([`Invalid JSON: ${parsed.error}`]);
                            return;
                          }
                          importParsed(parsed.value);
                        }}
                        onFileUpload={async (file) => {
                          const text = await file.text();
                          setJsonText(text);
                          const parsed = safeJsonParse<unknown>(text);
                          if (!parsed.ok) {
                            setStatus([`Invalid uploaded JSON: ${parsed.error}`]);
                            return;
                          }
                          importParsed(parsed.value);
                        }}
                        onCopyExport={async () => {
                          await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
                          setStatus(["Exported JSON copied to clipboard."]);
                        }}
                        onDownloadExport={() => downloadTextFile(`${doc.protocol.id || "protocol"}.json`, JSON.stringify(doc, null, 2))}
                        onCopyAiInstructions={async () => {
                          await navigator.clipboard.writeText(AI_IMPORT_INSTRUCTIONS_TEXT);
                          setStatus(["AI import instructions copied to clipboard."]);
                        }}
                        onDownloadTemplate={() => downloadTextFile("protocol-template-example.json", JSON.stringify(createProtocolForMode("template"), null, 2))}
                        status={status}
                      />
                    </section>
                  )}
                </section>
              </div>
            ) : (
              <section className="protocol-main-panel">
                <header className="protocol-page-header">
                  <div>
                    <p className="protocol-page-kicker">{sidebarTab === "overview" ? "Portfolio overview" : "Protocol library"}</p>
                    <h1>{sidebarTab === "overview" ? "OVERVIEW" : "LIBRARY"}</h1>
                    <p className="hero-subtitle">
                      {sidebarTab === "overview"
                        ? "Track every current protocol by project, review state, archive state, and validation state."
                        : "Browse the full protocol inventory, grouped by project, then jump any protocol straight into VIEW."}
                    </p>
                  </div>

                  <div className="protocol-workspace-meta">
                    <span>{totalProjects} project(s)</span>
                    <span>{totalProtocols} protocol(s)</span>
                    <span>{totalActive} active</span>
                  </div>
                </header>

                {sidebarTab === "overview" ? (
                  <div className="protocol-summary-view">
                    <article className="protocol-content-card protocol-content-card-accent protocol-content-card-hero">
                      <div className="protocol-card-heading">
                        <h3>Workspace Totals</h3>
                        <span>Across every current protocol</span>
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
                          <small>Current library size</small>
                        </div>
                        <div>
                          <span>Reviewed / reviewing</span>
                          <strong>
                            {totalReviewed} / {totalReviewing}
                          </strong>
                          <small>Quality-review split</small>
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
                            <strong>{group.protocols[0]?.protocol.title ?? "None"}</strong>
                            <small>First available protocol in this project</small>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="protocol-library-grid">
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
                            const metadata = getProtocolMetadata(protocol);
                            return (
                              <button className="protocol-library-card" type="button" key={protocol.protocol.id} onClick={() => openProtocolFromLibrary(protocol.protocol.id)}>
                                <div>
                                  <strong>{protocol.protocol.title}</strong>
                                  <span>{protocol.protocol.description || "No description yet."}</span>
                                </div>
                                <div className="protocol-library-statuses">
                                  <span>{metadata.reviewStatus}</span>
                                  <span>{metadata.lifecycleStatus}</span>
                                  <span>{metadata.validationStatus}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          {newProtocolModalOpen && (
            <div className="step-modal-overlay" onClick={() => setNewProtocolModalOpen(false)}>
              <div className="step-modal protocol-new-modal" role="dialog" aria-modal="true" aria-label="Create a new protocol" onClick={(event) => event.stopPropagation()}>
                <div className="step-modal-header">
                  <span className="outline-marker">Create Protocol</span>
                  <button className="step-modal-close" onClick={() => setNewProtocolModalOpen(false)} aria-label="Close create protocol dialog">
                    X
                  </button>
                </div>
                <div className="step-modal-body protocol-new-modal-body">
                  <p className="protocol-observation-copy">Choose how the next protocol should start.</p>
                  <div className="protocol-new-grid">
                    <button className="protocol-new-choice" type="button" onClick={() => handleCreateProtocol("blank")}>
                      <strong>Blank</strong>
                      <span>Open VIEW with a clean protocol shell.</span>
                    </button>
                    <button className="protocol-new-choice" type="button" onClick={() => handleCreateProtocol("template")}>
                      <strong>Template</strong>
                      <span>Open VIEW with the starter protocol template loaded.</span>
                    </button>
                    <button className="protocol-new-choice" type="button" onClick={() => handleCreateProtocol("import-files")}>
                      <strong>Import files</strong>
                      <span>Start blank, jump to Transfer, then upload an existing file.</span>
                    </button>
                    <button className="protocol-new-choice" type="button" onClick={() => handleCreateProtocol("import-json")}>
                      <strong>Import JSON</strong>
                      <span>Start blank, jump to Transfer, then paste or upload JSON.</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {editorModalOpen && (
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
          )}
        </main>
      )}
    </>
  );
};

const loadLibraryState = (): ProtocolLibraryState => {
  const storedLibrary = localStorage.getItem(LIBRARY_STORAGE_KEY);
  if (storedLibrary) {
    const parsed = safeJsonParse<unknown>(storedLibrary);
    if (parsed.ok && isLibraryPayload(parsed.value)) {
      const protocols = parsed.value.protocols
        .map((candidate) => validateStoredProtocol(candidate))
        .filter((candidate): candidate is ProtocolDocument => Boolean(candidate));

      if (protocols.length > 0) {
        return normalizeLibraryState(protocols, parsed.value.activeProtocolId);
      }
    }
  }

  const storedLegacyDocument = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (storedLegacyDocument) {
    const parsed = safeJsonParse<unknown>(storedLegacyDocument);
    if (parsed.ok) {
      const doc = validateStoredProtocol(parsed.value);
      if (doc) {
        return normalizeLibraryState([doc], doc.protocol.id);
      }
    }
  }

  return createInitialLibrary();
};

const validateStoredProtocol = (value: unknown): ProtocolDocument | null => {
  const result = validateProtocolDocument(value, { mode: "assisted" });
  if (!result.success || !result.data) return null;
  return ensureProtocolMetadata(normalizeProtocolDocument(result.data));
};

const isLibraryPayload = (
  value: unknown
): value is { activeProtocolId?: string; protocols: unknown[] } =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as { protocols?: unknown[] }).protocols);

const countSections = (sections: ProtocolDocument["protocol"]["sections"]): number =>
  sections.reduce((total, section) => total + 1 + countSections(section.sections), 0);

const countSteps = (sections: ProtocolDocument["protocol"]["sections"]): number =>
  sections.reduce((total, section) => total + section.steps.length + countSteps(section.sections), 0);

const countStepsInSection = (section: ProtocolSection | null): number =>
  section ? section.steps.length + countSteps(section.sections) : 0;

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

const groupProtocolsByProject = (protocols: ProtocolDocument[]) => {
  const groups = new Map<
    string,
    {
      project: string;
      protocols: ProtocolDocument[];
      reviewed: number;
      reviewing: number;
      active: number;
      archived: number;
      validated: number;
      proposed: number;
    }
  >();

  protocols.forEach((protocol) => {
    const metadata = getProtocolMetadata(protocol);
    const current =
      groups.get(metadata.project) ??
      {
        project: metadata.project,
        protocols: [],
        reviewed: 0,
        reviewing: 0,
        active: 0,
        archived: 0,
        validated: 0,
        proposed: 0
      };

    current.protocols.push(protocol);
    current.reviewed += metadata.reviewStatus === "reviewed" ? 1 : 0;
    current.reviewing += metadata.reviewStatus === "reviewing" ? 1 : 0;
    current.active += metadata.lifecycleStatus === "active" ? 1 : 0;
    current.archived += metadata.lifecycleStatus === "archived" ? 1 : 0;
    current.validated += metadata.validationStatus === "validated" ? 1 : 0;
    current.proposed += metadata.validationStatus === "proposed" ? 1 : 0;
    groups.set(metadata.project, current);
  });

  return Array.from(groups.values()).sort((left, right) => left.project.localeCompare(right.project));
};

const cloneBlocks = (blocks: ProtocolBlock[]): ProtocolBlock[] =>
  JSON.parse(JSON.stringify(blocks)) as ProtocolBlock[];

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

const countSpecialBlocks = (step: ProtocolStep) =>
  step.blocks.filter((block) => block.type !== "paragraph" && block.type !== "note").length;

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
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  @page {
    margin: 14mm;
    size: auto;
  }

  html, body {
    margin: 0;
    background: #ffffff;
  }

  body.print-window-body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #1e1e1e;
  }

  .print-document {
    max-width: 900px;
    margin: 0 auto;
    padding: 24px 28px 40px;
    background: #ffffff;
  }

  .print-document-header {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #d6d0c3;
  }

  .print-document-header p {
    margin: 0 0 8px;
    color: #6e685c;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .print-document-header h1 {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 34px;
    font-weight: 500;
  }

  .editor-stack {
    gap: 20px;
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

  .preview-subcard {
    border: 1px solid #d6d0c3 !important;
    border-radius: 14px;
    padding: 12px 14px;
    background: #ffffff !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
  }

  .preview-note,
  .preview-caution,
  .preview-qc {
    background: #ffffff !important;
    border-left: 4px solid #b9b0a0;
  }

  .preview-caution {
    border-left-color: #c57967;
  }

  .preview-qc {
    border-left-color: #c29a3f;
  }

  .preview-table {
    width: 100%;
    border-collapse: collapse;
  }

  .preview-table th,
  .preview-table td {
    border-bottom: 1px solid #d6d0c3;
    padding: 8px 6px;
    text-align: left;
  }

  .preview-table thead {
    display: table-header-group;
  }

  a {
    color: #2d4e74;
    text-decoration: none;
  }
`;
