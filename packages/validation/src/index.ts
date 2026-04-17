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

const blockSchema = z
  .object({
    id: z.string().min(1),
    type: blockTypeSchema,
    extensions: extensionSchema
  })
  .and(
    z.union([
      z.object({ type: z.literal("paragraph"), text: z.string() }).strict(),
      z.object({ type: z.literal("note"), text: z.string() }).strict(),
      z.object({ type: z.literal("caution"), text: z.string(), severity: z.enum(["low", "medium", "high"]).optional() }).strict(),
      z.object({ type: z.literal("qc"), checkpoint: z.string().min(1), acceptanceCriteria: z.string().optional() }).strict(),
      z.object({ type: z.literal("recipe"), title: z.string().optional(), items: z.array(recipeItemSchema).min(1) }).strict(),
      z.object({ type: z.literal("timeline"), stages: z.array(timelineStageSchema).min(1) }).strict(),
      z.object({ type: z.literal("link"), label: z.string().min(1), url: z.string().url() }).strict(),
      z.object({ type: z.literal("table"), columns: z.array(z.string().min(1)).min(1), rows: z.array(z.array(z.string())) }).strict(),
      z.object({ type: z.literal("fileReference"), label: z.string().min(1), path: z.string().min(1) }).strict(),
      z.object({ type: z.literal("branch"), condition: z.string().min(1), thenStepIds: z.array(z.string().min(1)) }).strict()
    ])
  );

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
  const parsed = protocolSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      warnings: []
    };
  }

  const warnings = collectWarnings(parsed.data);
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
