# Todos

:white_check_mark: done — :hourglass: in progress — :construction: pending

- [x] Decide stack & architecture, document in opencode/
- [x] Scaffold workspace with Angular 22 + Vitest + ESLint + Prettier + Material + CDK
- [x] Tooling: `check`/`format`/`typecheck` scripts; resolved Node 24.15 requirement (nvm + PATH wrappers in ~/.opencode/bin)
- [x] Define core typed data model (form schema, conditions, calculations, piping)
- [x] Expression engine (parser + evaluator + template piping + dependency graph) + tests
- [x] Condition engine + calculation engine + tests
- [x] Signal stores: DesignerStore, RunnerStore, EvaluationStore + form utils (ids, clone, UUID)
- [x] Validation rules engine (predefined + custom) + tests
- [x] CSV + XLSX export services + PDF receipt/summary + form JSON import/export + tests
- [x] Builder UI: palette, canvas, property panel, condition editor
- [x] Runner UI: page navigation with page logic, progress, element host, signature pad, file control
- [x] Field controls: text, longText, number, date, time, dateTime, boolean, choice, dropdown, multiChoice, scale, file, signature, group, section
- [x] Demo form (pipes, conditions, calcs, signature) + landing page
- [x] Full gate: lint + format + typecheck + tests + production build green
- [x] Auth: password login, bearer tokens, guarded editor routes
- [x] i18n: en/de dictionaries + reactive translations across the whole UI
- [x] Runner draft persistence: autosave + restore + clear on submit/reset
- [x] Runner thank-you screen: Download PDF receipt button
- [x] AGENTS.md for AI tooling (repo map, commands, conventions)
- [ ] (Optional) Retry "understand-everything" (Mor-Li) or `graftmap` MCP as a richer AGENTS alternative
- [ ] (Optional) End-to-end demo walkthrough + browser-based regression pass