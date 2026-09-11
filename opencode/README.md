# FormMaker — Development Docs

This folder records the development plan, decisions and progress for the project.
Per instructions, progress is documented **here**, not in chat.

## Index

- [architecture.md](./architecture.md) — stack decision, rationale, folder map, data model
- [todos.md](./todos.md) — task list with status (mirrors the session todo list)
- [devlog.md](./devlog.md) — chronological session log (what was done, decisions, failures)

## Commands

```bash
npm start          # dev server (http://localhost:4200)
npm run test:ci    # vitest unit tests, single run
npm run lint       # eslint (angular-eslint + typescript-eslint)
npm run format     # prettier --write
npm run typecheck  # strict TS check of app + spec projects
npm run check      # full gate: lint + format + typecheck + tests + production build
```
