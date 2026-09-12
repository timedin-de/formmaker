# FormMaker — Development Docs

This folder records the development plan, decisions and progress for the project.
Per instructions, progress is documented **here**, not in chat.

## Index

- [architecture.md](./architecture.md) — stack decision, rationale, folder map, data model
- [todos.md](./todos.md) — task list with status (mirrors the session todo list)
- [devlog.md](./devlog.md) — chronological session log (what was done, decisions, failures)

## Commands

```bash
npm start               # dev UI server (http://localhost:4200; /api proxied to :3000)
npm run start:api       # Express API on http://localhost:3000
npm run start:all       # both at once
npm run test:ci         # vitest unit tests, single run
npm run e2e             # Playwright e2e (chromium/firefox/webkit)
npm run lint            # eslint (angular-eslint + typescript-eslint)
npm run format          # prettier --write
npm run typecheck       # strict TS check of app + spec projects
npm run typecheck:server # strict TS check of the Express API
npm run check           # full gate: lint + format + typecheck(+server) + tests + build
```

History of what changed each session: [devlog.md](./devlog.md).
