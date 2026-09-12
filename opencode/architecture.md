# Architecture

## Stack decision (decided 2026-09-11)

**Recommended: Angular 22 + TypeScript strict + Vitest + ESLint (angular-eslint) + Prettier.**

The user asked whether to recommend Angular. **Yes — Angular is a strong fit here**, because:

1. **Reactive Forms** are purpose-built for exactly this domain: dynamic control creation, per-control
   value streams, and complex validation. A form builder/runner is their flagship use case.
2. **Strong typing** — Angular is all-in on TypeScript; strict mode catches schema-evolution bugs.
3. **Performance under load** — `ChangeDetectionStrategy.OnPush`, signal-based state, and the CDK
   virtual scroll viewport let us render thousands of questions/submissions cheaply.
4. **Component model** fits the classic builder layout (palette / canvas / property panel).

Chosen pieces:

| Concern            | Choice                                                                  |
| ------------------ | ----------------------------------------------------------------------- |
| Framework          | Angular 22 (standalone components, signals)                             |
| Language           | TypeScript ~6.0, full strict mode (default `ng new` config)             |
| UI kit             | Angular Material 22 + CDK (virtual scroll, overlay)                     |
| Tests              | Vitest 4 (Angular's default in v22) + jsdom + Angular Testing Library   |
| Linting            | ESLint via `@angular-eslint` (template + TS)                            |
| Formatting         | Prettier 3                                                              |
| Expression engine  | Hand-rolled recursive-descent parser + evaluator (no dep, fully tested) |
| Signature pad      | `signature_pad` 5 (canvas)                                              |
| Excel export       | `exceljs` 4                                                             |
| CSV export         | Hand-rolled serializer (escaped, RFC 4180 style) — no dep               |
| Storage (sessions) | Signal-based stores; localStorage persistence                           |

### Why hand-roll the expression engine?

Conditions, piping, dynamic defaults and calculations all need to evaluate **against field values** with
functions (`sum/avg/if/...`). A JSON-predicate DSL would be anemic; `eval` is unsafe; a dependency
(like `jexl`) bloats the bundle and is hard to type. A ~300-line parser/evaluator is fully unit-testable,
zero-dep, and gives us exact control over typing and safety (no global access, no prototype traversal).

## Folder map (`src/app/`)

```
core/
  model/        pure TypeScript types — form schema, conditions, values, submissions
  engine/       expression parser/evaluator, template piping, condition engine,
                calculation engine, dependency graph (no Angular imports where possible)
  state/        signal-based stores: DesignerStore, RunnerStore, EvaluationCache,
                FormsRepository (API client + offline fallback)
  export/       CSV + XLSX export, jsPDF summary/receipt, JSON import/export + validation
  i18n/         translations.ts (en/de) + translation.service.ts (I18nService)
  auth/         auth.service.ts + auth.guard.ts (editor routes protected)
  utils/        ids, clone, coercion helpers
builder/        designer UI: palette, canvas (virtual scroll), property panel,
                condition editor, validation editor
runner/         form filling UI: page navigation, progress, element host,
                signature pad, draft autosave + PDF receipt
landing/        form list / share / import / delete
login/          password login screen
results/        submissions viewer + CSV/Excel/PDF export
shared/         field controls (one component per question type), layout blocks,
                chip/section components, pipes
app.routes.ts   builder / runner / landing / login routes (+ authGuard)
```

## Common cross-cuts

- **i18n**: `I18nService.t(key, params?)` with `{name}` interpolation; `lang()` signal; storage key
  `formmaker.lang`; auto-detect `de`. Keys live in `core/i18n/translations.ts` (en + de) — never
  hardcode UI strings.
- **Auth**: `POST /api/auth/login` (password) → in-memory bearer token, 24 h TTL. `authGuard` on
  `/`, `/builder`, `/results/:id`; login + runner public. `FormsRepository` attaches the token from
  `formmaker.token`, offline fallback password is `formmaker`.
- **Runner drafts**: per-form `formmaker.draft.<id>` in localStorage; restored unless the form
  `version` changed; cleared on submit/reset; 300 ms debounce in `RunnerStore`.
- **Icons**: bundled SVGs via `scripts/copy-icons.mjs`; register new `svgIcon`s there and run
  `npm run icons:copy` (auto on prestart/prebuild). Manifest is generated → gitignored.
- **Verification**: `npm run check` = lint + format:check + typecheck + typecheck:server +
  test:ci + build. Always run before finishing work.

## Data model (core idea)

- `FormDefinition` = pages + settings (import/export JSON).
- `PageDefinition` = `enabledWhen` (page-level condition gating) + elements.
- `ElementDefinition` = discriminated union over question types, `group`, `section`.
  Every element: `enabledWhen` (element/group conditional visibility), `validations`,
  `defaultValue` (static | expression | fromField), `calculation` (formula for number fields),
  piped-string labels (`{{fieldId}}`).
- `Submission` = flattened field values per element id.
- Values are a reserved safe set (`string | number | boolean | string[] | FileValue[] | SignatureValue | null`).

See [src/app/core/model/form.model.ts](../src/app/core/model/form.model.ts).

## Performance strategy

- OnPush everywhere; Runner/Builder feed components via signals.
- Expression results memoized per element against a revision counter; only affected elements
  recompute on change (dependency graph from conditions/templates/calcs).
- `cdk-virtual-scroll-viewport` for the builder canvas and the runner page element list.
- `trackBy` on all lists; no array re-creation on unrelated edits.

## Testing strategy

- Core engine/store/export = plain unit tests (fast).
- Component tests via TestBed for builder & runner smoke/integration.
- A synthetic form generator (in `state`) lets us performance-test large forms.
