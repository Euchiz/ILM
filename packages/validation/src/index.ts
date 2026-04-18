import { PROTOCOL_SCHEMA_VERSION, type ProtocolDocument, type ProtocolSection, type ProtocolStep } from "@ilm/types";
import { z } from "zod";

const stepKindSchema = z.enum(["action", "preparation", "qc", "optional", "pause", "cleanup", "analysis"]);
const blockTypeSchema = z.enum([
  "paragraph",
  "note",
  "caution",
  "qc",
  "recipe",
  "timeline",
  "link",
  "table",
  "fileReference",
  "branch"
]);

const extensionSchema = z.record(z.unknown()).optional();
const isoDateSchema = z.string().datetime({ offset: true });

const recipeItemSchema = z
  .object({
    component: z.string().min(1),
    quantity: z.string().min(1),
    notes: z.string().optional()
  })
  .strict();

const timelineStageSchema = z
  .object({
    label: z.string().min(1),
    duration: z.string().min(1),
    temperature: z.string().optional(),
    details: z.string().optional()
  })
  .strict();

const reagentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    supplier: z.string().optional(),
    catalogNumber: z.string().optional(),
    notes: z.string().optional(),
    extensions: extensionSchema
  })
  .strict();

const equipmentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    model: z.string().optional(),
    notes: z.string().optional(),
    extensions: extensionSchema
  })
  .strict();

const baseBlockSchema = {
  id: z.string().min(1),
  extensions: extensionSchema
} as const;

const blockSchema = z.discriminatedUnion("type", [
  z.object({ ...baseBlockSchema, type: z.literal("paragraph"), text: z.string() }).strict(),
  z.object({ ...baseBlockSchema, type: z.literal("note"), text: z.string() }).strict(),
  z.object({ ...baseBlockSchema, type: z.literal("caution"), text: z.string(), severity: z.enum(["low", "medium", "high"]).optional() }).strict(),
  z.object({ ...baseBlockSchema, type: z.literal("qc"), checkpoint: z.string().min(1), acceptanceCriteria: z.string().optional() }).strict(),
  z.object({ ...baseBlockSchema, type: z.literal("recipe"), title: z.string().optional(), items: z.array(recipeItemSchema).min(1) }).strict(),
  z.object({ ...baseBlockSchema, type: z.literal("timeline"), stages: z.array(timelineStageSchema).min(1) }).strict(),
  z.object({ ...baseBlockSchema, type: z.literal("link"), label: z.string().min(1), url: z.string().url() }).strict(),
  z.object({ ...baseBlockSchema, type: z.literal("table"), columns: z.array(z.string().min(1)).min(1), rows: z.array(z.array(z.string())) }).strict(),
  z.object({ ...baseBlockSchema, type: z.literal("fileReference"), label: z.string().min(1), path: z.string().min(1) }).strict(),
  z.object({ ...baseBlockSchema, type: z.literal("branch"), condition: z.string().min(1), thenStepIds: z.array(z.string().min(1)) }).strict()
]);

const stepSchema: z.ZodType<ProtocolStep> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      title: z.string().min(1),
      stepKind: stepKindSchema,
      optional: z.boolean().optional(),
      blocks: z.array(blockSchema).min(1),
      extensions: extensionSchema
    })
    .strict()
);

const sectionSchema: z.ZodType<ProtocolSection> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      sections: z.array(sectionSchema),
      steps: z.array(stepSchema),
      extensions: extensionSchema
    })
    .strict()
);

export const protocolSchema: z.ZodType<ProtocolDocument> = z
  .object({
    schemaVersion: z.literal(PROTOCOL_SCHEMA_VERSION),
    protocol: z
      .object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        createdAt: isoDateSchema,
        updatedAt: isoDateSchema,
        authors: z.array(z.string()),
        tags: z.array(z.string()),
        metadata: z.record(z.unknown()).optional(),
        reagents: z.array(reagentSchema),
        equipment: z.array(equipmentSchema),
        sections: z.array(sectionSchema),
        extensions: extensionSchema
      })
      .strict(),
    extensions: extensionSchema
  })
  .strict();

