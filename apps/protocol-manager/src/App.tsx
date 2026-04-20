import { useEffect, useMemo, useRef, useState } from "react";
import type { ProtocolBlock, ProtocolDocument, ProtocolSection, ProtocolStep } from "@ilm/types";
import { safeJsonParse, nowIso } from "@ilm/utils";
import type { ValidationMode } from "@ilm/validation";
import { AI_IMPORT_INSTRUCTIONS_TEXT } from "@ilm/ai-import";
import { normalizeProtocolDocument, validateProtocolDocument } from "@ilm/validation";
import { createDefaultProtocol } from "./lib/defaultProtocol";
import { ImportExportPanel } from "./components/ImportExportPanel";
import { OutlinePanel } from "./components/OutlinePanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { StepEditorModal } from "./components/StepEditorModal";
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
  findSectionParent,
  findStepLocation,
  moveSection,
  moveStep,
  pasteBlocksIntoStep,
  pasteSections,
  pasteStepsIntoSection,
  removeBlocksFromStep,
  reorderSections,
  type Selection,
  moveStepsToSection
} from "./state/protocolState";

const STORAGE_KEY = "ilm.protocol-manager.document";
type AppTab = "author" | "preview" | "transfer";
type ActiveModule = "home" | "protocol-manager";

const MODULE_CARDS = [
  {
    id: "protocol-manager",
    title: "Protocol Manager",
    status: "Available",
    description: "Structured wet-lab authoring, preview, printing, and import/export workflows.",
    actionLabel: "Open module"
  },
  {
    id: "supply-manager",
    title: "Supply Manager",
    status: "Planned",
    description: "Track reagents, catalog numbers, and stock relationships with future protocol links.",
    actionLabel: "Coming soon"
  },
  {
    id: "project-manager",
    title: "Project Manager",
    status: "Planned",
    description: "Coordinate milestones, linked protocols, and experiment planning across research workstreams.",
    actionLabel: "Coming soon"
  },
  {
    id: "funding-manager",
    title: "Funding Manager",
    status: "Planned",
    description: "Organize grants, budgets, and connections between funded work and protocol execution.",
    actionLabel: "Coming soon"
  }
] as const;

const APP_BASE_URL = import.meta.env.BASE_URL;

const buildPageUrl = (path: "" | "protocol-manager/") => new URL(path, window.location.origin + APP_BASE_URL).toString();

type AppProps = {
  page: ActiveModule;
};

