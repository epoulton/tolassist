# TolAssist — Dark Workshop Aesthetic Direction

> Status: Approved visual direction for a future styling pass
>
> Reference: User-provided workshop photograph reviewed locally; not tracked
> or distributed with TolAssist.

The reference photograph is inspiration only. It will not be copied into the
repository, displayed in the application, or shipped as an application asset.
TolAssist will abstract its atmosphere through color, lighting, typography,
geometry, and restrained material cues.

## 1. Design North Star

**Precision work at a lit forge.**

TolAssist should feel like a serious engineering instrument being used at the
center of a dark, working shop. The surrounding interface recedes into
blackened iron and soot-dark timber; the current calculation receives the
light. Warm metal accents identify the controls that move the work forward.

The result should be:

- serious, capable, and quietly dramatic;
- tactile without becoming ornamental;
- compact and purposeful without feeling crowded;
- warm enough to feel human, but precise enough to trust with engineering work;
- visually distinctive without compromising legibility or accessibility.

This is not a literal blacksmith theme. The interface must not resemble a game,
a themed restaurant, a Western poster, or a steampunk control panel.

## 2. Extracted Visual Principles

### Light surrounded by shadow

The photograph concentrates attention on the bright workpiece and the hands
working it. TolAssist should use the same hierarchy: the page shell stays dark,
panels sit one step lighter, and the active input or result receives the
brightest edge and clearest text. Brightness must indicate working priority,
not decoration.

### Honest working materials

The visual vocabulary comes from blackened iron, charcoal, dark timber, brick,
oxidized copper, and heated steel. These materials translate into flat colors,
fine borders, inset fields, small highlights, and restrained tonal gradients.
They do not translate into photographs, tool silhouettes, rivet decorations,
fake scratches, leather, flames, or woodgrain backgrounds.

### Organized density

The shop is visually dense, but every object has a purpose. Definition rows may
remain information-rich, with labels and values aligned like tools on a bench.
Spacing should make relationships obvious rather than make every element feel
large or luxurious.

### Useful wear, not simulated damage

Surfaces may use slight tonal irregularity or extremely subtle procedural
grain to avoid looking digitally sterile. Texture must disappear behind text,
never reduce contrast, and never imitate distressed or damaged controls.

### The work is the focal point

Navigation, borders, helper text, and inactive stages should recede. Editable
values, active controls, validation feedback, and computed results should carry
the strongest contrast. The interface should make it immediately clear where
the user is working and what changed.

## 3. Color System

These tokens define the intended roles. Implementations may introduce derived
opacity variants, but must not change the base hue relationships or use
semi-transparent text whose final contrast is uncertain.

| Token                   | Value     | Role and accessibility intent                                                           |
| ----------------------- | --------- | --------------------------------------------------------------------------------------- |
| `--forge-bg`            | `#0D0B0A` | Soot-black page background; deepest visual plane.                                       |
| `--forge-bg-warm`       | `#15110E` | Warm shadow used in restrained page lighting gradients.                                 |
| `--forge-panel`         | `#1B1714` | Primary workflow-stage surface.                                                         |
| `--forge-panel-raised`  | `#251F1A` | Rows, inspectors, menus, and raised work surfaces.                                      |
| `--forge-panel-active`  | `#30271F` | Active or selected work area; use sparingly.                                            |
| `--forge-field`         | `#100E0D` | Recessed input and select background.                                                   |
| `--forge-text`          | `#F4EBDD` | Warm off-white primary text on all dark surfaces; target WCAG AA or better.             |
| `--forge-text-muted`    | `#BFB0A0` | Secondary copy and labels; retain at least 4.5:1 contrast at normal sizes.              |
| `--forge-text-faint`    | `#958678` | Placeholders and nonessential metadata only; never required instructions.               |
| `--forge-line`          | `#5B493B` | Primary structural border and separator.                                                |
| `--forge-line-subtle`   | `#382E27` | Low-emphasis dividers inside a panel.                                                   |
| `--forge-copper`        | `#B66E43` | Secondary accent, stage markers, and selected outlines.                                 |
| `--forge-copper-bright` | `#D88A55` | Hovered copper details and high-emphasis secondary controls.                            |
| `--forge-heat`          | `#F4932F` | Primary actions, active focus, and progress. Use with dark text.                        |
| `--forge-heat-hover`    | `#FFAD4A` | Primary-action hover and active illumination. Use with dark text.                       |
| `--forge-on-heat`       | `#1A1008` | Text and icons placed on orange action surfaces.                                        |
| `--forge-success`       | `#65D391` | Green constraint status and success feedback on dark surfaces.                          |
| `--forge-warning`       | `#F2BE55` | Yellow/amber partial-pass status and warnings on dark surfaces.                         |
| `--forge-danger`        | `#FF766B` | Red constraint status, destructive actions, and errors on dark surfaces.                |
| `--forge-info`          | `#72B8D4` | Neutral informational feedback when orange would imply action.                          |
| `--forge-disabled`      | `#766B62` | Disabled outlines and secondary marks; disabled controls also need shape and text cues. |

