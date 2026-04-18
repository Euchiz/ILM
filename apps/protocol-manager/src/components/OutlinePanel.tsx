import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProtocolSection, ProtocolStep } from "@ilm/types";
import { Tag } from "@ilm/ui";
import type { Selection } from "../state/protocolState";
import { ActionMenu } from "./ActionMenu";

interface OutlinePanelProps {
  sections: ProtocolSection[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onReorderSection: (parentSectionId: string | null, sectionId: string, targetSectionId: string) => void;
  onReorderStep: (sectionId: string, stepId: string, targetStepId: string) => void;
  onAddSubsection: (sectionId: string) => void;
  onAddStep: (sectionId: string) => void;
  onDuplicateSection: (sectionId: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onDuplicateStep: (sectionId: string, stepId: string) => void;
  onDeleteStep: (sectionId: string, stepId: string) => void;
}

const getSectionDragId = (sectionId: string) => `section:${sectionId}`;
const getStepDragId = (stepId: string) => `step:${stepId}`;

export const OutlinePanel = ({
  sections,
  selection,
  onSelect,
  onReorderSection,
  onReorderStep,
  onAddSubsection,
  onAddStep,
  onDuplicateSection,
  onDeleteSection,
  onDuplicateStep,
  onDeleteStep
}: OutlinePanelProps) => {
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const toggleCollapsed = (sectionId: string) => {
    setCollapsedIds((current) => (current.includes(sectionId) ? current.filter((id) => id !== sectionId) : [...current, sectionId]));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;
    if (!activeData || !overData || activeData.type !== overData.type) return;

    if (activeData.type === "section" && activeData.parentSectionId === overData.parentSectionId && activeData.sectionId !== overData.sectionId) {
      onReorderSection(activeData.parentSectionId, activeData.sectionId, overData.sectionId);
    }

    if (activeData.type === "step" && activeData.sectionId === overData.sectionId && activeData.stepId !== overData.stepId) {
      onReorderStep(activeData.sectionId, activeData.stepId, overData.stepId);
    }
  };

  const renderSectionList = (sectionList: ProtocolSection[], parentSectionId: string | null, pathPrefix = "") => (
    <SortableContext items={sectionList.map((section) => getSectionDragId(section.id))} strategy={verticalListSortingStrategy}>
      <div className="outline-subsections">
        {sectionList.map((section, index) => (
          <SortableSectionCard
            collapsedIds={collapsedIds}
            key={section.id}
            level={pathPrefix ? pathPrefix.split(".").length : 0}
            onAddStep={onAddStep}
            onAddSubsection={onAddSubsection}
            onDeleteSection={onDeleteSection}
            onDeleteStep={onDeleteStep}
            onDuplicateSection={onDuplicateSection}
            onDuplicateStep={onDuplicateStep}
            onSelect={onSelect}
            parentSectionId={parentSectionId}
            renderChildren={renderSectionList}
            section={section}
            sectionPath={pathPrefix ? `${pathPrefix}.${index + 1}` : `${index + 1}`}
            selection={selection}
            toggleCollapsed={toggleCollapsed}
          />
        ))}
      </div>
    </SortableContext>
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="outline-tree">
        <button className={selection.type === "protocol" ? "outline-root active" : "outline-root"} onClick={() => onSelect({ type: "protocol" })}>
          <span className="outline-marker">Protocol</span>
          <strong>{selection.type === "protocol" ? "Editing metadata" : "Open protocol metadata"}</strong>
        </button>
        <p className="helper-text">Drag cards by their handles to reorder sections and steps. Use the action menus for quick edits.</p>
        {renderSectionList(sections, null)}
      </div>
    </DndContext>
  );
};

interface SortableSectionCardProps {
  section: ProtocolSection;
  sectionPath: string;
  parentSectionId: string | null;
  selection: Selection;
  collapsedIds: string[];
  level: number;
  onSelect: (selection: Selection) => void;
  onAddSubsection: (sectionId: string) => void;
  onAddStep: (sectionId: string) => void;
  onDuplicateSection: (sectionId: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onDuplicateStep: (sectionId: string, stepId: string) => void;
  onDeleteStep: (sectionId: string, stepId: string) => void;
  toggleCollapsed: (sectionId: string) => void;
  renderChildren: (sections: ProtocolSection[], parentSectionId: string | null, pathPrefix?: string) => JSX.Element;
}

const SortableSectionCard = ({
  section,
  sectionPath,
  parentSectionId,
  selection,
  collapsedIds,
  level,
  onSelect,
  onAddSubsection,
  onAddStep,
  onDuplicateSection,
  onDeleteSection,
  onDuplicateStep,
  onDeleteStep,
  toggleCollapsed,
  renderChildren
}: SortableSectionCardProps) => {
  const isCollapsed = collapsedIds.includes(section.id);
  const isSectionSelected = selection.type === "section" && selection.sectionId === section.id;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: getSectionDragId(section.id),
    data: { type: "section", parentSectionId, sectionId: section.id }
  });

  return (
    <article
      className={`outline-card level-${Math.min(level, 3)} ${isSectionSelected ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="outline-card-header">
        <button className="drag-handle" ref={setActivatorNodeRef} type="button" {...attributes} {...listeners}>
          ::
        </button>
        <button className="collapse-toggle" onClick={() => toggleCollapsed(section.id)}>
          {isCollapsed ? "+" : "-"}
        </button>
        <button className="outline-card-title" onClick={() => onSelect({ type: "section", sectionId: section.id })}>
          <span className="outline-marker">Section {sectionPath}</span>
          <strong>{section.title}</strong>
          {section.description ? <small>{section.description}</small> : null}
        </button>
        <ActionMenu
          buttonClassName="menu-trigger"
          label="..."
          items={[
            { label: "Add step", onSelect: () => onAddStep(section.id) },
            { label: "Add subsection", onSelect: () => onAddSubsection(section.id) },
            { label: "Duplicate section", onSelect: () => onDuplicateSection(section.id) },
            { label: "Delete section", onSelect: () => onDeleteSection(section.id), tone: "danger" }
          ]}
        />
      </div>

      <div className="outline-card-tags">
        <Tag label={`${section.steps.length} steps`} tone="neutral" />
        {section.sections.length > 0 ? <Tag label={`${section.sections.length} subsections`} tone="info" /> : null}
      </div>

      {!isCollapsed ? (
        <div className="outline-card-body">
          {section.steps.length > 0 ? (
            <SortableContext items={section.steps.map((step) => getStepDragId(step.id))} strategy={verticalListSortingStrategy}>
              <div className="outline-step-list">
                {section.steps.map((step, index) => (
                  <SortableStepPill
                    index={index}
                    key={step.id}
                    onDeleteStep={onDeleteStep}
                    onDuplicateStep={onDuplicateStep}
                    onSelect={onSelect}
                    sectionId={section.id}
                    sectionPath={sectionPath}
                    selection={selection}
                    step={step}
                  />
                ))}
              </div>
            </SortableContext>
          ) : (
            <p className="helper-text">No steps in this section yet.</p>
          )}

          {section.sections.length > 0 ? renderChildren(section.sections, section.id, sectionPath) : null}
        </div>
      ) : null}
    </article>
  );
};

interface SortableStepPillProps {
  step: ProtocolStep;
  index: number;
  sectionId: string;
  sectionPath: string;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onDuplicateStep: (sectionId: string, stepId: string) => void;
  onDeleteStep: (sectionId: string, stepId: string) => void;
}

const SortableStepPill = ({
  step,
  index,
  sectionId,
  sectionPath,
  selection,
  onSelect,
  onDuplicateStep,
  onDeleteStep
}: SortableStepPillProps) => {
  const isStepSelected = selection.type === "step" && selection.stepId === step.id;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: getStepDragId(step.id),
    data: { type: "step", sectionId, stepId: step.id }
  });

  return (
    <div
      className={isStepSelected ? "outline-step-pill selected" : "outline-step-pill"}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.7 : 1 }}
    >
      <button className="drag-handle step" ref={setActivatorNodeRef} type="button" {...attributes} {...listeners}>
        ::
      </button>
      <button className="outline-step-content" onClick={() => onSelect({ type: "step", sectionId, stepId: step.id })}>
        <span className="outline-step-index">{sectionPath}.{index + 1}</span>
        <span className="outline-step-copy">
          <strong>{step.title}</strong>
          <span>{step.stepKind}</span>
        </span>
      </button>
      <ActionMenu
        buttonClassName="menu-trigger step"
        label="..."
        items={[
          { label: "Duplicate step", onSelect: () => onDuplicateStep(sectionId, step.id) },
          { label: "Delete step", onSelect: () => onDeleteStep(sectionId, step.id), tone: "danger" }
        ]}
      />
    </div>
  );
};
