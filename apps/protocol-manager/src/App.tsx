import { useEffect, useMemo, useState } from "react";
import { Panel, Tag } from "@ilm/ui";
import type { ProtocolDocument } from "@ilm/types";
import { safeJsonParse, nowIso } from "@ilm/utils";
import type { ValidationMode } from "@ilm/validation";
import { AI_IMPORT_INSTRUCTIONS_TEXT } from "@ilm/ai-import";
import { normalizeProtocolDocument, validateProtocolDocument } from "@ilm/validation";
import { createDefaultProtocol } from "./lib/defaultProtocol";
import { EditorPanel } from "./components/EditorPanel";
import { ImportExportPanel } from "./components/ImportExportPanel";
import { OutlinePanel } from "./components/OutlinePanel";
import { PreviewPanel } from "./components/PreviewPanel";
import {
  addSection,
  addStep,
  deleteSection,
  deleteStep,
  duplicateSection,
  duplicateStep,
  moveSection,
  moveStep,
  type Selection
} from "./state/protocolState";

const STORAGE_KEY = "ilm.protocol-manager.document";
type AppTab = "author" | "preview" | "transfer";

export const App = () => {
  const [doc, setDoc] = useState<ProtocolDocument>(createDefaultProtocol);
  const [selection, setSelection] = useState<Selection>({ type: "protocol" });
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<ValidationMode>("assisted");
  const [activeTab, setActiveTab] = useState<AppTab>("author");

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

  const updateDoc = (nextDoc: ProtocolDocument) => {
    setDoc({ ...nextDoc, protocol: { ...nextDoc.protocol, updatedAt: nowIso() } });
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
    setSelection({ type: "protocol" });
    setStatus([
      `Import successful (${importMode} mode).`,
      ...result.warnings.map((warning) => `Warning: ${warning}`)
    ]);
  };

  const resetSelection = () => setSelection({ type: "protocol" });

  const handleDeleteSelection = () => {
    if (selection.type === "section") {
      updateDoc(deleteSection(doc, selection.sectionId));
      resetSelection();
    }

    if (selection.type === "step") {
      updateDoc(deleteStep(doc, selection.sectionId, selection.stepId));
      setSelection({ type: "section", sectionId: selection.sectionId });
    }
  };

  const handleDuplicateSelection = () => {
    if (selection.type === "section") updateDoc(duplicateSection(doc, selection.sectionId));
    if (selection.type === "step") updateDoc(duplicateStep(doc, selection.sectionId, selection.stepId));
  };

  const handleMoveSelection = (direction: "up" | "down") => {
    if (selection.type === "section") updateDoc(moveSection(doc, selection.sectionId, direction));
    if (selection.type === "step") updateDoc(moveStep(doc, selection.sectionId, selection.stepId, direction));
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

  return (
    <main className="page-shell">
      <header className="app-header">
        <div>
          <p className="hero-kicker">Integrated Lab Manager</p>
          <h1 className="app-title">Protocol Manager</h1>
        </div>
        <p className="hero-subtitle">
          Write structured wet-lab protocols in focused tabs: authoring, print-ready preview, and transfer workflows.
        </p>
      </header>

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

      <div className="hero-summary">
        <div className="stat-row">
          <Tag label={`${sectionCount} sections`} tone="neutral" />
          <Tag label={`${stepCount} steps`} tone="info" />
          <Tag label={`${doc.protocol.reagents.length} reagents`} tone="success" />
          <Tag label={`${doc.protocol.equipment.length} equipment`} tone="neutral" />
        </div>
      </div>

      {activeTab === "author" && (
        <section className="author-layout" aria-label="Authoring workspace">
          <Panel title="Outline">
            <div className="panel-content">
              <p className="section-intro">
                Build the protocol hierarchy first. The outline is interactive and grouped into section cards with nested steps.
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
                <button onClick={() => handleMoveSelection("up")} disabled={selection.type === "protocol"}>
                  Move up
                </button>
                <button onClick={() => handleMoveSelection("down")} disabled={selection.type === "protocol"}>
                  Move down
                </button>
                <button onClick={handleDeleteSelection} disabled={selection.type === "protocol"}>
                  Delete
                </button>
              </div>
              <OutlinePanel sections={doc.protocol.sections} selection={selection} onSelect={setSelection} />
            </div>
          </Panel>

          <Panel title="Details">
            <div className="panel-content">
              <p className="section-intro">
                Refine the selected object on the right. Metadata and structured blocks are edited in compact detail bubbles.
              </p>
              <EditorPanel doc={doc} selection={selection} onDocChange={updateDoc} />
            </div>
          </Panel>
        </section>
      )}

      {activeTab === "preview" && (
        <section className="single-tab" aria-label="Preview and print workspace">
          <Panel title="Render Preview">
            <div className="panel-content">
              <div className="toolbar">
                <button onClick={() => window.print()}>Print / Save as PDF</button>
              </div>
              <p className="section-intro">
                Use your browser’s print dialog to save a PDF. The print stylesheet hides tabs and controls so the rendered protocol becomes the document.
              </p>
              <div className="print-surface">
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
    </main>
  );
};

const countSections = (sections: ProtocolDocument["protocol"]["sections"]): number =>
  sections.reduce((total, section) => total + 1 + countSections(section.sections), 0);

const countSteps = (sections: ProtocolDocument["protocol"]["sections"]): number =>
  sections.reduce((total, section) => total + section.steps.length + countSteps(section.sections), 0);
