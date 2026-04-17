import { useState } from "react";
import type { ProtocolSection } from "@ilm/types";
import { Tag } from "@ilm/ui";
import type { Selection } from "../state/protocolState";

interface OutlinePanelProps {
  sections: ProtocolSection[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

export const OutlinePanel = ({ sections, selection, onSelect }: OutlinePanelProps) => {
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);

  const toggleCollapsed = (sectionId: string) => {
    setCollapsedIds((current) => (current.includes(sectionId) ? current.filter((id) => id !== sectionId) : [...current, sectionId]));
  };

  const renderSection = (section: ProtocolSection, level = 0) => {
    const isCollapsed = collapsedIds.includes(section.id);
    const isSectionSelected = selection.type === "section" && selection.sectionId === section.id;

    return (
      <div key={section.id} style={{ marginLeft: level * 16 }}>
        <div className={`tree-row ${isSectionSelected ? "active" : ""}`}>
          <button className="collapse-toggle" onClick={() => toggleCollapsed(section.id)}>
            {isCollapsed ? "+" : "-"}
          </button>
          <button className="outline-item" onClick={() => onSelect({ type: "section", sectionId: section.id })}>
            {section.title}
          </button>
          <Tag label={`${section.steps.length} steps`} tone="neutral" />
        </div>

        {!isCollapsed && (
          <div>
            {section.steps.map((step) => {
              const isStepSelected = selection.type === "step" && selection.stepId === step.id;

              return (
                <div className={`tree-row step-row ${isStepSelected ? "active" : ""}`} key={step.id}>
                  <span className="tree-spacer" />
                  <button className="outline-item step" onClick={() => onSelect({ type: "step", sectionId: section.id, stepId: step.id })}>
                    {step.title}
                  </button>
                  <Tag label={step.stepKind} tone={step.stepKind === "qc" ? "warning" : "info"} />
                </div>
              );
            })}
            {section.sections.map((subsection) => renderSection(subsection, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="outline-tree">
      <button className={`outline-root ${selection.type === "protocol" ? "active" : ""}`} onClick={() => onSelect({ type: "protocol" })}>
        Protocol metadata
      </button>
      {sections.map((section) => renderSection(section))}
    </div>
  );
};
