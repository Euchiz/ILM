import { useEffect, useMemo, useState } from "react";
import { Panel } from "@ilm/ui";
import type { ProtocolDocument } from "@ilm/types";
import { safeJsonParse, nowIso } from "@ilm/utils";
import type { ValidationMode } from "@ilm/validation";
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

export const App = () => {
  const [doc, setDoc] = useState<ProtocolDocument>(createDefaultProtocol);
  const [selection, setSelection] = useState<Selection>({ type: "protocol" });
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<ValidationMode>("assisted");

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
    if (selection.type === "section") {
      updateDoc(duplicateSection(doc, selection.sectionId));
    }

    if (selection.type === "step") {
      updateDoc(duplicateStep(doc, selection.sectionId, selection.stepId));
    }
  };

  const handleMoveSelection = (direction: "up" | "down") => {
    if (selection.type === "section") {
      updateDoc(moveSection(doc, selection.sectionId, direction));
    }

    if (selection.type === "step") {
      updateDoc(moveStep(doc, selection.sectionId, selection.stepId, direction));
    }
  };

  return (
    <main>
      <header className="page-header">
        <div>
          <p className="eyebrow">Integrated Lab Manager</p>
          <h1>Protocol Manager</h1>
        </div>
        <p className="page-summary">
          Build structured wet-lab protocols as validated JSON with a scientist-friendly outline, editor, preview, and import workflow.
        </p>
      </header>

      <div className="layout">
        <Panel title="1) Outline panel">
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
        </Panel>

        <Panel title="2) Editor panel">
          <EditorPanel doc={doc} selection={selection} onDocChange={updateDoc} />
        </Panel>

        <Panel title="3) Preview panel">
          <PreviewPanel doc={doc} />
        </Panel>

        <Panel title="4) Import / export panel">
          <ImportExportPanel
            importMode={importMode}
            setImportMode={setImportMode}
            jsonText={jsonText || exportedJson}
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
            status={status}
          />
        </Panel>
      </div>
    </main>
  );
};
