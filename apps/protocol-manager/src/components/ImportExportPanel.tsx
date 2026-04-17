import { AI_IMPORT_PANEL_TITLE, AI_IMPORT_INSTRUCTIONS_TEXT } from "@ilm/ai-import";

interface ImportExportPanelProps {
  jsonText: string;
  setJsonText: (text: string) => void;
  onImportText: () => void;
  onFileUpload: (file: File) => void;
  onCopyExport: () => void;
  status: string[];
}

export const ImportExportPanel = ({
  jsonText,
  setJsonText,
  onImportText,
  onFileUpload,
  onCopyExport,
  status
}: ImportExportPanelProps) => (
  <div style={{ display: "grid", gap: 10 }}>
    <textarea
      rows={12}
      value={jsonText}
      onChange={(event) => setJsonText(event.target.value)}
      placeholder="Paste protocol JSON here"
      className="field"
    />
    <div className="button-row">
      <button onClick={onImportText}>Import pasted JSON</button>
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
      <textarea readOnly rows={14} value={AI_IMPORT_INSTRUCTIONS_TEXT} className="field" />
    </div>
  </div>
);