export type ValidationMode = "strict" | "assisted";

export interface ValidationOptions {
  mode?: ValidationMode;
}

export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  data?: ProtocolDocument;
}

export const validateProtocolDocument = (input: unknown, options: ValidationOptions = {}): ValidationResult => {
  const mode = options.mode ?? "strict";
  const coerced = mode === "assisted" ? coerceAssistedImport(input) : { value: input, warnings: [] as string[] };
  const parsed = protocolSchema.safeParse(coerced.value);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      warnings: coerced.warnings
    };
  }

  const warnings = [...coerced.warnings, ...collectWarnings(parsed.data)];
  const errors = collectSemanticErrors(parsed.data);

  if (mode === "strict" && warnings.length > 0) {
    return {
      success: false,
      errors: ["Strict import blocked because the document still has warnings that need review."],
      warnings,
      data: parsed.data
    };
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings, data: parsed.data };
  }

  return { success: true, errors: [], warnings, data: parsed.data };
};

const coerceAssistedImport = (input: unknown): { value: unknown; warnings: string[] } => {
  if (!isRecord(input) || !isRecord(input.protocol)) {
    return { value: input, warnings: [] };
  }

  const warnings: string[] = [];
  const now = new Date().toISOString();
  const protocol = input.protocol;

  const missingProtocolFields = ["createdAt", "updatedAt", "authors", "tags", "reagents", "equipment"].filter(
    (key) => !(key in protocol)
  );
  if (missingProtocolFields.length > 0) {
    warnings.push(`Assisted import filled missing protocol fields: ${missingProtocolFields.join(", ")}.`);
  }

  if (hasNonCanonicalStepFields(protocol.sections)) {
    warnings.push("Assisted import removed noncanonical AI fields such as step order metadata.");
  }

  const normalized = {
    schemaVersion:
      typeof input.schemaVersion === "string" && input.schemaVersion.length > 0 ? input.schemaVersion : PROTOCOL_SCHEMA_VERSION,
    protocol: {
      id: asNonEmptyString(protocol.id),
      title: asNonEmptyString(protocol.title),
      description: asOptionalString(protocol.description),
      createdAt: asIsoDate(protocol.createdAt) ?? now,
      updatedAt: asIsoDate(protocol.updatedAt) ?? now,
      authors: asStringArray(protocol.authors),
      tags: asStringArray(protocol.tags),
      metadata: isRecord(protocol.metadata) ? protocol.metadata : {},
      reagents: normalizeReagents(protocol.reagents),
      equipment: normalizeEquipment(protocol.equipment),
      sections: normalizeSections(protocol.sections, warnings),
      extensions: isRecord(protocol.extensions) ? protocol.extensions : {}
    },
    extensions: isRecord(input.extensions) ? input.extensions : {}
  };

  return { value: normalized, warnings };
};

export const normalizeProtocolDocument = (doc: ProtocolDocument): ProtocolDocument => ({
  ...doc,
  schemaVersion: PROTOCOL_SCHEMA_VERSION,
  protocol: {
    ...doc.protocol,
    metadata: doc.protocol.metadata ?? {},
    reagents: doc.protocol.reagents.map((reagent) => ({
      ...reagent,
      supplier: reagent.supplier ?? "",
      catalogNumber: reagent.catalogNumber ?? "",
      notes: reagent.notes ?? "",
      extensions: reagent.extensions ?? {}
    })),
    equipment: doc.protocol.equipment.map((item) => ({
      ...item,
      model: item.model ?? "",
      notes: item.notes ?? "",
      extensions: item.extensions ?? {}
    })),
    extensions: doc.protocol.extensions ?? {},
    sections: doc.protocol.sections.map((section) => normalizeSection(section))
  },
  extensions: doc.extensions ?? {}
});

const normalizeSection = (section: ProtocolSection): ProtocolSection => ({
  ...section,
  description: section.description ?? "",
  sections: section.sections.map((child) => normalizeSection(child)),
  steps: section.steps.map((step) => ({
    ...step,
    optional: step.optional ?? undefined,
    extensions: step.extensions ?? {},
    blocks: step.blocks.map((block) => ({ ...block, extensions: block.extensions ?? {} }))
  })),
  extensions: section.extensions ?? {}
});

