import type { BlockType, ProtocolBlock, ProtocolDocument, ProtocolSection, ProtocolStep, StepKind } from "@ilm/types";
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

export const findStepLocation = (
  sections: ProtocolSection[],
  stepId: string
): { sectionId: string; step: ProtocolStep } | null => {
  for (const section of sections) {
    const step = section.steps.find((candidate) => candidate.id === stepId);
    if (step) return { sectionId: section.id, step };
    const nested = findStepLocation(section.sections, stepId);
    if (nested) return nested;
  }
  return null;
};

export const collectStepIds = (sections: ProtocolSection[]): string[] => {
  const ids: string[] = [];
  sections.forEach((section) => {
    section.steps.forEach((step) => ids.push(step.id));
    ids.push(...collectStepIds(section.sections));
  });
  return ids;
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

export const updateStep = (
  doc: ProtocolDocument,
  sectionId: string,
  stepId: string,
  mapFn: (step: ProtocolStep) => ProtocolStep
): ProtocolDocument => ({
  ...doc,
  protocol: {
    ...doc.protocol,
    sections: mapStep(doc.protocol.sections, sectionId, stepId, (step) => mapFn(step))
  }
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

export const reorderSection = (
  doc: ProtocolDocument,
  parentSectionId: string | null,
  sectionId: string,
  targetSectionId: string
): ProtocolDocument => ({
  ...doc,
  protocol: {
    ...doc.protocol,
    sections: mapSectionLists(doc.protocol.sections, parentSectionId, (siblings) =>
      moveItemToTarget(siblings, sectionId, targetSectionId)
    )
  }
});

export const addStep = (doc: ProtocolDocument, sectionId: string, title: string, stepKind: StepKind = "action"): ProtocolDocument => {
  const newStep: ProtocolStep = {
    id: createUniqueId("step", title || "step"),
    title: title || "New step",
    stepKind,
    blocks: [createDefaultParagraphBlock()],
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

export const deleteSteps = (doc: ProtocolDocument, stepIds: string[]): ProtocolDocument => {
  const selectedIds = new Set(stepIds);
  return {
    ...doc,
    protocol: {
      ...doc.protocol,
      sections: removeStepsFromSections(doc.protocol.sections, selectedIds)
    }
  };
};

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

export const reorderStep = (
  doc: ProtocolDocument,
  sectionId: string,
  stepId: string,
  targetStepId: string
): ProtocolDocument => ({
  ...doc,
  protocol: {
    ...doc.protocol,
    sections: mapSections(doc.protocol.sections, sectionId, (section) => ({
      ...section,
      steps: moveItemToTarget(section.steps, stepId, targetStepId)
    }))
  }
});

export const moveStepsToSection = (
  doc: ProtocolDocument,
  stepIds: string[],
  destinationSectionId: string,
  targetStepId?: string
): ProtocolDocument => {
  const selectedIds = new Set(stepIds);
  if (selectedIds.size === 0 || !findSection(doc.protocol.sections, destinationSectionId)) return doc;

  const movedSteps = collectStepsInDocumentOrder(doc.protocol.sections).filter((step) => selectedIds.has(step.id));
  if (movedSteps.length === 0) return doc;

  const destinationSection = findSection(doc.protocol.sections, destinationSectionId);
  const originalDestSteps = destinationSection ? destinationSection.steps : [];
  const targetOriginalIndex = targetStepId ? originalDestSteps.findIndex((step) => step.id === targetStepId) : -1;
  const movedFromDestIndices = originalDestSteps
    .map((step, index) => (selectedIds.has(step.id) ? index : -1))
    .filter((index) => index >= 0);
  const insertAfterTarget =
    targetOriginalIndex >= 0 &&
    movedFromDestIndices.length > 0 &&
    Math.min(...movedFromDestIndices) < targetOriginalIndex;

  const sectionsWithoutMovedSteps = removeStepsFromSections(doc.protocol.sections, selectedIds);
  const nextSections = mapSections(sectionsWithoutMovedSteps, destinationSectionId, (section) => {
    const existingSteps = [...section.steps];
    const insertIndex = targetStepId ? existingSteps.findIndex((step) => step.id === targetStepId) : -1;
    let resolvedIndex = insertIndex >= 0 ? insertIndex : existingSteps.length;
    if (insertAfterTarget && insertIndex >= 0) resolvedIndex = insertIndex + 1;
    existingSteps.splice(resolvedIndex, 0, ...movedSteps);
    return { ...section, steps: existingSteps };
  });

  return {
    ...doc,
    protocol: {
      ...doc.protocol,
      sections: nextSections
    }
  };
};

export const findSectionParent = (
  sections: ProtocolSection[],
  sectionId: string,
  parentId: string | null = null
): { parentId: string | null; index: number } | null => {
  const directIndex = sections.findIndex((section) => section.id === sectionId);
  if (directIndex >= 0) return { parentId, index: directIndex };

  for (const section of sections) {
    const found = findSectionParent(section.sections, sectionId, section.id);
    if (found) return found;
  }
  return null;
};

export const reorderSections = (
  doc: ProtocolDocument,
  parentSectionId: string | null,
  sectionIds: string[],
  targetSectionId: string
): ProtocolDocument => {
  if (sectionIds.includes(targetSectionId)) return doc;
  return {
    ...doc,
    protocol: {
      ...doc.protocol,
      sections: mapSectionLists(doc.protocol.sections, parentSectionId, (siblings) => {
        const moving = sectionIds
          .map((id) => siblings.find((sibling) => sibling.id === id))
          .filter((section): section is ProtocolSection => Boolean(section));
        if (moving.length === 0) return siblings;
        const remaining = siblings.filter((sibling) => !sectionIds.includes(sibling.id));
        const targetIndex = remaining.findIndex((sibling) => sibling.id === targetSectionId);
        if (targetIndex < 0) return siblings;
        return [...remaining.slice(0, targetIndex), ...moving, ...remaining.slice(targetIndex)];
      })
    }
  };
};

export const deleteSections = (doc: ProtocolDocument, sectionIds: string[]): ProtocolDocument => {
  const idSet = new Set(sectionIds);
  const removeMany = (sections: ProtocolSection[]): ProtocolSection[] =>
    sections
      .filter((section) => !idSet.has(section.id))
      .map((section) => ({ ...section, sections: removeMany(section.sections) }));
  return { ...doc, protocol: { ...doc.protocol, sections: removeMany(doc.protocol.sections) } };
};

export const collectSectionsByIds = (
  sections: ProtocolSection[],
  sectionIds: string[]
): ProtocolSection[] => {
  const idSet = new Set(sectionIds);
  const result: ProtocolSection[] = [];
  const visit = (list: ProtocolSection[]) => {
    list.forEach((section) => {
      if (idSet.has(section.id)) result.push(section);
      visit(section.sections);
    });
  };
  visit(sections);
  return result;
};

export const collectStepsByIds = (
  sections: ProtocolSection[],
  stepIds: string[]
): ProtocolStep[] => {
  const idSet = new Set(stepIds);
  const result: ProtocolStep[] = [];
  const visit = (list: ProtocolSection[]) => {
    list.forEach((section) => {
      section.steps.forEach((step) => {
        if (idSet.has(step.id)) result.push(step);
      });
      visit(section.sections);
    });
  };
  visit(sections);
  return result;
};

export const pasteStepsIntoSection = (
  doc: ProtocolDocument,
  sectionId: string,
  steps: ProtocolStep[],
  afterStepId?: string
): ProtocolDocument => {
  if (steps.length === 0) return doc;
  const cloned = steps.map((step) => cloneStep(step));
  return {
    ...doc,
    protocol: {
      ...doc.protocol,
      sections: mapSections(doc.protocol.sections, sectionId, (section) => {
        const insertIndex = afterStepId ? section.steps.findIndex((s) => s.id === afterStepId) + 1 : section.steps.length;
        const resolvedIndex = insertIndex > 0 ? insertIndex : section.steps.length;
        return {
          ...section,
          steps: [...section.steps.slice(0, resolvedIndex), ...cloned, ...section.steps.slice(resolvedIndex)]
        };
      })
    }
  };
};

export const pasteSections = (
  doc: ProtocolDocument,
  parentId: string | null,
  sections: ProtocolSection[],
  afterSectionId?: string
): ProtocolDocument => {
  if (sections.length === 0) return doc;
  const cloned = sections.map((section) => cloneSection(section));
  return {
    ...doc,
    protocol: {
      ...doc.protocol,
      sections: mapSectionLists(doc.protocol.sections, parentId, (siblings) => {
        const insertIndex = afterSectionId ? siblings.findIndex((s) => s.id === afterSectionId) + 1 : siblings.length;
        const resolvedIndex = insertIndex > 0 ? insertIndex : siblings.length;
        return [...siblings.slice(0, resolvedIndex), ...cloned, ...siblings.slice(resolvedIndex)];
      })
    }
  };
};

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

export const removeBlocksFromStep = (
  doc: ProtocolDocument,
  sectionId: string,
  stepId: string,
  blockIds: string[]
): ProtocolDocument => {
  const selectedIds = new Set(blockIds);
  return updateStep(doc, sectionId, stepId, (step) => {
    const remainingBlocks = step.blocks.filter((block) => !selectedIds.has(block.id));
    return {
      ...step,
      blocks: remainingBlocks.length > 0 ? remainingBlocks : [createDefaultParagraphBlock()]
    };
  });
};

export const pasteBlocksIntoStep = (
  doc: ProtocolDocument,
  sectionId: string,
  stepId: string,
  blocks: ProtocolBlock[],
  afterBlockId?: string
): ProtocolDocument => {
  if (blocks.length === 0) return doc;
  return updateStep(doc, sectionId, stepId, (step) => {
    const clonedBlocks = blocks.map((block) => cloneBlock(block));
    const insertIndex = afterBlockId ? step.blocks.findIndex((block) => block.id === afterBlockId) + 1 : step.blocks.length;
    const resolvedIndex = insertIndex > 0 ? insertIndex : step.blocks.length;
    return {
      ...step,
      blocks: [...step.blocks.slice(0, resolvedIndex), ...clonedBlocks, ...step.blocks.slice(resolvedIndex)]
    };
  });
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

const createDefaultParagraphBlock = (): ProtocolBlock => ({
  id: createUniqueId("block", "paragraph"),
  type: "paragraph",
  text: "",
  extensions: {}
});

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

const mapSectionLists = (
  sections: ProtocolSection[],
  parentSectionId: string | null,
  mapFn: (siblings: ProtocolSection[]) => ProtocolSection[]
): ProtocolSection[] => {
  if (parentSectionId === null) return mapFn(sections);

  return sections.map((section) => ({
    ...section,
    sections: section.id === parentSectionId ? mapFn(section.sections) : mapSectionLists(section.sections, parentSectionId, mapFn)
  }));
};

const removeSection = (sections: ProtocolSection[], sectionId: string): ProtocolSection[] =>
  sections
    .filter((section) => section.id !== sectionId)
    .map((section) => ({ ...section, sections: removeSection(section.sections, sectionId) }));

const removeStepsFromSections = (sections: ProtocolSection[], selectedIds: Set<string>): ProtocolSection[] =>
  sections.map((section) => ({
    ...section,
    steps: section.steps.filter((step) => !selectedIds.has(step.id)),
    sections: removeStepsFromSections(section.sections, selectedIds)
  }));

const collectStepsInDocumentOrder = (sections: ProtocolSection[]): ProtocolStep[] => {
  const steps: ProtocolStep[] = [];
  sections.forEach((section) => {
    section.steps.forEach((step) => steps.push(step));
    steps.push(...collectStepsInDocumentOrder(section.sections));
  });
  return steps;
};

const moveInArray = <T,>(items: T[], index: number, direction: "up" | "down"): T[] => {
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

const moveItemToTarget = <T extends { id: string }>(items: T[], itemId: string, targetId: string): T[] => {
  const fromIndex = items.findIndex((item) => item.id === itemId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) return items;

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(targetIndex, 0, moved);
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

const cloneBlock = (block: ProtocolBlock): ProtocolBlock => {
  const id = createUniqueId("block", block.type);
  const extensions = { ...(block.extensions ?? {}) };

  if (block.type === "paragraph") return { ...block, id, extensions };
  if (block.type === "note") return { ...block, id, extensions };
  if (block.type === "caution") return { ...block, id, extensions };
  if (block.type === "qc") return { ...block, id, extensions };
  if (block.type === "recipe")
    return {
      ...block,
      id,
      items: block.items.map((item) => ({ ...item })),
      extensions
    };
  if (block.type === "timeline")
    return {
      ...block,
      id,
      stages: block.stages.map((stage) => ({ ...stage })),
      extensions
    };
  if (block.type === "link") return { ...block, id, extensions };
  if (block.type === "table")
    return {
      ...block,
      id,
      columns: [...block.columns],
      rows: block.rows.map((row) => [...row]),
      extensions
    };
  if (block.type === "fileReference") return { ...block, id, extensions };
  return {
    ...block,
    id,
    thenStepIds: [...block.thenStepIds],
    extensions
  };
};
