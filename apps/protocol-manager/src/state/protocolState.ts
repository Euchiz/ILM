import type {
  BlockType,
  ProtocolBlock,
  ProtocolDocument,
  ProtocolSection,
  ProtocolStep,
  StepKind
} from "@ilm/types";
import { createStableId } from "@ilm/utils";

export type Selection =
  | { type: "protocol" }
  | { type: "section"; sectionId: string }
  | { type: "step"; sectionId: string; stepId: string };

const createUniqueId = (prefix: string, label: string) =>
  createStableId(prefix, `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

export const findSection = (sections: ProtocolSection[], id: string): ProtocolSection | null => {
  for (const section of sections) {
    if (section.id === id) return section;
    const nested = findSection(section.sections, id);
    if (nested) return nested;
  }
  return null;
};

export const mapSections = (
  sections: ProtocolSection[],
  id: string,
  mapFn: (section: ProtocolSection) => ProtocolSection
): ProtocolSection[] =>
  sections.map((section) =>
    section.id === id ? mapFn(section) : { ...section, sections: mapSections(section.sections, id, mapFn) }
  );

export const mapStep = (
  sections: ProtocolSection[],
  sectionId: string,
  stepId: string,
  mapFn: (step: ProtocolStep, stepIndex: number) => ProtocolStep
): ProtocolSection[] =>
  sections.map((section) => {
    if (section.id === sectionId) {
      return {
        ...section,
        steps: section.steps.map((step, index) => (step.id === stepId ? mapFn(step, index) : step))
      };
    }
    return { ...section, sections: mapStep(section.sections, sectionId, stepId, mapFn) };
  });

export const addSection = (doc: ProtocolDocument, title: string, parentId?: string): ProtocolDocument => {
  const section: ProtocolSection = {
    id: createUniqueId("section", title || "section"),
    title: title || "New section",
    description: "",
    sections: [],
    steps: [],
    extensions: {}
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

export const updateSection = (
  doc: ProtocolDocument,
  sectionId: string,
  mapFn: (section: ProtocolSection) => ProtocolSection
): ProtocolDocument => ({
  ...doc,
  protocol: {
    ...doc.protocol,
    sections: mapSections(doc.protocol.sections, sectionId, mapFn)
  }
});

export const deleteSection = (doc: ProtocolDocument, sectionId: string): ProtocolDocument => ({
  ...doc,
  protocol: {
    ...doc.protocol,
    sections: removeSection(doc.protocol.sections, sectionId)
  }
});

export const duplicateSection = (doc: ProtocolDocument, sectionId: string): ProtocolDocument => ({
  ...doc,
  protocol: {
    ...doc.protocol,
    sections: mutateSections(doc.protocol.sections, sectionId, (siblings, index) => {
      const source = siblings[index];
      const clone = cloneSection(source);
      return [...siblings.slice(0, index + 1), clone, ...siblings.slice(index + 1)];
    })
  }
});

export const moveSection = (doc: ProtocolDocument, sectionId: string, direction: "up" | "down"): ProtocolDocument => ({
  ...doc,
  protocol: {
    ...doc.protocol,
    sections: mutateSections(doc.protocol.sections, sectionId, (siblings, index) => moveInArray(siblings, index, direction))
  }
});

export const addStep = (doc: ProtocolDocument, sectionId: string, title: string, stepKind: StepKind = "action"): ProtocolDocument => {
  const newStep: ProtocolStep = {
    id: createUniqueId("step", title || "step"),
    title: title || "New step",
    stepKind,
    blocks: [{ id: createUniqueId("block", "paragraph"), type: "paragraph", text: "", extensions: {} }],
    extensions: {}
  };

  return {
    ...doc,
    protocol: {
      ...doc.protocol,
      sections: mapSections(doc.protocol.sections, sectionId, (section) => ({ ...section, steps: [...section.steps, newStep] }))
    }
  };
};

export const deleteStep = (doc: ProtocolDocument, sectionId: string, stepId: string): ProtocolDocument => ({
  ...doc,
  protocol: {
    ...doc.protocol,
    sections: mapSections(doc.protocol.sections, sectionId, (section) => ({
      ...section,
      steps: section.steps.filter((step) => step.id !== stepId)
    }))
  }
});

export const duplicateStep = (doc: ProtocolDocument, sectionId: string, stepId: string): ProtocolDocument => ({
  ...doc,
  protocol: {
    ...doc.protocol,
    sections: mapSections(doc.protocol.sections, sectionId, (section) => {
      const index = section.steps.findIndex((step) => step.id === stepId);
      if (index === -1) return section;
      const clone = cloneStep(section.steps[index]);
      return {
        ...section,
        steps: [...section.steps.slice(0, index + 1), clone, ...section.steps.slice(index + 1)]
      };
    })
  }
});

export const moveStep = (
  doc: ProtocolDocument,
  sectionId: string,
  stepId: string,
  direction: "up" | "down"
): ProtocolDocument => ({
  ...doc,
  protocol: {
    ...doc.protocol,
    sections: mapSections(doc.protocol.sections, sectionId, (section) => {
      const index = section.steps.findIndex((step) => step.id === stepId);
      if (index === -1) return section;
      return {
        ...section,
        steps: moveInArray(section.steps, index, direction)
      };
    })
  }
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

export const updateProtocol = <T extends keyof ProtocolDocument["protocol"]>(
  doc: ProtocolDocument,
  key: T,
  value: ProtocolDocument["protocol"][T]
): ProtocolDocument => ({
  ...doc,
  protocol: { ...doc.protocol, [key]: value }
});

const createBlock = (type: BlockType): ProtocolBlock => {
  const id = createUniqueId("block", type);
  if (type === "paragraph") return { id, type, text: "", extensions: {} };
  if (type === "note") return { id, type, text: "", extensions: {} };
  if (type === "caution") return { id, type, text: "", severity: "medium", extensions: {} };
  if (type === "qc") return { id, type, checkpoint: "", acceptanceCriteria: "", extensions: {} };
  if (type === "recipe")
    return { id, type, title: "", items: [{ component: "", quantity: "", notes: "" }], extensions: {} };
  if (type === "timeline")
    return { id, type, stages: [{ label: "", duration: "", temperature: "", details: "" }], extensions: {} };
  if (type === "link") return { id, type, label: "", url: "https://", extensions: {} };
  if (type === "table") return { id, type, columns: ["Column A"], rows: [[""]], extensions: {} };
  if (type === "fileReference") return { id, type, label: "", path: "", extensions: {} };
  return { id, type: "branch", condition: "", thenStepIds: [], extensions: {} };
};

const mutateSections = (
  sections: ProtocolSection[],
  sectionId: string,
  mutate: (siblings: ProtocolSection[], index: number) => ProtocolSection[]
): ProtocolSection[] => {
  const directIndex = sections.findIndex((section) => section.id === sectionId);
  if (directIndex >= 0) return mutate(sections, directIndex);

  return sections.map((section) => ({
    ...section,
    sections: mutateSections(section.sections, sectionId, mutate)
  }));
};

const removeSection = (sections: ProtocolSection[], sectionId: string): ProtocolSection[] =>
  sections
    .filter((section) => section.id !== sectionId)
    .map((section) => ({ ...section, sections: removeSection(section.sections, sectionId) }));

const moveInArray = <T,>(items: T[], index: number, direction: "up" | "down"): T[] => {
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

const cloneSection = (section: ProtocolSection): ProtocolSection => ({
  ...section,
  id: createUniqueId("section", section.title),
  sections: section.sections.map((child) => cloneSection(child)),
  steps: section.steps.map((step) => cloneStep(step)),
  extensions: { ...(section.extensions ?? {}) }
});

const cloneStep = (step: ProtocolStep): ProtocolStep => ({
  ...step,
  id: createUniqueId("step", step.title),
  blocks: step.blocks.map((block) => cloneBlock(block)),
  extensions: { ...(step.extensions ?? {}) }
});

const cloneBlock = (block: ProtocolBlock): ProtocolBlock => ({ ...block, id: createUniqueId("block", block.type), extensions: { ...(block.extensions ?? {}) } });
