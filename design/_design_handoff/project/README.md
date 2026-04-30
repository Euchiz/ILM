# Viridian Blue Labs — Design System

> **Integrated, scientist-friendly software for modern bioscience teams.**
>
> Aesthetic: **Neo-skeuomorphic Futurism** — soft, luminous, tactile, future-facing design for scientific tools that should feel powerful, humane, and alive.

---

## 1. Company

Viridian Blue Labs builds calm, connected software for bioscience teams. Their first product is the **Integrated Lab Manager (ILM)** — a crosslinked workspace covering projects, protocols, supplies, funding, schedules, teams, and lab knowledge.

- **Brand name in formal contexts:** Viridian Blue Labs
- **Short brand:** Viridian Blue
- **Product:** Integrated Lab Manager / ILM (sometimes branded as `Rhine Lab L.L.C. — Lab Manager OS` inside the product UI as a sample tenant)
- **One-line:** *Integrated software for connected bioscience labs.*

## 2. Sources

This design system is distilled from:

- **Brand brief:** `Euchiz/ILM` repository, file `design/Viridian_Blue_Labs_README.md` (full brand bible — name rationale, mission, vision, taglines, manifesto, tone, visual direction).
- **Product source code:** `Euchiz/ILM` GitHub repo (npm-workspaces monorepo). Key UI files imported into `apps/`, `packages/`. Production-ready apps: Account/Home, Protocol Manager, Project Manager. In-flight: Supply Manager. Deferred: Funding Manager. Foundation: Scheduler.
- **Visual references uploaded by the user:** `uploads/web.png` (full dashboard render), `uploads/geo-mark.png`, `uploads/infinity.png`, `uploads/lab-corridor.png`, `uploads/radar.png`. These are the same assets shipped under `design/segments/` in the repo and `apps/account/public/assets/`.
- **Tokens of record:** `packages/ui/src/tokens.css` (`--ilm-*` and legacy `--rl-*`), `packages/ui/src/primitives/primitives.css`, `packages/ui/src/lab-shell.css`.

---

## 3. Content Fundamentals

How Viridian Blue Labs writes:

- **Tone formula:** *Modern scientific infrastructure + thoughtful product design + quiet optimism.*
- **Voice:** clear, composed, warm but not casual, precise but not cold, confident but not exaggerated, visionary but grounded.
- **Person:** Mostly *we* in marketing copy ("**We** build for the living complexity of bioscience"). Product UI is direct and instrument-like — minimal *you*, no chatty hand-holding. Status copy reads like a readout: `OPTIMAL`, `All systems running within normal parameters.`
- **Casing:**
  - **Display headlines** in marketing/dashboard hero use `INTEGRATED LAB. INTELLIGENTLY MANAGED.` — Title or full-uppercase, with a period inside. Sentences fragment cleanly: short. declarative. dimensional.
  - **Section labels** are tight uppercase tracking 0.08–0.14em: `OVERVIEW`, `LAB OPERATING STATUS`, `UPCOMING SCHEDULE`.
  - **Body** is sentence case.
  - **Nav items** are uppercase: `PROJECTS`, `PROTOCOLS`, `INVENTORY`.
  - **Status pills** are uppercase: `ACTIVE`, `REVIEW`, `PUBLISHED`, `DRAFT`.
- **Punctuation:** dashes feel right (`Integrated Lab. Intelligently Managed.`). Commas are used to slow the eye in marketing copy. Periods in product copy are crisp and final.
- **Numbers:** real, specific, tabular. `$2.48M`, `412 Reagents`, `100%`, `24 / 128 / 18` — never rounded for vibe.
- **Emoji:** **never.** No emoji in product, marketing, or icons. Material Symbols Outlined is the icon font of record.
- **Vocabulary to embrace:** *clarity, connected, structured, calm, usability, scientific reality, living systems, research-native, crosslinked, operational layer, instrument*.
- **Vocabulary to avoid:** generic AI buzzwords, "revolutionary platform," exaggerated productivity claims, startup hype, enterprise corp-speak, wellness-brand softness.

**Concrete examples (from real product copy):**

