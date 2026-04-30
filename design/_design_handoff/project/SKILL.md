---
name: viridian-blue-labs-design
description: Use this skill to generate well-branded interfaces and assets for Viridian Blue Labs (ILM — Integrated Lab Manager), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files (colors_and_type.css, ICONOGRAPHY.md, assets/, ui_kits/, preview/).

If creating visual artifacts (slides, mocks, throwaway prototypes, etc.), copy assets out of `assets/` and create static HTML files for the user to view. Pull tokens from `colors_and_type.css` (`--vbl-*` foundational + `--ilm-*` semantic). Reuse JSX components from `ui_kits/ilm/` rather than re-deriving the look.

If working on production code, copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

**Brand essentials:**
- Aesthetic: Neo-skeuomorphic Futurism — soft, luminous, tactile, future-facing scientific tools.
- Primary: viridian `#2F7D72`. Canvas: warm near-white `#F7F9F7`. Ink: `#14201F` (never pure black).
- Type: Space Grotesk (display), Inter (body), JetBrains Mono (figures). Material Symbols Outlined for system icons.
- No emoji. Modest radii (6–16px). Inner-highlight cards. Page halo + 10%-opacity lab-corridor decoration.
- Voice: clear, composed, precise. Display headlines often uppercase with periods (e.g. `INTEGRATED LAB. INTELLIGENTLY MANAGED.`).
