import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, Tag } from "@ilm/ui";
import type { ProtocolBlock, ProtocolDocument } from "@ilm/types";
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
  collectStepIds,
  deleteSection,
  deleteStep,
  deleteSteps,
  duplicateSection,
  duplicateStep,
  findStepLocation,
  moveSection,
  moveStep,
  pasteBlocksIntoStep,
  removeBlocksFromStep,
  reorderSection,
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

export const App = () => {
  const [doc, setDoc] = useState<ProtocolDocument>(createDefaultProtocol);
  const [selection, setSelection] = useState<Selection>({ type: "protocol" });
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [blockSelection, setBlockSelection] = useState<{ stepId: string; blockIds: string[] }>({ stepId: "", blockIds: [] });
  const [blockClipboard, setBlockClipboard] = useState<ProtocolBlock[]>([]);
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<ValidationMode>("assisted");
  const [activeTab, setActiveTab] = useState<AppTab>("author");
  const [activeModule, setActiveModule] = useState<ActiveModule>("home");
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

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

  const resetSelection = () => {
    setSelection({ type: "protocol" });
    setSelectedStepIds([]);
    clearBlockSelection();
  };

  const selectProtocol = () => {
    setSelection({ type: "protocol" });
    setSelectedStepIds([]);
    clearBlockSelection();
    setEditorModalOpen(true);
  };

  const selectSection = (sectionId: string) => {
    setSelection({ type: "section", sectionId });
    setSelectedStepIds([]);
    clearBlockSelection();
    setEditorModalOpen(true);
  };

  const selectStep = (sectionId: string, stepId: string, options?: { toggle: boolean }) => {
    clearBlockSelection();

    if (options?.toggle) {
      setSelectedStepIds((current) => {
        if (current.includes(stepId)) {
          const next = current.filter((id) => id !== stepId);
          if (next.length === 0) {
            setSelection({ type: "step", sectionId, stepId });
            return [stepId];
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
        setEditorModalOpen(true);
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
    if (selection.type === "step" && stepIds.includes(selection.stepId)) {
      setSelection({ type: "step", sectionId: destinationSectionId, stepId: selection.stepId });
    }
    setSelectedStepIds(stepIds);
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
    setActiveModule("protocol-manager");
    setActiveTab("author");
  };

  return (
    <main className="page-shell">
      <header className="app-header">
        <div>
          <p className="hero-kicker">Integrated Lab Manager</p>
          <h1 className="app-title">{activeModule === "home" ? "Module Home" : "Protocol Manager"}</h1>
        </div>
        <p className="hero-subtitle">
          {activeModule === "home"
            ? "Enter the live Protocol Manager now, and keep the future ILM modules visible as a clear product map."
            : "Write structured wet-lab protocols in focused tabs: authoring, print-ready preview, and transfer workflows."}
        </p>
      </header>

      {activeModule === "home" ? (
        <section className="home-layout" aria-label="Integrated Lab Manager home">
          <div className="hero-summary">
            <div className="stat-row">
              <Tag label="1 live module" tone="success" />
              <Tag label="3 planned modules" tone="neutral" />
              <Tag label={`${sectionCount} protocol sections saved`} tone="info" />
              <Tag label={`${stepCount} protocol steps saved`} tone="neutral" />
            </div>
          </div>

          <div className="module-grid">
            {MODULE_CARDS.map((module) => {
              const isLive = module.id === "protocol-manager";
              return (
                <article className={isLive ? "module-card live" : "module-card"} key={module.id}>
                  <div className="module-card-header">
                    <span className="outline-marker">ILM Module</span>
                    <Tag label={module.status} tone={isLive ? "success" : "neutral"} />
                  </div>
                  <h2>{module.title}</h2>
                  <p>{module.description}</p>
                  <button onClick={isLive ? openProtocolManager : undefined} disabled={!isLive}>
                    {module.actionLabel}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <>
          <div className="module-toolbar">
            <button onClick={() => setActiveModule("home")}>Back to module home</button>
            <div className="stat-row">
              <Tag label={`${sectionCount} sections`} tone="neutral" />
              <Tag label={`${stepCount} steps`} tone="info" />
              <Tag label={`${doc.protocol.reagents.length} reagents`} tone="success" />
              <Tag label={`${doc.protocol.equipment.length} equipment`} tone="neutral" />
            </div>
          </div>

          <div className="tab-strip" role="tablist" aria-label="Protocol manager views">
            <button className={activeTab === "author" ? "tab-button active" : "tab-button"} onClick={() => setActiveTab("author")} role="tab" aria-selected={activeTab === "author"}>
              Author
            </button>
            <button className={activeTab === "preview" ? "tab-button active" : "tab-button"} onClick={() => setActiveTab("preview")} role="tab" aria-selected={activeTab === "preview"}>
              Preview / Print
            </button>
            <button className={activeTab === "transfer" ? "tab-button active" : "tab-button"} onClick={() => setActiveTab("transfer")} role="tab" aria-selected={activeTab === "transfer"}>
              Import / Export
            </button>
          </div>

          {activeTab === "author" && (
            <section className="single-tab" aria-label="Authoring workspace">
              <Panel title="Outline">
                <div className="panel-content">
                  <p className="section-intro">
                    Build the protocol hierarchy first. Click any item to edit it in a centered floating editor. Steps can move across sections and subsections, and multi-selected steps can travel together.
                  </p>
                  <div className="toolbar">
                    <button onClick={() => updateDoc(addSection(doc, "New top-level section"))}>Add section</button>
                    <button onClick={() => selection.type === "section" && updateDoc(addSection(doc, "New subsection", selection.sectionId))} disabled={selection.type !== "section"}>
                      Add subsection
                    </button>
                    <button onClick={() => selection.type === "section" && updateDoc(addStep(doc, selection.sectionId, "New step"))} disabled={selection.type !== "section"}>
                      Add step
                    </button>
                    <button onClick={handleDuplicateSelection} disabled={selection.type === "protocol"}>
                      Duplicate
                    </button>
                    <button onClick={() => handleMoveSelection("up")} disabled={selection.type === "protocol" || (selection.type === "step" && selectedStepIds.length > 1)}>
                      Move up
                    </button>
                    <button onClick={() => handleMoveSelection("down")} disabled={selection.type === "protocol" || (selection.type === "step" && selectedStepIds.length > 1)}>
                      Move down
                    </button>
                    <button onClick={handleDeleteSelection} disabled={selection.type === "protocol"}>
                      Delete
                    </button>
                  </div>
                  <OutlinePanel
                    sections={doc.protocol.sections}
                    selection={selection}
                    selectedStepIds={selectedStepIds}
                    onSelectProtocol={selectProtocol}
                    onSelectSection={selectSection}
                    onSelectStep={selectStep}
                    onClearStepSelection={() => setSelectedStepIds(selection.type === "step" ? [selection.stepId] : [])}
                    onReorderSection={(parentSectionId, sectionId, targetSectionId) =>
                      updateDoc(reorderSection(doc, parentSectionId, sectionId, targetSectionId))
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
              </Panel>

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
            </section>
          )}

          {activeTab === "preview" && (
            <section className="single-tab" aria-label="Preview and print workspace">
              <Panel title="Render Preview">
                <div className="panel-content">
                  <div className="toolbar">
                    <button onClick={handlePrintPreview}>Export PDF / Print</button>
                  </div>
                  <p className="section-intro">
                    The export now opens a dedicated print-ready document so the PDF renderer only sees the protocol content and its print styles.
                  </p>
                  <div className="print-surface" ref={previewRef}>
                    <PreviewPanel doc={doc} />
                  </div>
                </div>
              </Panel>
            </section>
          )}

          {activeTab === "transfer" && (
            <section className="single-tab" aria-label="Import and export workspace">
              <Panel title="Import / Export">
                <div className="panel-content">
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
                </div>
              </Panel>
            </section>
          )}
        </>
      )}
    </main>
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
