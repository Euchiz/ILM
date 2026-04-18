import { useEffect, useRef } from "react";
import type { ProtocolBlock, ProtocolDocument, ProtocolStep } from "@ilm/types";
import { addBlockToStep, mapStep, type Selection } from "../state/protocolState";
import { createStableId } from "@ilm/utils";
import type { BlockType, StepKind } from "@ilm/types";
import { EditorPanel } from "./EditorPanel";

interface StepEditorModalProps {
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
  onClose: () => void;
}

export const StepEditorModal = ({
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
  onPasteBlocks,
  onClose
}: StepEditorModalProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) onClose();
  };

  if (selection.type !== "step") return null;

  return (
    <div className="step-modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="step-modal" role="dialog" aria-modal="true" aria-label="Step editor">
        <div className="step-modal-header">
          <span className="outline-marker">Step editor</span>
          <button className="step-modal-close" onClick={onClose} aria-label="Close step editor">
            ✕
          </button>
        </div>
        <div className="step-modal-body">
          <EditorPanel
            doc={doc}
            selection={selection}
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
        </div>
      </div>
    </div>
  );
};