The interface should be approximately 80% soot, charcoal, and iron; 15% warm
off-white and steel text; and no more than 5% copper, orange, and status color.
Forge orange is an attention resource, not a general brand wash.

Large gradients should be rare. The page may use a soft warm radial glow behind
the hero or active stage, analogous to reflected forge light. Panels may use a
subtle top-edge highlight. Avoid glossy gradients, neon bloom, and orange text
across large passages.

## 4. Typography

### Display and stage headings

Use a sturdy condensed industrial grotesque. **Barlow Condensed** is the leading
open-source reference. Use weights 600–700, slightly tightened tracking, and
compact line height. Headings should feel stamped and direct, not elegant or
editorial.

Fallback category: `"Arial Narrow", "Roboto Condensed", sans-serif`.

### Interface and explanatory text

Use a highly legible neutral sans serif. **IBM Plex Sans** is the leading
open-source reference because it feels technical without appearing sterile.
Use regular weight for prose and 600 for controls and concise labels.

Fallback category: `Inter, system-ui, sans-serif`.

### Engineering values and expressions

Use **IBM Plex Mono** or an equivalent tabular monospaced face for numeric
inputs, units, expressions, constraint formulas, calculated values, and
optimization diagnostics. Enable tabular numerals. Alignment must remain stable
when values change.

Fallback category: `ui-monospace, "SFMono-Regular", Consolas, monospace`.

### Label treatment

Short labels, stage kickers, and table headers may use uppercase text with
moderate tracking, like stamped equipment markings. Do not apply this treatment
to instructions, validation messages, button labels, or long headings.

Font acquisition and local bundling will be decided during implementation. The
styling pass must preserve the role distinction even if it initially uses the
fallback stacks.

## 5. Geometry, Surfaces, and Depth

- Reduce large panel radii to approximately `4–8px`; small controls may use
  `3–5px`. Status dots and the loading spinner may remain circular.
- Replace floating white cards with forged-iron work panels using a crisp outer
  border, a subtle light top edge, and a quiet inset shadow.
- Keep drop shadows shallow, dark, and close to the surface. Avoid soft,
  far-reaching shadows that make panels float above the page.
- Use one-pixel dividers to organize dense information. Structural borders use
  iron or copper tones rather than translucent white.
- Use extremely restrained procedural grain only if flat colors feel sterile.
  Grain opacity should remain below roughly 2%, must not animate, and must not
  sit between text and its background.
- Preserve consistent alignment and spacing. Material character must never
  produce irregular control sizes or misaligned data.

## 6. Layout and Hierarchy

The existing five vertically stacked stages remain intact. This is a visual
restyle, not an information-architecture redesign.

- Keep the hero concise and high contrast. It should establish a workshop
  atmosphere through light and type rather than occupy most of the first screen.
- Treat each stage as a work station. Stage headings and controls belong to the
  same bounded surface rather than appearing as independent floating cards.
- Present stage numbers as compact stamped plates: dark steel, a copper edge,
  condensed numerals, and little or no rounding.
- Give the stage or field containing current focus a slight increase in surface
  brightness or edge warmth. Do not dim other content below readable contrast.
- Keep definition rows horizontally efficient on wide screens. Use grid lines,
  label alignment, and monospaced values to create order.
- Preserve whitespace around headings, help, and error messages. Do not imitate
  the literal clutter of the photograph.
- Stage 5 should resemble an inspection report laid out on a metal bench:
  orderly sections, clear ruled tables, aligned figures, and strong provenance.

## 7. Component Treatment

### Header and wordmark

Use a near-black steel bar with a subtle bottom rule. The wordmark remains text,
with `Tol` in warm off-white and `Assist` in copper or forge orange. Phase and
context labels should resemble small stamped inventory text, not luminous
branding.

### Workflow panels

Use the primary iron surface with a restrained warm highlight near the upper or
active edge. Avoid a unique decorative treatment for every stage. State and
content, rather than color variety, distinguish the stages.

### Definition rows

Rows should look like replaceable work fixtures seated inside a larger panel.
Use a raised charcoal surface, thin internal separators, and a clear focus-within
edge. Drag handles should resemble practical knurled grip marks through simple
geometry, not skeuomorphic hardware.

### Inputs, selects, and multiselects

Fields are recessed instrument windows:

- near-black fill;
- one-pixel iron border;
- warm high-contrast text;
- monospaced data where appropriate;
- a subtle inset shadow;
- a copper border on hover;
- a clear forge-orange focus ring outside the control.

Placeholders remain visibly lower-emphasis but must not carry required
instructions. Invalid fields use a red border, an error icon or label, and
specific text; never a red glow alone.

### Buttons

- Primary actions use solid forge orange with dark text and a firm border.
- Hover increases heat and brightness without changing size.
- Pressed state moves inward by at most one pixel and deepens the inset edge.
- Secondary actions use raised steel with warm text and copper hover borders.
- Destructive actions remain quiet until hover or focus, then use the danger
  color with an explicit label.
