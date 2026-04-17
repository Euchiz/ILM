import { useEffect, useMemo, useState } from "react";
import { Panel } from "@ilm/ui";
import type { ProtocolDocument } from "@ilm/types";
import { safeJsonParse, nowIso } from "@ilm/utils";
import { normalizeProtocolDocument, validateProtocolDocument } from "@ilm/validation";
import { createDefaultProtocol } from "./lib/defaultProtocol";
import { EditorPanel } from "./components/EditorPanel";
import { ImportExportPanel } from "./components/ImportExportPanel";
import { OutlinePanel } from "./components/OutlinePanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { addBlockToStep, addSection, addStep, type Selection } from "./state/protocolState";

const STORAGE_KEY = "ilm.protocol-manager.document";

export const App = () => {
  const [doc, setDoc] = useState<ProtocolDocument>(createDefaultProtocol);
  const [selection, setSelection] = useState<Selection>({ type: "protocol" });
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const parsed = safeJsonParse<unknown>(stored);
    if (!parsed.ok) {
      setStatus([`Could not parse autosaved document: ${parsed.error}`]);
      return;
    }
    const result = validateProtocolDocument(parsed.value);
    if (result.success && result.data) {
      setDoc(normalizeProtocolDocument(result.data));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc, null, 2));
  }, [doc]);

  const exportedJson = useMemo(() => JSON.stringify(doc, null, 2), [doc]);

  const importParsed = (value: unknown) => {
    const result = validateProtocolDocument(value);
    if (!result.success || !result.data) {
      setStatus(["Import failed validation", ...result.errors]);
      return;
    }
    const normalized = normalizeProtocolDocument(result.data);
    setDoc({ ...normalized, protocol: { ...normalized.protocol, updatedAt: nowIso() } });
    setStatus(["Import successful", "Document normalized and loaded."]);
  };

  return (
    <main>
      <header>
        <h1>Integrated Lab Manager — Protocol Manager</h1>
      </header>
      <div className="layout">
        <Panel title="1) Outline panel">
          <div className="button-row">
            <button onClick={() => setDoc(addSection(doc, "New top-level section"))}>Add section</button>
            <button
              onClick={() => {
                if (selection.type === "section") {
                  setDoc(addSection(doc, "New subsection", selection.sectionId));
                }
              }}
            >
              Add subsection
            </button>
            <button
              onClick={() => {
                if (selection.type === "section") {
                  setDoc(addStep(doc, selection.sectionId, "New step"));
                }
              }}
            >
              Add step
            </button>
          </div>
          <OutlinePanel sections={doc.protocol.sections} selection={selection} onSelect={setSelection} />
        </Panel>

        <Panel title="2) Editor panel">
          <EditorPanel
            doc={doc}
            selectedStep={selection.type === "step" ? { sectionId: selection.sectionId, stepId: selection.stepId } : null}
            onDocChange={(nextDoc) => setDoc({ ...nextDoc, protocol: { ...nextDoc.protocol, updatedAt: nowIso() } })}
            onAddBlock={(type) => {
              if (selection.type !== "step") return;
              setDoc(addBlockToStep(doc, selection.sectionId, selection.stepId, type));
            }}
          />
        </Panel>

        <Panel title="3) Preview panel">
          <PreviewPanel doc={doc} />
        </Panel>

        <Panel title="4) Import / export panel">
          <ImportExportPanel
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