| Surface | Text |
|---|---|
| Hero headline | *INTEGRATED LAB. INTELLIGENTLY MANAGED.* |
| Hero sub | *Project data. Protocol systems. Resource orchestration.* |
| Status big-number | *OPTIMAL* — *All systems running within normal parameters.* |
| Nav | OVERVIEW · PROJECTS · PROTOCOLS · INVENTORY · FUNDING · CALENDAR · TEAM · ANALYTICS · REPORTS · SETTINGS |
| Empty state | *No upcoming events.* (calm, factual, no exclamation) |
| Footer mark | *POWERED BY RHINE LAB* (small caps, tracked) |
| Tagline candidate | *Scientific software from a calmer future.* |

---

## 4. Visual Foundations

### Background & Atmosphere
- **Canvas:** warm near-white `#f7f9f7`, never pure white.
- **Page halo:** two soft radial gradients — viridian at 12% 18%, soft blue at 95% 85% — at ~10% and ~8% opacity. Always present on every product page.
- **Imagery posture:** translucent glass renders (the infinity loop, the lab corridor) used as **subtle hero art** at ~92% opacity with a faint drop shadow. Never as full-bleed photo backgrounds. Lab corridor is anchored bottom-left at **10% opacity** as quiet decoration.
- **Imagery color world:** cool, luminous white-greens. Photo-real renders of glass / chrome with viridian highlights. No warm sunset hues. No grain. No black-and-white. Never high-saturation.
- **Patterns:** an optional `.rl-paper-grid` 40px graph-paper background at ~8% opacity for technical contexts; otherwise plain canvas + halo.

### Color Use
- **Primary (viridian `#2f7d72`)** — for calls to action, active nav, link, success metrics, charts, the side-status dot.
- **Soft viridian `#dff1ec`** — tinted surfaces, success badges, accent fills.
- **Blue `#5c7d8f`** — secondary chart hue, metadata.
- **Mint `#c9eee2`** — fixed green, chips.
- **Amber `#9a5b1e` on `#fff2df`** — review / warning only. Sparingly.
- **Red `#b42318`** — error, destructive only.
- **Ink `#14201f`** — never `#000`. All copy.

### Type
- **Display:** Space Grotesk (600). Tight letterspacing. Used for headlines, big numbers, labels, nav.
- **Body:** Inter (400/500/600). Reads at 0.9–1rem in product. Line-height 1.55–1.6.
- **Mono:** JetBrains Mono — for codes, IDs, tabular numerics.
- **Icon font:** Material Symbols Outlined (weight 400, FILL 0). Always outlined, never filled.
- **Scale:** display 2.8–4.4rem · h1 2–3.1rem · h2 1.45rem · h3 1.05rem · body 0.95rem · meta 0.72rem · meta-tight 0.68rem (uppercase, tracked 0.10–0.14em).

### Spacing & Layout
- **4px grid.** Tokens 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
- **Card gap:** 1rem (16px) between dashboard cards.
- **Page padding:** `2rem 2.2rem` topbar, `0.6rem 2.2rem 2.5rem` body.
- **Sidebar:** sticky 264px, glass `rgba(249,250,248,0.85)` with `backdrop-filter: blur(6px)`.
- **Layout language:** structured modular grids. Hero spans 2 cols + a 1-col schedule; the 4-up review row spans full width. Predictable, readable, never busy.

### Borders, Radii, Cards
- **Hairlines** (`#c9d7d2`, 0.5–1px) and lines (`#d9e3df`, 1px). Borders are present but quiet — they describe edges, never decorate.
- **Radii** are *modest*: cards `8px` (sm), modals `16px`, pills `999px`. **Never** soft puffy 24px radii on cards. The look is "precise instrument," not "consumer app."
- **Cards** = `rgba(255,255,255,0.78)` glass-white surface, `1px solid var(--ilm-line)` border, `8px` radius, **`box-shadow: inset 0 1px 0 rgba(255,255,255,0.6)`** as a top inner highlight (the neo-skeuomorphic luminous-edge cue). Outer shadows are reserved for floating elements.

### Shadows & Light (the "neo-skeu" ingredient)
- **Inner highlight on every card** (1px white inner top edge) makes surfaces feel like they catch light.
- **Glow** (`0 0 12px rgba(78,159,146,0.34)`) only on primary buttons on hover, and on the side-status dot ring (`0 0 0 4px rgba(78,159,146,0.2)`).
- **Soft ambient drop shadow** (`0 18px 48px rgba(59,99,91,0.13)`) for floating things only — modals, popovers.
- **Step shadow** (`0 0 18px rgba(78,159,146,0.08)`) is a barely-there bloom, used on raised tiles.
- **Material orb** technique used for avatars: a `radial-gradient` nose-highlight + `inset -5px -6px 12px rgba(0,0,0,0.2)` + outer `0 6px 12px rgba(0,0,0,0.1)`. Shaded, dimensional, but desaturated.

