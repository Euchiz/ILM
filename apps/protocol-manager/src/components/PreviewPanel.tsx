import type { ProtocolBlock, ProtocolDocument, ProtocolSection, ProtocolStep, StepKind } from "@ilm/types";
import {
  Play,
  FlaskConical,
  CheckCircle,
  EyeOff,
  PauseCircle,
  Trash2,
  BarChart2
} from "lucide-react";

const STEP_KIND_ICONS: Record<StepKind, React.ReactNode> = {
  action: <Play size={14} />,
  preparation: <FlaskConical size={14} />,
  qc: <CheckCircle size={14} />,
  optional: <EyeOff size={14} />,
  pause: <PauseCircle size={14} />,
  cleanup: <Trash2 size={14} />,
  analysis: <BarChart2 size={14} />
};

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
        <div className="preview-subcard preview-subcard-recipe">
          <strong>Recipe: {block.title || "Mixture"}</strong>
          <ul>
            {block.items.map((item, idx) => (
              <li key={idx}>
                <span className="recipe-component">{item.component}</span>
                <span className="recipe-quantity">{item.quantity}</span>
                {item.notes ? <span className="recipe-notes">{item.notes}</span> : null}
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
          <div className="timeline-track">
            {block.stages.map((stage, idx) => (
              <div className="timeline-stage" key={idx}>
                <div className="timeline-stage-bar" />
                <div className="timeline-stage-label">{stage.label}</div>
                <div className="timeline-stage-meta">
                  <span>{stage.duration}</span>
                  {stage.temperature ? <span>{stage.temperature}</span> : null}
                </div>
                {stage.details ? <div className="timeline-stage-details">{stage.details}</div> : null}
              </div>
            ))}
          </div>
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
        <span className="preview-step-kind-icon">{STEP_KIND_ICONS[step.stepKind]}</span>
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
