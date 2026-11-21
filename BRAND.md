# FormMaker brand guide

FormMaker is a **professional tool with a polished finish**. It should feel like premium
software: crisp, calm and precise, with depth and a few signature details. It should never feel
playful or toy-like. Builders spend hours in it, and respondents see it once, so the brand stays
quiet and lets the content lead.

## Principles

1. **Precise, not plain.** Hairline borders, consistent spacing, compact controls.
2. **Depth, not decoration.** Soft glows, tinted shadows and a gentle sheen on primary actions.
   No illustrations, bouncing, tilting or multicolor accents.
3. **One brand color.** Ink carries every action. Violet only ever appears inside Ink gradients.
   Marigold lives in the logo only.

## Logo

The mark is an Ink tile with two answer rows. The top one is ticked in Marigold and the bottom
one is still open: "a form, half filled in".

| Asset            | Where                                               |
| ---------------- | --------------------------------------------------- |
| Mark (component) | `<fm-brand-mark />` (`core/components/brand-mark/`) |
| Favicon          | `public/favicon.svg` (and the legacy `favicon.ico`) |

- The wordmark is **Form**Maker in Inter: "Form" in 650 and on-surface, "Maker" in 500 and muted.
  Tracking is −0.025em.
- Keep clear space of at least ¼ of the mark's width around it. Minimum size is 16px.
- The mark is decorative (`aria-hidden`). Always put the name next to it as text, or give the
  holding link an accessible name.
- Don't recolor, rotate, outline or animate the mark.

## Color

Palettes are generated from these seeds with `ng generate @angular/material:theme-color` into
`src/frontend/app/core/styles/_brand-palettes.scss`, and used by the M3 theme in `styles.scss`.

| Name     | Value     | Role                                                           |
| -------- | --------- | -------------------------------------------------------------- |
| Ink      | `#2D3A8C` | Primary: actions, links, focus, selection, the mark            |
| Violet   | `#6A5CD8` | Only inside Ink gradients and accent hairlines (`--fm-violet`) |
| Slate    | `#74767C` | Neutral: page `#F5F6F8`, sheets `#FFFFFF`, hairlines `#E3E5EA` |
| Brick    | `#C4372B` | Error and destructive actions                                  |
| Marigold | `#E8A33D` | Logo only                                                      |

- **Text contrast is AAA.** Light mode uses tone 30 for primary/tertiary/error and dark mode uses
  tone 80 (see the comment in `styles.scss`).
- Gradients: `--fm-gradient-ink` fills brand surfaces (avatar, success tick, hovered palette
  tiles). `--fm-gradient-accent` is the 2–3px hairline on brand moments.

## Typography

**Inter** (variable, with optical sizes) for everything. It's self-hosted via
`@fontsource-variable/inter`, so there are no third-party font requests.

| Use           | Size / weight  | Notes                                      |
| ------------- | -------------- | ------------------------------------------ |
| Page title    | 24–28px / 600  | −0.02em tracking                           |
| Card / panel  | 14–16px / 600  |                                            |
| Body / inputs | 14px / 400     | line-height 1.5                            |
| Field labels  | 13px / 550     | Always above the box, never inside it      |
| Overlines     | 11.5px / 600   | Uppercase, +0.06em, muted (panel sections) |
| Numbers       | `tabular-nums` | Counts, dates and durations line up        |

## Shape, depth and motion

Tokens live on `html` in `styles.scss`. Shared patterns are in `core/styles/mixins.scss`, and
Material control restyling is in `core/styles/_controls.scss`.

- **Radius:** `--fm-radius-sm` 6 · `md` 8 (buttons, fields) · `lg` 10 · `xl` 12 (cards, dialogs).
- **Sheets:** every card-like surface is a white sheet on the grey page (`mixins.sheet()`): a 1px
  `--fm-line` border plus `--fm-shadow-1`. Interactive sheets deepen to `--fm-shadow-3` on hover.
- **Primary buttons** have a top-light sheen, inner highlights and an Ink-tinted shadow
  (`--fm-shadow-ink`). There are no ripples; hover and pressed state layers remain.
- **Density:** 36px buttons, 40px fields, segmented button toggles, left-aligned underline tabs.
- **Motion:** `--fm-ease`, 120ms for state changes and 200ms for movement. Fades and small
  translations only. Everything switches off under `prefers-reduced-motion`.
- **Focus:** Material strong focus indicators in Ink, plus a 3px Ink ring on focused fields.

## Signature details

- A faint Ink and violet glow behind the top of every page, under a frosted header.
- The active nav item is marked by an Ink rule on the header's bottom edge.
- The accent hairline on form cards (on hover) and on top of the runner's form header.
- The question being answered gets an Ink edge on its left.
- Icons sit in hairline tiles; palette tiles turn Ink on hover.
- The login sits on a faint blueprint grid that fades out toward the edges.

## Voice

Short, direct and in the second person. Say what happens.

- ✅ "Form saved." · "Your answers were sent." · "Delete this form? This can't be undone."
- ❌ "Success!!" · "Oops, something went wrong :(" · "Are you absolutely sure?"

Strings always go through i18n (`en.ts` / `de.ts`). The brand name **FormMaker** is never
translated, split or abbreviated.
