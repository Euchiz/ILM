import { useState } from "react";
import {
  closestCorners,
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProtocolSection, ProtocolStep, StepKind } from "@ilm/types";
import { Tag } from "@ilm/ui";
import {
  Play,
  FlaskConical,
  CheckCircle,
  EyeOff,
  PauseCircle,
  Trash2,
  BarChart2
} from "lucide-react";
import type { Selection } from "../state/protocolState";
import { ActionMenu } from "./ActionMenu";

const STEP_KIND_ICONS: Record<StepKind, React.ReactNode> = {
  action: <Play size={13} />,
  preparation: <FlaskConical size={13} />,
  qc: <CheckCircle size={13} />,
  optional: <EyeOff size={13} />,
  pause: <PauseCircle size={13} />,
  cleanup: <Trash2 size={13} />,
  analysis: <BarChart2 size={13} />
};

interface OutlinePanelProps {
  sections: ProtocolSection[];
  selection: Selection;
  selectedStepIds: string[];
  selectedSectionIds: string[];
  onSelectProtocol: () => void;
  onSelectSection: (sectionId: string, options?: { toggle: boolean }) => void;
  onSelectStep: (sectionId: string, stepId: string, options?: { toggle: boolean }) => void;
  onClearOutlineSelection: () => void;
  onReorderSection: (parentSectionId: string | null, sectionIds: string[], targetSectionId: string) => void;
  onMoveSteps: (stepIds: string[], destinationSectionId: string, targetStepId?: string) => void;
  onAddSubsection: (sectionId: string) => void;
  onAddStep: (sectionId: string) => void;
  onDuplicateSection: (sectionId: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onDuplicateStep: (sectionId: string, stepId: string) => void;
  onDeleteStep: (sectionId: string, stepId: string) => void;
}

const getSectionDragId = (sectionId: string) => `section:${sectionId}`;
const getStepDragId = (stepId: string) => `step:${stepId}`;
const getSectionDropId = (sectionId: string) => `section-drop:${sectionId}`;

export const OutlinePanel = ({
  sections,
  selection,
  selectedStepIds,
  selectedSectionIds,
  onSelectProtocol,
  onSelectSection,
  onSelectStep,
  onClearOutlineSelection,
  onReorderSection,
  onMoveSteps,
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
    if (!activeData || !overData) return;

    if (activeData.type === "section" && overData.type === "section") {
      if (activeData.parentSectionId === overData.parentSectionId && activeData.sectionId !== overData.sectionId) {
        const movingSectionIds =
          Array.isArray(activeData.selectedSectionIds) && activeData.selectedSectionIds.includes(activeData.sectionId)
            ? activeData.selectedSectionIds
            : [activeData.sectionId];
        if (!movingSectionIds.includes(overData.sectionId)) {
          onReorderSection(activeData.parentSectionId, movingSectionIds, overData.sectionId);
        }
      }
      return;
    }

    if (activeData.type !== "step") return;

    const movingStepIds =
      Array.isArray(activeData.selectedStepIds) && activeData.selectedStepIds.includes(activeData.stepId)
        ? activeData.selectedStepIds
        : [activeData.stepId];

    if (overData.type === "step") {
      if (!movingStepIds.includes(overData.stepId)) {
        onMoveSteps(movingStepIds, overData.sectionId, overData.stepId);
      }
      return;
    }

    if (overData.type === "section" || overData.type === "section-drop") {
      onMoveSteps(movingStepIds, overData.sectionId);
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
            onSelectSection={onSelectSection}
            onSelectStep={onSelectStep}
            parentSectionId={parentSectionId}
            renderChildren={renderSectionList}
            section={section}
            sectionPath={pathPrefix ? `${pathPrefix}.${index + 1}` : `${index + 1}`}
            selectedStepIds={selectedStepIds}
            selectedSectionIds={selectedSectionIds}
            selection={selection}
            toggleCollapsed={toggleCollapsed}
          />
        ))}
      </div>
    </SortableContext>
  );

  const handleBackgroundClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.classList.contains("outline-tree") ||
      target.classList.contains("outline-subsections") ||
      target.classList.contains("outline-card-body")
    ) {
      onClearOutlineSelection();
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="outline-tree" onClick={handleBackgroundClick}>
        <button className={selection.type === "protocol" ? "outline-root active" : "outline-root"} onClick={onSelectProtocol}>
          <span className="outline-marker">Protocol</span>
          <strong>{selection.type === "protocol" ? "Editing metadata" : "Open protocol metadata"}</strong>
        </button>
        <p className="helper-text">
          Drag steps or sections to reorganize the protocol. Use Shift/Ctrl/Cmd-click on titles to build a multi-selection. Click empty space to clear it. Use Ctrl/Cmd + C/X/V to copy, cut, paste.
        </p>
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
  selectedStepIds: string[];
  selectedSectionIds: string[];
  collapsedIds: string[];
  level: number;
  onSelectSection: (sectionId: string, options?: { toggle: boolean }) => void;
  onSelectStep: (sectionId: string, stepId: string, options?: { toggle: boolean }) => void;
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
  selectedStepIds,
  selectedSectionIds,
  collapsedIds,
  level,
  onSelectSection,
  onSelectStep,
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
  const isPrimarySection = selection.type === "section" && selection.sectionId === section.id;
  const isGroupSelected = selectedSectionIds.includes(section.id);
  const isSectionSelected = isPrimarySection;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: getSectionDragId(section.id),
    data: { type: "section", parentSectionId, sectionId: section.id, selectedSectionIds }
  });
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: getSectionDropId(section.id),
    data: { type: "section-drop", sectionId: section.id }
  });

  return (
    <article
      className={`outline-card level-${Math.min(level, 3)} ${isSectionSelected ? "selected" : ""} ${isGroupSelected && !isPrimarySection ? "group-selected" : ""} ${isDragging ? "dragging" : ""}`}
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
        <button
          className="outline-card-title"
          onClick={(event) => onSelectSection(section.id, { toggle: event.shiftKey || event.metaKey || event.ctrlKey })}
          aria-pressed={isGroupSelected}
        >
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
          <div ref={setDropNodeRef} className={isOver ? "section-drop-target active" : "section-drop-target"}>
            Drop selected steps here to append them to this section.
          </div>

          {section.steps.length > 0 ? (
            <SortableContext items={section.steps.map((step) => getStepDragId(step.id))} strategy={verticalListSortingStrategy}>
              <div className="outline-step-list">
                {section.steps.map((step, index) => (
                  <SortableStepPill
                    index={index}
                    key={step.id}
                    onDeleteStep={onDeleteStep}
                    onDuplicateStep={onDuplicateStep}
                    onSelectStep={onSelectStep}
                    sectionId={section.id}
                    sectionPath={sectionPath}
                    selectedStepIds={selectedStepIds}
                    selection={selection}
                    step={step}
                  />
                ))}
              </div>
            </SortableContext>
          ) : (
            <p className="helper-text">No steps in this section yet. Drop selected steps here or add a new one.</p>
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
  selectedStepIds: string[];
  onSelectStep: (sectionId: string, stepId: string, options?: { toggle: boolean }) => void;
  onDuplicateStep: (sectionId: string, stepId: string) => void;
  onDeleteStep: (sectionId: string, stepId: string) => void;
}

const SortableStepPill = ({
  step,
  index,
  sectionId,
  sectionPath,
  selection,
  selectedStepIds,
  onSelectStep,
  onDuplicateStep,
  onDeleteStep
}: SortableStepPillProps) => {
  const isPrimaryStep = selection.type === "step" && selection.stepId === step.id;
  const isGroupSelected = selectedStepIds.includes(step.id);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: getStepDragId(step.id),
    data: { type: "step", sectionId, stepId: step.id, selectedStepIds }
  });

  return (
    <div
      className={`${isPrimaryStep ? "outline-step-pill selected" : "outline-step-pill"} ${isGroupSelected && !isPrimaryStep ? "group-selected" : ""}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.7 : 1 }}
    >
      <button className="drag-handle step" ref={setActivatorNodeRef} type="button" {...attributes} {...listeners}>
        ::
      </button>
      <button
        className="outline-step-content"
        onClick={(event) => onSelectStep(sectionId, step.id, { toggle: event.shiftKey || event.metaKey || event.ctrlKey })}
        aria-pressed={isGroupSelected}
      >
        <span className="outline-step-index">{sectionPath}.{index + 1}</span>
        <span className="outline-step-copy">
          <strong>{step.title}</strong>
          <span className="outline-step-kind">
            {STEP_KIND_ICONS[step.stepKind]}
            {step.stepKind}
          </span>
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