- Disabled buttons use reduced contrast, a muted steel surface, and unchanged
  readable wording. They must not appear like enabled secondary actions.

### Toggles and disclosure controls

Selected segments should resemble a seated metal plate with a warm inner edge.
Disclosure chevrons rotate firmly and quickly. Avoid pill-shaped switches unless
the control's semantics genuinely require a switch.

### Help and validation feedback

Help panels should read as technical notes: a darker inset surface, a thin
left-hand copper rule, and compact type. Errors, warnings, and success messages
pair an icon or text label with color. Messages remain actionable and retain the
Phase 9 focus and live-region behavior.

### Constraint states

Green, amber, and red must remain semantically distinct from forge orange:

- green: **All cases pass**;
- amber: **Nominal passes; some limits fail**;
- red: **Nominal fails**.

Use a status-colored edge or compact indicator plus the existing visible text.
Do not flood an entire row with saturated color.

### Result inspectors and Stage 5

Use ruled, report-like layouts with monospaced values and clear unit alignment.
Min/nom/max values should scan as instrument readings. Expanded inspectors may
receive a faint warm top edge, but calculated content remains calmer than a
primary action.

## 8. Interaction and Motion

Motion should feel mechanical, short, and controlled.

- Use approximately `120–180ms` for hover, focus, row insertion, and small state
  transitions.
- Use approximately `180–240ms` for inspectors and meaningful layout changes.
- Prefer ease-out movement for placement and ease-in movement for removal.
- Use short vertical travel, opacity, and firm expansion. Avoid spring bounce,
  elastic overshoot, floating parallax, flickering firelight, and animated grain.
- Loading indicators may rotate steadily but should not pulse or glow heavily.
- Progress should communicate work through text and measured motion, not visual
  spectacle.

With `prefers-reduced-motion: reduce`, remove layout travel and rotation, make
state changes effectively immediate, and keep all feedback content intact.

## 9. Responsive Behavior and Data Density

- Preserve the established desktop, tablet, and narrow-screen breakpoints unless
  implementation testing finds a concrete layout defect.
- On wide screens, prioritize aligned columns and rapid comparison across rows.
- On narrow screens, reflow each row into labeled vertical groups. Do not shrink
  engineering values or controls below comfortable reading and touch sizes.
- Keep the active value and its unit visually adjacent after reflow.
- Allow formulas and long diagnostics to wrap or scroll within their own field;
  the page must not develop horizontal scrolling at a `360px` viewport.
- Do not hide validation explanations, status text, units, or provenance to make
  the layout fit.
- Preserve minimum `44px` touch targets where practical and never reduce the
  current keyboard-operable behavior.

## 10. Accessibility Requirements

- Meet WCAG 2.2 AA contrast: at least `4.5:1` for normal text and `3:1` for large
  text, focus indicators, and meaningful component boundaries.
- Test actual rendered color combinations rather than assuming token contrast.
- Use forge orange as the primary focus color with a dark separation outline
  when necessary so it remains visible on both fields and panels.
- Never communicate state through color, glow, texture, or position alone.
- Preserve semantic headings, labels, descriptions, live regions, table roles,
  keyboard reordering, and focus handoff behavior.
- Keep focus indicators visible and consistent for pointer-independent use.
- Ensure forced-colors and increased-contrast modes retain control boundaries
  and textual status labels even if material styling disappears.
- Texture and tonal lighting are expendable. Readability and state clarity are
  not.

## 11. Do and Avoid

### Do

- Use darkness to focus attention on the work.
- Use warm light selectively for action and current focus.
- Let alignment, rules, and typography convey engineering precision.
- Keep surfaces tactile through edge treatment and restrained depth.
- Make numeric values stable, scannable, and visually prominent.
- Keep every decorative decision subordinate to comprehension.

### Avoid

- Literal flames, anvils, hammers, gears, pipes, rivets, or tool silhouettes.
- Steampunk ornament, Western typography, faux leather, parchment, and brass
  instrument cosplay.
- Heavy distressed textures, fake scratches, grime overlays, or legibility loss.
- Large orange gradients, neon glow, glossy controls, or cyberpunk lighting.
- Excessively rounded cards, floating glass panels, and soft consumer-app
  pastels.
- Decorative clutter that competes with inputs, constraints, or results.
- Changing component behavior or information hierarchy merely to fit the theme.

## 12. Implementation Boundary

The future styling pass may change CSS, font assets, and purely presentational
markup where needed for styling hooks. It must preserve:

- the complete five-stage workflow;
- all calculation, validation, optimization, and export behavior;
- current responsive content order;
- semantic constraint meanings;
- keyboard and screen-reader behavior;
- reduced-motion support;
- solver loading boundaries and performance characteristics.

This document defines the visual target. It does not itself authorize changes
to application behavior, data structures, or solver implementation.
