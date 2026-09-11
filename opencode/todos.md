# Todos

:white_check_mark: done — :hourglass: in progress — :construction: pending

- [x] Decide stack & architecture, document in opencode/
- [x] Scaffold workspace with Angular 22 + Vitest + ESLint + Prettier + Material + CDK
- [x] Tooling: `check`/`format`/`typecheck` scripts; resolved Node 24.15 requirement (nvm + PATH wrappers in ~/.opencode/bin)
- [ ] Define core typed data model (form schema, conditions, calculations, piping)
- [ ] Expression engine (parser + evaluator + template piping + dependency graph) + tests
- [ ] Condition engine + calculation engine + tests
- [ ] Signal stores: DesignerStore, RunnerStore, EvaluationStore + form utils (ids, clone, UUID)
- [ ] Validation rules engine (predefined + custom) + tests
- [ ] CSV + XLSX export services + form JSON import/export + schema validation + tests
- [ ] Builder UI: palette, canvas (virtual scroll), property panel, condition editor
- [ ] Runner UI: page navigation with page logic, progress, element host, signature pad, file control
- [ ] Field controls: text, longText, number, date, time, dateTime, boolean, choice, dropdown, multiChoice, scale, file, signature, group, section
- [ ] Demo form (pipes, conditions, calcs, signature) + landing page
- [ ] Full gate: lint + format + typecheck + tests + production build green