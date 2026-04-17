export const PROTOCOL_SCHEMA_VERSION = "1.0.0" as const;

export type StepKind =
  | "action"
  | "preparation"
  | "qc"
  | "optional"
  | "pause"
  | "cleanup"
  | "analysis";

export type BlockType =
  | "paragraph"
  | "note"
  | "caution"
  | "qc"
  | "recipe"
  | "timeline"
  | "link"
  | "table"
  | "fileReference"
  | "branch";

export interface ProtocolDocument {
  schemaVersion: typeof PROTOCOL_SCHEMA_VERSION;
  protocol: Protocol;
  extensions?: Record<string, unknown>;
}

export interface Protocol {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  authors: string[];
  tags: string[];
  metadata?: Record<string, unknown>;
  reagents: ProtocolReagent[];
  equipment: ProtocolEquipment[];
  sections: ProtocolSection[];
  extensions?: Record<string, unknown>;
}

export interface ProtocolReagent {
  id: string;
  name: string;
  supplier?: string;
  catalogNumber?: string;
  notes?: string;
  extensions?: Record<string, unknown>;
}

export interface ProtocolEquipment {
  id: string;
  name: string;
  model?: string;
  notes?: string;
  extensions?: Record<string, unknown>;
}

export interface ProtocolSection {
  id: string;
  title: string;
  description?: string;
  sections: ProtocolSection[];
  steps: ProtocolStep[];
  extensions?: Record<string, unknown>;
}

export interface ProtocolStep {
  id: string;
  title: string;
  stepKind: StepKind;
  blocks: ProtocolBlock[];
  optional?: boolean;
  extensions?: Record<string, unknown>;
}

interface BaseBlock {
  id: string;
  type: BlockType;
  extensions?: Record<string, unknown>;
}

export interface ParagraphBlock extends BaseBlock {
  type: "paragraph";
  text: string;
}

export interface NoteBlock extends BaseBlock {
  type: "note";
  text: string;
}

export interface CautionBlock extends BaseBlock {
  type: "caution";
  severity?: "low" | "medium" | "high";
  text: string;
}

export interface QcBlock extends BaseBlock {
  type: "qc";
  checkpoint: string;
  acceptanceCriteria?: string;
}

export interface RecipeBlock extends BaseBlock {
  type: "recipe";
  title?: string;
  items: { component: string; quantity: string; notes?: string }[];
}

export interface TimelineBlock extends BaseBlock {
  type: "timeline";
  stages: { label: string; duration: string; temperature?: string; details?: string }[];
}

export interface LinkBlock extends BaseBlock {
  type: "link";
  label: string;
  url: string;
}

export interface TableBlock extends BaseBlock {
  type: "table";
  columns: string[];
  rows: string[][];
}

export interface FileReferenceBlock extends BaseBlock {
  type: "fileReference";
  label: string;
  path: string;
}

export interface BranchBlock extends BaseBlock {
  type: "branch";
  condition: string;
  thenStepIds: string[];
}

export type ProtocolBlock =
  | ParagraphBlock
  | NoteBlock
  | CautionBlock
  | QcBlock
  | RecipeBlock
  | TimelineBlock
  | LinkBlock
  | TableBlock
  | FileReferenceBlock
  | BranchBlock;