const collectSemanticErrors = (doc: ProtocolDocument): string[] => {
  const errors: string[] = [];
  const ids = new Map<string, string>();
  const stepIds = new Set<string>();

  const registerId = (id: string, path: string) => {
    const previous = ids.get(id);
    if (previous) {
      errors.push(`Duplicate id "${id}" found at ${path}; already used at ${previous}.`);
      return;
    }
    ids.set(id, path);
  };

  registerId(doc.protocol.id, "protocol.id");
  doc.protocol.reagents.forEach((reagent, index) => registerId(reagent.id, `protocol.reagents.${index}.id`));
  doc.protocol.equipment.forEach((item, index) => registerId(item.id, `protocol.equipment.${index}.id`));
  walkSections(doc.protocol.sections, "protocol.sections", (section, path) => {
    registerId(section.id, `${path}.id`);
    section.steps.forEach((step, stepIndex) => {
      registerId(step.id, `${path}.steps.${stepIndex}.id`);
      stepIds.add(step.id);
      step.blocks.forEach((block, blockIndex) => registerId(block.id, `${path}.steps.${stepIndex}.blocks.${blockIndex}.id`));
    });
  });

  walkSections(doc.protocol.sections, "protocol.sections", (section, path) => {
    section.steps.forEach((step, stepIndex) => {
      step.blocks.forEach((block, blockIndex) => {
        if (block.type === "table" && block.rows.some((row) => row.length !== block.columns.length)) {
          errors.push(`${path}.steps.${stepIndex}.blocks.${blockIndex}: table rows must match the number of columns.`);
        }

        if (block.type === "branch") {
          const missingTargets = block.thenStepIds.filter((targetId) => !stepIds.has(targetId));
          if (missingTargets.length > 0) {
            errors.push(
              `${path}.steps.${stepIndex}.blocks.${blockIndex}: branch references unknown step ids (${missingTargets.join(", ")}).`
            );
          }
        }
      });
    });
  });

  return errors;
};

const collectWarnings = (doc: ProtocolDocument): string[] => {
  const warnings: string[] = [];

  if (doc.protocol.authors.length === 0) warnings.push("Protocol has no authors listed.");
  if (doc.protocol.tags.length === 0) warnings.push("Protocol has no tags listed.");
  if (doc.protocol.reagents.length === 0) warnings.push("Protocol has no reagent records yet.");
  if (doc.protocol.equipment.length === 0) warnings.push("Protocol has no equipment records yet.");
  if (doc.protocol.sections.length === 0) warnings.push("Protocol has no sections yet.");

  walkSections(doc.protocol.sections, "protocol.sections", (section, path) => {
    if (section.steps.length === 0 && section.sections.length === 0) {
      warnings.push(`${path}: section "${section.title}" is empty.`);
    }

    section.steps.forEach((step, stepIndex) => {
      if (step.blocks.length === 0) {
        warnings.push(`${path}.steps.${stepIndex}: step "${step.title}" has no content blocks.`);
      }
    });
  });

  return warnings;
};

const walkSections = (
  sections: ProtocolSection[],
  basePath: string,
  visit: (section: ProtocolSection, path: string) => void
) => {
  sections.forEach((section, index) => {
    const path = `${basePath}.${index}`;
    visit(section, path);
    walkSections(section.sections, `${path}.sections`, visit);
  });
};

const normalizeReagents = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index) => ({
      id: asNonEmptyString(item.id) || `reagent-${index + 1}`,
      name: asNonEmptyString(item.name) || `Reagent ${index + 1}`,
      supplier: asOptionalString(item.supplier),
      catalogNumber: asOptionalString(item.catalogNumber),
      notes: asOptionalString(item.notes),
      extensions: isRecord(item.extensions) ? item.extensions : {}
    }));
};

