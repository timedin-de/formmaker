# FormMaker — Agent Guide

Modern Angular 22 form builder (build forms, share links, collect + export submissions) with a small
Express API. This file helps AI/agent tools navigate the repo. Full docs: [opencode/](./opencode/).

## Commands / verification gate

Alwyays run the full gate before finishing: `npm run check`
(= `lint` + `format:check` + `typecheck` + `typecheck:server` + `test:ci` + `test:server` + `build`).

| Task             | Command                                                               |
| ---------------- | --------------------------------------------------------------------- |
| Dev UI           | `npm start`                                                           |
| Dev API          | `npm run start:api`                                                   |
| Run both at once | `npm run start:all`                                                   |
| Unit tests       | `npm run test:ci`                                                     |
| Server tests     | `npm run test:server` (plain vitest, `src/server/**/*.spec.ts`)       |
| Unit coverage    | `npx ng test --watch=false --coverage` (thresholds in `angular.json`) |
| E2E tests        | `npm run e2e` / `e2e:headed` / `e2e:ui` (Playwright, 3 browsers)      |
| E2E coverage     | collected automatically in the `e2e` run → `coverage/e2e/index.html`  |
| Lint             | `npm run lint`                                                        |
| Format           | `npm run format` / `format:check`                                     |
| Typecheck app    | `npm run typecheck`                                                   |
| Typecheck API    | `npm run typecheck:server`                                            |
| DB migrations    | `npm run migration:run` / `:revert` / `:generate -- <path>`           |
| Full gate        | `npm run check`                                                       |

- Node v24.15.0 is required by the Angular 22 CLI — via wrappers in `/home/user/.opencode/bin`.
- Icons are bundled SVGs. Any new `mat-icon svgIcon="..."` MUST be registered in
  `scripts/copy-icons.mjs` and regenerated with `npm run icons:copy` (auto-runs on `prestart`/`prebuild`).
  The manifest lives in `src/frontend/app/core/icon-names.ts`.
- Playwright: browser binaries via `npm run e2e:install`; the config spins up the API + UI dev
  servers itself and reuses them locally. The `e2e` CI jobs run
  `npx playwright install --with-deps chromium firefox webkit` then `npm run e2e`.
  Before adding an e2e spec, check `e2e/helpers.ts` for the seed/cleanup API helpers.

## Repository layout

