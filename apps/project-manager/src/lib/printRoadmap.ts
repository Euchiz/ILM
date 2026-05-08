import type { ExperimentRecord, MilestoneRecord, ProjectRecord } from "./cloudAdapter";

// ---------------------------------------------------------------------------
// Printable project roadmap.
//
// Rather than wrestle the LabShell + roadmap CSS into looking right under
// `@media print`, we build a self-contained HTML document and pop it into a
// new window. The new window's onload handler triggers the browser's print
// dialog so the user can save as PDF or send to a physical printer. Closing
// the print preview leaves the original Project Manager session untouched.
// ---------------------------------------------------------------------------

const escapeHtml = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
};

const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
};

const statusLabel = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

const PRINT_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #14181d;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 12pt;
    line-height: 1.45;
  }
  body { padding: 24px 32px 48px; }
  .doc-head {
    border-bottom: 2px solid #1f9d6c;
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .doc-kicker {
    font-size: 9pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #1f9d6c;
    margin-bottom: 4px;
  }
  .doc-title { margin: 0 0 6px; font-size: 22pt; line-height: 1.15; }
  .doc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 9pt;
    color: #5b6470;
  }
  .doc-meta strong { color: #14181d; font-weight: 600; }
  .doc-summary { margin: 12px 0 0; color: #2c333b; }
  .roadmap-section {
    margin-top: 22px;
    page-break-inside: avoid;
  }
  /* Each milestone (and the unassigned-experiments tail) starts on a new
     page when printed. The first roadmap section follows the document
     header on page 1; the adjacent-sibling selector skips it. */
  .roadmap-section + .roadmap-section {
    margin-top: 0;
    break-before: page;
    page-break-before: always;
  }
  .section-head {
    border-left: 4px solid #1f9d6c;
    padding: 4px 0 4px 12px;
    margin-bottom: 12px;
  }
  .section-marker {
    font-size: 8.5pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #1f9d6c;
  }
  .section-head h2 {
    margin: 4px 0 2px;
    font-size: 14pt;
    line-height: 1.2;
  }
  .section-head .section-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    font-size: 9.5pt;
    color: #5b6470;
  }
  .section-head .section-meta .pill {
    background: #f1f3f5;
    border: 1px solid #d6dadf;
    border-radius: 999px;
    padding: 1px 9px;
    font-size: 8.5pt;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #2c333b;
  }
  .section-description { margin: 6px 0 10px; color: #2c333b; }
  .experiment-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .experiment {
    border: 1px solid #cfd5db;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
    page-break-inside: avoid;
    background: #fbfcfd;
  }
  .experiment-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
  }
  .experiment-marker {
    font-size: 8.5pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #5b6470;
  }
  .experiment-title { font-weight: 600; font-size: 11pt; }
  .experiment-notes {
    margin: 4px 0 6px;
    color: #2c333b;
    font-size: 10.5pt;
  }
  .experiment-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    font-size: 9pt;
    color: #5b6470;
  }
  .empty-note {
    color: #5b6470;
    font-style: italic;
    font-size: 10pt;
  }
  .doc-footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #d6dadf;
    font-size: 8.5pt;
    color: #5b6470;
    display: flex;
    justify-content: space-between;
  }
  @media print {
    body { padding: 0.6in; }
    .roadmap-section { break-inside: avoid; }
    .experiment { break-inside: avoid; }
  }
