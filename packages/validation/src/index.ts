import { PROTOCOL_SCHEMA_VERSION, type ProtocolDocument } from "@ilm/types";
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

const recipeItemSchema = z.object({
  component: z.string().min(1),
  quantity: z.string().min(1),
  notes: z.string().optional()
});

const timelineStageSchema = z.object({
  label: z.string().min(1),
  duration: z.string().min(1),
  temperature: z.string().optional(),
  details: z.string().optional()
});

const blockSchema = z
  .object({
    id: z.string().min(1),
    type: blockTypeSchema,
    extensions: extensionSchema
  })
  .and(
    z.union([
      z.object({ type: z.literal("paragraph"), text: z.string() }),
      z.object({ type: z.literal("note"), text: z.string() }),
      z.object({ type: z.literal("caution"), text: z.string(), severity: z.enum(["low", "medium", "high"]).optional() }),
      z.object({ type: z.literal("qc"), checkpoint: z.string().min(1), acceptanceCriteria: z.string().optional() }),
      z.object({ type: z.literal("recipe"), title: z.string().optional(), items: z.array(recipeItemSchema) }),
      z.object({ type: z.literal("timeline"), stages: z.array(timelineStageSchema) }),
      z.object({ type: z.literal("link"), label: z.string().min(1), url: z.string().url() }),
      z.object({ type: z.literal("table"), columns: z.array(z.string()), rows: z.array(z.array(z.string())) }),
      z.object({ type: z.literal("fileReference"), label: z.string().min(1), path: z.string().min(1) }),
      z.object({ type: z.literal("branch"), condition: z.string().min(1), thenStepIds: z.array(z.string()) })
    ])
  );

const stepSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    stepKind: stepKindSchema,
    optional: z.boolean().optional(),
    blocks: z.array(blockSchema),
    extensions: extensionSchema
  })
);

const sectionSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    sections: z.array(sectionSchema),
    steps: z.array(stepSchema),
    extensions: extensionSchema
  })
);

export const protocolSchema = z.object({
  schemaVersion: z.literal(PROTOCOL_SCHEMA_VERSION),
  protocol: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    authors: z.array(z.string()),
    tags: z.array(z.string()),
    metadata: z.record(z.unknown()).optional(),
    sections: z.array(sectionSchema),
    extensions: extensionSchema
  }),
  extensions: extensionSchema
});

export interface ValidationResult {
  success: boolean;
  errors: string[];
  data?: ProtocolDocument;
}

export const validateProtocolDocument = (input: unknown): ValidationResult => {
  const parsed = protocolSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    };
  }
  return { success: true, errors: [], data: parsed.data as ProtocolDocument };
};

export const normalizeProtocolDocument = (doc: ProtocolDocument): ProtocolDocument => ({
  ...doc,
  schemaVersion: PROTOCOL_SCHEMA_VERSION,
  protocol: {
    ...doc.protocol,
    metadata: doc.protocol.metadata ?? {},
    extensions: doc.protocol.extensions ?? {},
    sections: doc.protocol.sections.map((section) => normalizeSection(section))
  },
  extensions: doc.extensions ?? {}
});

const normalizeSection = (section: ProtocolDocument["protocol"]["sections"][number]) => ({
  ...section,
  sections: section.sections.map((child) => normalizeSection(child)),
  steps: section.steps.map((step) => ({
    ...step,
    extensions: step.extensions ?? {},
    blocks: step.blocks.map((block) => ({ ...block, extensions: block.extensions ?? {} }))
  })),
  extensions: section.extensions ?? {}
});
