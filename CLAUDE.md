# ILM (Integrated Lab Manager)

**This file is only for CLAUDE usage from the HPC, which has a different setting from normal building environment. Only CLAUDE should refer to this. Codex that is building out of the HPC should ignore any instructions from this file.**

## Repository

- GitHub: https://github.com/Euchiz/ILM.git
- Local path: `/mnt/isilon/wang_lab/zac/projects/ILM`
- Primary branch: `main`

## Project Structure

npm workspaces monorepo:

**Apps** (`apps/`):
- `funding-manager`
- `project-manager`
- `protocol-manager`
- `supply-manager`

**Packages** (`packages/`):
- `ai-import` (`@ilm/ai-import`)
- `types` (`@ilm/types`)
- `ui` (`@ilm/ui`)
- `utils` (`@ilm/utils`)
- `validation` (`@ilm/validation`)

## npm / Node Environment

`npm` is not available on the host. All npm commands must be run via Singularity:

```bash
singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && <npm command>"
```

The SIF image is cached locally. Node version: 24-slim. npm version: 11.12.1.

## Common Commands

```bash
# Install dependencies
singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && npm install"

# Build all workspaces
singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && npm run build"

# Lint all workspaces
singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && npm run lint"

# Typecheck all workspaces
singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && npm run typecheck"

# Dev server (protocol-manager)
singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && npm run dev"
```
