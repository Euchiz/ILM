import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ExperimentRecord, MilestoneRecord } from "../lib/cloudAdapter";

export type ProjectOutlineSelection =
  | { kind: "milestone"; id: string }
  | { kind: "experiment"; id: string }
  | null;

interface ProjectOutlinePanelProps {
  projectName: string;
  milestones: MilestoneRecord[];
  experimentsByMilestone: Map<string, ExperimentRecord[]>;
  unassignedExperiments: ExperimentRecord[];
  selection: ProjectOutlineSelection;
  canManage: boolean;
  onSelectMilestone: (milestoneId: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
  onSelectExperiment: (experimentId: string) => void;
  onOpenExperiment: (experimentId: string) => void;
  onClearSelection: () => void;
  onMoveMilestone: (movingMilestoneId: string, targetMilestoneId: string) => void;
  onMoveExperiment: (experimentId: string, destinationMilestoneId: string | null, targetExperimentId?: string) => void;
  onAddMilestone: () => void;
  onAddExperiment: (milestoneId: string | null) => void;
  onDuplicateSelection: () => void;
  onCutSelection: () => void;
}

const statusLabel = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const typeAwareCollision: CollisionDetection = (args) => {
  const activeType = args.active.data.current?.type;
  const allowed = (nextType: unknown) => {
    if (activeType === "milestone") return nextType === "milestone";
    if (activeType === "experiment") return nextType === "experiment" || nextType === "experiment-drop";
    return true;
  };
  const filtered = args.droppableContainers.filter((container) => allowed(container.data.current?.type));
  return closestCenter({ ...args, droppableContainers: filtered });
};

const getMilestoneDragId = (milestoneId: string) => `milestone:${milestoneId}`;
const getExperimentDragId = (experimentId: string) => `experiment:${experimentId}`;
const getExperimentDropId = (milestoneId: string | null) => `experiment-drop:${milestoneId ?? "unassigned"}`;

export const ProjectOutlinePanel = ({
  projectName,
  milestones,
  experimentsByMilestone,
  unassignedExperiments,
  selection,
  canManage,
  onSelectMilestone,
  onOpenMilestone,
  onSelectExperiment,
  onOpenExperiment,
  onClearSelection,
  onMoveMilestone,
  onMoveExperiment,
  onAddMilestone,
  onAddExperiment,
  onDuplicateSelection,
  onCutSelection,
}: ProjectOutlinePanelProps) => {
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const activeData = active.data.current;
    const overData = over.data.current;
    if (!activeData || !overData) return;

    if (activeData.type === "milestone" && overData.type === "milestone") {
      if (activeData.milestoneId !== overData.milestoneId) {
        onMoveMilestone(activeData.milestoneId, overData.milestoneId);
      }
      return;
    }

    if (activeData.type !== "experiment") return;

    if (overData.type === "experiment") {
      if (activeData.experimentId !== overData.experimentId) {
        onMoveExperiment(activeData.experimentId, overData.milestoneId ?? null, overData.experimentId);
      }
      return;
    }

    if (overData.type === "experiment-drop") {
      onMoveExperiment(activeData.experimentId, overData.milestoneId ?? null);
    }
  };

  const toggleCollapsed = (milestoneId: string) => {
    setCollapsedIds((current) =>
      current.includes(milestoneId) ? current.filter((id) => id !== milestoneId) : [...current, milestoneId]
    );
  };

  const selectedLabel =
    selection?.kind === "milestone"
      ? "Milestone selected"
      : selection?.kind === "experiment"
        ? "Experiment selected"
        : "Nothing selected";

