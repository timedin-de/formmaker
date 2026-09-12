# FormMaker

A visual, no-code style form builder with a live **designer**, a **runner** for respondents, and a **results** view with spreadsheets — all client-side. Design a form, preview it exactly as respondents see it, and collect submissions in your browser.

Built with Angular 22 and Angular Material 22, running entirely in the browser with `localStorage` persistence.

## What it can do

- **Visual form designer** — build multi-page forms by dragging nothing at all: pick a field from the palette and tune it in the property panel.
- **Two editing layouts** — the classic split view (palette / canvas / property panel) or a stacked **WYSIWYG** view where fields render exactly as respondents will see them, with the property editor inline under each selected field.
- **14 field types**
  - Basic: short text, long text, number, yes/no, single choice, dropdown, multi-choice, date, time, date-time
  - Advanced: rating scale, file upload
  - Special: signature pad
  - Layout: section heading, question group
- **Live runner** — respondents fill the form with real Material controls, page-by-page navigation, and validation with per-field messages.
- **Results** — every submission collected in the browser; view them side by side and export to **CSV** or **Excel (xlsx)**; delete single submissions or clear all.

## Advanced features

- **Page logic** — show or hide whole pages via a visual condition builder ("all / any" conditions, nested groups, literals, ranges, and references to other fields).
- **Field visibility** — every field can show/hide conditionally, again with the same visual condition editor.
- **Default values** — static values, computed expressions (`now()`, `concat('A','B')`), or copy the value from another field.
- **Calculated fields** — number fields with formulas over other fields (e.g. `(a * b) / 100`) and configurable decimals.
- **Validation rules** — required, length bounds, min/max, between, regex patterns, date ranges, integers, email/url/phone, file-type and file-count/size rules, plus fully custom expressions — each with a custom error message.
- **Groups** — nest questions inside collapsible groups; groups carry their own legend.
- **Field layout** — full / half / third widths so multi-column forms are possible.
- **Uploads & signatures** — file fields enforce `accept`/multiple/size/file-type rules; signatures are captured on a device-pixel-correct signature pad.
- **Markdown titles & descriptions** — question labels, page titles/subtitles and descriptions are rendered as Markdown (**bold**, _italic_, `code`, lists, links) with `markdown-it`; block formatting (paragraphs, lists, headings) works in descriptions.
- **Import / export** — save forms to JSON, re-import them (with schema validation), and continue editing.
- **Persistence** — everything lives in `localStorage`; forms and their submissions survive a reload. Install as a PWA if you want it truly offline.

## Tech stack

- Angular 22 (zoneless change detection, signals, new control flow, `Router` with lazy routes)
- Angular Material 22 (Theming from Material 3 design tokens)
- `signature_pad` for capturing signatures
- `exceljs` for `.xlsx` export
- `markdown-it` for Markdown rendering of titles and descriptions
- Vitest for unit tests

## Getting started

```bash
npm install
npm start        # dev server on http://localhost:4200
```

Other scripts:

```bash
npm run lint        # ESLint
npm run typecheck   # tsc for app + specs
npm run test:ci     # unit tests (Vitest)
npm run build       # production build into dist/
```

## Structure

```
src/app/
  core/
    model/        # data model: forms, fields, values, validation
    state/        # DesignerStore (signals), FormsRepository (localStorage)
    engine/       # evaluation: values, conditions, validations, calculations, templates
    export/       # JSON schema, CSV/Excel export, file helpers
  landing/        # home: open a form to edit, preview, or review results
  builder/        # designer UI: canvas, palette, property panel, condition editor
  runner/         # respondent view
  results/        # submissions & export
```

## Note on AI

This project was **built for the most part with AI assistance** (opencode with a large language model), including significant portions of the code, the tests, and this README. It's a working, tested mini-go-live rather than a production product — expect rough edges.
