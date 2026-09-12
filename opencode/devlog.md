# Dev Log

## 2026-09-11 — bootstrap

- User requested a modern, performant form builder with: page logic, advanced conditions (page +
  question/group), piping + predefined default values (static & dynamic), calculations, many question
  types incl. signature (sign pad), validators custom & predefined, TS with clear types, test+lint+format
  workspace, export excel/csv, import/export forms (JSON), and docs in `opencode/`.
- Environment: Linux, empty dir. Node was v24.14.0 but **Angular 22 CLI requires ≥ 24.15.0**.
  Installed Node v24.15.0 via nvm. Shell PATH does not persist between tool calls, so created
  `node`/`npm`/`npx`/`ng` wrapper scripts in `/home/user/.opencode/bin` (first dir on PATH) that exec the
  v24.15.0 binaries.
- Scaffolded: `ng new form-maker` (Angular 22.1, TypeScript 6.0, SCSS, routing, standalone, no SSR,
  **Vitest 4 default test runner** — checked: `ng test --watch=false` passes).
- Added deps: `@angular/material@22.1` (+ CDK) with azure-blue M3 theme; `@angular-eslint` 22 (flat
  config generated); runtime libs `signature_pad@5.1.4`, `exceljs@4.4.0`.
- Added npm scripts: `format`, `format:check`, `typecheck`, `check` (lint+format+typecheck+test+build).
- Stack decision documented in opencode/architecture.md (recommend **Angular**: Reactive Forms,
  OnPush + CDK virtual scroll, signals, type safety).
- Wrote opencode/README.md, architecture.md, todos.md, devlog.md.

## Next steps

- core/model (schema types) then engine (parser/eval/template/conditions/calc/deps) + tests,
  then stores, then UI (builder + runner), then export + tests, then demo + full gate.

## Session 2 (same day)

- Core typed model written: `core/model/` (ids, values, conditions, validation, form, submission types).
- Expression engine written + 47 unit tests green:
  - `expression/lexer.ts` (tokens, keyword ops, numbers/strings)
  - `expression/parser.ts` (recursive descent, precedence, functions, refs collection)
  - `expression/evaluator.ts` (safe function library: sum/avg/min/max/if/concat/coalesce/round/date helpers/required/msg…)
  - `expression/template.ts` (piping `{{field}}` + filters upper/lower/title/number/currency/date)
  - `condition-engine.ts` (all operators incl. array has* and between; group all/any + nesting)
  - `dependencies.ts` (collect field refs from elements/pages/forms)
- Fixed several strict-TS + import-path mistakes; `lint` + `typecheck` green.
- Tests run via Vitest (`ng test`), jsdom env.

## Sessions 3/4 — model, engine, stores, UI, export, auth

- Full core engine in place: expression parser/evaluator with safe functions, template piping,
  condition engine with groups (all/any) + operators, dependency graph, validation rules — all
  unit-tested (`core/engine/*`).
- Signal stores: `DesignerStore` (form definition CRUD, selection, pages, localized default
  labels), `RunnerStore` (ElementViewRef per page, condition evaluation, submit, thank-you state),
  `FormsRepository` (API client, bearer-token auth, offline fallback to localStorage).
- Builder UI and runner UI built out on Material 22; CSV/Excel/PDF exporters + JSON import/export.
- **Auth**: `POST /api/auth/login` yields a 24h in-memory bearer token; `authGuard` protects
  `/`, `/builder`, `/results/:id`; login + runner public. Offline fallback password `formmaker`.
- **i18n**: `core/i18n/` with `I18nService.t(key, params)` + `lang()` signal, en/de dictionaries,
  `formmaker.lang` storage key, browser auto-detect `de`. Every visible string goes through the
  service — no hardcoded literals.
- **Runner drafts**: autosave `<formId>` answers to localStorage (`formmaker.draft.<id>`,
  300 ms debounce), restore on reload unless the form version changed, clear on submit/reset.
- **PDF receipt**: `submissionToPdf(form, submission)` builds a per-response receipt; downloaded
  from the runner thank-you screen via `downloadBlob`.
- Ran `npm run check` (lint + format + typecheck + typecheck:server + test:ci + build) → green.

## Session 5 — polish & commits

- Tooling note: Node v24.15.0 wrappers in `/home/user/.opencode/bin`; PATH does not persist
  between tool calls — prefix commands with `export PATH=/home/user/.opencode/bin:$PATH`.
- Icons are bundled SVGs; new `mat-icon svgIcon` must be registered in `scripts/copy-icons.mjs`
  and regenerated via `npm run icons:copy` (auto-runs on prestart/prebuild). Manifest is
  generated → gitignored.
- Added `AGENTS.md` so AI tools can navigate the repo and run the verification gate.
- Cleaned dead duplicate logic in `question-list.ts` and stray `console.log`s.
- CSV export restored to structured `{ text, additional? }` from `formatValueForExport`.
- Committed the accumulated feature work in logical, reviewable commits (i18n module, builder
  translation, auth, icons, exports, runner drafts+receipt, docs).

## Session 6 — receipt groups + pluggable result exports

- Runner thank-you PDF receipt now renders **group headings** via
  `core/export/receipt.ts` (`buildReceipt`): headings only for groups with an
  answer, nested questions indented, sections/unanswered hidden.
- Results exports refactored onto a **pluggable channel** API
  (`core/export/channels.ts`): each `ExportChannel` turns `{ form, submissions,
ctx.t }` into a download `Blob` or link artifact. The toolbar is now a single
  loop; new outputs (e.g. a server email sender) plug in by registering a
  channel. Added an `Email` channel (mailto summary) as the worked example.
- Moved `toSlug` into `core/export/file.ts`; removed now-unused i18n keys
  (`results.exportCsv/Excel/Pdf`, `pdf.filename`, `pdf.exported`), added
  `results.email`/`mailSubject`/`mailBody` + `export.exported`/`export.failed`.
- Registered the `mail` icon; `npm run check` green (76 tests).

## Ongoing issues / choices

- Expression `+` is string-concat when either side is a string, else numeric (documented, tested).
- Unknown identifiers evaluate to `null` (calculation-friendly).
- Hidden fields keep their raw value in evaluation context (so gating works) but are excluded
  from submissions.
- Server-side tokens are in-memory only; restart invalidates all sessions. Offline mode relies on
  localStorage and the fallback password.
- Stale/docs hygiene: opencode/ docs should be refreshed alongside any major feature commit.
