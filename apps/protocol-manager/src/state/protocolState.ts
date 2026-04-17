import type { BlockType, ProtocolBlock, ProtocolDocument, ProtocolSection, ProtocolStep, StepKind } from "@ilm/types";
import { createStableId } from "@ilm/utils";

export type Selection =
  | { type: "protocol" }
  | { type: "section"; sectionId: string }
  | { type: "step"; sectionId: string; stepId: string };

export const findSection = (sections: ProtocolSection[], id: string): ProtocolSection | null => {
  for (const section of sections) {
    if (section.id === id) return section;
    const nested = findSection(section.sections, id);
    if (nested) return nested;
  }
  return null;
};

export const mapSections = (sections: ProtocolSection[], id: string, mapFn: (section: ProtocolSection) => ProtocolSection): ProtocolSection[] =>
  sections.map((section) =>
    section.id === id ? mapFn(section) : { ...section, sections: mapSections(section.sections, id, mapFn) }
  );

export const addSection = (doc: ProtocolDocument, title: string, parentId?: string): ProtocolDocument => {
  const section: ProtocolSection = {
    id: createStableId("section", `${title}-${Date.now()}`),
    title: title || "New section",
    description: "",
    sections: [],
    steps: []
  };
  if (!parentId) return { ...doc, protocol: { ...doc.protocol, sections: [...doc.protocol.sections, section] } };
  return {
    ...doc,
    protocol: {
      ...doc.protocol,
      sections: mapSections(doc.protocol.sections, parentId, (parent) => ({ ...parent, sections: [...parent.sections, section] }))
    }
  };
};

export const addStep = (doc: ProtocolDocument, sectionId: string, title: string, stepKind: StepKind = "action"): ProtocolDocument => {
  const newStep: ProtocolStep = {
    id: createStableId("step", `${title}-${Date.now()}`),
    title: title || "New step",
    stepKind,
    blocks: [{ id: createStableId("block", `paragraph-${Date.now()}`), type: "paragraph", text: "" }]
  };
  return {
    ...doc,
    protocol: {
      ...doc.protocol,
      sections: mapSections(doc.protocol.sections, sectionId, (section) => ({ ...section, steps: [...section.steps, newStep] }))
    }
  };
};

export const mapStep = (
  sections: ProtocolSection[],
  sectionId: string,
  stepId: string,
  mapFn: (step: ProtocolStep) => ProtocolStep
): ProtocolSection[] =>
  sections.map((section) => {
    if (section.id === sectionId) {
      return { ...section, steps: section.steps.map((step) => (step.id === stepId ? mapFn(step) : step)) };
    }
    return { ...section, sections: mapStep(section.sections, sectionId, stepId, mapFn) };
  });

export const addBlockToStep = (doc: ProtocolDocument, sectionId: string, stepId: string, blockType: BlockType): ProtocolDocument => {
  const block = createBlock(blockType);
  return {
    ...doc,
    protocol: {
      ...doc.protocol,
      sections: mapStep(doc.protocol.sections, sectionId, stepId, (step) => ({ ...step, blocks: [...step.blocks, block] }))
    }
  };
};

const createBlock = (type: BlockType): ProtocolBlock => {
  const id = createStableId("block", `${type}-${Date.now()}`);
  if (type === "paragraph") return { id, type, text: "" };
  if (type === "note") return { id, type, text: "" };
  if (type === "caution") return { id, type, text: "", severity: "medium" };
  if (type === "qc") return { id, type, checkpoint: "", acceptanceCriteria: "" };
  if (type === "recipe") return { id, type, title: "", items: [{ component: "", quantity: "", notes: "" }] };
  if (type === "timeline") return { id, type, stages: [{ label: "", duration: "", temperature: "", details: "" }] };
  if (type === "link") return { id, type, label: "", url: "https://" };
  if (type === "table") return { id, type, columns: ["Column A"], rows: [[""]] };
  if (type === "fileReference") return { id, type, label: "", path: "" };
  return { id, type: "branch", condition: "", thenStepIds: [] };
};

export const updateProtocol = <T extends keyof ProtocolDocument["protocol"]>(
  doc: ProtocolDocument,
  key: T,
  value: ProtocolDocument["protocol"][T]
): ProtocolDocument => ({
  ...doc,
  protocol: { ...doc.protocol, [key]: value }
});
