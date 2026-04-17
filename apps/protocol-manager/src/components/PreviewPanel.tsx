import type { ProtocolBlock, ProtocolDocument, ProtocolSection, ProtocolStep } from "@ilm/types";

export const PreviewPanel = ({ doc }: { doc: ProtocolDocument }) => {
  const renderBlock = (block: ProtocolBlock) => {
    if (block.type === "paragraph") return <p>{block.text}</p>;
    if (block.type === "note") return <p style={{ background: "#f8fafc", padding: 8 }}>📝 {block.text}</p>;
    if (block.type === "caution") return <p style={{ borderLeft: "4px solid #ef4444", paddingLeft: 8 }}>⚠️ {block.text}</p>;
    if (block.type === "qc")
      return (
        <p style={{ borderLeft: "4px solid #eab308", paddingLeft: 8 }}>
          ✅ <strong>{block.checkpoint}</strong>
          {block.acceptanceCriteria ? ` — ${block.acceptanceCriteria}` : ""}
        </p>
      );
    if (block.type === "recipe")
      return (
        <div>
          <strong>Recipe: {block.title || "Mixture"}</strong>
          <ul>{block.items.map((item, idx) => <li key={idx}>{item.component}: {item.quantity}</li>)}</ul>
        </div>
      );
    if (block.type === "timeline")
      return (
        <ol>
          {block.stages.map((stage, idx) => (
            <li key={idx}>{stage.label} — {stage.duration} {stage.temperature ? `(${stage.temperature})` : ""}</li>
          ))}
        </ol>
      );
    if (block.type === "link") return <p>🔗 <a href={block.url}>{block.label}</a></p>;
    return <pre>{JSON.stringify(block, null, 2)}</pre>;
  };

  const renderStep = (step: ProtocolStep, index: number) => (
    <article key={step.id} className={`preview-step kind-${step.stepKind}`}>
      <h4>
        {index + 1}. {step.title} <small>({step.stepKind})</small>
      </h4>
      {step.blocks.map((block) => <div key={block.id}>{renderBlock(block)}</div>)}
    </article>
  );

  const renderSection = (section: ProtocolSection, path: string) => (
    <section key={section.id} className="preview-section">
      <h3>{path} {section.title}</h3>
      {section.steps.map((step, index) => renderStep(step, index))}
      {section.sections.map((sub, index) => renderSection(sub, `${path}${index + 1}.`))}
    </section>
  );

  return (
    <div>
      <h2>{doc.protocol.title}</h2>
      <p>{doc.protocol.description}</p>
      {doc.protocol.sections.map((section, index) => renderSection(section, `${index + 1}.`))}
    </div>
  );
};
