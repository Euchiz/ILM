# Protocol Manager

**Protocol Manager** is the protocol-design module inside **Integrated Lab Manager**, a broader platform for structured lab operations.

Protocol Manager is a browser-based visual editor for creating, editing, validating, importing, and exporting **wet-lab protocols** using a standardized structured JSON format.

Its goal is to make protocols more reusable, more machine-readable, and easier to integrate with future lab-management systems such as reagent inventory, project planning, and funding workflows.

---

## Position within Integrated Lab Manager

Integrated Lab Manager is intended to become a modular platform for organizing lab operations, including:

- protocol design
- supply and reagent management
- project tracking
- funding and budget organization
- future AI-assisted structuring of lab content

Protocol Manager is the **first major module** in that ecosystem.

This means Protocol Manager should be built as a strong standalone tool, while also being architected so it can later connect to other modules in the larger platform.

Examples of future integration:
- protocols referencing reagents from inventory
- protocols linked to project milestones
- workflows connected to funding-supported workstreams
- AI-assisted conversion of legacy protocols into structured lab records

---

## Module purpose

Protocol Manager is designed to solve a common problem in research labs:

Protocols are often stored as Word documents, PDFs, notebooks, plain text, or scattered notes. These formats are readable, but they are hard to validate, restructure, reuse, connect to other systems, or reliably transform with AI.

Protocol Manager addresses this by representing protocols as **structured data** rather than only free-form text.

Users should be able to:
- build protocols visually
- organize sections and steps
- insert structured scientific content like recipes and timelines
- export protocols as canonical JSON
- import JSON back into the editor
- use AI to convert free-form protocol text into importable structured JSON

---

## Product goals

### Primary goals
- Provide a visual editor for wet-lab protocol authoring
- Store protocols in a standardized portable JSON format
- Support import/export of protocol files
- Make protocols AI-friendly for structured conversion workflows
- Keep the protocol data model extensible for future lab-platform integration

### Secondary goals
- Maintain a clean scientist-friendly interface
- Keep the initial implementation static and frontend-first
- Support future reuse of protocol data across the larger platform

### Non-goals for current version
- no cloud collaboration
- no inventory management inside this module
- no project management inside this module
- no execution logging
- no ELN replacement
- no permissions/auth system
- no backend requirement for the first implementation

---

## Core concepts

Protocol Manager treats protocols as structured hierarchies of objects rather than plain rich text.

### Protocol structure
A protocol consists of:
- metadata
- sections
- subsections
- ordered steps
- typed content blocks inside steps

### Step kinds
Each step has a semantic role, such as:
- `action`
- `preparation`
- `qc`
- `optional`
- `pause`
- `cleanup`
- `analysis`

### Block types
Steps may contain specialized block objects, including:
- `paragraph`
- `note`
- `caution`
- `qc`
- `recipe`
- `timeline`
- `link`
- `table`
- `fileReference`
- `branch`

This structure is what makes the protocols:
- more consistent
- easier to validate
- easier to preview
- easier to edit programmatically
- easier for AI to generate

---

## Example use cases

Protocol Manager should support protocols such as:
- molecular biology workflows
- library preparation procedures
- chemical workflows
- cell culture plans and treatment workflows
- sample prep procedures with QC checkpoints
- multi-branch protocols with optional cleanup paths

Common structured content includes:
- reaction compositions
- thermal cycling programs
- incubation/culture schedules
- caution notes
- QC acceptance criteria
- external references

---

## Key features

### 1. Visual protocol editor
Users should be able to:
- create protocols
- add sections and subsections
- add and reorder steps
- assign semantic step kinds
- insert specialized blocks
- duplicate and delete items
- collapse and expand the hierarchy

### 2. Structured block editors
Protocol Manager should provide dedicated editing UIs for:
- recipe blocks
- timeline blocks
- QC blocks
- caution blocks
- link blocks

### 3. Human-readable preview
The app should render protocols in a clean readable preview with:
- numbered sections and steps
- visually distinct step types
- highlighted cautions and QC blocks
- readable rendering of recipes and timelines

### 4. JSON import/export
Users should be able to:
- export current protocol as JSON
- import protocol JSON
- validate imported files
- inspect errors and warnings

### 5. AI-assisted import workflow
The UI should include copyable instructions that tell an AI agent how to convert arbitrary protocol text into Protocol Manager JSON.

This is one of the signature features of the module.

---

## Canonical data model

Protocol Manager uses **JSON as the canonical storage format**.

Reasons:
- browser-friendly
- easy to validate
- easy to import/export
- easy to version
- easy for AI systems to generate
- easy to integrate later with larger lab-management systems

At minimum, the top-level format should look like:

```json
{
  "schemaVersion": "1.0.0",
  "protocol": {
    "id": "protocol-example",
    "title": "Example Protocol",
    "description": "Short summary",
    "createdAt": "2026-04-17T12:00:00Z",
    "updatedAt": "2026-04-17T12:00:00Z",
    "authors": [],
    "tags": [],
    "metadata": {},
    "reagents": [],
    "equipment": [],
    "sections": [],
    "extensions": {}
  }
}

```

