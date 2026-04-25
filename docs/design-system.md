# Viridian Blue Labs Design System

Product design guidance for Integrated Lab Manager (ILM).

This document translates the Viridian Blue Labs identity into a reusable UI system
for the ILM product family. It is not based on the fictional "Rhine Lab" text in
the AI-generated visual template; that template is useful only as an aesthetic
reference for light, tactile, scientific dashboards.

For implementation planning, see `docs/ui-alignment.md`. That document tracks how
the shared React/CSS primitives in `@ilm/ui` are extracted and migrated. This
document describes what those primitives should feel like and how modules should
use them.

## Product Context

Viridian Blue Labs builds integrated, scientist-friendly software for modern
bioscience teams. The first product direction is Integrated Lab Manager: a
crosslinked workspace that helps labs manage projects, protocols, supplies,
funding, schedules, teams, and operational knowledge as one connected system.

ILM is not just an ELN, inventory system, project tracker, calendar, or admin
dashboard. It is the operating layer across lab operations. The interface must
make relationships visible: projects link to protocols, protocols link to
materials and equipment, supplies link to experiments and funding, people link
to responsibilities, and knowledge links back to the work that produced it.

## Current Product Plan

Current shipped state:

- **Protocol Manager** is production-ready: visual protocol editor, typed steps,
  draft/submit/review/publish workflow, revisions, and recycle bin.
- **Account** is production-ready: profile, lab membership, invitations, join
  requests, share links, and strict owner/admin/member hierarchy.
- **Project Manager** is production-ready: projects, milestones, experiments,
  roadmap ordering, project leads, review-gated publishing, and GitHub activity.
- **Shared UI kit** has shipped phases A-D: tokens/reset, primitives, app shell,
  and legacy app shell migration.

Current in-flight stage:

- **Supply Manager**: stock/items, orders, storage locations, and reorder alerts,
  built on top of the shared UI kit with no new one-off primitive CSS.

Deferred next stage:

- **Funding Manager**: grants, budgets, allocations, and expenses.

Design-system implication: every module must feel like a local view into the same
connected scientific operating environment, not a separate app with its own
visual language.

## Design Ideology

Viridian Blue Labs uses **Neo-skeuomorphic Futurism**:

> Soft, luminous, tactile, future-facing design for scientific tools that should
> feel powerful, humane, and alive.

The UI should feel physical enough to understand, luminous enough to feel alive,
and modern enough to belong to the future. This is not old skeuomorphism and not
dark sci-fi. It is a calm, bright, tactile scientific interface.

The interface should feel:

- alive, but not whimsical
- technical, but not cold
- scientific, but not bureaucratic
- comprehensive, but not chaotic
- premium, humane, and research-native

It should avoid:

- generic SaaS dashboards
- loud startup gradients
- dark cyberpunk
- sterile enterprise admin software
- wellness-brand softness
- cluttered academic software

## Core Principles

1. **Scientist-friendly first.**
   Screens must support how labs actually work: iterative, contextual,
   collaborative, and full of relationships.

2. **Connected by design.**
   Objects should rarely feel isolated. Cards, tables, detail pages, and
   navigation should show what an item belongs to, depends on, or affects.

3. **Comprehensive but usable.**
   ILM must support real lab complexity without making every screen dense by
   default. Progressive disclosure beats giant forms.

4. **Structure before atmosphere.**
   Layout, hierarchy, and data relationships must work before glass, glow, or
   visual motifs are added.

5. **Depth with purpose.**
   Shadows, translucency, glow, and layering should clarify hierarchy and
   relationships. They should never be decoration for its own sake.

6. **Calm responsiveness.**
   Interaction should feel like a precise instrument: quick, smooth, quiet, and
   reassuring.

7. **Trust through restraint.**
   Because the product handles scientific operations, beauty must support trust.
   Avoid effects that reduce readability or make data feel less serious.

## Visual Atmosphere

The product should read as a luminous scientific workspace:

- white or very light warm-gray backgrounds
- viridian green, soft teal, and clear biotech blue accents
- translucent glass-like panels
- thin scientific linework
- rounded but disciplined modular grids
- gentle shadows, inner glow, and material cues
- geometric line icons
- living-system motifs: loops, rings, lattices, signals, crystals, networks

