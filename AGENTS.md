# FormMaker — Agent Guide

Modern Angular 22 form builder (build forms, share links, collect + export submissions) with a small
Express API. This file helps AI/agent tools navigate the repo. Full docs: [opencode/](./opencode/).

## Commands / verification gate

Alwyays run the full gate before finishing: `npm run check`
(= `lint` + `format:check` + `typecheck` + `typecheck:server` + `test:ci` + `build`).

| Task             | Command                           |
| ---------------- | --------------------------------- |
| Dev UI           | `npm start`                       |
| Dev API          | `npm run start:api`               |
| Run both at once | `npm run start:all`               |
| Unit tests       | `npm run test:ci`                 |
| Lint             | `npm run lint`                    |
| Format           | `npm run format` / `format:check` |
| Typecheck app    | `npm run typecheck`               |
| Typecheck API    | `npm run typecheck:server`        |
| Full gate        | `npm run check`                   |

- Node v24.15.0 is required by the Angular 22 CLI — via wrappers in `/home/user/.opencode/bin`.
- Icons are bundled SVGs. Any new `mat-icon svgIcon="..."` MUST be registered in
  `scripts/copy-icons.mjs` and regenerated with `npm run icons:copy` (auto-runs on `prestart`/`prebuild`).
  The manifest lives in `src/app/core/icon-names.ts`.

## Repository layout

```
src/app/
  core/
    model/          pure TS types: form schema, conditions, values, submissions, validation, ids
    engine/         expression parser/evaluator, template piping, condition engine, validators,
                    dependency graph (no Angular imports) -- heavily unit-tested
    state/          signal stores: DesignerStore, RunnerStore, EvaluationCache; FormsRepository
    export/         csv-exporter, excel-exporter, pdf-exporter (jsPDF), columns, file IO, form-schema
    i18n/           translations.ts (en/de dictionaries) + translation.service.ts (I18nService)
    auth/           auth.service.ts + auth.guard.ts (editor routes protected)
  builder/          designer UI: palette, canvas, element-row, property-panel, condition-editor,
                    field-preview, question-input(+field), question-selector
  runner/           form filling UI: runner, questionList, signature-pad
  landing/          form list / share / import / delete
  login/            password login screen
  results/          submissions viewer + CSV/Excel/PDF export
  shared/model/     element definitions, conditions.model, validation.model, values.model,
                    submission.model, form.model, ids
server/             Express API: forms + submissions endpoints, auth.ts (password login, tokens)
scripts/            copy-icons.mjs (icon bundling)
```

## Key architecture

- **Standalone components, zoneless rendering, signals** everywhere (Angular 22, Material 22).
  No NgModules introduced.
- **`DesignerStore`** (per-builder): holds the `FormDefinition` signal, selection, page CRUD,
  element insert/move/duplicate/remove, default labels (localized).
- **`RunnerStore`**: builds `ElementViewRef[]` (control + logic) per page, evaluates conditions,
  handles submit; exposes a `submitted()` thank-you state.
- **`FormsRepository`** (root): API client. Attaches `Authorization: Bearer <token>` from
  sessionStorage key `formmaker.token`. Has an `offline` signal; in offline mode it reads/writes
  localStorage.
- **`I18nService`** (root): signal `lang`; `t(key, params?)` with `{name}` interpolation; keys in
  `core/i18n/translations.ts` (en + de). Browser auto-detects `de`; persisted under `formmaker.lang`.
  Templates use `i18n.t('...')` so they re-render when the language signal changes. **Do not
  hardcode UI strings** — add a key to both `en` and `de` dictionaries.
- **Auth model**: editor routes (`/`, `/builder`, `/results/:id`) are guarded by `authGuard`.
  `POST /api/auth/login` with the server password returns a bearer token (in-memory, 24h TTL).
  Runner (`/runner/:id`) and login are public. Offline fallback password matches the server default.
  Default password: `formmaker` (in `server/auth.ts` and `core/auth/auth.service.ts`).
- **Conditions** (`conditions.model`): `ConditionGroup` = `{ logic: all|any, conditions[], groups[] }`.
  Operators need either `operand` (literal or field ref), `list`, `range`, or `none`.

## Conventions

- Strict TypeScript. No `any` (use `unknown` + guards), no unused imports (lint-enforced).
- No `console.log` in app code (lint doesn't ban it — remove them in review anyway).
- Sort/keep imports clean; run `npm run format` before committing.
- All visible strings go through `I18nService`. Model-level default labels use keys, not literals.
- CSV/Excel column text comes from `formatValueForExport(value)` → `{ text, additional? }`
  (structured, not a plain string).
- Export filenames are localized via keys like `pdf.filename`.

## Tests

- Vitest (`ng test`), jsdom. Core logic has the coverage: `core/engine/*`, `core/export/export.spec.ts`.
- Component-level tests via TestBed where UI logic matters.
- Before adding a feature, look for a matching store/engine/util; add unit tests beside it.