  const handleBackgroundClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select")) return;
    onClearSelection();
  };

  return (
    <DndContext sensors={sensors} collisionDetection={typeAwareCollision} onDragEnd={handleDragEnd}>
      <div className="pm-outline-tree" onClick={handleBackgroundClick}>
        <div className="pm-outline-root">
          <div>
            <span className="pm-outline-marker">Project outline</span>
            <strong>{projectName}</strong>
          </div>
          <span className="pm-outline-selection-copy">{selectedLabel}</span>
        </div>

        <div className="pm-outline-toolbar">
          <button type="button" className="pm-outline-tool" onClick={onAddMilestone} disabled={!canManage}>
            Add milestone
          </button>
          <button
            type="button"
            className="pm-outline-tool"
            onClick={() =>
              onAddExperiment(
                selection?.kind === "milestone"
                  ? selection.id
                  : selection?.kind === "experiment"
                    ? milestones.find((milestone) =>
                        (experimentsByMilestone.get(milestone.id) ?? []).some((experiment) => experiment.id === selection.id)
                      )?.id ?? null
                    : null
              )
            }
            disabled={!canManage}
          >
            Add experiment
          </button>
          <button
            type="button"
            className="pm-outline-tool"
            onClick={onDuplicateSelection}
            disabled={!canManage || !selection}
          >
            Duplicate
          </button>
          <button type="button" className="pm-outline-tool" onClick={onCutSelection} disabled={!canManage || !selection}>
            Cut
          </button>
        </div>

        <p className="pm-outline-help">
          Single-click to select an item. Double-click to open it in Edit. Drag milestones or experiments to reorganize
          the roadmap.
        </p>

        <SortableContext items={milestones.map((milestone) => getMilestoneDragId(milestone.id))} strategy={verticalListSortingStrategy}>
          <div className="pm-outline-groups">
            {milestones.map((milestone, index) => (
              <MilestoneNode
                key={milestone.id}
                collapsed={collapsedIds.includes(milestone.id)}
                experiments={experimentsByMilestone.get(milestone.id) ?? []}
                index={index}
                milestone={milestone}
                selection={selection}
                canManage={canManage}
                onAddExperiment={onAddExperiment}
                onOpenExperiment={onOpenExperiment}
                onOpenMilestone={onOpenMilestone}
                onSelectExperiment={onSelectExperiment}
                onSelectMilestone={onSelectMilestone}
                onToggleCollapsed={toggleCollapsed}
              />
            ))}
          </div>
        </SortableContext>

        <ExperimentGroupDropZone milestoneId={null} label="Unassigned experiments" isEmpty={unassignedExperiments.length === 0}>
          <SortableContext items={unassignedExperiments.map((experiment) => getExperimentDragId(experiment.id))} strategy={verticalListSortingStrategy}>
            <div className="pm-outline-step-list">
              {unassignedExperiments.length === 0 ? (
                <p className="pm-empty">No unassigned experiments.</p>
              ) : (
                unassignedExperiments.map((experiment, index) => (
                  <ExperimentNode
                    key={experiment.id}
                    experiment={experiment}
                    index={index}
                    milestoneId={null}
                    selection={selection}
                    onOpenExperiment={onOpenExperiment}
                    onSelectExperiment={onSelectExperiment}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </ExperimentGroupDropZone>
      </div>
    </DndContext>
  );
};

interface MilestoneNodeProps {
  milestone: MilestoneRecord;
  experiments: ExperimentRecord[];
  index: number;
  collapsed: boolean;
  selection: ProjectOutlineSelection;
  canManage: boolean;
  onSelectMilestone: (milestoneId: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
  onSelectExperiment: (experimentId: string) => void;
  onOpenExperiment: (experimentId: string) => void;
  onAddExperiment: (milestoneId: string | null) => void;
  onToggleCollapsed: (milestoneId: string) => void;
}

const MilestoneNode = ({
  milestone,
  experiments,
  index,
  collapsed,
  selection,
  canManage,
  onSelectMilestone,
  onOpenMilestone,
  onSelectExperiment,
  onOpenExperiment,
  onAddExperiment,
  onToggleCollapsed,
}: MilestoneNodeProps) => {
  const isSelected = selection?.kind === "milestone" && selection.id === milestone.id;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: getMilestoneDragId(milestone.id),
    data: { type: "milestone", milestoneId: milestone.id },
  });

  return (
    <article
      ref={setNodeRef}
      className={`pm-outline-card${isSelected ? " selected" : ""}${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="pm-outline-card-header">
        <div className="pm-outline-card-main">
          <button
            type="button"
            className="pm-drag-handle"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag milestone ${milestone.title}`}
          >
            ::: 
          </button>
          <button
            type="button"
            className="pm-collapse-toggle"
            onClick={() => onToggleCollapsed(milestone.id)}
            aria-label={collapsed ? `Expand ${milestone.title}` : `Collapse ${milestone.title}`}
          >
            {collapsed ? "+" : "-"}
          </button>
          <button
            type="button"
            className="pm-outline-row-button"
            onClick={() => onSelectMilestone(milestone.id)}
            onDoubleClick={() => onOpenMilestone(milestone.id)}
          >
            <span className="pm-outline-marker">Milestone {index + 1}</span>
            <strong>{milestone.title}</strong>
            <small>{milestone.due_date ? `Due ${milestone.due_date}` : "No due date"}</small>
          </button>
        </div>
        <div className="pm-outline-card-meta">
          <span className={`pm-status-tag pm-status-tag-${milestone.status}`}>{statusLabel(milestone.status)}</span>
          {canManage ? (
            <button type="button" className="pm-outline-inline-button" onClick={() => onAddExperiment(milestone.id)}>
              + Experiment
            </button>
          ) : null}
        </div>
      </div>

      {!collapsed ? (
        <ExperimentGroupDropZone milestoneId={milestone.id} label={null} isEmpty={experiments.length === 0}>
          <SortableContext items={experiments.map((experiment) => getExperimentDragId(experiment.id))} strategy={verticalListSortingStrategy}>
            <div className="pm-outline-step-list">
              {experiments.length === 0 ? (
                <p className="pm-empty">No experiments under this milestone yet.</p>
              ) : (
                experiments.map((experiment, experimentIndex) => (
                  <ExperimentNode
                    key={experiment.id}
                    experiment={experiment}
                    index={experimentIndex}
                    milestoneId={milestone.id}
                    selection={selection}
                    onOpenExperiment={onOpenExperiment}
                    onSelectExperiment={onSelectExperiment}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </ExperimentGroupDropZone>
      ) : null}
    </article>
  );
};

interface ExperimentGroupDropZoneProps {
  milestoneId: string | null;
  label: string | null;
  isEmpty: boolean;
  children: ReactNode;
}

const ExperimentGroupDropZone = ({ milestoneId, label, isEmpty, children }: ExperimentGroupDropZoneProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: getExperimentDropId(milestoneId),
    data: { type: "experiment-drop", milestoneId },
  });

  return (
    <div ref={setNodeRef} className={`pm-outline-dropzone${isOver ? " active" : ""}`}>
      {label ? <div className="pm-outline-subhead">{label}</div> : null}
      {isOver ? (
        <div className="pm-outline-drop-copy">
          Drop experiment here to {milestoneId ? "place it under this milestone" : "leave it unassigned"}.
        </div>
      ) : isEmpty ? (
        <div className="pm-outline-drop-copy">
          {milestoneId ? "Drop an experiment here or add one from the toolbar." : "Drop experiments here to detach them from milestones."}
        </div>
      ) : null}
      {children}
    </div>
  );
};

interface ExperimentNodeProps {
  experiment: ExperimentRecord;
  index: number;
  milestoneId: string | null;
  selection: ProjectOutlineSelection;
  onSelectExperiment: (experimentId: string) => void;
  onOpenExperiment: (experimentId: string) => void;
}

const ExperimentNode = ({
  experiment,
  index,
  milestoneId,
  selection,
  onSelectExperiment,
  onOpenExperiment,
}: ExperimentNodeProps) => {
  const isSelected = selection?.kind === "experiment" && selection.id === experiment.id;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: getExperimentDragId(experiment.id),
    data: { type: "experiment", experimentId: experiment.id, milestoneId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`pm-outline-step${isSelected ? " selected" : ""}${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="pm-drag-handle pm-drag-handle-step"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag experiment ${experiment.title}`}
      >
        :: 
      </button>
      <button
        type="button"
        className="pm-outline-step-button"
        onClick={() => onSelectExperiment(experiment.id)}
        onDoubleClick={() => onOpenExperiment(experiment.id)}
      >
        <span className="pm-outline-step-index">{index + 1}</span>
        <span className="pm-outline-step-copy">
          <span className="pm-outline-marker">Experiment</span>
          <strong>{experiment.title}</strong>
          <small>{experiment.protocol_id ? "Linked to protocol" : "No linked protocol"}</small>
        </span>
      </button>
      <span className={`pm-status-tag pm-status-tag-${experiment.status}`}>{statusLabel(experiment.status)}</span>
    </div>
  );
};
