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

## Publishing

This app is set up for GitHub Pages deployment at:

`https://euchiz.github.io/ILM/`

The module home now lives at `https://euchiz.github.io/ILM/` and the Protocol Manager itself lives at `https://euchiz.github.io/ILM/protocol-manager/`.

The GitHub Actions workflow builds the app with `VITE_BASE_PATH=/ILM/` so the generated asset URLs work correctly when served from the repository project site path.

## Data model principles

- canonical JSON format
- stable IDs
- schema versioning (`1.0.0`)
- content/presentation separation
- unknown future data preserved under `extensions`