### Transparency, Blur, Glass
- **Glass** is the signature: sidebar 0.85α + 6px blur, cards 0.78α opaque white over the canvas halo. Glass = surfaces that sit *above* the page, not full transparency.
- **Backdrop blur** is reserved for the sidebar and modal backdrops. Don't blur card surfaces.

### Animation & Motion
- **Calm, instrument-like.** `120ms / 140ms / 200ms` durations with plain `ease`.
- **Hover:** background tint shift (e.g. `rgba(255,255,255,0.95)`), border color → viridian, **lift `translateY(-1px)`** on review tiles. **No bouncy springs.**
- **Press:** `transform: scale(0.98)` on buttons.
- **Focus:** `0 0 0 3px rgba(79,111,82,0.3)` outer ring — never a system outline.
- **Transitions** are tactile and short — the product should "respond like a precise instrument, not a noisy app."
- **Spinners:** a single CSS `rotate` animation (`ovw-spin`, 0.9s linear infinite) on a refresh glyph. No skeleton shimmer, no progress dots.

### States
- **Hover:** raise + tint background a notch lighter, border darkens to viridian on actionable surfaces.
- **Active nav:** white surface + line border + viridian text + a soft `0 12px 22px rgba(30,46,30,0.05)` shadow (signature lifted-tile look).
- **Pressed:** subtle scale-down, never a heavy color flip.
- **Disabled:** opacity 0.55, cursor not-allowed.

### Iconography (overview)
- **Material Symbols Outlined** is the in-product icon font. Outlined weight, never filled.
- **Brand visual motifs** (the icosahedral geo-mark, the infinity loop, the corridor, the radar, the donut chart) are PNG renders — translucent glass with viridian highlights — used as decorative scientific imagery, not as UI icons.
- See `ICONOGRAPHY.md` for the full guide.

### Layout Rules / Fixed Elements
- **Sidebar always visible** on ≥960px, collapses to top stack below.
- **Search bar** is a quiet rounded rectangle in the topbar — it sits in `rgba(255,255,255,0.6)`, never a heavy field.
- **Status footer** in sidebar: a glass panel with mint border + radial-gradient orb + dot. Always at the bottom.
- **`POWERED BY RHINE LAB`** small caps in the bottom-right of dashboards (whitelabel pattern).

---

## 5. Iconography (summary)

- **System icons:** Material Symbols Outlined via Google Fonts CDN.
- **Brand icons:** the 5 PNG renders in `assets/`. Treat as imagery, not UI.
- **No emoji. No unicode glyphs as icons.**
- See `ICONOGRAPHY.md` for full guidance.

---

## 6. Index

| File | What it contains |
|---|---|
| `README.md` | This file. Brand + content + visual foundations + index. |
| `colors_and_type.css` | Single-file token sheet. `--vbl-*` foundational + `--ilm-*` semantic roles. |
| `ICONOGRAPHY.md` | Detailed icon usage. |
| `SKILL.md` | Cross-compatible Agent Skill manifest for downstream use. |
| `assets/` | `geo-mark.png`, `infinity.png`, `lab-corridor.png`, `radar.png`, `donut.png`, `web.png`. |
| `preview/` | Design System tab cards (type / color / spacing / components / brand). |
| `ui_kits/ilm/` | Integrated Lab Manager UI kit — 5 core screens, modular JSX components, `index.html` clickthrough. |
| `apps/`, `packages/`, `design/` | Imported source files from `Euchiz/ILM` for reference. |

---

## 7. Caveats / What's missing

- **Fonts:** Space Grotesk is now bundled locally as a variable TTF in `fonts/`. Inter and JetBrains Mono still load from Google Fonts CDN — drop local files into `fonts/` if you license them.
- **Logo:** the brand brief talks about "Viridian Blue Labs" but the in-product wordmark visible is `RHINE LAB —∞— Integrated Lab Manager OS`. We've preserved that as the canonical product-tenant chrome and treat **Viridian Blue Labs** as the parent company / publisher.
- **No marketing site** exists in source — UI kit covers product surfaces only.
