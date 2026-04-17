import type { ProtocolSection } from "@ilm/types";
import { Tag } from "@ilm/ui";
import type { Selection } from "../state/protocolState";

interface OutlinePanelProps {
  sections: ProtocolSection[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

export const OutlinePanel = ({ sections, selection, onSelect }: OutlinePanelProps) => {
  const renderSection = (section: ProtocolSection, level = 0) => (
    <div key={section.id} style={{ marginLeft: level * 12, marginBottom: 8 }}>
      <button
        className={selection.type === "section" && selection.sectionId === section.id ? "outline-item active" : "outline-item"}
        onClick={() => onSelect({ type: "section", sectionId: section.id })}
      >
        📁 {section.title}
      </button>
      {section.steps.map((step) => (
        <button
          key={step.id}
          className={selection.type === "step" && selection.stepId === step.id ? "outline-item step active" : "outline-item step"}
          onClick={() => onSelect({ type: "step", sectionId: section.id, stepId: step.id })}
        >
          ▸ {step.title} <Tag label={step.stepKind} tone={step.stepKind === "qc" ? "warning" : "info"} />
        </button>
      ))}
      {section.sections.map((sub) => renderSection(sub, level + 1))}
    </div>
  );

  return <div>{sections.map((section) => renderSection(section))}</div>;
};
