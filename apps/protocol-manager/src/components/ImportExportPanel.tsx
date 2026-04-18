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
  onDownloadExport: () => void;
  onCopyAiInstructions: () => void;
  onDownloadTemplate: () => void;
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
  onDownloadExport,
  onCopyAiInstructions,
  onDownloadTemplate,
  status
}: ImportExportPanelProps) => (
  <div className="transfer-stack">
    <section className="transfer-block">
      <div className="transfer-heading">
        <h3>Export current protocol</h3>
        <p className="helper-text">The JSON stays off-page. Use copy or download when you need the canonical document.</p>
      </div>
      <div className="toolbar">
        <button onClick={onCopyExport}>Copy JSON</button>
        <button onClick={onDownloadExport}>Download JSON</button>
      </div>
    </section>

    <section className="transfer-block">
      <div className="transfer-heading">
        <h3>Import protocol JSON</h3>
        <p className="helper-text">Paste JSON or upload a file. Assisted mode allows warnings; strict mode blocks them.</p>
      </div>

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
        rows={10}
        value={jsonText}
        onChange={(event) => setJsonText(event.target.value)}
        placeholder="Paste protocol JSON here for import"
        className="field"
      />

      <div className="toolbar">
        <button onClick={onImportText}>Import pasted JSON</button>
        <label className="file-input">
          Upload JSON file
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
    </section>

    <section className="transfer-block">
      <div className="transfer-heading">
        <h3>{AI_IMPORT_PANEL_TITLE}</h3>
        <p className="helper-text">Copy the instructions, attach your legacy protocol text, and ask an AI system to produce valid Protocol Manager JSON.</p>
      </div>
      <div className="toolbar">
        <button onClick={onCopyAiInstructions}>Copy AI instructions</button>
        <button onClick={onDownloadTemplate}>Download template example</button>
      </div>
      <textarea readOnly rows={12} value={AI_IMPORT_INSTRUCTIONS_TEXT} className="field" />
    </section>

    {status.length > 0 && (
      <ul className="status-list">
        {status.map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
    )}
  </div>
);
