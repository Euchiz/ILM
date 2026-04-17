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

export const createDefaultProtocol = (): ProtocolDocument => {
  const now = nowIso();
  const recipe: RecipeBlock = {
    id: "block-master-mix",
    type: "recipe",
    title: "Master mix",
    items: [
      { component: "2x PCR mix", quantity: "12.5 µL" },
      { component: "Forward primer", quantity: "0.5 µL" },
      { component: "Reverse primer", quantity: "0.5 µL" },
      { component: "Nuclease-free water", quantity: "10.5 µL" }
    ]
  };

  const timeline: TimelineBlock = {
    id: "block-pcr-cycling",
    type: "timeline",
    stages: [
      { label: "Initial denaturation", duration: "3 min", temperature: "95°C" },
      { label: "35 cycles", duration: "30 s each", details: "95°C / 58°C / 72°C" },
      { label: "Final extension", duration: "5 min", temperature: "72°C" }
    ]
  };

  const caution: CautionBlock = {
    id: "block-aerosol-warning",
    type: "caution",
    severity: "high",
    text: "Use separate pre-PCR and post-PCR areas to avoid contamination."
  };

  const qc: QcBlock = {
    id: "block-gel-qc",
    type: "qc",
    checkpoint: "Run 5 µL product on 1.5% agarose gel",
    acceptanceCriteria: "Single band at expected amplicon size"
  };

  const link: LinkBlock = {
    id: "block-manufacturer-protocol",
    type: "link",
    label: "Enzyme datasheet",
    url: "https://example.org/datasheet"
  };

  const intro: ParagraphBlock = {
    id: "block-intro",
    type: "paragraph",
    text: "Prepare reaction mix on ice, then run amplification and verify product quality."
  };

  const steps: ProtocolStep[] = [
    { id: "step-prepare-mix", title: "Prepare reaction mix", stepKind: "preparation", blocks: [intro, recipe, caution] },
    { id: "step-run-program", title: "Run thermal cycler", stepKind: "action", blocks: [timeline, link] },
    { id: "step-verify-product", title: "Check amplicon quality", stepKind: "qc", blocks: [qc] }
  ];

  const section: ProtocolSection = {
    id: createStableId("section", "PCR setup"),
    title: "PCR setup",
    description: "Core amplification workflow",
    sections: [],
    steps
  };

  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    protocol: {
      id: "protocol-pcr-basic",
      title: "Basic PCR Amplification",
      description: "Starter template for Protocol Manager",
      createdAt: now,
      updatedAt: now,
      authors: ["Integrated Lab Manager"],
      tags: ["PCR", "DNA"],
      metadata: { objective: "Generate target amplicon" },
      sections: [section],
      extensions: {}
    },
    extensions: {}
  };
};
