# FormMaker — Agent Guide

Guidance for coding agents working in this repository. User-facing docs are in `README.md`.

FormMaker is a form builder: an Angular 22 SPA (designer, runner, results) plus a NestJS-on-Express
API with TypeORM persistence (SQLite by default, MySQL optional).

## Commands

Node ≥ 24.15 is required by the Angular 22 CLI.

| Task                  | Command                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Dev UI + API together | `npm start` (UI on :4200, proxies `/api` to :3000)                                                  |
| UI only / API only    | `npm run start:frontend` / `npm run start:api`                                                      |
| Frontend unit tests   | `npm run test:ci` (`ng test`, Vitest + jsdom)                                                       |
| Single frontend spec  | `npx ng test --watch=false --include src/shared/engine/engine.spec.ts`                              |
| Server tests          | `npm run test:server`                                                                               |
| Single server spec    | `npx vitest run -c vitest.server.config.ts src/server/forms/form.service.spec.ts`                   |
| E2E (3 browsers)      | `npm run e2e` (Playwright starts the API + UI servers itself)                                       |
| Single E2E spec       | `npx playwright test e2e/runner.spec.ts --project=chromium`                                         |
| Coverage              | `npx ng test --watch=false --coverage` (thresholds in `angular.json`)                               |
| Migrations            | `npm run migration:run` / `migration:revert` / `migration:generate -- src/server/migrations/<Name>` |
| Full gate             | `npm run check` (lint, format:check, typecheck, typecheck:server, test:ci, test:server, build)      |

Which runner picks up which spec: `ng test` runs every `src/**/*.spec.ts` **except** `src/server/**`
(so `src/shared` specs run here). `test:server` runs only `src/server/**/*.spec.ts`. Server specs are
typechecked by `typecheck:server`, not `typecheck`.

## Layout

```
src/frontend/app/   Angular SPA: builder/, runner/, results/, landing/, login/, account/, core/
src/shared/         Code used by BOTH frontend and server (import via the `@shared/*` alias)
  model/            form schema, conditions, values, submissions, validation, ids
  engine/           expression parser/evaluator, templates, condition engine, validators (no Angular)
  schemas/          zod schemas — the single source of truth for validating API input
src/server/         Nest app: auth/, forms/, user/, health/, common/ (pipe + exception filter),
                    entities/, migrations/, database.module.ts
e2e/                Playwright specs; helpers.ts / db.ts have seed + cleanup helpers
scripts/            copy-icons.mjs (icon bundling), build-server.mjs (ncc bundle)
```

## Architecture

- **Shared engine/model.** Conditions, expressions, defaults, calculations and validation live in
  `src/shared/engine` + `src/shared/model` and are used by both sides: the runner evaluates them
  live, and the server re-validates submissions with the same code and builds the full submission
  object itself. Changes to form semantics therefore usually belong in `src/shared`, with specs
  beside them.
- **Frontend state** (`core/state`): signal stores. `DesignerStore` owns the `FormDefinition` being
  edited (pages, element insert/move/duplicate/remove, selection). `RunnerStore` builds per-page
  view refs, evaluates conditions, handles drafts (`runner-draft.ts`) and submit. `api-client.ts`
  attaches the bearer token (sessionStorage); `api-cache.ts` keeps short-lived cached GET
  responses in localStorage (`formmaker.cache.*`). There is no offline write mode.
- **Frontend conventions.** Standalone components, zoneless, signals, no NgModules. Routes in
  `app.routes.ts`: `/runner/:id` and `/login` are public; everything else uses `authGuard`.
- **Server.** `createApp()` in `src/server/app.ts` builds an Express instance (CORS, 50 MB JSON body
  parsing, rate limit, SPA static fallback) and wraps it in Nest (`AppModule`, global prefix `api`).
  Nest's body parser is disabled. Anything registered on Express before `nest.init()` runs ahead of
  Nest routes. `index.ts` only listens.
- **Auth.** Users with roles (`admin` / `editor`). Durable sessions with hashed bearer tokens
  and a 24h TTL. Forms are scoped to their owner, and admins see everything. The first start
  creates `admin@formmaker.local` (override with `FORMMAKER_ADMIN_EMAIL`) with the password from
  `FORMMAKER_PASSWORD`, or a random one printed to the log if unset or shorter than 8 characters. Protect Nest routes with `@UseGuards(AuthGuard)` + `@CurrentUser()`.

## Server rules

- **Always `@Inject(Token)` in constructors.** tsx and vitest (esbuild/oxc) emit no decorator metadata.
- Validate input with `@Body(new ZodValidationPipe(schema))` using `src/shared/schemas`, not
  class-validator.
- Error contract is `{ error, details? }`. Throw Nest exceptions with an object body
  (`new ConflictException({ error: '...' })`). `ApiExceptionFilter` formats the rest. Status
  codes are part of the contract (`@HttpCode(200)` login, 204 register, 204 logout).
- Schema changes go **only** through TypeORM migrations (never `synchronize`). Edit the entity,
  generate, review the SQL, and **register the migration in `src/server/migrations/index.ts`**
  (the server is bundled with ncc, so there is no runtime globbing). Keep migrations dialect-neutral
  (TypeORM `Table` API) because they must work on both SQLite and MySQL. Pending migrations run on
  startup unless `TYPEORM_MIGRATIONS_RUN=false`.

## Frontend rules

- **No hardcoded UI strings.** Use `i18n.t('key', params?)` and add the key to both `en` and `de` in
  `core/i18n/translations.ts`. Model-level default labels use keys too.
- **Icons are bundled SVGs.** A new `mat-icon svgIcon="..."` must be added to
  `scripts/copy-icons.mjs` and regenerated with `npm run icons:copy` (manifest:
  `core/icon-names.ts`). This runs automatically on `prestart` and `prebuild`.
- **Styles use nested SCSS.** Nest child selectors, `&:` states and `@media` queries inside their
  parent block instead of writing flat `.parent .child` rules.
- Labels/titles and descriptions render Markdown via the `markdown` pipe: inline `| markdown` for
  labels, block `| markdown: true` for descriptions.
- Exports: add a channel to `EXPORT_CHANNELS` (`core/export/channels.ts`) to get a results-toolbar
  button. CSV/Excel cell text comes from `formatValueForExport(value)` → `{ text, additional? }`.
  The PDF receipt and the results summary both render blocks from `buildReceipt`
  (`core/export/receipt.ts`).

## E2E

- `e2e/a11y.spec.ts` runs axe over every page and its notable states (dialogs,
  validation errors, results with submissions, …). When you add a feature (with an e2e test) that
  introduces a new page, dialog or UI state, add a matching case to `a11y.spec.ts`.

## Code conventions

Strict TypeScript: no `any` (use `unknown` + guards), no unused imports. Don't leave `console.log`
in app code. Run `npm run format` (Prettier) before committing.
