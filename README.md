# Integrated Lab Manager

**Integrated Lab Manager** is a modular, extensible platform for organizing scientific lab operations in a structured, software-native way.

It is designed to unify several categories of lab work that are often scattered across documents, spreadsheets, ad hoc notes, and disconnected tools, including:

- wet-lab protocol design
- supply and reagent management
- project planning and tracking
- funding and budget organization
- experiment-associated documentation
- future AI-assisted data structuring and workflow support

The long-term goal is to provide a cohesive environment for managing the informational and operational side of research labs while keeping the system flexible, transparent, and friendly to both humans and machines.

---

## Vision

Modern labs often rely on fragmented workflows:

- protocols live in Word documents, PDFs, or notebooks
- reagent inventories live in spreadsheets
- project plans live in slides, notes, or task boards
- budgets and funding records live elsewhere
- structured reuse across these systems is limited
- AI assistance is difficult because most information is unstructured

Integrated Lab Manager aims to address this by treating core lab workflows as **structured, interoperable objects** rather than isolated documents.

The platform is intended to evolve into a unified lab operations framework where protocols, supplies, projects, timelines, and resources can eventually connect to each other through shared data structures and modular interfaces.

---

## Current focus

The first major module is:

### ProtoWeave — visual wet-lab protocol designer
A browser-based visual editor for building wet-lab protocols with structured JSON storage and AI-assisted import/export workflows.

ProtoWeave allows users to create protocols using:

- sections and subsections
- ordered steps
- preparation and QC steps
- optional branches
- reaction recipe blocks
- timeline blocks
- caution/note blocks
- external references and links

This module serves as the first foundational component of the broader platform.

---

## Planned platform modules

The larger project is intended to grow into a modular system with components such as:

### 1. Protocol Designer
Structured authoring, editing, validation, reuse, and AI-assisted import of wet-lab protocols.

### 2. Lab Supply & Reagent Management
Inventory tracking for reagents, consumables, kits, and instruments, with future support for stock levels, vendors, storage locations, and ordering workflows.

### 3. Project Management
Tracking research projects, milestones, tasks, dependencies, and associated protocols or resources.

### 4. Funding & Budget Management
Organization of grants, budgets, spending categories, deadlines, and project-linked funding sources.

### 5. Experiment / Workflow Planning
Structured descriptions of experiments and operational plans that may eventually connect protocols, timelines, reagents, personnel, and deliverables.

### 6. AI-Assisted Import / Structuring
Tools to transform unstructured lab content into standardized data formats that can be edited and managed inside the platform.

---

## Design philosophy

Integrated Lab Manager is being built around several core principles:

### Structured over ad hoc
Lab information should be represented as explicit structured data where possible, not only as free text.

### Modular by design
Different functional areas should be implemented as modules that can evolve independently while still fitting into a larger shared architecture.

### Human-readable and machine-readable
Stored data should be understandable to users and easy for software or AI systems to validate, transform, and reuse.

### Static-first where practical
Early modules should work without requiring complex backend infrastructure whenever possible.

### Extensible data model
The system should support future expansion without breaking earlier content or forcing rigid assumptions too early.

### Scientist-friendly UX
The interface should prioritize clarity, low friction, and practical scientific workflows over flashy or overly abstract design.

---

## Why this project exists

Most lab management workflows are handled through a patchwork of:

- office documents
- spreadsheets
- personal notes
- task trackers
- vendor portals
- internal memory

This makes it difficult to:

- standardize procedures
- reuse structured information
- validate content
- keep protocols and logistics connected
- support AI tools in a reliable way

Integrated Lab Manager is intended to provide a foundation for gradually moving these workflows into a more coherent and structured environment.

---

## Repository scope

This repository is intended to host the broader Integrated Lab Manager codebase.

At the current stage, the primary emphasis is on building and refining the protocol-design subsystem first, while keeping the repository architecture ready for future modules.

This means the repo should support:

- clear separation of modules
- shared type definitions where appropriate
- reusable UI patterns
- reusable data validation utilities
- future expansion without large rewrites

---

## Proposed repository structure

