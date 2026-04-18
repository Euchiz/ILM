export const AI_IMPORT_PANEL_TITLE = "Instructions for AI-assisted protocol import";

export const AI_IMPORT_RULES = [
  "Output one complete valid JSON object only. No markdown fences. No commentary.",
  "The output must be ready to save directly as a downloadable .json file for Protocol Manager import.",
  "Do not split the result across sections, snippets, or multiple alternatives.",
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
  "Use schemaVersion \"1.0.0\".",
  "Return the final answer as a single self-contained JSON file payload."
] as const;

export const AI_IMPORT_INSTRUCTIONS_TEXT = AI_IMPORT_RULES.map((rule, index) => `${index + 1}. ${rule}`).join("\n");
