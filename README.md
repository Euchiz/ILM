# Integrated Lab Manager

Integrated Lab Manager is a modular monorepo for structured lab operations software.

## Current status

The first implemented module is **Protocol Manager**, a browser-based protocol designer for wet-lab workflows with structured JSON storage.

## Monorepo layout

```text
integrated-lab-manager/
├─ apps/
│  ├─ protocol-manager/      # implemented in this phase
│  ├─ supply-manager/        # placeholder
│  ├─ project-manager/       # placeholder
│  └─ funding-manager/       # placeholder
├─ packages/
│  ├─ ai-import/             # AI import instructions + helpers
│  ├─ types/                 # shared protocol TypeScript model
│  ├─ validation/            # validation + normalization helpers
│  ├─ utils/                 # ids + generic utility helpers
│  └─ ui/                    # shared lightweight UI primitives
├─ examples/
│  └─ protocols/             # example protocol JSON files
└─ docs/
```

## Technical direction

- TypeScript across repo
- React + Vite for Protocol Manager
- static frontend-first architecture
- canonical protocol JSON model with schema versioning and extension support
- localStorage persistence (autosave) for the first release

## Getting started

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite.

## GitHub Pages

The Protocol Manager app is configured to deploy to GitHub Pages from the `main` branch via GitHub Actions.

- Production URL: `https://euchiz.github.io/ILM/`
- Workflow file: `.github/workflows/deploy-protocol-manager-pages.yml`

For local development, the app still runs at `/`. For the GitHub Pages build, the workflow sets `VITE_BASE_PATH=/ILM/` so static assets resolve correctly on the project site URL.
