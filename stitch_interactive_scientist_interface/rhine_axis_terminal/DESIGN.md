# Design System Documentation: Clinical Authority & Data Sovereignty

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Sovereign Laboratory."** 

This system rejects the soft, approachable "SaaS" aesthetics of the modern web in favor of an authoritative, sterile editorial experience. It is designed to feel like a high-end medical research interface—precise, high-contrast, and intellectually demanding. 

We break the "template" look by utilizing intentional asymmetry and "Structured Clarity." With a shift to balanced spacing, we favor organized layouts that leave room for technical metadata. We use sharp, 0px-radius geometries to communicate a sense of structural integrity. This is not just an interface; it is a clinical instrument.

---

## 2. Colors & Environmental Tones
The palette is rooted in a "High-Contrast Void" aesthetic, utilizing an absolute black neutral base punctuated by a signature "Clinical Forest Green."

### Surface Hierarchy & Nesting
Depth is achieved through **Tonal Layering** of high-density surfaces.
*   **Base:** The foundation of all views is a low-luminance neutral (`#000000`), providing a deep, obsidian canvas for data.
*   **Nesting:** To define a workspace, use subtle tonal shifts in the surface container hierarchy.
*   **The "No-Line" Rule:** Prohibit the use of 1px solid borders for sectioning. Boundaries must be defined by the shift between surface tiers. If two areas must be separated, use a background color shift, not a line.

### The "Glass & Glow" Rule
To elevate the UI from a flat display to a premium clinical OS:
*   **Glassmorphism:** For floating panels or overlays, use surface containers at 70% opacity with a `20px` backdrop-blur. 
*   **Signature Glows:** Primary actions and critical data points (using `primary` #4F6F52) should feature a subtle `0 0 8px` outer glow in the same color to mimic a high-end LED phosphor display.

---

## 3. Typography: The Intellectual Contrast
This design system utilizes a high-contrast typographic pairing to balance "The Researcher" (Headings) with "The Machine" (Data).

*   **The Editorial Voice (Display & Headline):** We use **Noto Serif**. This introduces a human, scholarly element into a sterile environment. Use `display-lg` for high-impact titling with generous letter-spacing to emphasize authority.
*   **The Technical Voice (Title, Body, Label):** We use **Space Grotesk**. This monospace-adjacent font handles all functional data. 
    *   **Data Layout:** With a "Normal" spacing setting (Level 2), we allow data more room to breathe than a traditional terminal, ensuring readability in high-stakes environments.
    *   **Hierarchy:** Headings should always be high-contrast, while secondary metadata should drop to a lower-contrast variant to ensure the eye hits the conclusion before the supporting data.

---

## 4. Elevation & Depth: Tonal Layering
We do not use standard shadows. We build "Physicality" through light and stacking.

*   **The Layering Principle:** Use the neutral palette to create "recessed" or "lifted" effects through value shifts rather than darkness.
*   **The Ghost Border:** If a containment line is strictly required for accessibility, use a "Ghost Border"—the `outline_variant` token at 15% opacity. It should be a hairline (0.5px to 1px) stroke that feels like a laser-etched guide.
*   **Ambient Light:** When a panel must float (e.g., a modal), the shadow must be tinted with the `primary_container` (#4F6F52) color at 5% opacity, with a very wide blur (40px+).

---

## 5. Components & Primitive Styling

### Brackets & Geometric Accents
Every major container must feature a **'Bracket' Accent**. Instead of a full border, use `primary` #4F6F52 hairline strokes that only cover the corners (e.g., a 10px L-shape on the top-left and bottom-right).

### Buttons
*   **Primary:** Solid `primary_color_hex` (#4F6F52). 0px border radius. Text is `on_primary`. 
*   **Secondary:** No fill. Hairline stroke of `outline`. On hover, fill with a light surface shift and add a `primary` corner bracket.
*   **Tertiary:** All caps `label-md` text with a `primary` underline that only spans 30% of the text width.

### Input Fields
*   **Terminal Aesthetic:** Inputs should look like a data entry line. No background fill. Only a bottom-border using `outline_variant`. 
*   **Focus State:** The bottom border shifts to `primary` with a 2px glow. The cursor should be a solid block (matching the `primary` color).

### Chips & Tags
*   **Technical Labels:** Use `secondary_color_hex` (#A8B98B) backgrounds. These must be rectangular (0px radius). Use for status effects (e.g., "STABLE," "CRITICAL").

### Cards & Lists
*   **The "No-Divider" Rule:** Never use horizontal lines to separate list items. Use vertical spacing (consistent with Level 2 spacing) to define separation.

---

## 6. Do's and Don'ts

### Do:
*   **Do** embrace the starkness of the black neutral against the forest green primary.
*   **Do** use hairline strokes (0.5pt) for decorative accents.
*   **Do** prioritize monospace fonts for any numerical value or timestamp.
*   **Do** use `tertiary` (#FF9933) sparingly as a "Warning" or "Alert" accent.

### Don't:
*   **Don't** use border-radius. Every corner in this system must be a sharp 90 degrees.
*   **Don't** use standard "drop shadows" (black/grey). 
*   **Don't** center-align long-form text. All text should be left-aligned.
*   **Don't** use "vibrant" colors outside of the defined primary/secondary/tertiary tokens.

---

## 7. Signature Interaction Pattern: "The Scan-Line"
When a new view or modal opens, use a "Scan-line" reveal: an animated mask that reveals the component from top-to-bottom. This reinforces the "Sovereign Laboratory" experience of loading high-fidelity data onto a sterile display.