```text
integrated-lab-manager/
├─ apps/
│  ├─ protocol-designer/          # Current dev module
│  ├─ supply-manager/             # future
│  ├─ project-manager/            # future
│  └─ funding-manager/            # future
├─ packages/
│  ├─ ui/                         # shared UI components
│  ├─ types/                      # shared TypeScript types
│  ├─ validation/                 # shared schema/validation helpers
│  ├─ utils/                      # shared utilities
│  └─ ai-import/                  # shared AI import helpers/prompts
├─ docs/
│  ├─ architecture/
│  ├─ schemas/
│  ├─ product-specs/
│  └─ examples/
├─ examples/
│  └─ protocols/
├─ README.md
└─ LICENSE
````

This structure is only a recommended direction and may evolve as the platform grows.

---

## Future integration ideas across modules

Over time, the platform may support links such as:

* protocols referencing required reagents from inventory
* projects referencing associated protocols
* funding records referencing supported projects
* experiments referencing both protocols and reagent usage
* purchasing tied to inventory status and project budgets
* AI-assisted conversion of legacy documents into structured records

These are future directions rather than current commitments.

---

## Technical direction

The project is intended to favor:

* **TypeScript-first development**
* **strong data models**
* **schema validation**
* **component modularity**
* **frontend architectures that can start simple and scale later**

For the protocol designer specifically, the current preferred stack is:

* React
* TypeScript
* Vite
* static deployment compatible with GitHub Pages
* local storage for early persistence
* structured JSON as canonical storage format

As the broader project grows, some modules may eventually require backend services, but the architecture should avoid introducing unnecessary complexity too early.

---

## AI compatibility

A central design goal of Integrated Lab Manager is to make structured scientific content easier to generate, inspect, validate, and refine with AI assistance.

This includes:

* well-defined schemas
* explicit controlled vocabularies where useful
* portable import/export formats
* repairable validation workflows
* copyable AI import instructions for converting existing lab materials into structured formats

AI is intended to assist with structuring and transformation, not replace scientific judgment.

---

## Status

This repository is currently in an early design and prototyping stage.

Current emphasis:

* defining the product architecture
* designing the protocol data model
* building the first editor module
* establishing reusable schema and validation patterns
* keeping the larger platform direction in mind from the beginning

---

## Early roadmap

### Phase 1

Build the protocol designer module:

* structured protocol data model
* visual editor
* JSON import/export
* validation
* AI-assisted import instructions
* protocol preview

### Phase 2

Stabilize shared platform architecture:

* shared UI package
* shared type definitions
* shared validation utilities
* documentation of schema conventions

### Phase 3

Add additional operational modules:

* supply/reagent management
* project management
* funding/budget organization

### Phase 4

Explore cross-module linking:

* protocol-to-reagent links
* project-to-protocol links
* budget/project associations
* experiment/workflow integration

---

## Intended users

This project is meant for:

* academic labs
* small research teams
* computational/experimental hybrid labs
* trainees and scientists who want more structured lab workflows
* groups exploring AI-assisted scientific operations

---

## Development priorities

When building this repository, prioritize:

1. clean data models
2. modular architecture
3. maintainable code
4. scientist-friendly UX
5. portability of stored data
6. extensibility without overengineering

---

## Contributing philosophy

At this stage, contributions should align with the core design goals:

* preserve modularity
* avoid unnecessary complexity
* keep schemas explicit and readable
* prefer extensible structures over hard-coded assumptions
* document new modules and interfaces clearly

As the project matures, contribution guidelines can be formalized further.

---

## Naming note

**Integrated Lab Manager** is the umbrella platform name.

The initial protocol-design submodule is currently referred to as:

**Protocol Manager**
*A visual, structured, AI-compatible wet-lab protocol designer.*

This naming allows the broader repository to grow without forcing the protocol tool to carry the entire platform identity.

---

## Long-term aspiration

The long-term aspiration is to build a practical, extensible platform where structured scientific operations can be authored, organized, and gradually connected across the daily work of a research lab.

Rather than replacing every existing tool immediately, Integrated Lab Manager aims to provide a strong structured foundation that can expand over time.

---

## License

MIT

---

## Contact / notes

This repository is currently under active design and prototyping. Documentation, schemas, and module boundaries are expected to evolve as the system takes shape.
