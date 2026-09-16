# FormMaker

A visual, no-code style form builder with a live **designer**, a **runner** for respondents, and a **results** view with spreadsheets. Design a form, preview it exactly as respondents see it, share a link, and collect submissions — served by a small Express API.

Built with Angular 22 + Angular Material 22 on the frontend and a TypeScript Express backend with TypeORM persistence.

## What it can do

- **Visual form designer** — build multi-page forms by dragging nothing at all: pick a field from the palette and tune it in the property panel.
- **Two editing layouts** — the classic split view (palette / canvas / property panel) or a stacked **WYSIWYG** view where fields render exactly as respondents will see them, with the property editor inline under each selected field.
- **16 field types**
  - Basic (10): short text, long text, number, yes/no, single choice, dropdown, multiple choice, date, time, date-time
  - Advanced (3): rating scale, file upload, signature pad
  - Layout (3): section heading, question group, text display
- **Live runner** — respondents fill the form with real Material controls, page-by-page navigation, and validation with per-field messages.
- **Share links** — copy a public `/runner/:id` link straight from the landing page; after submit, respondents get a thank-you screen with a **downloadable PDF receipt**.
- **Results** — every submission stored server-side; view them side by side and export to **CSV**, **Excel (xlsx)**, or a **PDF summary** (or email a summary), and delete single submissions or clear all.

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
- **Draft autosave** — a respondent's answers are restored if they reload, cleared on submit or reset.
- **Import / export** — save forms to JSON and re-import them (with schema validation) to continue editing.
- **i18n** — the whole UI ships in English and German (auto-detected, or toggled manually).
- **Persistence** — forms, submissions, users, and durable sessions are stored server-side through TypeORM. SQLite is the default; MySQL is supported through configuration. The browser keeps short-lived cached API responses and local respondent drafts to reduce repeated requests; it never treats that cache as an offline write store.

## Backend & auth

The Express API (`server/`) exposes:

- `POST /api/auth/login`, `POST /api/auth/register` — email/password login and self-registration. New registrations receive the `editor` role; sessions are durable, expire after 24 hours, and bearer tokens are stored as hashes. Omitting `email` keeps the existing single-password login compatible by selecting the initial admin account.
- `GET/POST /api/users`, `PATCH /api/users/:id/password` — administrator-only user provisioning and password management. Forms are isolated by owner; admins retain access to all forms.
- `GET /api/forms`, `GET/POST/DELETE /api/forms/:id` — form CRUD.
- `GET/POST/DELETE /api/forms/:id/submissions[ /:submissionId]` — submissions per form.
- `GET /api/health` — liveness probe.

The first start creates `admin@formmaker.local` with password `formmaker`. Set `FORMMAKER_ADMIN_EMAIL` and `FORMMAKER_PASSWORD` before the first start to choose secure bootstrap credentials.

SQLite is used by default at `server/data/formmaker.sqlite`. To use MySQL instead, set `DATABASE_PROVIDER=mysql` and `DATABASE_URL=mysql://user:password@host:3306/formmaker`. For controlled production schema rollouts, set `TYPEORM_SYNCHRONIZE=false` after applying the corresponding TypeORM migration.

## Tech stack

- Angular 22 (zoneless change detection, signals, new control flow, lazy routes)
- Angular Material 22 (Theming from Material 3 design tokens)
- Express 5 + `tsx` (TypeScript server with `cors`)
- `signature_pad` for capturing signatures
- `exceljs` for `.xlsx` export, `jspdf` for receipt/summary PDFs
- `markdown-it` for Markdown rendering of titles and descriptions
- Vitest + Playwright (3 browsers) for tests
- Docker (single-container deploy) optional

## Getting started

Requires Node ≥ 24.15 (see the wrapper notes in `AGENTS.md` if you run into CLI version errors).

```bash
npm install
npm start        # dev UI on http://localhost:4200 (proxies /api → :3000)
npm run start:api   # Express API on http://localhost:3000
npm run start:all   # both at once
```

Other scripts:

```bash
npm run lint        # ESLint
npm run typecheck   # tsc for app + specs
npm run typecheck:server  # tsc for the Express API
npm run test:ci     # unit tests (Vitest)
npm run e2e         # Playwright end-to-end tests (chromium/firefox/webkit)
npm run build       # production build into dist/
npm run check       # full gate: lint + format:check + typecheck (+server) + tests + build
```

## Structure

```
src/app/
  core/
    model/        # data model: forms, fields, values, validation
    engine/       # evaluation: values, conditions, validations, calculations, templates
    state/        # signal stores + FormsRepository (API client with offline fallback)
    export/       # JSON schema, CSV/Excel/PDF exporters, mail channel, file helpers
    auth/         # login service + route guard
    i18n/         # en/de translations + reactive I18nService
  landing/        # form list, share links, import, delete
  builder/        # designer UI: canvas, palette, property panel, condition editor
  runner/         # respondent view (incl. signature pad, PDF receipt, draft autosave)
  results/        # submissions & CSV/Excel/PDF/mail export
  login/          # password login screen
  shared/model/   # element definitions, conditions, validation, values, submission
server/           # Express API: TypeORM datasource, entities, auth, user/form/submission endpoints
e2e/              # Playwright specs + coverage collection
deploy/           # optional nginx reverse-proxy config
```

## Deployment

The simplest option is the included single-container Docker setup:

```bash
FORMMAKER_PASSWORD=secret docker compose up -d --build
```

The container serves both the built Angular SPA (with SPA fallback) and the API on port 3000; persist the SQLite database through a mounted volume, or configure MySQL via the environment variables above. Alternatively, serve the static `dist/` build with **nginx** and reverse-proxy `/api/` to the Node backend — see `deploy/nginx/form-maker.conf`.

## Note on AI

This project was **built for the most part with AI assistance** (opencode with a large language model), including significant portions of the code, the tests, and this README. It's a working, tested mini-go-live rather than a production product — expect rough edges.
