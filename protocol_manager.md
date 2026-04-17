## Module spotlight: Protocol Manager

Protocol manager is the first module under development.

### Purpose

To provide a visual, structured, AI-compatible editor for wet-lab protocols. 
Build a GitHub Pages-compatible web app for designing wet-lab protocols visually.

### Key ideas

* protocols are stored as structured JSON
* protocol content is represented as explicit typed objects
* import/export is portable
* protocols can be created manually or generated from unstructured text via AI
* the editor is designed for scientific workflows, not generic note-taking

### Example protocol objects

* sections
* subsections
* steps
* preparation steps
* optional steps
* QC checkpoints
* reaction recipes
* PCR/incubation timelines
* cautions
* external links

### Why this module comes first

Protocols are a natural starting point because they:

* are central to many labs
* benefit strongly from structure
* can be implemented client-side first
* have immediate value
* provide a useful foundation for future integration with projects, reagents, and workflows

High-level goal:
Create a static client-side protocol designer for wet-lab workflows. The app should let users build hierarchical protocols with sections, subsections, ordered steps, and specialized blocks such as reaction recipes, timelines, QC checkpoints, cautions, optional steps, and hyperlinks. Protocols must be saved as a standardized JSON format that users can export and import.

Technical constraints:
- Use React + TypeScript + Vite
- Must work as a static site deployable to GitHub Pages
- No backend required
- Keep data in browser memory plus localStorage autosave
- Use a clean modular architecture
- Use strongly typed interfaces
- Add validation for imported JSON
- Include several sample protocols

Core product requirements:
1. Protocol outline editor
   - Add, edit, delete, duplicate, and reorder sections, subsections, and steps
   - Drag and drop hierarchy management
   - Collapsible tree outline
   - Ordered numbering preview

2. Step system
   - Each step has a stepKind enum:
     action, preparation, qc, optional, pause, cleanup, analysis
   - Each step supports plain text plus embedded typed blocks

3. Block system
   Implement these block types:
   - paragraph
   - note
   - caution
   - qc
   - recipe
   - timeline
   - link
   - table
   - fileReference
   - branch

4. Specialized block editors
   - Recipe block editor for reaction mixtures with components, units, and total volume
   - Timeline block editor for PCR cycles, incubation schedules, and multi-stage plans
   - QC block editor with objective, method, acceptance criteria, and failure actions
   - Caution block editor with severity and text
   - Link block editor with title, label, and URL

5. Protocol preview
   - Human-readable rendered view
   - Clear distinction between normal steps, QC, optional, preparation, and cautions
   - Nice but simple scientific styling
   - Print-friendly layout consideration

6. JSON import/export
   - Export current protocol as canonical JSON
   - Import JSON file or pasted JSON
   - Validate against schema and display useful errors
   - If possible, preserve unknown fields in an extensions object

7. AI-assisted import panel
   - Include a copyable text panel called “Instructions for AI-assisted protocol import”
   - The panel should explain how an AI should convert arbitrary protocol text into the required JSON format
   - Include a sample JSON skeleton in the UI
   - Include a strict “JSON only” instruction

8. Data model
   Design the canonical JSON around:
   - schemaVersion
   - protocol metadata
   - sections with recursive children
   - steps with stepKind
   - typed blocks
   - stable IDs
   - optional extensions fields

9. Developer requirements
   - Create TypeScript interfaces for the protocol model
   - Create a JSON validation layer
   - Separate editor components from preview components
   - Keep the data model independent from presentation details
   - Add comments in code for maintainability

10. Deliverables
   - Working frontend app
   - Readable project structure
   - Example JSON files
   - README explaining:
     - project purpose
     - schema overview
     - how import/export works
     - how to deploy to GitHub Pages

Important design preference:
Prioritize a clean, scientist-friendly editor over flashy UI. The saved JSON format should be human-readable and AI-friendly. The app should feel like a structured protocol composer, not just a note-taking app.

Please start by:
1. designing the TypeScript protocol model
2. designing the JSON schema/validator
3. creating the editor layout
4. implementing block editors
5. implementing preview rendering
6. implementing import/export and AI import instructions