```
src/app/
  core/
    model/          pure TS types: form schema, conditions, values, submissions, validation, ids
    engine/         expression parser/evaluator, template piping, condition engine, validators,
                    dependency graph (no Angular imports) -- heavily unit-tested
    state/          signal stores: DesignerStore, RunnerStore, EvaluationCache; FormsRepository
    export/         channels (pluggable CSV/Excel/PDF/mail), pdf-exporter (jsPDF), receipt
                    builder, columns, csv/excel exporters, file IO, form-schema
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
  server/           Express API + shared model live under src/: src/server (Express:
                    forms + submissions endpoints, auth.ts) and src/shared (shared types)
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
  Default password: `formmaker` (in `src/server/auth.ts` and `core/auth/auth.service.ts`).
- **Conditions** (`conditions.model`): `ConditionGroup` = `{ logic: all|any, conditions[], groups[] }`.
  Operators need either `operand` (literal or field ref), `list`, `range`, or `none`.

## Server (NestJS on Express)

- `src/server/app.ts` `createApp()` wraps the Express instance in a Nest app (`AppModule`); `index.ts`
  only listens. Routes not yet ported stay as Express routers in `routes/`; port them module by
  module into `src/server/<feature>/` (module + controller + service) and delete the router.
- **Always use `@Inject(Token)` in constructors.** tsx and vitest (esbuild/oxc) do not emit
  decorator metadata, so Nest cannot infer constructor types. Legacy decorators are enabled via
  `tsconfig.server.json` (tsx: `--tsconfig`) and `vitest.server.config.ts`.
- Body parsing is done once in `app.ts` (50mb limit); Nest's parser is off. Anything registered on
  the Express app before `nest.init()` runs ahead of Nest routes and Nest's 404 handler.
- Providers: `DatabaseModule` (global) exposes `DataSource` and `Repository`. `AuthModule`
  (`src/server/auth/`) owns `/api/auth/*` and exports `AuthGuard`; use `@UseGuards(AuthGuard)` +
  `@CurrentUser()` on Nest routes. Session/password helpers still live in `src/server/auth.ts`
  (shared with the legacy routers until they are ported).
- Validate input with `@Body(new ZodValidationPipe(schema))` using the shared zod schemas
  (`src/shared/schemas`), not class-validator. Errors keep the API contract `{ error, details? }`:
  throw Nest exceptions with an object body, e.g. `new ConflictException({ error: '...' })`;
  `ApiExceptionFilter` formats everything else. Status codes are part of the contract
  (`@HttpCode(200)` on login, 201 on register, 204 on logout).
- Server specs are excluded from `tsconfig.spec.json` (they are typechecked by `typecheck:server` and
  run by `test:server`, not `ng test`).

## Database & migrations

- The schema changes **only** through TypeORM migrations in `src/server/migrations` — never
  `synchronize`. Change an entity in `src/server/entities`, then
  `npm run migration:generate -- src/server/migrations/<Name>` and review the SQL.
- Register every migration in `src/server/migrations/index.ts` (explicit list: the server is bundled
  with ncc, so globbing files at runtime does not work). Keep migrations dialect-neutral (TypeORM
  `Table` API) because SQLite and MySQL are both supported.
- Pending migrations run on server start (`TYPEORM_MIGRATIONS_RUN=false` disables). Server specs sit
  beside the code and run with `npm run test:server`; `ng test` only covers `src/frontend`.
- Planned backend direction (NestJS, normalized tables, orgs, webhooks): `opencode/backend-plan.md`.

## Conventions

- Strict TypeScript. No `any` (use `unknown` + guards), no unused imports (lint-enforced).
- No `console.log` in app code (lint doesn't ban it — remove them in review anyway).
- Sort/keep imports clean; run `npm run format` before committing.
- All visible strings go through `I18nService`. Model-level default labels use keys, not literals.
- Titles/labels and descriptions render **Markdown** via the `markdown` pipe (`core/markdown`,
  `markdown-it`). Use inline mode for labels (`| markdown`) and block mode for descriptions
  (`| markdown: true`). Raw HTML is escaped and Angular sanitizes the bound `[innerHTML]`.
- CSV/Excel column text comes from `formatValueForExport(value)` → `{ text, additional? }`
  (structured, not a plain string).
- Export buttons are pluggable via `EXPORT_CHANNELS` in `core/export/channels.ts`: each channel
  produces a download `Blob` or a `link` artifact (`{ form, submissions, ctx.t }` → `{ kind, ... }`).
  Add a channel there to appear in the results toolbar. Download filenames are slugged,
  e.g. `<form>-responses.csv` via `exportFileName`.
- The runner's thank-you PDF receipt and the results summary PDF render blocks from
  `buildReceipt` (`core/export/receipt.ts`); headings are emitted for **pages** (with an
  answer/field) and groups, in order, with nesting indent (`page`/`group`/`answer` block kinds).
- CI runs on GitHub Actions (`.github/workflows/ci.yml`) and Forgejo (mirror in
  `.forgejo/workflows/ci.yml`): lint, format:check, typechecks, `test:ci -- --coverage`
  (thresholds in `angular.json`, lcov at `coverage/`), build. Dependency updates via
  Renovate (`renovate.json`).

## Tests

- Vitest (`ng test`), jsdom. Core logic has the coverage: `core/engine/*`, `core/export/export.spec.ts`.
- Component-level tests via TestBed where UI logic matters.
- Before adding a feature, look for a matching store/engine/util; add unit tests beside it.
