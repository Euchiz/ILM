import type {
  ProtocolBlock,
  ProtocolDocument,
  ProtocolSection,
  ProtocolStep,
  StepKind,
} from "@ilm/types";

// ---------------------------------------------------------------------------
// Printable protocol document.
//
// Replaces the old "grab innerHTML from the on-screen preview and dump it in
// a popup" approach. We render a self-contained HTML document straight from
// the protocol data so the print output:
//   - carries its own typography + layout, decoupled from the app shell
//   - shows a real title block (title, lifecycle, version, authors, tags)
//   - has a numbered table of contents anchored to each section
//   - styles every block kind (note / caution / qc / recipe / timeline /
//     table / branch / file reference / link) with print-friendly formatting
//   - never page-breaks across a step or sub-card
// ---------------------------------------------------------------------------

const escapeHtml = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value)
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

const STEP_KIND_LABELS: Record<StepKind, string> = {
  action: "Action",
  preparation: "Preparation",
  qc: "QC",
  optional: "Optional",
  pause: "Pause",
  cleanup: "Cleanup",
  analysis: "Analysis",
};

// Tiny inline SVG glyphs — no font dependencies, prints reliably across
// browsers. Kept on the small side so they sit nicely next to the step
// title at print scale.
const stepKindIcon = (kind: StepKind): string => {
  const common = `width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  switch (kind) {
    case "action":
      return `<svg ${common}><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
    case "preparation":
      return `<svg ${common}><path d="M9 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-10V3"/><line x1="9" y1="3" x2="15" y2="3"/></svg>`;
    case "qc":
      return `<svg ${common}><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></svg>`;
    case "optional":
      return `<svg ${common}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><line x1="3" y1="3" x2="21" y2="21"/></svg>`;
    case "pause":
      return `<svg ${common}><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>`;
    case "cleanup":
      return `<svg ${common}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
    case "analysis":
      return `<svg ${common}><line x1="3" y1="20" x2="21" y2="20"/><rect x="6" y="10" width="3" height="9"/><rect x="11" y="6" width="3" height="13"/><rect x="16" y="13" width="3" height="6"/></svg>`;
  }
};

const PRINT_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #14181d;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 11.5pt;
    line-height: 1.5;
  }
  body { padding: 28px 36px 56px; }
  a { color: #156c4a; text-decoration: underline; }

  /* ---------- Document head ---------- */
  .doc-head {
    border-bottom: 2px solid #1f9d6c;
    padding-bottom: 14px;
    margin-bottom: 22px;
  }
  .doc-kicker {
    font-size: 9pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #1f9d6c;
    margin-bottom: 4px;
  }
  .doc-title { margin: 0 0 8px; font-size: 24pt; line-height: 1.15; letter-spacing: -0.01em; }
  .doc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 22px;
    font-size: 9.5pt;
    color: #5b6470;
  }
  .doc-meta strong { color: #14181d; font-weight: 600; }
  .doc-meta .pill {
    background: #f1f3f5;
    border: 1px solid #d6dadf;
    border-radius: 999px;
    padding: 1px 9px;
    font-size: 8.5pt;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #2c333b;
  }
  .doc-tags {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .doc-tag {
    background: #ecf6f1;
    color: #156c4a;
    font-size: 8.5pt;
    padding: 1px 8px;
    border-radius: 4px;
    border: 1px solid #c9e3d6;
  }
  .doc-summary {
    margin: 14px 0 0;
    color: #2c333b;
    font-size: 11pt;
  }

  /* ---------- Materials block ---------- */
  .materials {
    margin: 22px 0 8px;
    border: 1px solid #d6dadf;
    border-left: 3px solid #1f9d6c;
    border-radius: 4px;
    padding: 12px 16px;
    background: #fbfcfd;
    page-break-inside: avoid;
  }
  .materials h2 {
    margin: 0 0 8px;
    font-size: 11pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #1f9d6c;
  }
  .materials-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 28px;
  }
  .materials-grid h3 {
    margin: 6px 0 4px;
    font-size: 10pt;
    color: #2c333b;
  }
  .materials-grid ul {
    margin: 0;
    padding-left: 18px;
    font-size: 10.5pt;
  }
  .materials-grid li { margin-bottom: 2px; }
  .materials-grid li small { color: #5b6470; }

  /* ---------- Table of contents ---------- */
  .toc {
    margin: 18px 0 22px;
    padding: 12px 16px;
    background: #f6f8f9;
    border: 1px solid #d6dadf;
    border-radius: 4px;
    font-size: 10.5pt;
    page-break-inside: avoid;
  }
  .toc h2 {
    margin: 0 0 6px;
    font-size: 9pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #5b6470;
  }
  .toc ol {
    margin: 0;
    padding-left: 22px;
    counter-reset: toc;
    list-style: none;
  }
  .toc ol ol { padding-left: 22px; }
  .toc li {
    counter-increment: toc;
    padding: 1px 0;
  }
  .toc li::before {
    content: counters(toc, ".") ". ";
    color: #5b6470;
  }
  .toc a { color: inherit; text-decoration: none; }
  .toc a:hover { text-decoration: underline; }

  /* ---------- Sections + steps ---------- */
  .section {
    margin-top: 22px;
    page-break-inside: auto;
  }
  .section + .section { margin-top: 26px; }
  /* Each top-level section starts on a fresh page when printed. The
     adjacent-sibling selector skips the very first section (it follows
     the TOC on page 1) and only matches the 2nd, 3rd, … top-level
     sections. Nested subsections do not get the break — they flow
     inside their parent section. */
  .section-top + .section-top {
    break-before: page;
    page-break-before: always;
    margin-top: 0;
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
  .section-head h2,
  .section-head h3,
  .section-head h4 {
    margin: 4px 0 0;
    line-height: 1.2;
  }
  .section-head h2 { font-size: 16pt; }
  .section-head h3 { font-size: 13pt; }
  .section-head h4 { font-size: 11.5pt; }
  .section-description { margin: 6px 0 10px; color: #2c333b; }

  .step {
    border: 1px solid #d6dadf;
    border-left: 4px solid #6c757d;
    border-radius: 4px;
    padding: 10px 14px;
    margin-bottom: 10px;
    background: #ffffff;
    page-break-inside: avoid;
  }
  .step.kind-action      { border-left-color: #4080c0; }
  .step.kind-preparation { border-left-color: #1f9d6c; }
  .step.kind-qc          { border-left-color: #156c4a; background: #f6fbf8; }
  .step.kind-optional    { border-left-color: #8a8a8a; background: #fafafa; }
  .step.kind-pause       { border-left-color: #d39e00; }
  .step.kind-cleanup     { border-left-color: #c0392b; }
  .step.kind-analysis    { border-left-color: #6f4ea0; }

  .step-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
  }
  .step-marker {
    flex: 0 0 auto;
    font-size: 9pt;
    letter-spacing: 0.06em;
    color: #5b6470;
    font-variant-numeric: tabular-nums;
    min-width: 2.5em;
  }
  .step-icon {
    flex: 0 0 auto;
    color: #5b6470;
    line-height: 0;
  }
  .step-title { font-weight: 600; font-size: 11.5pt; flex: 1 1 auto; }
  .step-kind-pill {
    font-size: 8pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: #f1f3f5;
    border: 1px solid #d6dadf;
    border-radius: 999px;
    padding: 1px 8px;
    color: #2c333b;
  }
  .step.kind-qc .step-kind-pill { background: #e0f1e8; border-color: #b6dcc6; color: #156c4a; }
  .step.kind-pause .step-kind-pill { background: #fff5da; border-color: #f0d999; color: #6c4f07; }
  .step.kind-cleanup .step-kind-pill { background: #fbeae8; border-color: #ecbcb6; color: #80261b; }
  .step.kind-analysis .step-kind-pill { background: #efe7f7; border-color: #cdbde7; color: #45307a; }

  .step-body { margin: 4px 0 0; }
  .step-body p { margin: 6px 0; }

  /* ---------- Block primitives ---------- */
  .block-note,
  .block-caution,
  .block-qc {
    border-left: 3px solid;
    padding: 6px 10px;
    margin: 8px 0;
    border-radius: 3px;
    font-size: 10.5pt;
  }
  .block-note    { border-color: #4080c0; background: #eaf2fa; color: #11365d; }
  .block-caution { border-color: #c0392b; background: #fbeae8; color: #80261b; }
  .block-caution.severity-high { border-left-width: 5px; font-weight: 600; }
  .block-qc      { border-color: #156c4a; background: #e8f4ee; color: #0f4a31; }
  .block-label {
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 8.5pt;
    margin-right: 6px;
  }

  .subcard {
    border: 1px solid #d6dadf;
    border-radius: 4px;
    padding: 10px 12px;
    margin: 10px 0;
    background: #fbfcfd;
    page-break-inside: avoid;
  }
  .subcard-title {
    font-size: 8.5pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #5b6470;
    margin-bottom: 6px;
  }
  .subcard-title strong {
    color: #14181d;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    font-size: 11pt;
  }

  /* recipe */
  .recipe-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid #ecedef;
  }
  .recipe-list li {
    display: grid;
    grid-template-columns: 1.4fr 0.8fr 1.2fr;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid #ecedef;
    font-size: 10.5pt;
  }
  .recipe-component { font-weight: 600; }
  .recipe-quantity { font-variant-numeric: tabular-nums; color: #2c333b; }
  .recipe-notes { color: #5b6470; font-size: 10pt; }

  /* timeline */
  .timeline {
    display: flex;
    gap: 8px;
    margin-top: 6px;
    overflow-x: auto;
  }
  .timeline-stage {
    flex: 1 1 0;
    border: 1px solid #d6dadf;
    border-top: 3px solid #1f9d6c;
    border-radius: 3px;
    padding: 8px 10px;
    background: #ffffff;
    min-width: 0;
  }
  .timeline-stage-label { font-weight: 600; font-size: 10.5pt; }
  .timeline-stage-meta {
    margin-top: 2px;
    font-size: 9.5pt;
    color: #5b6470;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .timeline-stage-details { margin-top: 4px; font-size: 10pt; color: #2c333b; }

  /* table */
  .protocol-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
    font-size: 10pt;
  }
  .protocol-table th,
  .protocol-table td {
    border: 1px solid #d6dadf;
    padding: 5px 8px;
    vertical-align: top;
    text-align: left;
  }
  .protocol-table thead th {
    background: #f1f3f5;
    font-weight: 600;
  }

  /* link / file / branch */
  .block-inline { font-size: 10.5pt; margin: 6px 0; }
  .block-inline .block-label { color: #5b6470; }

  /* ---------- Footer ---------- */
  .doc-footer {
    margin-top: 36px;
    padding-top: 12px;
    border-top: 1px solid #d6dadf;
    font-size: 8.5pt;
    color: #5b6470;
    display: flex;
    justify-content: space-between;
  }

  @media print {
    body { padding: 0.5in 0.55in 0.6in; }
    a { color: #14181d; }
    .toc { background: #ffffff; }
    .timeline { overflow: visible; }
  }
`;

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

const renderBlock = (block: ProtocolBlock): string => {
  switch (block.type) {
    case "paragraph":
      return `<p>${escapeHtml(block.text)}</p>`;
    case "note":
      return `<div class="block-note"><span class="block-label">Note</span>${escapeHtml(block.text)}</div>`;
    case "caution": {
      const severity = block.severity ?? "medium";
      return `<div class="block-caution severity-${escapeHtml(severity)}"><span class="block-label">Caution · ${escapeHtml(severity)}</span>${escapeHtml(block.text)}</div>`;
    }
    case "qc":
      return `<div class="block-qc"><span class="block-label">QC checkpoint</span><strong>${escapeHtml(block.checkpoint)}</strong>${
        block.acceptanceCriteria ? ` — ${escapeHtml(block.acceptanceCriteria)}` : ""
      }</div>`;
    case "recipe": {
      const itemsHtml = block.items
        .map(
          (item) =>
            `<li><span class="recipe-component">${escapeHtml(item.component)}</span><span class="recipe-quantity">${escapeHtml(item.quantity)}</span><span class="recipe-notes">${escapeHtml(item.notes ?? "")}</span></li>`
        )
        .join("");
      return `<div class="subcard"><div class="subcard-title">Recipe · <strong>${escapeHtml(block.title || "Mixture")}</strong></div><ul class="recipe-list">${itemsHtml}</ul></div>`;
    }
    case "timeline": {
      const stagesHtml = block.stages
        .map((stage) => {
          const meta = [stage.duration, stage.temperature].filter(Boolean).map((v) => `<span>${escapeHtml(v as string)}</span>`).join("");
          return `<div class="timeline-stage"><div class="timeline-stage-label">${escapeHtml(stage.label)}</div><div class="timeline-stage-meta">${meta}</div>${
            stage.details ? `<div class="timeline-stage-details">${escapeHtml(stage.details)}</div>` : ""
          }</div>`;
        })
        .join("");
      return `<div class="subcard"><div class="subcard-title">Timeline</div><div class="timeline">${stagesHtml}</div></div>`;
    }
    case "link":
      return `<p class="block-inline"><span class="block-label">Link</span><a href="${escapeHtml(block.url)}">${escapeHtml(block.label)}</a></p>`;
    case "table": {
      const head = `<tr>${block.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
      const body = block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("");
      return `<div class="subcard"><div class="subcard-title">Table</div><table class="protocol-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    }
    case "fileReference":
      return `<p class="block-inline"><span class="block-label">File</span>${escapeHtml(block.label)} <small>(${escapeHtml(block.path)})</small></p>`;
    case "branch": {
      const targets = block.thenStepIds.length > 0 ? block.thenStepIds.join(", ") : "no target steps selected";
      return `<div class="subcard"><div class="subcard-title">Branch</div><p>If <strong>${escapeHtml(block.condition)}</strong>, continue with: ${escapeHtml(targets)}.</p></div>`;
    }
  }
};

const renderStep = (step: ProtocolStep, marker: string): string => {
  const blocks = step.blocks.map(renderBlock).join("");
  const optional = step.optional ? ` <span class="step-kind-pill">Optional</span>` : "";
  return `
    <article class="step kind-${escapeHtml(step.stepKind)}">
      <div class="step-head">
        <span class="step-marker">${escapeHtml(marker)}</span>
        <span class="step-icon">${stepKindIcon(step.stepKind)}</span>
        <span class="step-title">${escapeHtml(step.title)}</span>
        <span class="step-kind-pill">${escapeHtml(STEP_KIND_LABELS[step.stepKind])}</span>${optional}
      </div>
      <div class="step-body">${blocks}</div>
    </article>
  `;
};

const renderSection = (section: ProtocolSection, path: string, depth: number): string => {
  const headingTag = depth === 0 ? "h2" : depth === 1 ? "h3" : "h4";
  const marker = depth === 0 ? `Section ${path}` : `Subsection ${path}`;
  const stepsHtml = section.steps
    .map((step, idx) => renderStep(step, `${path}${idx + 1}`))
    .join("");
  const childSectionsHtml = section.sections
    .map((child, idx) => renderSection(child, `${path}${idx + 1}.`, depth + 1))
    .join("");
  const description = section.description?.trim()
    ? `<p class="section-description">${escapeHtml(section.description)}</p>`
    : "";
  const anchorId = `section-${escapeHtml(section.id)}`;
  // Mark depth-0 sections so the print stylesheet can put each one on its
  // own page. Subsections share the parent's page by design.
  const className = depth === 0 ? "section section-top" : "section";
  return `
    <section class="${className}" id="${anchorId}">
      <header class="section-head">
        <div class="section-marker">${escapeHtml(marker)}</div>
        <${headingTag}>${escapeHtml(path)} ${escapeHtml(section.title || "Untitled section")}</${headingTag}>
        ${description}
      </header>
      ${stepsHtml}
      ${childSectionsHtml}
    </section>
  `;
};

const renderToc = (sections: ProtocolSection[]): string => {
  if (sections.length === 0) return "";
  const renderItems = (list: ProtocolSection[]): string => `
    <ol>
      ${list
        .map(
          (section) =>
            `<li><a href="#section-${escapeHtml(section.id)}">${escapeHtml(section.title || "Untitled section")}</a>${
              section.sections.length > 0 ? renderItems(section.sections) : ""
            }</li>`
        )
        .join("")}
    </ol>
  `;
  return `<nav class="toc"><h2>Contents</h2>${renderItems(sections)}</nav>`;
};

const renderMaterials = (
  reagents: ProtocolDocument["protocol"]["reagents"],
  equipment: ProtocolDocument["protocol"]["equipment"]
): string => {
  if (reagents.length === 0 && equipment.length === 0) return "";
  const reagentsHtml =
    reagents.length > 0
      ? `<div><h3>Reagents</h3><ul>${reagents
          .map((r) => {
            const tail = [r.catalogNumber, r.supplier].filter(Boolean).join(" · ");
            return `<li>${escapeHtml(r.name)}${tail ? ` <small>${escapeHtml(tail)}</small>` : ""}</li>`;
          })
          .join("")}</ul></div>`
      : "";
  const equipmentHtml =
    equipment.length > 0
      ? `<div><h3>Equipment</h3><ul>${equipment
          .map((e) => `<li>${escapeHtml(e.name)}${e.model ? ` <small>${escapeHtml(e.model)}</small>` : ""}</li>`)
          .join("")}</ul></div>`
      : "";
  return `<aside class="materials"><h2>Materials</h2><div class="materials-grid">${reagentsHtml}${equipmentHtml}</div></aside>`;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PrintProtocolInput {
  doc: ProtocolDocument;
  /** Optional active-lab name for the document footer. */
  labName?: string | null;
}

const readMetaString = (
  metadata: Record<string, unknown> | undefined,
  key: string
): string | null => {
  if (!metadata) return null;
  const raw = metadata[key];
  return typeof raw === "string" && raw.trim() ? raw : null;
};

export const buildPrintHtml = ({ doc, labName }: PrintProtocolInput): string => {
  const protocol = doc.protocol;
  const generatedAt = new Date().toISOString();
  const generatedAtLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(generatedAt));

  const lifecycle = readMetaString(protocol.metadata, "lifecycleStatus");
  const review = readMetaString(protocol.metadata, "reviewStatus");
  const version = readMetaString(protocol.metadata, "version");

  const metaItems: string[] = [];
  if (lifecycle) metaItems.push(`<span class="pill">${escapeHtml(lifecycle)}</span>`);
  if (review) metaItems.push(`<span class="pill">${escapeHtml(review)}</span>`);
  if (version) metaItems.push(`<span><strong>Version</strong> ${escapeHtml(version)}</span>`);
  if (protocol.authors.length > 0) {
    metaItems.push(`<span><strong>Authors</strong> ${escapeHtml(protocol.authors.join(", "))}</span>`);
  }
  if (protocol.createdAt) {
    metaItems.push(`<span><strong>Created</strong> ${escapeHtml(formatDate(protocol.createdAt))}</span>`);
  }
  if (protocol.updatedAt) {
    metaItems.push(`<span><strong>Updated</strong> ${escapeHtml(formatDate(protocol.updatedAt))}</span>`);
  }
  if (labName) metaItems.push(`<span><strong>Lab</strong> ${escapeHtml(labName)}</span>`);
  metaItems.push(`<span><strong>Printed</strong> ${escapeHtml(generatedAtLabel)}</span>`);

  const tagsHtml =
    protocol.tags.length > 0
      ? `<div class="doc-tags">${protocol.tags
          .map((tag) => `<span class="doc-tag">${escapeHtml(tag)}</span>`)
          .join("")}</div>`
      : "";

  const summary = protocol.description?.trim()
    ? `<p class="doc-summary">${escapeHtml(protocol.description)}</p>`
    : "";

  const sectionsHtml = protocol.sections
    .map((section, idx) => renderSection(section, `${idx + 1}.`, 0))
    .join("");
  const empty =
    protocol.sections.length === 0
      ? `<p style="color:#5b6470;font-style:italic;margin-top:24px;">No sections recorded yet.</p>`
      : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(protocol.title || "Protocol")} — printable</title>
    <style>${PRINT_STYLES}</style>
  </head>
  <body>
    <header class="doc-head">
      <div class="doc-kicker">Protocol</div>
      <h1 class="doc-title">${escapeHtml(protocol.title || "Untitled protocol")}</h1>
      <div class="doc-meta">${metaItems.join("")}</div>
      ${tagsHtml}
      ${summary}
    </header>
    ${renderMaterials(protocol.reagents, protocol.equipment)}
    ${renderToc(protocol.sections)}
    ${sectionsHtml}
    ${empty}
    <footer class="doc-footer">
      <span>Integrated Lab Manager · Protocol export</span>
      <span>${escapeHtml(generatedAtLabel)}</span>
    </footer>
  </body>
</html>`;
};

/**
 * Open a new window with the printable protocol and trigger the print dialog.
 * Returns true when a window was successfully opened.
 */
export const printProtocol = (input: PrintProtocolInput): boolean => {
  if (typeof window === "undefined") return false;
  const html = buildPrintHtml(input);
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      // popup-blocker / cross-origin can sometimes interfere; ignore.
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