const normalizeEquipment = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index) => ({
      id: asNonEmptyString(item.id) || `equipment-${index + 1}`,
      name: asNonEmptyString(item.name) || `Equipment ${index + 1}`,
      model: asOptionalString(item.model),
      notes: asOptionalString(item.notes),
      extensions: isRecord(item.extensions) ? item.extensions : {}
    }));
};

const normalizeSections = (value: unknown, warnings: string[]): ProtocolSection[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((section, index) => normalizeSectionInput(section, index, warnings));
};

const normalizeSectionInput = (section: Record<string, unknown>, index: number, warnings: string[]): ProtocolSection => ({
  id: asNonEmptyString(section.id) || `section-${index + 1}`,
  title: asNonEmptyString(section.title) || `Section ${index + 1}`,
  description: asOptionalString(section.description),
  sections: normalizeSections(section.sections, warnings),
  steps: normalizeSteps(section.steps, warnings),
  extensions: isRecord(section.extensions) ? section.extensions : {}
});

const normalizeSteps = (value: unknown, warnings: string[]): ProtocolStep[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((step, index) => normalizeStepInput(step, index, warnings));
};

const normalizeStepInput = (step: Record<string, unknown>, index: number, warnings: string[]): ProtocolStep => ({
  id: asNonEmptyString(step.id) || `step-${index + 1}`,
  title: asNonEmptyString(step.title) || `Step ${index + 1}`,
  stepKind: asStepKind(step.stepKind),
  optional: typeof step.optional === "boolean" ? step.optional : undefined,
  blocks: normalizeBlocks(step.blocks, warnings),
  extensions: isRecord(step.extensions) ? step.extensions : {}
});

const normalizeBlocks = (value: unknown, warnings: string[]) => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((block, index) => normalizeBlockInput(block, index, warnings));
};

const normalizeBlockInput = (block: Record<string, unknown>, index: number, warnings: string[]): ProtocolStep["blocks"] => {
  const id = asNonEmptyString(block.id) || `block-${index + 1}`;
  const extensions = isRecord(block.extensions) ? block.extensions : {};
  const title = asOptionalString(block.title);

  switch (block.type) {
    case "paragraph":
      return [{ id, type: "paragraph", text: asString(block.text), extensions }];
    case "note":
      return [{ id, type: "note", text: asString(block.text), extensions }];
    case "caution":
      return [
        {
          id,
          type: "caution",
          text: asString(block.text),
          severity: asSeverity(block.severity),
          extensions
        }
      ];
    case "qc": {
      const noteText = joinSentenceParts([asOptionalString(block.notes)]);
      return [
        {
          id,
          type: "qc",
          checkpoint: asNonEmptyString(block.checkpoint) || asString(block.text),
          acceptanceCriteria: asOptionalString(block.acceptanceCriteria),
          extensions
        },
        ...createSupplementalNote(id, noteText)
      ];
    }
    case "recipe": {
      const noteText = joinSentenceParts([
        asOptionalString(block.finalVolume) ? `Final volume: ${asOptionalString(block.finalVolume)}` : "",
        asOptionalString(block.notes)
      ]);
      return [
        {
          id,
          type: "recipe",
          title: title ?? undefined,
          items: normalizeRecipeItems(block.items),
          extensions
        },
        ...createSupplementalNote(id, noteText)
      ];
    }
    case "timeline":
      return [
        ...createSupplementalParagraph(id, title),
        {
          id,
          type: "timeline",
          stages: normalizeTimelineStages(block.stages),
          extensions
        }
      ];
    case "link":
      return [
        {
          id,
          type: "link",
          label: asString(block.label),
          url: asString(block.url),
          extensions
        }
      ];
    case "table":
      return [
        ...createSupplementalParagraph(id, title),
        {
          id,
          type: "table",
          columns: normalizeStringList(block.columns),
          rows: normalizeTableRows(block.rows),
          extensions
        }
      ];
    case "fileReference":
      return [
        {
          id,
          type: "fileReference",
          label: asString(block.label),
          path: asString(block.path),
          extensions
        }
      ];
    case "branch":
      if (Array.isArray(block.thenStepIds) || typeof block.condition === "string") {
        return [
          {
            id,
            type: "branch",
            condition: asNonEmptyString(block.condition) || "Review branch logic",
            thenStepIds: normalizeStringList(block.thenStepIds),
            extensions
          }
        ];
      }
      if (Array.isArray(block.branches)) {
        warnings.push(`Assisted import converted branch block "${id}" into a table because it used descriptive labels instead of step references.`);
        return [
          ...createSupplementalParagraph(id, title || "Branch conditions"),
          {
            id,
            type: "table",
            columns: ["Condition", "Value"],
            rows: block.branches.filter(isRecord).map((entry) => [asString(entry.label), asString(entry.content)]),
            extensions
          }
        ];
      }
      return createSupplementalNote(id, "Unsupported branch content was preserved as a note during assisted import.");
    default:
      warnings.push(`Assisted import converted unsupported block "${id}" into a note.`);
      return createSupplementalNote(id, asString(block.text) || "Unsupported block content");
  }
};

