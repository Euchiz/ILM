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

  const renderSection = (section: ProtocolSection, sectionPath: string, level = 0) => {
    const isCollapsed = collapsedIds.includes(section.id);
    const isSectionSelected = selection.type === "section" && selection.sectionId === section.id;

    return (
      <article className={`outline-card level-${level} ${isSectionSelected ? "selected" : ""}`} key={section.id}>
        <div className="outline-card-header">
          <button className="collapse-toggle" onClick={() => toggleCollapsed(section.id)}>
            {isCollapsed ? "+" : "-"}
          </button>
          <button className="outline-card-title" onClick={() => onSelect({ type: "section", sectionId: section.id })}>
            <span className="outline-marker">Section {sectionPath}</span>
            <strong>{section.title}</strong>
            {section.description ? <small>{section.description}</small> : null}
          </button>
        </div>

        <div className="outline-card-tags">
          <Tag label={`${section.steps.length} steps`} tone="neutral" />
          {section.sections.length > 0 ? <Tag label={`${section.sections.length} subsections`} tone="info" /> : null}
        </div>

        {!isCollapsed && (
          <div className="outline-card-body">
            {section.steps.length > 0 ? (
              <div className="outline-step-list">
                {section.steps.map((step, index) => {
                  const isStepSelected = selection.type === "step" && selection.stepId === step.id;

                  return (
                    <button
                      className={isStepSelected ? "outline-step-pill selected" : "outline-step-pill"}
                      key={step.id}
                      onClick={() => onSelect({ type: "step", sectionId: section.id, stepId: step.id })}
                    >
                      <span className="outline-step-index">{sectionPath}.{index + 1}</span>
                      <span className="outline-step-copy">
                        <strong>{step.title}</strong>
                        <span>{step.stepKind}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="helper-text">No steps in this section yet.</p>
            )}

            {section.sections.length > 0 ? (
              <div className="outline-subsections">
                {section.sections.map((subsection, index) => renderSection(subsection, `${sectionPath}.${index + 1}`, level + 1))}
              </div>
            ) : null}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="outline-tree">
      <button className={selection.type === "protocol" ? "outline-root active" : "outline-root"} onClick={() => onSelect({ type: "protocol" })}>
        <span className="outline-marker">Protocol</span>
        <strong>{selection.type === "protocol" ? "Editing metadata" : "Open protocol metadata"}</strong>
      </button>
      {sections.map((section, index) => renderSection(section, `${index + 1}`))}
    </div>
  );
};
