import type {
  BlockType,
  ProtocolBlock,
  ProtocolDocument,
  ProtocolEquipment,
  ProtocolReagent,
  ProtocolStep,
  StepKind
} from "@ilm/types";
import { createStableId } from "@ilm/utils";
import {
  addBlockToStep,
  findSection,
  mapStep,
  type Selection,
  updateProtocol,
  updateSection
} from "../state/protocolState";
import { ActionMenu } from "./ActionMenu";

interface EditorPanelProps {
  doc: ProtocolDocument;
  selection: Selection;
  selectedBlockIds: string[];
  canPasteBlocks: boolean;
  clipboardBlockCount: number;
  onDocChange: (doc: ProtocolDocument) => void;
  onSetSelectedBlockIds: (stepId: string, blockIds: string[]) => void;
  onClearBlockSelection: () => void;
  onCutBlocks: (sectionId: string, stepId: string, blockIds: string[]) => void;
  onCopyBlocks: (stepId: string, blockIds: string[]) => void;
  onPasteBlocks: (sectionId: string, stepId: string, afterBlockId?: string) => void;
}

const STEP_KINDS: StepKind[] = ["action", "preparation", "qc", "optional", "pause", "cleanup", "analysis"];
const BLOCK_TYPES: BlockType[] = ["paragraph", "note", "caution", "qc", "recipe", "timeline", "link", "table", "fileReference", "branch"];