export const App = ({ page }: AppProps) => {
  const [doc, setDoc] = useState<ProtocolDocument>(createDefaultProtocol);
  const [selection, setSelection] = useState<Selection>({ type: "protocol" });
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [blockSelection, setBlockSelection] = useState<{ stepId: string; blockIds: string[] }>({ stepId: "", blockIds: [] });
  const [blockClipboard, setBlockClipboard] = useState<ProtocolBlock[]>([]);
  const [stepClipboard, setStepClipboard] = useState<ProtocolStep[]>([]);
  const [sectionClipboard, setSectionClipboard] = useState<ProtocolSection[]>([]);
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<ValidationMode>("assisted");
  const [activeTab, setActiveTab] = useState<AppTab>("author");
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const isProtocolManagerPage = page === "protocol-manager";

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    const parsed = safeJsonParse<unknown>(stored);
    if (!parsed.ok) {
      setStatus([`Could not parse autosaved document: ${parsed.error}`]);
      return;
    }

    const result = validateProtocolDocument(parsed.value, { mode: "assisted" });
    if (!result.success || !result.data) {
      setStatus(["Could not restore autosaved protocol.", ...result.errors, ...result.warnings.map((warning) => `Warning: ${warning}`)]);
      return;
    }

    setDoc(normalizeProtocolDocument(result.data));
    if (result.warnings.length > 0) {
      setStatus(["Autosaved protocol restored with warnings.", ...result.warnings.map((warning) => `Warning: ${warning}`)]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc, null, 2));
  }, [doc]);

  const exportedJson = useMemo(() => JSON.stringify(doc, null, 2), [doc]);
  const templateJson = useMemo(() => JSON.stringify(createDefaultProtocol(), null, 2), []);
  const sectionCount = useMemo(() => countSections(doc.protocol.sections), [doc]);
  const stepCount = useMemo(() => countSteps(doc.protocol.sections), [doc]);
  const allStepIds = useMemo(() => collectStepIds(doc.protocol.sections), [doc]);
  const liveModuleCount = MODULE_CARDS.filter((module) => module.status === "Available").length;
  const plannedModuleCount = MODULE_CARDS.length - liveModuleCount;

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

  const updateDoc = (nextDoc: ProtocolDocument) => {
    setDoc({ ...nextDoc, protocol: { ...nextDoc.protocol, updatedAt: nowIso() } });
  };

  const clearBlockSelection = () => setBlockSelection({ stepId: "", blockIds: [] });

  const hasOutlineSelection =
    selection.type !== "protocol" || selectedStepIds.length > 0 || selectedSectionIds.length > 0 || blockSelection.blockIds.length > 0;

  const resetSelection = () => {
    setSelection({ type: "protocol" });
    setSelectedStepIds([]);
    setSelectedSectionIds([]);
    clearBlockSelection();
  };

  const selectProtocol = () => {
    setSelection({ type: "protocol" });
    setSelectedStepIds([]);
    setSelectedSectionIds([]);
    clearBlockSelection();
    setEditorModalOpen(true);
  };

  const selectSection = (sectionId: string, options?: { toggle: boolean }) => {
    setSelectedStepIds([]);
    clearBlockSelection();

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
    setEditorModalOpen(true);
  };

  const selectStep = (sectionId: string, stepId: string, options?: { toggle: boolean }) => {
    clearBlockSelection();
    setSelectedSectionIds([]);

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
          setSelection(
            nextLocation
              ? { type: "step", sectionId: nextLocation.sectionId, stepId: nextPrimary }
              : { type: "step", sectionId, stepId }
          );
          return next;
        }

        setSelection({ type: "step", sectionId, stepId });
        return [...current, stepId];
      });
      return;
    }

    setSelection({ type: "step", sectionId, stepId });
    setSelectedStepIds([stepId]);
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

    const normalized = normalizeProtocolDocument(result.data);
    setDoc({ ...normalized, protocol: { ...normalized.protocol, updatedAt: nowIso() } });
    resetSelection();
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

  const handleMoveSelection = (direction: "up" | "down") => {
    if (selection.type === "section") {
      updateDoc(moveSection(doc, selection.sectionId, direction));
      return;
    }

    if (selection.type === "step" && selectedStepIds.length <= 1) {
      updateDoc(moveStep(doc, selection.sectionId, selection.stepId, direction));
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
    if (!isProtocolManagerPage || activeTab !== "author") return;
    if (!hasOutlineSelection) return;
    if (editorModalOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (event.shiftKey || event.metaKey || event.ctrlKey) return;
      if (target.closest(".step-modal, [role='dialog'], [role='menu']")) return;
      if (target.closest(".outline-tree button, .outline-tree a, .outline-tree input, .outline-tree textarea, .outline-tree select")) return;
      if (target.closest(".outline-card.selected, .outline-card.group-selected, .outline-step-pill.selected, .outline-step-pill.group-selected")) return;
      resetSelection();
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProtocolManagerPage, activeTab, hasOutlineSelection, editorModalOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!isProtocolManagerPage || activeTab !== "author") return;

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
  }, [activeTab, handleCopyOutline, handleCutOutline, handlePasteOutline, isProtocolManagerPage, selection.type, stepClipboard.length, sectionClipboard.length]);

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
      <div class="print-document-header">
        <p>Integrated Lab Manager</p>
        <h1>${escapeHtml(doc.protocol.title)}</h1>
      </div>
      ${previewMarkup}
    </main>
    <script>
      window.addEventListener('load', function () {
        setTimeout(function () {
          window.focus();
          window.print();
        }, 250);
      });
    </script>
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

  const firstStepRecord = getFirstStepRecord(doc.protocol.sections);
  const focusedStepLocation = selection.type === "step" ? findStepLocation(doc.protocol.sections, selection.stepId) : null;
  const focusedSection =
    selection.type === "section"
      ? findSectionById(doc.protocol.sections, selection.sectionId)
      : selection.type === "step"
        ? findSectionById(doc.protocol.sections, selection.sectionId)
        : firstStepRecord?.section ?? doc.protocol.sections[0] ?? null;
  const focusedStep =
    selection.type === "step"
      ? focusedStepLocation?.step ?? null
      : focusedSection?.steps[0] ?? firstStepRecord?.step ?? null;
  const recipeBlock = getBlockOfType(focusedStep, "recipe");
  const tableBlock = getBlockOfType(focusedStep, "table");
  const timelineBlock = getBlockOfType(focusedStep, "timeline");
  const cautionBlock = getBlockOfType(focusedStep, "caution");
  const noteBlock = getBlockOfType(focusedStep, "note") ?? getBlockOfType(focusedStep, "paragraph");

  const handleProtocolExport = () => {
    if (activeTab !== "preview") {
      setActiveTab("preview");
      setStatus(["Switched to Preview / Print. Select Export Protocol again to open the print-ready document."]);
      return;
    }
    handlePrintPreview();
  };

  const handleSaveDraft = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc, null, 2));
    setStatus(["Draft saved locally. Autosave remains active in this browser session."]);
  };

  const handleNewProtocol = () => {
    setDoc(createDefaultProtocol());
    setSelection({ type: "protocol" });
    setSelectedStepIds([]);
    setSelectedSectionIds([]);
    clearBlockSelection();
    setEditorModalOpen(false);
    setStatus(["Started a fresh protocol draft."]);
  };

  const handleOpenFocusedEditor = () => {
    if (selection.type === "protocol") {
      selectProtocol();
      return;
    }
    setEditorModalOpen(true);
  };

  return (
    <>
      {page === "home" ? (
        <main className="dashboard-shell">
          <header className="dashboard-topbar">
            <div className="dashboard-brand">
              <div className="dashboard-brand-mark">ILM</div>
              <div>
                <p className="dashboard-brand-title">Rhine Lab</p>
                <p className="dashboard-brand-subtitle">System operations v4.02</p>
              </div>
            </div>

            <nav className="dashboard-nav" aria-label="Dashboard sections">
              <a className="active" href="#overview">
                Overview
              </a>
              <a href="#overview">Modules</a>
              <a href="#overview">Analytics</a>
              <a href="#overview">Logistics</a>
            </nav>

            <div className="dashboard-actions">
              <div className="dashboard-connection-badge">
                <span>SECURE_CONN</span>
                <strong>TS_782.9</strong>
              </div>
              <button className="dashboard-icon-button" type="button" onClick={() => window.print()} aria-label="Print report">
                ⌕
              </button>
              <button className="dashboard-icon-button" type="button" onClick={openProtocolManager} aria-label="Open protocol manager">
                ◎
              </button>
            </div>
          </header>

          <section className="dashboard-hero" id="overview">
            <div>
              <h1>Operations Summary</h1>
              <div className="dashboard-hero-meta">
                <span className="dashboard-status-live">Status: nominal</span>
                <span>Ref_ID: {doc.protocol.id || "RL-DSH-992-B"}</span>
                <span>Timestamp: {formatDisplayTimestamp(doc.protocol.updatedAt)}</span>
              </div>
            </div>
            <div className="dashboard-hero-actions">
              <button type="button" onClick={openProtocolManager}>
                Open Protocol Manager
              </button>
              <span>CONFIDENTIAL - INTERNAL USE ONLY</span>
            </div>
          </section>

          <section className="dashboard-layout" aria-label="Integrated Lab Manager module dashboard">
            <div className="dashboard-column">
              <article className="dashboard-metric-card">
                <div className="dashboard-card-header">
                  <h2>Protocol Matrix</h2>
                  <span>M-01</span>
                </div>
                <div className="dashboard-metric-row">
                  <span>Live modules</span>
                  <strong>{liveModuleCount}</strong>
                </div>
                <div className="dashboard-meter">
                  <span style={{ width: `${(liveModuleCount / MODULE_CARDS.length) * 100}%` }} />
                </div>
                <div className="dashboard-metric-row">
                  <span>Planned modules</span>
                  <strong>{plannedModuleCount}</strong>
                </div>
                <div className="dashboard-meter muted">
                  <span style={{ width: `${(plannedModuleCount / MODULE_CARDS.length) * 100}%` }} />
                </div>
                <p className="dashboard-card-footnote">Validation: static deployment ready</p>
              </article>

              <article className="dashboard-metric-card">
                <div className="dashboard-card-header">
                  <h2>Research Projects</h2>
                  <span>M-03</span>
                </div>
                <div className="dashboard-metric-row">
                  <span>Protocol sections</span>
                  <strong>{sectionCount}</strong>
                </div>
                <div className="dashboard-meter">
                  <span style={{ width: `${Math.min(100, Math.max(18, sectionCount * 9))}%` }} />
                </div>
                <div className="dashboard-metric-row">
                  <span>Protocol steps</span>
                  <strong>{stepCount}</strong>
                </div>
                <div className="dashboard-meter muted">
                  <span style={{ width: `${Math.min(100, Math.max(22, stepCount * 3))}%` }} />
                </div>
                <p className="dashboard-card-footnote">Status: deployment ready</p>
              </article>
            </div>

            <article className="dashboard-schematic">
              <div className="dashboard-schematic-label">FIG_01: CORE_LIFECYCLE_SCHEMA</div>
              <div className="dashboard-grid-background" />
              <button className="dashboard-node dashboard-node-top" type="button" onClick={openProtocolManager}>
                Protocol
              </button>
              <button className="dashboard-node dashboard-node-left" type="button">
                Projects
              </button>
              <button className="dashboard-node dashboard-node-right" type="button">
                Supply
              </button>
              <button className="dashboard-node dashboard-node-bottom" type="button">
                Funding
              </button>
              <div className="dashboard-core-node">
                <span className="dashboard-core-mark">◎</span>
                <p>Matrix Flow</p>
                <strong>Integrated Lab Manager</strong>
              </div>
              <div className="dashboard-schematic-foot">
                <span>Scale: 1:1.024</span>
                <span>Auth: Level_5</span>
              </div>
            </article>

            <div className="dashboard-column">
              <article className="dashboard-metric-card">
                <div className="dashboard-card-header">
                  <h2>Supply Chain</h2>
                  <span>M-02</span>
                </div>
                <div className="dashboard-metric-row">
                  <span>Reagents</span>
                  <strong>{doc.protocol.reagents.length}</strong>
                </div>
                <div className="dashboard-meter">
                  <span style={{ width: `${Math.min(100, Math.max(12, doc.protocol.reagents.length * 15))}%` }} />
                </div>
                <div className="dashboard-metric-row">
                  <span>Equipment</span>
                  <strong>{doc.protocol.equipment.length}</strong>
                </div>
                <div className="dashboard-meter muted">
                  <span style={{ width: `${Math.min(100, Math.max(16, doc.protocol.equipment.length * 16))}%` }} />
                </div>
                <p className="dashboard-card-footnote dashboard-warning">Warning: low inventory telemetry</p>
              </article>

              <article className="dashboard-metric-card">
                <div className="dashboard-card-header">
                  <h2>Fund Allocation</h2>
                  <span>M-04</span>
                </div>
                <div className="dashboard-metric-row">
                  <span>Authors</span>
                  <strong>{doc.protocol.authors.length}</strong>
                </div>
                <div className="dashboard-meter">
                  <span style={{ width: `${Math.min(100, Math.max(10, doc.protocol.authors.length * 18))}%` }} />
                </div>
                <div className="dashboard-metric-row">
                  <span>Tagged workflows</span>
                  <strong>{doc.protocol.tags.length}</strong>
                </div>
                <div className="dashboard-meter muted">
                  <span style={{ width: `${Math.min(100, Math.max(10, doc.protocol.tags.length * 18))}%` }} />
                </div>
                <p className="dashboard-card-footnote">Burn rate: stable</p>
              </article>
            </div>
          </section>

          <footer className="dashboard-footer">
            <span>Proprietary &amp; schematic data © Rhine Lab Biological Research</span>
            <span>
              SYSTEM_NODE: 0X8FA2 // PROTOCOL_REV: {doc.protocol.id || "S-99"}
            </span>
          </footer>
        </main>
      ) : (
        <main className="protocol-shell">
          <header className="protocol-topbar">
            <button className="protocol-wordmark" type="button" onClick={openModuleHome} aria-label="Return to module home">
              <span className="material-symbols-outlined protocol-wordmark-glyph" aria-hidden="true">biotech</span>
              <span className="protocol-wordmark-text">RHINE_PROTOCOL_V4</span>
            </button>

            <div className="protocol-topbar-controls">
              <div className="protocol-tab-nav" role="tablist" aria-label="Protocol manager views">
                <button className={activeTab === "author" ? "protocol-tab-link active" : "protocol-tab-link"} type="button" role="tab" aria-selected={activeTab === "author"} onClick={() => setActiveTab("author")}>
                  Editor
                </button>
                <button className={activeTab === "preview" ? "protocol-tab-link active" : "protocol-tab-link"} type="button" role="tab" aria-selected={activeTab === "preview"} onClick={() => setActiveTab("preview")}>
                  Preview
                </button>
                <button className={activeTab === "transfer" ? "protocol-tab-link active" : "protocol-tab-link"} type="button" role="tab" aria-selected={activeTab === "transfer"} onClick={() => setActiveTab("transfer")}>
                  Transfer
                </button>
              </div>

              <button className="protocol-utility-link" type="button" onClick={() => setStatus(["Version history UI is not wired yet. Protocol autosave is active."])}>
                History
              </button>
              <button className="protocol-utility-link" type="button" onClick={() => setStatus(["Settings panel is not wired yet. Edit document metadata from the focused editor for now."])}>
                Settings
              </button>
              <button className="protocol-primary-action" type="button" onClick={handleProtocolExport}>
                Export_Protocol
              </button>
              <button className="protocol-secondary-action" type="button" onClick={handleSaveDraft}>
                Save_Draft
              </button>
            </div>
          </header>

          <div className="protocol-body">
            <aside className="protocol-side-rail" aria-label="Protocol manager navigation">
              <button className="protocol-rail-item" type="button" onClick={openModuleHome}>
                <span className="material-symbols-outlined protocol-rail-glyph" aria-hidden="true">dashboard</span>
                <span>Module Home</span>
              </button>
              <button className={activeTab === "author" ? "protocol-rail-item active" : "protocol-rail-item"} type="button" onClick={() => setActiveTab("author")}>
                <span className="material-symbols-outlined protocol-rail-glyph" aria-hidden="true">science</span>
                <span>Sequencing</span>
              </button>
              <button className={activeTab === "preview" ? "protocol-rail-item active" : "protocol-rail-item"} type="button" onClick={() => setActiveTab("preview")}>
                <span className="material-symbols-outlined protocol-rail-glyph" aria-hidden="true">visibility</span>
                <span>Preview</span>
              </button>
              <button className={activeTab === "transfer" ? "protocol-rail-item active" : "protocol-rail-item"} type="button" onClick={() => setActiveTab("transfer")}>
                <span className="material-symbols-outlined protocol-rail-glyph" aria-hidden="true">swap_vert</span>
                <span>Transfer</span>
              </button>
              <button className="protocol-rail-item protocol-rail-item-strong" type="button" onClick={handleNewProtocol}>
                <span>New_Protocol</span>
              </button>
            </aside>

            <div className="protocol-main-grid">
              <aside className="protocol-outline-pane">
                <div className="protocol-outline-header">
                  <h2>Protocol Outline</h2>
                  <button type="button" onClick={resetSelection} aria-label="Clear selection">
                    ≡
                  </button>
                </div>

                <div className="protocol-outline-toolbar">
                  <button type="button" onClick={() => updateDoc(addSection(doc, "New top-level section"))}>
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
                </div>

                <div className="protocol-outline-scroll">
                  <OutlinePanel
                    sections={doc.protocol.sections}
                    selection={selection}
                    selectedStepIds={selectedStepIds}
                    selectedSectionIds={selectedSectionIds}
                    onSelectProtocol={selectProtocol}
                    onSelectSection={selectSection}
                    onSelectStep={selectStep}
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
                    <h1>
                      {activeTab === "author"
                        ? focusedStep?.title ?? focusedSection?.title ?? doc.protocol.title
                        : activeTab === "preview"
                          ? "Protocol Preview / Print"
                          : "Import / Export Transfer Desk"}
                    </h1>
                    <div className="protocol-workspace-meta">
                      {activeTab === "author" ? (
                        <>
                          <span className="protocol-status-badge">{getStepStatusLabel(focusedStep)}</span>
                          <span>ID: {doc.protocol.id || "PROT-99-AXIS-02"}</span>
                          <span>Section: {focusedSection?.title ?? "Protocol Overview"}</span>
                        </>
                      ) : (
                        <>
                          <span className="protocol-status-badge">{activeTab === "preview" ? "PRINT_READY" : "SYNC_READY"}</span>
                          <span>Sections: {sectionCount}</span>
                          <span>Steps: {stepCount}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="protocol-workspace-actions">
                    <button type="button" onClick={handleOpenFocusedEditor}>
                      Open focused editor
                    </button>
                    <button type="button" onClick={openModuleHome}>
                      Back to dashboard
                    </button>
                  </div>
                </header>

                {activeTab === "author" && (
                  <div className="protocol-editor-canvas">
                    <article className="protocol-content-card">
                      <div className="protocol-card-heading">
                        <h3>Reagent Matrix</h3>
                        <span>{doc.protocol.reagents.length} loaded</span>
                      </div>
                      <table className="protocol-data-table">
                        <thead>
                          <tr>
                            <th>Reagent</th>
                            <th>Supplier</th>
                            <th>Catalog</th>
                            <th>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {doc.protocol.reagents.slice(0, 5).map((reagent) => (
                            <tr key={reagent.id}>
                              <td>{reagent.name}</td>
                              <td>{reagent.supplier || "Internal"}</td>
                              <td>{reagent.catalogNumber || "N/A"}</td>
                              <td>{reagent.notes || "Ready for run"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </article>

                    <article className="protocol-content-card protocol-content-card-accent">
                      <div className="protocol-card-heading">
                        <h3>Thermocycling Conditions</h3>
                        <button className="protocol-inline-link" type="button" onClick={handleOpenFocusedEditor}>
                          Edit parameters
                        </button>
                      </div>

                      {timelineBlock ? (
                        <div className="protocol-timeline-grid">
                          {timelineBlock.stages.map((stage) => (
                            <div className="protocol-timeline-stage" key={`${stage.label}-${stage.duration}`}>
                              <span>{stage.label}</span>
                              <strong>{stage.temperature || stage.duration}</strong>
                              <small>{stage.details || stage.duration}</small>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="protocol-summary-grid">
                          <div>
                            <span>Step kind</span>
                            <strong>{formatStepKind(focusedStep?.stepKind)}</strong>
                          </div>
                          <div>
                            <span>Block count</span>
                            <strong>{focusedStep?.blocks.length ?? 0}</strong>
                          </div>
                          <div>
                            <span>Equipment</span>
                            <strong>{doc.protocol.equipment.length}</strong>
                          </div>
                        </div>
                      )}
                    </article>

                    {cautionBlock && (
                      <article className="protocol-content-card protocol-callout protocol-callout-warning">
                        <div className="protocol-card-heading">
                          <h3>Safety Precaution</h3>
                          <span>{(cautionBlock.severity || "medium").toUpperCase()}</span>
                        </div>
                        <p>{cautionBlock.text}</p>
                      </article>
                    )}

                    <article className="protocol-content-card">
                      <div className="protocol-card-heading">
                        <h3>Technical Observation</h3>
                        <span>{formatStepKind(focusedStep?.stepKind)}</span>
                      </div>
                      <p className="protocol-observation-copy">
                        {noteBlock
                          ? "text" in noteBlock
                            ? noteBlock.text
                            : "Review the selected step in the focused editor for the full narrative."
                          : "Select a section or step from the protocol outline to inspect its narrative blocks, safety notes, and structured content."}
                      </p>
                    </article>

                    {(recipeBlock || tableBlock) && (
                      <article className="protocol-content-card">
                        <div className="protocol-card-heading">
                          <h3>{recipeBlock ? recipeBlock.title || "Component Recipe" : "Structured Table"}</h3>
                          <span>{recipeBlock ? `${recipeBlock.items.length} components` : `${tableBlock?.rows.length ?? 0} rows`}</span>
                        </div>

                        {recipeBlock ? (
                          <div className="protocol-summary-grid">
                            {recipeBlock.items.map((item) => (
                              <div key={`${item.component}-${item.quantity}`}>
                                <span>{item.component}</span>
                                <strong>{item.quantity}</strong>
                                <small>{item.notes || "No note"}</small>
                              </div>
                            ))}
                          </div>
                        ) : tableBlock ? (
                          <table className="protocol-data-table">
                            <thead>
                              <tr>
                                {tableBlock.columns.map((column) => (
                                  <th key={column}>{column}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tableBlock.rows.map((row, index) => (
                                <tr key={`${index}-${row.join("-")}`}>
                                  {row.map((cell, cellIndex) => (
                                    <td key={`${index}-${cellIndex}`}>{cell}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : null}
                      </article>
                    )}
                  </div>
                )}

                {activeTab === "preview" && (
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

                {activeTab === "transfer" && (
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
                        await navigator.clipboard.writeText(exportedJson);
                        setStatus(["Exported JSON copied to clipboard."]);
                      }}
                      onDownloadExport={() => downloadTextFile(`${doc.protocol.id || "protocol"}.json`, exportedJson)}
                      onCopyAiInstructions={async () => {
                        await navigator.clipboard.writeText(AI_IMPORT_INSTRUCTIONS_TEXT);
                        setStatus(["AI import instructions copied to clipboard."]);
                      }}
                      onDownloadTemplate={() => downloadTextFile("protocol-template-example.json", templateJson)}
                      status={status}
                    />
                  </section>
                )}
              </section>
            </div>
          </div>

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

const countSections = (sections: ProtocolDocument["protocol"]["sections"]): number =>
  sections.reduce((total, section) => total + 1 + countSections(section.sections), 0);

const countSteps = (sections: ProtocolDocument["protocol"]["sections"]): number =>
  sections.reduce((total, section) => total + section.steps.length + countSteps(section.sections), 0);

const orderStepIdsByDocument = (doc: ProtocolDocument, stepIds: string[]) => {
  const selectedIds = new Set(stepIds);
  return collectStepIds(doc.protocol.sections).filter((stepId) => selectedIds.has(stepId));
};

const findSectionById = (sections: ProtocolSection[], sectionId: string): ProtocolSection | null => {
  for (const section of sections) {
    if (section.id === sectionId) return section;
    const nested = findSectionById(section.sections, sectionId);
    if (nested) return nested;
  }
  return null;
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

const getBlockOfType = <T extends ProtocolBlock["type"]>(step: ProtocolStep | null | undefined, type: T): Extract<ProtocolBlock, { type: T }> | null => {
  if (!step) return null;
  const block = step.blocks.find((item) => item.type === type);
  return (block as Extract<ProtocolBlock, { type: T }> | undefined) ?? null;
};

const formatDisplayTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const formatStepKind = (value?: ProtocolStep["stepKind"]) => {
  if (!value) return "Protocol";
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getStepStatusLabel = (step: ProtocolStep | null) => {
  if (!step) return "STANDBY";
  if (step.optional) return "OPTIONAL";
  if (step.stepKind === "qc") return "QC_READY";
  if (step.stepKind === "analysis") return "ANALYSIS";
  return "IN_PROGRESS";
};

const cloneBlocks = (blocks: ProtocolBlock[]): ProtocolBlock[] =>
  JSON.parse(JSON.stringify(blocks)) as ProtocolBlock[];

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

  .preview-section {
    gap: 14px;
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
