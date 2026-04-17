# Protocol Manager

Protocol Manager is the first app in Integrated Lab Manager.

## Purpose

A scientist-friendly visual editor for building structured wet-lab protocols as portable, AI-compatible JSON.

## Features in this phase

- section/subsection/step outline editing
- typed step kinds (`action`, `preparation`, `qc`, `optional`, `pause`, `cleanup`, `analysis`)
- specialized block editors for:
  - recipe
  - timeline
  - qc
  - caution
  - link
- live preview panel
- import/export panel with JSON validation
- AI-assisted import instructions panel
- localStorage autosave

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
```

## Data model principles

- canonical JSON format
- stable IDs
- schema versioning (`1.0.0`)
- content/presentation separation
- unknown future data preserved under `extensions`