`;

export interface PrintRoadmapInput {
  project: ProjectRecord;
  milestones: MilestoneRecord[];
  experimentsByMilestone: Map<string, ExperimentRecord[]>;
  unassignedExperiments: ExperimentRecord[];
  protocolTitles: Map<string, string>;
  /** Display name for the lab, used in the document footer. */
  labName?: string | null;
}

const renderExperiment = (
  experiment: ExperimentRecord,
  marker: string,
  protocolTitles: Map<string, string>
): string => {
  const protocolTitle = experiment.protocol_id
    ? protocolTitles.get(experiment.protocol_id) ?? "Linked protocol"
    : "No linked protocol";
  const startedLabel = experiment.started_at
    ? `Started ${formatDateTime(experiment.started_at)}`
    : "Not started";
  const completedLabel = experiment.completed_at
    ? `Completed ${formatDateTime(experiment.completed_at)}`
    : null;
  return `
    <li class="experiment">
      <div class="experiment-head">
        <div>
          <div class="experiment-marker">${escapeHtml(marker)}</div>
          <div class="experiment-title">${escapeHtml(experiment.title)}</div>
        </div>
        <span class="pill">${escapeHtml(statusLabel(experiment.status))}</span>
      </div>
      <div class="experiment-notes">${escapeHtml(experiment.notes ?? "No notes recorded.")}</div>
      <div class="experiment-meta">
        <span>${escapeHtml(protocolTitle)}</span>
        <span>${escapeHtml(startedLabel)}</span>
        ${completedLabel ? `<span>${escapeHtml(completedLabel)}</span>` : ""}
      </div>
    </li>
  `;
};

const renderMilestoneSection = (
  milestone: MilestoneRecord,
  index: number,
  experiments: ExperimentRecord[],
  protocolTitles: Map<string, string>
): string => {
  const dueLabel = milestone.due_date ? `Due ${formatDate(milestone.due_date)}` : "No due date";
  const description = milestone.description?.trim() || "No milestone description provided.";
  const experimentsHtml = experiments.length
    ? `<ol class="experiment-list">${experiments
        .map((experiment, expIdx) =>
          renderExperiment(experiment, `Experiment ${index + 1}.${expIdx + 1}`, protocolTitles)
        )
        .join("")}</ol>`
    : `<p class="empty-note">No experiments assigned to this milestone yet.</p>`;
  return `
    <section class="roadmap-section">
      <header class="section-head">
        <div class="section-marker">Milestone ${index + 1}</div>
        <h2>${escapeHtml(milestone.title)}</h2>
        <div class="section-meta">
          <span class="pill">${escapeHtml(statusLabel(milestone.status))}</span>
          <span>${escapeHtml(dueLabel)}</span>
        </div>
        <p class="section-description">${escapeHtml(description)}</p>
      </header>
      ${experimentsHtml}
    </section>
  `;
};

const renderUnassignedSection = (
  experiments: ExperimentRecord[],
  protocolTitles: Map<string, string>
): string => {
  if (experiments.length === 0) return "";
  return `
    <section class="roadmap-section">
      <header class="section-head">
        <div class="section-marker">Unassigned</div>
        <h2>Unassigned experiments</h2>
        <p class="section-description">Experiments not yet attached to a milestone.</p>
      </header>
      <ol class="experiment-list">
        ${experiments
          .map((experiment, idx) =>
            renderExperiment(experiment, `Experiment U.${idx + 1}`, protocolTitles)
          )
          .join("")}
      </ol>
    </section>
  `;
};

export const buildPrintHtml = (input: PrintRoadmapInput): string => {
  const { project, milestones, experimentsByMilestone, unassignedExperiments, protocolTitles, labName } = input;
  const generatedAt = formatDateTime(new Date().toISOString());
  const summary = project.description?.trim() || "No project description recorded.";
  const milestoneSections = milestones
    .map((milestone, idx) =>
      renderMilestoneSection(milestone, idx, experimentsByMilestone.get(milestone.id) ?? [], protocolTitles)
    )
    .join("");
  const unassignedSection = renderUnassignedSection(unassignedExperiments, protocolTitles);
  const empty =
    milestones.length === 0 && unassignedExperiments.length === 0
      ? `<p class="empty-note">No milestones or experiments recorded yet.</p>`
      : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(project.name)} — roadmap</title>
    <style>${PRINT_STYLES}</style>
  </head>
  <body>
    <header class="doc-head">
      <div class="doc-kicker">Project roadmap</div>
      <h1 class="doc-title">${escapeHtml(project.name)}</h1>
      <div class="doc-meta">
        ${project.status ? `<span><strong>Status</strong> ${escapeHtml(statusLabel(project.status))}</span>` : ""}
        <span><strong>State</strong> ${escapeHtml(statusLabel(project.state))}</span>
        ${labName ? `<span><strong>Lab</strong> ${escapeHtml(labName)}</span>` : ""}
        <span><strong>Generated</strong> ${escapeHtml(generatedAt)}</span>
      </div>
      <p class="doc-summary">${escapeHtml(summary)}</p>
    </header>
    ${empty}
    ${milestoneSections}
    ${unassignedSection}
    <footer class="doc-footer">
      <span>Integrated Lab Manager · Project roadmap export</span>
      <span>${escapeHtml(generatedAt)}</span>
    </footer>
  </body>
</html>`;
};

/**
 * Open a new window containing the printable roadmap and trigger the print
 * dialog. Returns true if a print window was opened.
 */
export const printProjectRoadmap = (input: PrintRoadmapInput): boolean => {
  if (typeof window === "undefined") return false;
  const html = buildPrintHtml(input);
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Some browsers fire onload immediately on document.write windows; others
  // wait until the parser settles. Use a short fallback so the print dialog
  // always opens even if onload doesn't fire.
  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      // Swallow — popup blocker / cross-origin can sometimes interfere.
    }
  };
  if (win.document.readyState === "complete") {
    setTimeout(triggerPrint, 150);
  } else {
    win.addEventListener("load", () => setTimeout(triggerPrint, 50));
    setTimeout(triggerPrint, 600);
  }
  return true;
};
