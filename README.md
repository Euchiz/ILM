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
│  ├─ protocol-designer/          # ProtoWeave module
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
