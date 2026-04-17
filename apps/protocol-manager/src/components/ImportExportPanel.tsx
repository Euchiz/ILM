import { AI_IMPORT_PANEL_TITLE, AI_IMPORT_INSTRUCTIONS_TEXT } from "@ilm/ai-import";
import type { ValidationMode } from "@ilm/validation";

interface ImportExportPanelProps {
  importMode: ValidationMode;
  setImportMode: (mode: ValidationMode) => void;
  jsonText: string;
  setJsonText: (text: string) => void;
  onImportText: () => void;
  onFileUpload: (file: File) => void;
  onCopyExport: () => void;
  status: string[];
}

export const ImportExportPanel = ({
  importMode,
  setImportMode,
  jsonText,
  setJsonText,
  onImportText,
  onFileUpload,
  onCopyExport,
  status
}: ImportExportPanelProps) => (
  <div className="editor-stack">
    <div className="mode-switch">
      <label className="checkbox-row">
        <input type="radio" checked={importMode === "assisted"} onChange={() => setImportMode("assisted")} />
        Assisted import
      </label>
      <label className="checkbox-row">
        <input type="radio" checked={importMode === "strict"} onChange={() => setImportMode("strict")} />
        Strict import
      </label>
    </div>

    <textarea
      rows={14}
      value={jsonText}
      onChange={(event) => setJsonText(event.target.value)}
      placeholder="Paste protocol JSON here"
      className="field"
    />

    <div className="toolbar">
      <button onClick={onImportText}>Import JSON</button>
      <button onClick={onCopyExport}>Copy exported JSON</button>
      <label className="file-input">
        Upload JSON
        <input
          type="file"
          accept="application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFileUpload(file);
          }}
        />
      </label>
    </div>

    {status.length > 0 && (
      <ul className="status-list">
        {status.map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
    )}

    <div>
      <h3>{AI_IMPORT_PANEL_TITLE}</h3>
      <textarea readOnly rows={16} value={AI_IMPORT_INSTRUCTIONS_TEXT} className="field" />
    </div>
  </div>
);
