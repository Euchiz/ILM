export const AI_IMPORT_PANEL_TITLE = "Instructions for AI-assisted protocol import";

export const AI_IMPORT_RULES = [
  "Output valid JSON only. No markdown fences. No commentary.",
  "Preserve the original procedure content as faithfully as possible.",
  "Organize the protocol into protocol metadata, sections, subsections if needed, ordered steps, and typed blocks.",
  "Use stepKind only from: action, preparation, qc, optional, pause, cleanup, analysis",
  "Use block types only from: paragraph, note, caution, qc, recipe, timeline, link, table, fileReference, branch",
  "Put reaction mixtures into recipe blocks.",
  "Put cycling programs, incubation schedules, and multi-stage time plans into timeline blocks.",
  "Put warnings or critical handling notes into caution blocks.",
  "Put quality control checkpoints into qc blocks or steps with stepKind=\"qc\".",
  "If information is missing or ambiguous, preserve it in a note block instead of inventing details.",
  "Keep units exactly as written when possible.",
  "Create stable human-readable IDs.",
  "Use schemaVersion \"1.0.0\"."
] as const;

export const AI_IMPORT_INSTRUCTIONS_TEXT = AI_IMPORT_RULES.map((rule, index) => `${index + 1}. ${rule}`).join("\n");