### Important modeling principles

* every major object must have a stable `id`
* schema must be versioned
* unknown future fields should go under `extensions`
* content meaning should be separated from presentation details
* the JSON should remain human-readable and AI-friendly

---

## AI-assisted import

Protocol Manager should include a dedicated UI section titled:

**Instructions for AI-assisted protocol import**

This workflow is intended for cases where a user already has a protocol in:

* plain text
* Word document
* PDF-derived text
* notes
* mixed or messy formatting

The user can copy the instructions, combine them with the protocol text, and ask an AI system to produce valid Protocol Manager JSON for import.

Recommended instruction text:

```text
Convert the following wet-lab protocol into the JSON format required by this protocol designer.

Rules:
1. Output valid JSON only. No markdown fences. No commentary.
2. Preserve the original procedure content as faithfully as possible.
3. Organize the protocol into protocol metadata, sections, subsections if needed, ordered steps, and typed blocks.
4. Use stepKind only from:
   action, preparation, qc, optional, pause, cleanup, analysis
5. Use block types only from:
   paragraph, note, caution, qc, recipe, timeline, link, table, fileReference, branch
6. Put reaction mixtures into recipe blocks.
7. Put cycling programs, incubation schedules, and multi-stage time plans into timeline blocks.
8. Put warnings or critical handling notes into caution blocks.
9. Put quality control checkpoints into qc blocks or steps with stepKind="qc".
10. If information is missing or ambiguous, preserve it in a note block instead of inventing details.
11. Keep units exactly as written when possible.
12. Create stable human-readable IDs.
13. Use schemaVersion "1.0.0".

Return one JSON object only.
```

---

## UX expectations

Protocol Manager should feel like a **structured scientific composer**, not a generic notes app.

### Main interface areas

* **Outline panel** for sections and steps
* **Editor panel** for selected content
* **Preview panel** for rendered protocol view
* **Import/export panel** for JSON and AI instructions

### UX priorities

* clear hierarchy
* low clutter
* scientist-friendly terminology
* explicit structure
* simple insertion of specialized blocks
* good validation messages
* clean, readable styling

### Good future direction

As the platform matures, richer rendering systems (like pretext: https://github.com/chenglou/pretext) may later be introduced for print-oriented layout, but the first version should prioritize clarity and maintainability over custom layout complexity.

---

## Validation requirements

Imported JSON must be validated.

Validation should check:

* missing required fields
* invalid enum values
* duplicate IDs
* invalid nesting
* malformed block content
* incompatible schema versions
* malformed links and timelines where possible

Validation messages should be understandable and useful for repair.

The module should ideally support:

* **strict import**
* **assisted import with warnings**

---

## Technical direction

Protocol Manager is expected to be implemented as a frontend app within the larger Integrated Lab Manager monorepo.

Recommended stack:

* React
* TypeScript
* Vite
* static-friendly architecture
* localStorage for early persistence/autosave

The implementation should favor:

* modular components
* strong TypeScript typing
* schema validation
* clean separation of data model and rendering
* reusable UI patterns that can later fit the larger platform

---

## Recommended relationship to the monorepo

Protocol Manager should live under:

```text
apps/protocol-manager/
```

It should ideally depend on shared packages where useful, such as:

* shared UI components
* shared type helpers
* validation helpers
* shared AI import utilities

Possible monorepo structure:

```text
integrated-lab-manager/
├─ apps/
│  ├─ protocol-manager/
│  ├─ supply-manager/
│  ├─ project-manager/
│  └─ funding-manager/
├─ packages/
│  ├─ ui/
│  ├─ types/
│  ├─ validation/
│  ├─ utils/
│  └─ ai-import/
├─ docs/
└─ README.md
```

Even if only Protocol Manager is implemented initially, its architecture should be compatible with this broader direction.

---

## Roadmap for this module

### Phase 1

* protocol data model
* section/step hierarchy
* block editing
* preview rendering
* JSON import/export
* validation
* AI import instructions panel

### Phase 2

* templates
* search/filter within protocol
* richer table editing
* improved import repair flow
* print-friendly rendering

### Phase 3

* integration hooks for other modules
* reagent linking
* project linking
* richer references and metadata

---

## Development priorities

When building Protocol Manager, prioritize:

1. a clear and durable data model
2. a maintainable modular architecture
3. readable protocol JSON
4. a practical scientific editing experience
5. compatibility with future Integrated Lab Manager modules
6. extensibility without overengineering

---

## Status

Protocol Manager is currently in design / early build planning as the first module of Integrated Lab Manager.

The current focus is:

* defining the schema
* designing the editor architecture
* implementing the first version of the visual protocol builder
* making the module strong enough to stand alone while remaining ready for future integration

---

## Summary

Protocol Manager is the protocol-design foundation of Integrated Lab Manager:

**A visual, structured, AI-compatible wet-lab protocol designer**
built to turn scientific procedures into reusable, validated, extensible data.

````