The AI-generated dashboard image in `design/web.png` is a useful mood reference
for composition, translucency, lightness, and scientific texture. Do not copy its
fictional brand language, labels, or company name.

## Typography

Use role-based typography, not one global personality font.

| Role | Font stack | Usage |
| --- | --- | --- |
| Body | `Inter, "SF Pro Display", "Helvetica Neue", Arial, sans-serif` | paragraphs, tables, forms, descriptions, captions |
| Display / label | `"Space Grotesk", Inter, "SF Pro Display", "Helvetica Neue", Arial, sans-serif` | page titles, section titles, nav labels, card titles, badges, metric labels |
| Mono | `JetBrains Mono, ui-monospace, Menlo, monospace` | IDs, code-like metadata, schema/version labels, audit details |

Rules:

- Use Space Grotesk for interface structure and identity, not for every sentence.
- Use Inter/SF Pro for dense reading and operational content.
- H1s in app screens should usually be 24-30px, weight 500-600.
- Card titles should be 12-14px Space Grotesk, weight 600-700.
- Dashboard labels may be uppercase; long labels and body copy should not.
- Use `letter-spacing: 0` by default. Avoid negative tracking.
- Use tabular numeric alignment where values are compared.

Token direction:

- Add role tokens: `--ilm-font-body`, `--ilm-font-display`, `--ilm-font-mono`.
- The current codebase uses historical `--rl-*` tokens in `@ilm/ui`. Keep them
  during migration, but new documentation and product language should use ILM /
  Viridian Blue naming.

## Color System

The color world is light, green-blue, and scientific.

| Role | Direction | Usage |
| --- | --- | --- |
| Canvas | mist white, warm white, pale gray | app background and page shell |
| Surface | translucent white | cards, panels, sidebars, controls |
| Hairline | pale gray-green | borders, dividers, table lines |
| Ink | graphite/slate | headings and strong text |
| Muted text | low-saturation gray | metadata and helper text |
| Viridian | blue-green / bio green | healthy, active, connected, primary actions |
| Blue | clear biotech blue / teal | technology, information, calm focus |
| Amber | soft amber | warnings, review states, expiring items |
| Red | restrained red | destructive or failed states only |

Rules:

- Green and blue are accents, not full-page washes.
- Amber is semantic, not decorative.
- Use neutral gray for structure before reaching for color.
- Do not make module-specific palettes unless a workflow state demands it.
- Avoid saturated gradients, dark sci-fi themes, and beige/brown product moods.

## Layout System

ILM needs both dense operational screens and calm overview screens. The shared
layout system should support both without changing visual identity.

Global shell:

- Use `AppShell`, `AppTopbar`, `AppSubbar`, `AppContent`, `AppSidebarSection`,
  and `AppWordmark` from `@ilm/ui` where possible.
