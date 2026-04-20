import type {
  CautionBlock,
  LinkBlock,
  ParagraphBlock,
  ProtocolDocument,
  ProtocolSection,
  ProtocolStep,
  QcBlock,
  RecipeBlock,
  TimelineBlock
} from "@ilm/types";
import { PROTOCOL_SCHEMA_VERSION } from "@ilm/types";
import { createStableId, nowIso } from "@ilm/utils";

const createUniqueId = (prefix: string, label: string) =>
  createStableId(prefix, `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

export const createDefaultProtocol = (): ProtocolDocument => {
  const now = nowIso();

  const recipe: RecipeBlock = {
    id: "block-master-mix",
    type: "recipe",
    title: "Master mix",
    items: [
      { component: "2x PCR mix", quantity: "12.5 uL", notes: "" },
      { component: "Forward primer", quantity: "0.5 uL", notes: "" },
      { component: "Reverse primer", quantity: "0.5 uL", notes: "" },
      { component: "Nuclease-free water", quantity: "10.5 uL", notes: "" }
    ],
    extensions: {}
  };

  const timeline: TimelineBlock = {
    id: "block-pcr-cycling",
    type: "timeline",
    stages: [
      { label: "Initial denaturation", duration: "3 min", temperature: "95 C", details: "" },
      { label: "35 cycles", duration: "30 s each", temperature: "", details: "95 C / 58 C / 72 C" },
      { label: "Final extension", duration: "5 min", temperature: "72 C", details: "" }
    ],
    extensions: {}
  };

  const caution: CautionBlock = {
    id: "block-aerosol-warning",
    type: "caution",
    severity: "high",
    text: "Use separate pre-PCR and post-PCR areas to avoid contamination.",
    extensions: {}
  };

  const qc: QcBlock = {
    id: "block-gel-qc",
    type: "qc",
    checkpoint: "Run 5 uL product on a 1.5% agarose gel",
    acceptanceCriteria: "Single band at the expected amplicon size",
    extensions: {}
  };

  const link: LinkBlock = {
    id: "block-manufacturer-protocol",
    type: "link",
    label: "Enzyme datasheet",
    url: "https://example.org/datasheet",
    extensions: {}
  };

  const intro: ParagraphBlock = {
    id: "block-intro",
    type: "paragraph",
    text: "Prepare the reaction mix on ice, run amplification, and verify product quality before continuing.",
    extensions: {}
  };

  const steps: ProtocolStep[] = [
    { id: "step-prepare-mix", title: "Prepare reaction mix", stepKind: "preparation", blocks: [intro, recipe, caution], extensions: {} },
    { id: "step-run-program", title: "Run thermal cycler", stepKind: "action", blocks: [timeline, link], extensions: {} },
    { id: "step-verify-product", title: "Check amplicon quality", stepKind: "qc", blocks: [qc], extensions: {} }
  ];

  const section: ProtocolSection = {
    id: createStableId("section", "PCR setup"),
    title: "PCR setup",
    description: "Core amplification workflow",
    sections: [],
    steps,
    extensions: {}
  };

  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    protocol: {
      id: createUniqueId("protocol", "pcr-basic"),
      title: "Basic PCR Amplification",
      description: "Starter template for Protocol Manager",
      createdAt: now,
      updatedAt: now,
      authors: ["Integrated Lab Manager"],
      tags: ["PCR", "DNA"],
      metadata: { objective: "Generate target amplicon" },
      reagents: [
        {
          id: "reagent-pcr-mix",
          name: "2x PCR mix",
          supplier: "Example Bio",
          catalogNumber: "PCR-200",
          notes: "Keep chilled until use.",
          extensions: {}
        },
        {
          id: "reagent-forward-primer",
          name: "Forward primer",
          supplier: "",
          catalogNumber: "",
          notes: "",
          extensions: {}
        }
      ],
      equipment: [
        {
          id: "equipment-thermal-cycler",
          name: "Thermal cycler",
          model: "96-well",
          notes: "Confirm lid temperature settings before starting.",
          extensions: {}
        },
        {
          id: "equipment-gel-rig",
          name: "Agarose gel rig",
          model: "",
          notes: "",
          extensions: {}
        }
      ],
      sections: [section],
      extensions: {}
    },
    extensions: {}
  };
};

export const createBlankProtocol = (): ProtocolDocument => {
  const now = nowIso();

  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    protocol: {
      id: createUniqueId("protocol", "untitled"),
      title: "Untitled Protocol",
      description: "",
      createdAt: now,
      updatedAt: now,
      authors: [],
      tags: [],
      metadata: { objective: "" },
      reagents: [],
      equipment: [],
      sections: [],
      extensions: {}
    },
    extensions: {}
  };
};