const normalizeRecipeItems = (value: unknown) => {
  if (!Array.isArray(value)) return [{ component: "Unspecified", quantity: "Unspecified" }];
  const items = value
    .filter(isRecord)
    .map((item, index) => ({
      component: asNonEmptyString(item.component) || `Component ${index + 1}`,
      quantity: asNonEmptyString(item.quantity) || "Unspecified",
      notes: asOptionalString(item.notes)
    }));
  return items.length > 0 ? items : [{ component: "Unspecified", quantity: "Unspecified" }];
};

const normalizeTimelineStages = (value: unknown) => {
  if (!Array.isArray(value)) return [{ label: "Unspecified stage", duration: "Unspecified" }];
  const stages = value
    .filter(isRecord)
    .map((stage, index) => ({
      label: asNonEmptyString(stage.label) || `Stage ${index + 1}`,
      duration: asNonEmptyString(stage.duration) || "Unspecified",
      temperature: asOptionalString(stage.temperature),
      details: asOptionalString(stage.details)
    }));
  return stages.length > 0 ? stages : [{ label: "Unspecified stage", duration: "Unspecified" }];
};

const normalizeTableRows = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((row) => (Array.isArray(row) ? row.map((cell) => `${cell ?? ""}`) : []));
};

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => `${item ?? ""}`).filter((item) => item.length > 0);
};

const createSupplementalNote = (baseId: string, text?: string) =>
  text
    ? [
        {
          id: `${baseId}-note`,
          type: "note" as const,
          text,
          extensions: {}
        }
      ]
    : [];

const createSupplementalParagraph = (baseId: string, text?: string) =>
  text
    ? [
        {
          id: `${baseId}-title`,
          type: "paragraph" as const,
          text,
          extensions: {}
        }
      ]
    : [];

const joinSentenceParts = (parts: Array<string | undefined>) => parts.filter((part): part is string => Boolean(part && part.trim())).join(" ");

const hasNonCanonicalStepFields = (sections: unknown): boolean => {
  if (!Array.isArray(sections)) return false;
  return sections.some((section) => {
    if (!isRecord(section)) return false;
    const steps = Array.isArray(section.steps) ? section.steps : [];
    const stepHasOrder = steps.some((step) => isRecord(step) && "order" in step);
    return stepHasOrder || hasNonCanonicalStepFields(section.sections);
  });
};

const asStepKind = (value: unknown): ProtocolStep["stepKind"] =>
  value === "action" ||
  value === "preparation" ||
  value === "qc" ||
  value === "optional" ||
  value === "pause" ||
  value === "cleanup" ||
  value === "analysis"
    ? value
    : "action";

const asSeverity = (value: unknown): "low" | "medium" | "high" | undefined =>
  value === "low" || value === "medium" || value === "high" ? value : undefined;

const asIsoDate = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const asStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.map((item) => `${item ?? ""}`).filter(Boolean) : []);

const asString = (value: unknown) => (typeof value === "string" ? value : `${value ?? ""}`);

const asNonEmptyString = (value: unknown) => {
  const text = asString(value).trim();
  return text.length > 0 ? text : "";
};

const asOptionalString = (value: unknown) => {
  const text = asNonEmptyString(value);
  return text.length > 0 ? text : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