const createUniqueId = (prefix: string, label: string) =>
  createStableId(prefix, `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

export const EditorPanel = ({
  doc,
  selection,
  selectedBlockIds,
  canPasteBlocks,
  clipboardBlockCount,
  onDocChange,
  onSetSelectedBlockIds,
  onClearBlockSelection,
  onCutBlocks,
  onCopyBlocks,
  onPasteBlocks
}: EditorPanelProps) => {
  const selectedSection = selection.type !== "protocol" ? findSection(doc.protocol.sections, selection.sectionId) : null;
  const selectedStep =
    selection.type === "step" ? selectedSection?.steps.find((candidate) => candidate.id === selection.stepId) ?? null : null;

  if (selection.type === "protocol") {
    return <ProtocolEditor doc={doc} onDocChange={onDocChange} />;
  }

  if (selection.type === "section" && selectedSection) {
    return <SectionEditor doc={doc} sectionId={selection.sectionId} onDocChange={onDocChange} />;
  }

  if (selection.type === "step" && selectedSection && selectedStep) {
    return (
      <StepEditor
        doc={doc}
        sectionId={selection.sectionId}
        step={selectedStep}
        selectedBlockIds={selectedBlockIds}
        canPasteBlocks={canPasteBlocks}
        clipboardBlockCount={clipboardBlockCount}
        onDocChange={onDocChange}
        onSetSelectedBlockIds={onSetSelectedBlockIds}
        onClearBlockSelection={onClearBlockSelection}
        onCutBlocks={onCutBlocks}
        onCopyBlocks={onCopyBlocks}
        onPasteBlocks={onPasteBlocks}
      />
    );
  }

  return <p>Select a protocol item from the outline to edit it.</p>;
};

const ProtocolEditor = ({ doc, onDocChange }: { doc: ProtocolDocument; onDocChange: (doc: ProtocolDocument) => void }) => {
  const updateAuthors = (value: string) => updateProtocol(doc, "authors", splitCsv(value));
  const updateTags = (value: string) => updateProtocol(doc, "tags", splitCsv(value));

  return (
    <div className="editor-stack">
      <div>
        <h3>Protocol metadata</h3>
        <label>
          Title
          <input className="field" value={doc.protocol.title} onChange={(event) => onDocChange(updateProtocol(doc, "title", event.target.value))} />
        </label>
        <label>
          Description
          <textarea
            className="field"
            rows={4}
            value={doc.protocol.description ?? ""}
            onChange={(event) => onDocChange(updateProtocol(doc, "description", event.target.value))}
          />
        </label>
        <label>
          Authors
          <input
            className="field"
            value={doc.protocol.authors.join(", ")}
            onChange={(event) => onDocChange(updateAuthors(event.target.value))}
            placeholder="Comma-separated names"
          />
        </label>
        <label>
          Tags
          <input
            className="field"
            value={doc.protocol.tags.join(", ")}
            onChange={(event) => onDocChange(updateTags(event.target.value))}
            placeholder="Comma-separated tags"
          />
        </label>
      </div>

      <RecordListEditor
        title="Reagents"
        items={doc.protocol.reagents}
        createItem={() => ({
          id: createUniqueId("reagent", "reagent"),
          name: "New reagent",
          supplier: "",
          catalogNumber: "",
          notes: "",
          extensions: {}
        })}
        onChange={(items) => onDocChange(updateProtocol(doc, "reagents", items))}
        renderItem={(item, index, onItemChange, onRemove) => (
          <div className="card" key={item.id}>
            <div className="card-header">
              <strong>Reagent {index + 1}</strong>
              <button onClick={onRemove}>Remove</button>
            </div>
            <label>
              Name
              <input className="field" value={item.name} onChange={(event) => onItemChange({ ...item, name: event.target.value })} />
            </label>
            <div className="grid-2">
              <label>
                Supplier
                <input className="field" value={item.supplier ?? ""} onChange={(event) => onItemChange({ ...item, supplier: event.target.value })} />
              </label>
              <label>
                Catalog number
                <input className="field" value={item.catalogNumber ?? ""} onChange={(event) => onItemChange({ ...item, catalogNumber: event.target.value })} />
              </label>
            </div>
            <label>
              Notes
              <textarea className="field" rows={2} value={item.notes ?? ""} onChange={(event) => onItemChange({ ...item, notes: event.target.value })} />
            </label>
          </div>
        )}
      />

      <RecordListEditor
        title="Equipment"
        items={doc.protocol.equipment}
        createItem={() => ({
          id: createUniqueId("equipment", "equipment"),
          name: "New equipment",
          model: "",
          notes: "",
          extensions: {}
        })}
        onChange={(items) => onDocChange(updateProtocol(doc, "equipment", items))}
        renderItem={(item, index, onItemChange, onRemove) => (
          <div className="card" key={item.id}>
            <div className="card-header">
              <strong>Equipment {index + 1}</strong>
              <button onClick={onRemove}>Remove</button>
            </div>
            <label>
              Name
              <input className="field" value={item.name} onChange={(event) => onItemChange({ ...item, name: event.target.value })} />
            </label>
            <label>
              Model / variant
              <input className="field" value={item.model ?? ""} onChange={(event) => onItemChange({ ...item, model: event.target.value })} />
            </label>
            <label>
              Notes
              <textarea className="field" rows={2} value={item.notes ?? ""} onChange={(event) => onItemChange({ ...item, notes: event.target.value })} />
            </label>
          </div>
        )}
      />
    </div>
  );
};

const SectionEditor = ({
  doc,
  sectionId,
  onDocChange
}: {
  doc: ProtocolDocument;
  sectionId: string;
  onDocChange: (doc: ProtocolDocument) => void;
}) => {
  const section = findSection(doc.protocol.sections, sectionId);
  if (!section) return null;

  return (
    <div className="editor-stack">
      <h3>Section editor</h3>
      <label>
        Section title
        <input
          className="field"
          value={section.title}
          onChange={(event) => onDocChange(updateSection(doc, sectionId, (current) => ({ ...current, title: event.target.value })))}
        />
      </label>
      <label>
        Description
        <textarea
          className="field"
          rows={4}
          value={section.description ?? ""}
          onChange={(event) => onDocChange(updateSection(doc, sectionId, (current) => ({ ...current, description: event.target.value })))}
        />
      </label>
      <div className="card soft-card">
        <strong>Section summary</strong>
        <p>{section.steps.length} step(s) and {section.sections.length} subsection(s).</p>
      </div>
    </div>
  );
};

const StepEditor = ({
  doc,
  sectionId,
  step,
  selectedBlockIds,
  canPasteBlocks,
  clipboardBlockCount,
  onDocChange,
  onSetSelectedBlockIds,
  onClearBlockSelection,
  onCutBlocks,
  onCopyBlocks,
  onPasteBlocks
}: {
  doc: ProtocolDocument;
  sectionId: string;
  step: ProtocolStep;
  selectedBlockIds: string[];
  canPasteBlocks: boolean;
  clipboardBlockCount: number;
  onDocChange: (doc: ProtocolDocument) => void;
  onSetSelectedBlockIds: (stepId: string, blockIds: string[]) => void;
  onClearBlockSelection: () => void;
  onCutBlocks: (sectionId: string, stepId: string, blockIds: string[]) => void;
  onCopyBlocks: (stepId: string, blockIds: string[]) => void;
  onPasteBlocks: (sectionId: string, stepId: string, afterBlockId?: string) => void;
}) => {
  const saveStep = (nextStep: ProtocolStep) => {
    const nextSections = mapStep(doc.protocol.sections, sectionId, step.id, () => nextStep);
    onDocChange({ ...doc, protocol: { ...doc.protocol, sections: nextSections } });
  };

  const updateBlock = (blockIndex: number, nextBlock: ProtocolBlock) => {
    saveStep({
      ...step,
      blocks: step.blocks.map((block, index) => (index === blockIndex ? nextBlock : block))
    });
  };

  const duplicateBlock = (blockIndex: number) => {
    const block = step.blocks[blockIndex];
    const clone = {
      ...(JSON.parse(JSON.stringify(block)) as ProtocolBlock),
      id: createUniqueId("block", block.type),
      extensions: { ...(block.extensions ?? {}) }
    };
    saveStep({
      ...step,
      blocks: [...step.blocks.slice(0, blockIndex + 1), clone, ...step.blocks.slice(blockIndex + 1)]
    });
  };

  const removeBlock = (blockIndex: number) => {
    if (step.blocks.length === 1) return;
    saveStep({ ...step, blocks: step.blocks.filter((_, index) => index !== blockIndex) });
  };

  const moveBlock = (blockIndex: number, direction: "up" | "down") => {
    const target = direction === "up" ? blockIndex - 1 : blockIndex + 1;
    if (target < 0 || target >= step.blocks.length) return;
    const next = [...step.blocks];
    [next[blockIndex], next[target]] = [next[target], next[blockIndex]];
    saveStep({ ...step, blocks: next });
  };

  const toggleBlockSelection = (blockId: string, checked: boolean) => {
    const next = checked ? [...selectedBlockIds, blockId] : selectedBlockIds.filter((id) => id !== blockId);
    onSetSelectedBlockIds(step.id, next);
  };

  const selectedBlocksInOrder = step.blocks.filter((block) => selectedBlockIds.includes(block.id));
  const pasteAfterBlockId =
    selectedBlocksInOrder.length > 0 ? selectedBlocksInOrder[selectedBlocksInOrder.length - 1]?.id : undefined;

  return (
    <div className="editor-stack">
      <div>
        <h3>Step editor</h3>
        <label>
          Step title
          <input className="field" value={step.title} onChange={(event) => saveStep({ ...step, title: event.target.value })} />
        </label>
        <label>
          Step kind
          <select className="field" value={step.stepKind} onChange={(event) => saveStep({ ...step, stepKind: event.target.value as StepKind })}>
            {STEP_KINDS.map((kind) => (
              <option value={kind} key={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={Boolean(step.optional)} onChange={(event) => saveStep({ ...step, optional: event.target.checked || undefined })} />
          Mark this step as optional
        </label>
        <div className="quick-actions-row">
          <span className="field-label">Add block</span>
          <ActionMenu
            buttonClassName="quick-action-trigger"
            label="+ Block"
            items={BLOCK_TYPES.map((type) => ({
              label: `Add ${type}`,
              onSelect: () => onDocChange(addBlockToStep(doc, sectionId, step.id, type))
            }))}
          />
        </div>
      </div>

      <div className="block-selection-toolbar">
        <span className="field-label">
          {selectedBlockIds.length > 0 ? `${selectedBlockIds.length} block(s) selected` : "Select blocks to cut, copy, or move them together."}
        </span>
        <div className="mini-toolbar">
          <button onClick={() => onSetSelectedBlockIds(step.id, step.blocks.map((block) => block.id))} disabled={step.blocks.length === 0}>
            Select all
          </button>
          <button onClick={onClearBlockSelection} disabled={selectedBlockIds.length === 0}>
            Clear
          </button>
          <button onClick={() => onCopyBlocks(step.id, selectedBlockIds)} disabled={selectedBlockIds.length === 0}>
            Copy selected
          </button>
          <button onClick={() => onCutBlocks(sectionId, step.id, selectedBlockIds)} disabled={selectedBlockIds.length === 0}>
            Cut selected
          </button>
          <button onClick={() => onPasteBlocks(sectionId, step.id, pasteAfterBlockId)} disabled={!canPasteBlocks}>
            {canPasteBlocks ? `Paste ${clipboardBlockCount} block(s)` : "Paste blocks"}
          </button>
        </div>
      </div>

      {step.blocks.map((block, index) => {
        const isSelected = selectedBlockIds.includes(block.id);
        return (
          <div className={isSelected ? "card selected-block-card" : "card"} key={block.id}>
            <div className="card-header">
              <label className="checkbox-row block-selector">
                <input type="checkbox" checked={isSelected} onChange={(event) => toggleBlockSelection(block.id, event.target.checked)} />
                <strong>{block.type} block</strong>
              </label>
              <ActionMenu
                buttonClassName="menu-trigger"
                label="..."
                items={[
                  { label: "Move up", onSelect: () => moveBlock(index, "up"), disabled: index === 0 },
                  { label: "Move down", onSelect: () => moveBlock(index, "down"), disabled: index === step.blocks.length - 1 },
                  { label: "Duplicate block", onSelect: () => duplicateBlock(index) },
                  { label: "Remove block", onSelect: () => removeBlock(index), disabled: step.blocks.length === 1, tone: "danger" }
                ]}
              />
            </div>
            <BlockEditor block={block} allStepIds={collectStepIds(doc)} onChange={(next) => updateBlock(index, next)} />
          </div>
        );
      })}
    </div>
  );
};

const BlockEditor = ({
  block,
  allStepIds,
  onChange
}: {
  block: ProtocolBlock;
  allStepIds: string[];
  onChange: (block: ProtocolBlock) => void;
}) => {
  if (block.type === "paragraph" || block.type === "note") {
    return (
      <label>
        Text
        <textarea className="field" rows={4} value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
      </label>
    );
  }

  if (block.type === "caution") {
    return (
      <div className="editor-stack">
        <label>
          Severity
          <select className="field" value={block.severity ?? "medium"} onChange={(event) => onChange({ ...block, severity: event.target.value as "low" | "medium" | "high" })}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <label>
          Text
          <textarea className="field" rows={3} value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
        </label>
      </div>
    );
  }

  if (block.type === "qc") {
    return (
      <div className="editor-stack">
        <label>
          Checkpoint
          <input className="field" value={block.checkpoint} onChange={(event) => onChange({ ...block, checkpoint: event.target.value })} />
        </label>
        <label>
          Acceptance criteria
          <textarea className="field" rows={3} value={block.acceptanceCriteria ?? ""} onChange={(event) => onChange({ ...block, acceptanceCriteria: event.target.value })} />
        </label>
      </div>
    );
  }

  if (block.type === "recipe") {
    return (
      <div className="editor-stack">
        <label>
          Recipe title
          <input className="field" value={block.title ?? ""} onChange={(event) => onChange({ ...block, title: event.target.value })} />
        </label>
        {block.items.map((item, index) => (
          <div className="nested-card" key={`${block.id}-item-${index}`}>
            <div className="card-header">
              <strong>Item {index + 1}</strong>
              <button onClick={() => onChange({ ...block, items: block.items.filter((_, rowIndex) => rowIndex !== index) })} disabled={block.items.length === 1}>
                Remove
              </button>
            </div>
            <div className="grid-2">
              <label>
                Component
                <input
                  className="field"
                  value={item.component}
                  onChange={(event) =>
                    onChange({
                      ...block,
                      items: block.items.map((row, rowIndex) => (rowIndex === index ? { ...row, component: event.target.value } : row))
                    })
                  }
                />
              </label>
              <label>
                Quantity
                <input
                  className="field"
                  value={item.quantity}
                  onChange={(event) =>
                    onChange({
                      ...block,
                      items: block.items.map((row, rowIndex) => (rowIndex === index ? { ...row, quantity: event.target.value } : row))
                    })
                  }
                />
              </label>
            </div>
            <label>
              Notes
              <input
                className="field"
                value={item.notes ?? ""}
                onChange={(event) =>
                  onChange({
                    ...block,
                    items: block.items.map((row, rowIndex) => (rowIndex === index ? { ...row, notes: event.target.value } : row))
                  })
                }
              />
            </label>
          </div>
        ))}
        <button onClick={() => onChange({ ...block, items: [...block.items, { component: "", quantity: "", notes: "" }] })}>Add recipe item</button>
      </div>
    );
  }

  if (block.type === "timeline") {
    return (
      <div className="editor-stack">
        {block.stages.map((stage, index) => (
          <div className="nested-card" key={`${block.id}-stage-${index}`}>
            <div className="card-header">
              <strong>Stage {index + 1}</strong>
              <button onClick={() => onChange({ ...block, stages: block.stages.filter((_, rowIndex) => rowIndex !== index) })} disabled={block.stages.length === 1}>
                Remove
              </button>
            </div>
            <div className="grid-2">
              <label>
                Label
                <input
                  className="field"
                  value={stage.label}
                  onChange={(event) =>
                    onChange({
                      ...block,
                      stages: block.stages.map((row, rowIndex) => (rowIndex === index ? { ...row, label: event.target.value } : row))
                    })
                  }
                />
              </label>
              <label>
                Duration
                <input
                  className="field"
                  value={stage.duration}
                  onChange={(event) =>
                    onChange({
                      ...block,
                      stages: block.stages.map((row, rowIndex) => (rowIndex === index ? { ...row, duration: event.target.value } : row))
                    })
                  }
                />
              </label>
            </div>
            <div className="grid-2">
              <label>
                Temperature
                <input
                  className="field"
                  value={stage.temperature ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...block,
                      stages: block.stages.map((row, rowIndex) => (rowIndex === index ? { ...row, temperature: event.target.value } : row))
                    })
                  }
                />
              </label>
              <label>
                Details
                <input
                  className="field"
                  value={stage.details ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...block,
                      stages: block.stages.map((row, rowIndex) => (rowIndex === index ? { ...row, details: event.target.value } : row))
                    })
                  }
                />
              </label>
            </div>
          </div>
        ))}
        <button onClick={() => onChange({ ...block, stages: [...block.stages, { label: "", duration: "", temperature: "", details: "" }] })}>
          Add stage
        </button>
      </div>
    );
  }

  if (block.type === "link") {
    return (
      <div className="grid-2">
        <label>
          Label
          <input className="field" value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value })} />
        </label>
        <label>
          URL
          <input className="field" value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value })} />
        </label>
      </div>
    );
  }

  if (block.type === "table") {
    return (
      <div className="editor-stack">
        <div className="mini-toolbar">
          <button
            onClick={() =>
              onChange({
                ...block,
                columns: [...block.columns, `Column ${block.columns.length + 1}`],
                rows: block.rows.map((row) => [...row, ""])
              })
            }
          >
            Add column
          </button>
          <button onClick={() => onChange({ ...block, rows: [...block.rows, block.columns.map(() => "")] })}>Add row</button>
        </div>
        <div className="table-grid">
          {block.columns.map((column, columnIndex) => (
            <div className="table-cell" key={`${block.id}-column-${columnIndex}`}>
              <input
                className="field"
                value={column}
                onChange={(event) =>
                  onChange({
                    ...block,
                    columns: block.columns.map((value, index) => (index === columnIndex ? event.target.value : value))
                  })
                }
              />
            </div>
          ))}
          {block.rows.map((row, rowIndex) =>
            row.map((cell, cellIndex) => (
              <div className="table-cell" key={`${block.id}-${rowIndex}-${cellIndex}`}>
                <input
                  className="field"
                  value={cell}
                  onChange={(event) =>
                    onChange({
                      ...block,
                      rows: block.rows.map((rowValues, currentRowIndex) =>
                        currentRowIndex === rowIndex
                          ? rowValues.map((value, currentCellIndex) => (currentCellIndex === cellIndex ? event.target.value : value))
                          : rowValues
                      )
                    })
                  }
                />
              </div>
            ))
          )}
        </div>
        <button onClick={() => onChange({ ...block, rows: block.rows.slice(0, -1) })} disabled={block.rows.length <= 1}>
          Remove last row
        </button>
      </div>
    );
  }

  if (block.type === "fileReference") {
    return (
      <div className="grid-2">
        <label>
          Label
          <input className="field" value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value })} />
        </label>
        <label>
          Path or reference
          <input className="field" value={block.path} onChange={(event) => onChange({ ...block, path: event.target.value })} />
        </label>
      </div>
    );
  }

  return (
    <div className="editor-stack">
      <label>
        Branch condition
        <input className="field" value={block.condition} onChange={(event) => onChange({ ...block, condition: event.target.value })} />
      </label>
      <label>
        Target step ids
        <textarea
          className="field"
          rows={4}
          value={block.thenStepIds.join("\n")}
          placeholder={allStepIds.join("\n")}
          onChange={(event) => onChange({ ...block, thenStepIds: splitCsv(event.target.value.replace(/\n/g, ",")) })}
        />
      </label>
      <p className="helper-text">Available step ids: {allStepIds.join(", ") || "Add steps to this protocol first."}</p>
    </div>
  );
};

const RecordListEditor = <T extends ProtocolReagent | ProtocolEquipment>({
  title,
  items,
  createItem,
  onChange,
  renderItem
}: {
  title: string;
  items: T[];
  createItem: () => T;
  onChange: (items: T[]) => void;
  renderItem: (item: T, index: number, onItemChange: (item: T) => void, onRemove: () => void) => JSX.Element;
}) => (
  <div className="editor-stack">
    <div className="card-header">
      <h3>{title}</h3>
      <button onClick={() => onChange([...items, createItem()])}>Add {title.slice(0, -1).toLowerCase()}</button>
    </div>
    {items.length === 0 ? <p className="helper-text">No {title.toLowerCase()} yet.</p> : null}
    {items.map((item, index) =>
      renderItem(
        item,
        index,
        (nextItem) => onChange(items.map((candidate, candidateIndex) => (candidateIndex === index ? nextItem : candidate))),
        () => onChange(items.filter((_, candidateIndex) => candidateIndex !== index))
      )
    )}
  </div>
);

const splitCsv = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const collectStepIds = (doc: ProtocolDocument): string[] => {
  const ids: string[] = [];
  const visit = (sections: ProtocolDocument["protocol"]["sections"]) => {
    sections.forEach((section) => {
      section.steps.forEach((step) => ids.push(step.id));
      visit(section.sections);
    });
  };

  visit(doc.protocol.sections);
  return ids;
};
