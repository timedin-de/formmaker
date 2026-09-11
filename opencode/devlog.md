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

## Ongoing issues / choices
- Expression `+` is string-concat when either side is a string, else numeric (documented, tested).
- Unknown identifiers evaluate to `null` (calculation-friendly).
- Hidden fields keep their raw value in evaluation context (so gating works) but are excluded
  from submissions.