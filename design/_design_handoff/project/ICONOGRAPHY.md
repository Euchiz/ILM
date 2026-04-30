# Iconography — Viridian Blue Labs

## Two layers

1. **System icons** for UI controls — Material Symbols Outlined (Google Fonts CDN).
2. **Brand imagery** — five hero PNG renders that carry the neo-skeuomorphic feel.

## System Icons — Material Symbols Outlined

The product imports the variable font directly:

```css
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap");
```

Used as a ligature font:

```html
<span class="material-symbols-outlined">science</span>
<span class="material-symbols-outlined">inventory_2</span>
```

Default settings (from `tokens.css`):

```css
font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
```

- **Weight 400, FILL 0** — outlined, never filled. The interface stays linework-light.
- **Color** inherits from text (usually `var(--ilm-ink)` or `var(--ilm-muted)`).
- **Sizing** matches the surrounding text (typically 0.95rem–1rem for nav, smaller for inline meta).

Common glyphs in the product: `science`, `dashboard`, `folder_open`, `inventory_2`, `payments`, `calendar_month`, `groups`, `analytics`, `description`, `settings`, `notifications`, `mail`, `help`, `refresh`, `arrow_forward`, `chevron_right`.

### Sidebar nav glyphs (single letters)

The shipping app actually renders nav items as a tiny **bordered single-letter cell** (`.ils-nav-glyph-cell`) — a 22×22 box, 1.5px current-color border, the first letter of the destination inside (`O` overview, `P` projects, `I` inventory…). This is a **branded substitute** for system icons. Use the letter glyphs in product chrome, Material Symbols everywhere else.

## Brand Imagery (`assets/`)

These are translucent-glass renders with viridian highlights — the visual signature of the product. They are **not icons** — they are decorative scientific imagery.

| Asset | Use |
|---|---|
| `infinity.png` | Hero art on the Overview / status hero. ∞ glass torus, viridian core. Drop shadow `0 6px 18px rgba(47,125,114,0.12)`. |
| `geo-mark.png` | Inventory icon / brand glyph. Wireframe icosahedron with translucent core. |
| `radar.png` | Inventory radar background. 6-point hex chart with concentric viridian fills. |
| `donut.png` | Projects donut chart background. |
| `lab-corridor.png` | Bottom-left page decoration at **10% opacity, 360×360px fixed**. The "calmer future" glass corridor. |

## Wordmark

Inline text: `RHINE LAB —∞— Integrated Lab Manager OS`. The em-dashes flank a small infinity glyph. In code:

```html
<div class="ils-brand-mark">
  <strong>RHINE LAB</strong> <span>—∞—</span>
</div>
<p class="ils-brand-tag">INTEGRATED <b>LAB MANAGER</b> OS</p>
```

For the parent brand: write `Viridian Blue Labs` in Space Grotesk 600, no logomark.

## Don'ts

- **Never** use emoji.
- **Never** draw new SVG icons by hand — pull from Material Symbols.
- **Never** fill Material Symbols (FILL stays at 0).
- **Don't** put brand PNG renders inline at small sizes — they're hero-scale only (≥150px).
- **Don't** introduce a second icon family (no Lucide, no Heroicons, no Phosphor) without removing Material Symbols first.

## CDN substitution flag

The product uses Material Symbols Outlined as **the** icon family — it's already a CDN web font, so no substitution is needed.
