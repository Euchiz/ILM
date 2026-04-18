import type { ProtocolBlock, ProtocolDocument, ProtocolSection, ProtocolStep } from "@ilm/types";

export const PreviewPanel = ({ doc }: { doc: ProtocolDocument }) => {
  const renderBlock = (block: ProtocolBlock) => {
    if (block.type === "paragraph") return <p>{block.text}</p>;
    if (block.type === "note") return <p className="preview-note">Note: {block.text}</p>;
    if (block.type === "caution") return <p className="preview-caution">Caution ({block.severity ?? "medium"}): {block.text}</p>;
    if (block.type === "qc") {
      return (
        <p className="preview-qc">
          QC checkpoint: <strong>{block.checkpoint}</strong>
          {block.acceptanceCriteria ? ` - ${block.acceptanceCriteria}` : ""}
        </p>
      );
    }
    if (block.type === "recipe") {
      return (
        <div className="preview-subcard">
          <strong>Recipe: {block.title || "Mixture"}</strong>
          <ul>
            {block.items.map((item, idx) => (
              <li key={idx}>
                {item.component}: {item.quantity}
                {item.notes ? ` (${item.notes})` : ""}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if (block.type === "timeline") {
      return (
        <div className="preview-subcard">
          <strong>Timeline</strong>
          <ol>
            {block.stages.map((stage, idx) => (
              <li key={idx}>
                {stage.label} - {stage.duration}
                {stage.temperature ? ` at ${stage.temperature}` : ""}
                {stage.details ? ` (${stage.details})` : ""}
              </li>
            ))}
          </ol>
        </div>
      );
    }
    if (block.type === "link") {
      return (
        <p>
          Link:{" "}
          <a href={block.url} target="_blank" rel="noreferrer">
            {block.label}
          </a>
        </p>
      );
    }
    if (block.type === "table") {
      return (
        <div className="preview-subcard">
          <strong>Table</strong>
          <table className="preview-table">
            <thead>
              <tr>{block.columns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (block.type === "fileReference") {
      return <p>File reference: {block.label} ({block.path})</p>;
    }
    return (
      <div className="preview-subcard">
        <strong>Branch</strong>
        <p>If {block.condition}</p>
        <p>Then continue with: {block.thenStepIds.join(", ") || "No target steps selected."}</p>
      </div>
    );
  };

  const renderStep = (step: ProtocolStep, label: string) => (
    <article key={step.id} className={`preview-step kind-${step.stepKind}`}>
      <h4>
        {label} {step.title} <small>({step.stepKind})</small>
      </h4>
      {step.blocks.map((block) => (
        <div key={block.id}>{renderBlock(block)}</div>
      ))}
    </article>
  );

  const renderSection = (section: ProtocolSection, path: string) => (
    <section key={section.id} className="preview-section">
      <h3>
        {path} {section.title}
      </h3>
      {section.description ? <p className="preview-description">{section.description}</p> : null}
      {section.steps.map((step, index) => renderStep(step, `${path}${index + 1}`))}
      {section.sections.map((subsection, index) => renderSection(subsection, `${path}${index + 1}.`))}
    </section>
  );

  return (
    <div className="editor-stack preview-document">
      <div>
        <h2>{doc.protocol.title}</h2>
        {doc.protocol.description ? <p className="preview-description">{doc.protocol.description}</p> : null}
      </div>

      {(doc.protocol.reagents.length > 0 || doc.protocol.equipment.length > 0) && (
        <div className="preview-subcard">
          {doc.protocol.reagents.length > 0 && (
            <div>
              <strong>Reagents</strong>
              <ul>
                {doc.protocol.reagents.map((reagent) => (
                  <li key={reagent.id}>
                    {reagent.name}
                    {reagent.catalogNumber ? ` (${reagent.catalogNumber})` : ""}
                    {reagent.supplier ? ` - ${reagent.supplier}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {doc.protocol.equipment.length > 0 && (
            <div>
              <strong>Equipment</strong>
              <ul>
                {doc.protocol.equipment.map((item) => (
                  <li key={item.id}>
                    {item.name}
                    {item.model ? ` (${item.model})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {doc.protocol.sections.map((section, index) => renderSection(section, `${index + 1}.`))}
    </div>
  );
};