- Module-specific body layouts are allowed when the workflow requires them
  (Protocol Manager's editor workspace is a good example), but the outer shell
  should remain shared.

Dashboard / overview layout:

- Use a left navigation rail or contextual sidebar when the module has multiple
  operational zones.
- Use a top band for product/module identity, lab context, search, and actions.
- Use a card grid with consistent gutters and baselines.
- Keep major panels shallow enough that content does not crowd the bottom edge.

Detail/editor layout:

- Keep editing surfaces prominent and calm.
- Put metadata, relationships, history, and actions in predictable side regions.
- Avoid burying relational context inside modals when it should be visible during
  work.

Spacing:

- Use a 4px base scale.
- Dense cards: 16-22px horizontal padding, 16-24px vertical padding.
- Tables/forms: enough row height for scanning, not enterprise sprawl.
- Card gutters: 12-20px depending on density.
- Fixed-format elements like charts, counters, icon buttons, avatars, and status
  pills should have stable dimensions.

## Surfaces and Materiality

Neo-skeuomorphic futurism depends on material cues, but they must stay subtle.

Default operational card:

- translucent or solid white surface
- 1px pale hairline border
- 6-10px radius
- minimal shadow or soft inset highlight
- no heavy drop-shadow stacks

Elevated surface:

- slightly stronger shadow
- stronger background opacity
- used for modals, popovers, active selection, and focused work areas

Glass surface:

- used sparingly for hero/overview panels and identity moments
- must preserve text contrast
- should not become a permanent style for every small control

## Product Motifs and Assets

The current design assets are visual references, not brand source material. Use
them as prototypes for the motif system until final Viridian Blue assets exist.

Useful motif categories:

- rings/loops for connected systems and operational flow
- lattices/crystals for status, integrity, and structured knowledge
- signals/sparklines for live activity and utilization
- soft lab architecture for product atmosphere and workspace depth
- network/graph linework for relationships between scientific objects

Rules:

- Use complete assets, not visibly truncated crops.
- Build UI chrome in components/CSS; do not use screenshot-cropped cards, search
  bars, or frames as permanent UI.
- Use one motif per region.
- If an asset competes with data, lower opacity or remove it.
- Final production assets should be Viridian Blue branded, not "Rhine Lab"
  branded.

Current review-only assets in `design/segments`:

- `infinity.png` - connected systems / overview orchestration
- `lab-corridor.png` - soft scientific architecture
- `geo-mark.png` - status / integrity / structured knowledge
- `donut.png` - aggregate status visual reference
- `radar.png` - inventory/resource posture visual reference

These are acceptable for static design exploration. They should be replaced or
re-authored before production branding work.

## Navigation

Navigation should help users understand where they are in the lab operating
environment.

Sidebar/nav guidance:

- Space Grotesk labels, 12-13px, weight 600.
- Thin line icons, 16-18px, geometric and consistent.
- Active row: translucent white surface, subtle border, viridian/teal state mark.
- Pinned sidebar panels can show active lab, role, system status, or profile.
- Avoid decorative icon boxes unless they are part of a consistent component.

Cross-module navigation:

- The app switcher should make Protocol, Account, Project, Supply, and Funding
  feel like one product family.
- Lab context should be visible and stable across apps.
- Users should never wonder whether they are working in a personal draft, lab
  record, submitted snapshot, or published revision.

## Components

### App Shell

Use shared shell primitives for the outer structure. App-specific CSS should
mostly define composition, not restyle the entire shell.

Required behavior:

- consistent lab/account actions
- consistent module identity region
- responsive layout under narrow widths
- clear content max-width and page padding
- stable slot patterns for actions, subnav, and tabs

### Cards and Panels

Cards should communicate object type and relationship, not just group content.

Card title:

- Space Grotesk
- 12-14px
- weight 600-700
- short dashboard titles may be uppercase

Card body:

- Inter/SF Pro
- muted supporting text
- data values aligned consistently

Use cards for:

- repeated objects
- dashboard panels
- modals/popovers
- framed editing regions

Do not use nested cards unless the inner item is a repeated object list.

### Tables

Tables are central to Supply, Funding, Account, and admin workflows.

Rules:

- Make status and ownership visible without overcoloring rows.
- Keep row actions predictable and right-aligned.
- Use sticky headers only where scrolling demands it.
- Empty/loading/error states must use shared primitives.
- Let tables expose relationships through chips, links, or secondary metadata.

### Forms

Forms should feel structured but not bureaucratic.

Rules:

- Group fields by scientific or operational meaning.
- Put destructive actions away from primary save/submit actions.
- Show validation close to the field.
- Use helper text for domain ambiguity, not obvious instructions.
- Use modals for focused state changes; use full pages/panels for complex object
  creation.

### Status

Status language must be consistent across modules.

- Healthy/active/synced: viridian or teal dot/pill.
- Draft/private: neutral.
- Submitted/reviewing: blue/teal or neutral with clear label.
- Review needed/warning/expiring: amber.
- Failed/rejected/destructive: restrained red.
- Archived/deleted: muted neutral.

Status should be visible in tables, cards, and headers, but not oversized unless
the page itself is a status dashboard.

### Data Visualization

Charts should be calm, geometric, and directly tied to decision-making.

Appropriate uses:

- Supply: stock health, reorder alerts, storage distribution.
- Project: milestones, activity, experiment progress.
- Protocol: review status, validation health, usage links.
- Funding: budget burn, grant timelines, allocation status.
- Account/admin: membership, invitations, join-request activity.

Rules:

- Use gray baselines with viridian/blue/amber semantic highlights.
- Avoid decorative charts with no action.
- Keep mini charts stable in size.
- Use text values beside visuals for accessibility and quick scanning.

## Connected Object Patterns

The product promise depends on relationships. The UI system needs repeatable
patterns for showing them.

Use:

- relationship chips: "uses protocol", "stored in", "funded by", "owned by"
- side panels for linked records
- activity/history strips where state transitions matter
- object headers that show parent lab, project, status, and ownership
- "related work" blocks on detail pages
- contextual create actions, such as "request order from item" or "start
  experiment from protocol"

Avoid:

- isolated pages with no backlinks
- hidden relationship data only available after opening a modal
- generic "details" dumps that do not show operational meaning

## Module Guidance

### Protocol Manager

Primary feeling: precise scientific authoring.

- Editor surface should be calm and tactile.
- Steps are structured objects, not plain text blocks.
- Draft/submission/published state must be unmistakable.
- Protocol links to projects, reagents, equipment, and future consumption logs
  should become first-class visual relationships.

### Account

Primary feeling: trust, membership, and control.

- Role hierarchy must be readable.
- Invitation and request flows should feel safe and explicit.
- Lab identity and active workspace should be obvious.

### Project Manager

Primary feeling: living research coordination.

- Roadmaps, milestones, experiments, leads, and GitHub activity should feel
  connected.
- Project cards should reveal status, ownership, and recent motion.
- Review-gated publishing should feel like scientific governance, not admin
  bureaucracy.

### Supply Manager

Primary feeling: operational clarity at the bench.

- Stock, orders, locations, and reorder alerts need strong table/list patterns.
- Low-stock and order state should be obvious without making the screen anxious.
- Location hierarchy should feel physical and findable.
- Actions should map to lab behavior: request, order, receive, adjust, locate.

### Funding Manager

Primary feeling: financial context for research decisions.

- Budgets, grants, allocations, and expenses should connect back to projects and
  supplies.
- Warnings should be restrained but clear.
- Avoid accounting-software heaviness; keep the scientific context visible.

## Asset vs. Component Rule

Before adding any visual element:

1. If users interact with it, build it as a component.
2. If it contains live data, build it as a component.
3. If it is structural UI chrome, build it in CSS.
4. If it is an identity/atmosphere motif, use a complete, sparse image asset.
5. If it is a relationship between scientific objects, represent it as data first
   and decoration second.

## Implementation Guidance for `@ilm/ui`

The current shared UI kit already includes tokens/reset, primitives, and shell
components. The next design-system work should refine, not restart, that work.

Recommended next steps:

1. Add role-based font tokens while preserving historical `--rl-*` compatibility.
2. Add density tokens for dashboard cards, tables, and editor panels.
3. Create a shared thin-line icon strategy, likely through `lucide-react`.
4. Add relationship primitives: `RelationshipChip`, `ObjectHeader`,
   `LinkedRecordList`, or equivalent once patterns repeat.
5. Add module dashboard composition examples after Supply Manager has real data.
6. Update primitive docs so new apps know when to compose locally and when to
   promote a component.

Keep the existing rule from `docs/ui-alignment.md`:

- First use can stay local.
- Second use should be promoted into `@ilm/ui`.
- Shared primitives expose `className` and CSS custom properties for local
  adaptation.

## PR Gate

New module UI should answer these before merge:

- Does it use the shared app shell and primitives where available?
- Does it use Viridian Blue / ILM product language rather than template brand
  language?
- Does it use role-based typography?
- Does it preserve the body/display distinction?
- Are status colors semantic?
- Are object relationships visible where they matter?
- Are cards aligned to a shared spacing system?
- Are image assets complete, sparse, and meaningful?
- Are new patterns local on first use and promoted on second use?
- Does the screen feel calm, connected, tactile, and trustworthy?
