export const AI_IMPORT_PANEL_TITLE = "Instructions for AI-assisted protocol import";

export const AI_IMPORT_RULES = [
  "Output one complete valid JSON object only. No markdown fences. No commentary.",
  "The output must be saved directly as a downloadable .json file.",
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

// ---------------------------------------------------------------------------
// Project Manager — JSON transfer instructions
//
// Used by the "Import project from JSON" modal so users can copy a single
// prompt into an LLM along with their plain-language project description and
// receive a ready-to-import payload. The schema mirrors `projectIO.ts` in
// apps/project-manager.
// ---------------------------------------------------------------------------

export const AI_IMPORT_PROJECT_PANEL_TITLE =
  "Instructions for AI-assisted project import";

export const AI_IMPORT_PROJECT_RULES = [
  "Output one complete valid JSON object only. No markdown fences. No commentary.",
  "The output must be saved directly as a downloadable .json file.",
  "Use exactly these top-level fields: version (number), kind (string), exportedAt (ISO timestamp), project (object), milestones (array), ungroupedExperiments (array).",
  "Set kind to \"ilm.project\" and version to 1.",
  "project must include: name (non-empty string), description (string or null), status (one of: planning, active, blocked, completed, archived), approvalRequired (boolean).",
  "Each milestone must include: title (non-empty string), description (string or null), dueDate (ISO date string or null), status (one of: planned, in_progress, done, cancelled), sortOrder (number, ascending), experiments (array).",
  "Each experiment must include: title (non-empty string), notes (string or null), status (one of: planned, running, completed, failed), sortOrder (number, ascending), startedAt (ISO timestamp or null), completedAt (ISO timestamp or null).",
  "Use sortOrder values that ascend in steps of 1024 (1024, 2048, 3072 …) so future inserts have room.",
  "Group related experiments under their owning milestone via the milestone's experiments array. Put any experiment that has no parent milestone into ungroupedExperiments.",
  "Do not invent owner, lab, or user IDs — they are stripped on export and reassigned on import.",
  "If information is missing or ambiguous, preserve it in the description / notes fields instead of inventing details.",
  "Return the final answer as a single self-contained JSON file payload.",
] as const;

export const AI_IMPORT_PROJECT_INSTRUCTIONS_TEXT = AI_IMPORT_PROJECT_RULES
  .map((rule, index) => `${index + 1}. ${rule}`)
  .join("\n");

/**
 * Minimal but complete example payload, useful both as a template the user
 * can download and edit, and as the canonical reference for the AI prompt.
 * Mirrors the ProjectExport shape in apps/project-manager/src/lib/projectIO.ts.
 */
export const AI_IMPORT_PROJECT_TEMPLATE = {
  version: 1,
  kind: "ilm.project",
  exportedAt: "2026-01-01T00:00:00.000Z",
  project: {
    name: "Example project",
    description: "Short description of the project's goal and scope.",
    status: "planning",
    approvalRequired: true,
  },
  milestones: [
    {
      title: "Milestone 1 — feasibility",
      description: "Decide whether the approach is worth scaling up.",
      dueDate: null,
      status: "planned",
      sortOrder: 1024,
      experiments: [
        {
          title: "Pilot run",
          notes: "Replace with the experiment description you want to anchor here.",
          status: "planned",
          sortOrder: 1024,
          startedAt: null,
          completedAt: null,
        },
      ],
    },
  ],
  ungroupedExperiments: [
    {
      title: "Standalone experiment",
      notes: "Use this list for experiments not yet attached to a milestone.",
      status: "planned",
      sortOrder: 1024,
      startedAt: null,
      completedAt: null,
    },
  ],
} as const;
