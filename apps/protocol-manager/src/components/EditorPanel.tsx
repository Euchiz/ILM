import type { BlockType, ProtocolBlock, ProtocolDocument, ProtocolStep, StepKind } from "@ilm/types";
import { findSection, mapStep, updateProtocol } from "../state/protocolState";

interface EditorPanelProps {
  doc: ProtocolDocument;
  selectedStep: { sectionId: string; stepId: string } | null;
  onDocChange: (doc: ProtocolDocument) => void;
  onAddBlock: (type: BlockType) => void;
}

const STEP_KINDS: StepKind[] = ["action", "preparation", "qc", "optional", "pause", "cleanup", "analysis"];
const BLOCK_TYPES: BlockType[] = ["paragraph", "note", "caution", "qc", "recipe", "timeline", "link", "table", "fileReference", "branch"];

export const EditorPanel = ({ doc, selectedStep, onDocChange, onAddBlock }: EditorPanelProps) => {
  const section = selectedStep ? findSection(doc.protocol.sections, selectedStep.sectionId) : null;
  const step = selectedStep ? section?.steps.find((candidate) => candidate.id === selectedStep.stepId) : null;

  if (!step || !section) {
    return (
      <div>
        <h3>Protocol metadata</h3>
        <label>Title<input className="field" value={doc.protocol.title} onChange={(e) => onDocChange(updateProtocol(doc, "title", e.target.value))} /></label>
        <label>Description<textarea className="field" rows={4} value={doc.protocol.description ?? ""} onChange={(e) => onDocChange(updateProtocol(doc, "description", e.target.value))} /></label>
      </div>
    );
  }

  const saveStep = (nextStep: ProtocolStep) => {
    const nextSections = mapStep(doc.protocol.sections, section.id, step.id, () => nextStep);
    onDocChange({ ...doc, protocol: { ...doc.protocol, sections: nextSections } });
  };

  const saveBlock = (blockId: string, block: ProtocolBlock) => {
    saveStep({ ...step, blocks: step.blocks.map((candidate) => (candidate.id === blockId ? block : candidate)) });
  };

  return (
    <div>
      <h3>Step editor</h3>
      <label>Step title<input className="field" value={step.title} onChange={(e) => saveStep({ ...step, title: e.target.value })} /></label>
      <label>Step kind
        <select className="field" value={step.stepKind} onChange={(e) => saveStep({ ...step, stepKind: e.target.value as StepKind })}>
          {STEP_KINDS.map((kind) => <option value={kind} key={kind}>{kind}</option>)}
        </select>
      </label>
      <label>Add block
        <select className="field" onChange={(e) => { if (e.target.value) onAddBlock(e.target.value as BlockType); e.currentTarget.value = ""; }}>
          <option value="">Select block type</option>
          {BLOCK_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}
        </select>
      </label>
      <div style={{ display: "grid", gap: 8 }}>
        {step.blocks.map((block) => (
          <BlockEditor key={block.id} block={block} onChange={(next) => saveBlock(block.id, next)} />
        ))}
      </div>
    </div>
  );
};

const BlockEditor = ({ block, onChange }: { block: ProtocolBlock; onChange: (block: ProtocolBlock) => void }) => {
  if (block.type === "recipe") {
    return (
      <div className="card">
        <strong>Recipe block</strong>
        <input className="field" placeholder="Title" value={block.title ?? ""} onChange={(e) => onChange({ ...block, title: e.target.value })} />
        {block.items.map((item, index) => (
          <div className="grid-2" key={index}>
            <input className="field" placeholder="Component" value={item.component} onChange={(e) => onChange({ ...block, items: block.items.map((row, rowIndex) => rowIndex === index ? { ...row, component: e.target.value } : row) })} />
            <input className="field" placeholder="Quantity" value={item.quantity} onChange={(e) => onChange({ ...block, items: block.items.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: e.target.value } : row) })} />
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "timeline") {
    return (
      <div className="card">
        <strong>Timeline block</strong>
        {block.stages.map((stage, index) => (
          <div className="grid-2" key={index}>
            <input className="field" placeholder="Stage" value={stage.label} onChange={(e) => onChange({ ...block, stages: block.stages.map((row, rowIndex) => rowIndex === index ? { ...row, label: e.target.value } : row) })} />
            <input className="field" placeholder="Duration" value={stage.duration} onChange={(e) => onChange({ ...block, stages: block.stages.map((row, rowIndex) => rowIndex === index ? { ...row, duration: e.target.value } : row) })} />
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "qc") {
    return (
      <div className="card">
        <strong>QC block</strong>
        <input className="field" placeholder="Checkpoint" value={block.checkpoint} onChange={(e) => onChange({ ...block, checkpoint: e.target.value })} />
        <input className="field" placeholder="Acceptance criteria" value={block.acceptanceCriteria ?? ""} onChange={(e) => onChange({ ...block, acceptanceCriteria: e.target.value })} />
      </div>
    );
  }
  if (block.type === "caution") {
    return (
      <div className="card">
        <strong>Caution block</strong>
        <select className="field" value={block.severity ?? "medium"} onChange={(e) => onChange({ ...block, severity: e.target.value as "low" | "medium" | "high" })}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
        <textarea className="field" rows={3} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
      </div>
    );
  }
  if (block.type === "link") {
    return (
      <div className="card">
        <strong>Link block</strong>
        <input className="field" placeholder="Label" value={block.label} onChange={(e) => onChange({ ...block, label: e.target.value })} />
        <input className="field" placeholder="URL" value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} />
      </div>
    );
  }

  return (
    <div className="card">
      <strong>{block.type} block</strong>
      <textarea
        className="field"
        rows={3}
        value={(block as { text?: string }).text ?? ""}
        onChange={(e) => onChange({ ...(block as any), text: e.target.value })}
      />
    </div>
  );
};
