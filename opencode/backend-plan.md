# Backend rework plan

Status: phase 1a (migrations) and 1b-i (Nest bootstrap) done. Decided 2026-10-02.

## Goals

- Trust the frontend less: the server generates IDs, validates, evaluates conditions and owns
  submission handling.
- Granular sync (per-element operations) instead of saving one whole-form document.
- Normalize questions into tables instead of one JSON `document` blob.
- New features: organizations, webhooks, email.

## Stack

| Layer      | Choice                                                                |
| ---------- | --------------------------------------------------------------------- |
| HTTP       | NestJS (Express adapter)                                              |
| Validation | zod from `src/shared/schemas` via `nestjs-zod` (no `class-validator`) |
| ORM        | TypeORM (kept; `EntitySchema`, no decorators) with migrations         |
| DB         | SQLite (dev/small) + Postgres or MySQL (prod); avoid supporting all   |
| Jobs       | DB-backed outbox (`jobs` table, `SKIP LOCKED` on Postgres); no Redis  |
| Mail       | `nodemailer`                                                          |

Alternatives considered: Fastify + type provider (leaner, less structure), Hono, Drizzle. Nest was
chosen for guards/modules (orgs), queue/event tooling (webhooks, mail) and enforced conventions.

## Target data model

```
orgs, memberships(org_id, user_id, role)
forms(id, org_id, title, status, current_version)
pages(id, form_id, position)
elements(id, form_id, page_id, parent_id, position, type, config, conditions, validation, deleted_at)
form_versions(id, form_id, number, snapshot, published_at)   -- immutable published snapshots
submissions(id, form_id, version_id, submitted_at, meta)
answers(submission_id, element_id, value)
webhook_endpoints, webhook_deliveries, jobs
```

Hybrid elements (structural columns + JSON `config`), fractional-index `position`, server-generated
UUIDv7 ids, `org_id` on forms from day one (existing `owner_id` becomes a personal org).

## Phases (each is its own small PR)

1. **Foundation** — (a) migrations ✅ · (b) Nest: (i) bootstrap around the Express app, health +
   `DatabaseModule` ✅, then port auth, users, forms/submissions one PR each · (c) move
   `core/engine` into `src/shared`.
2. **Schema split** — pages/elements/versions + data migration of existing `document` blobs, with a
   read adapter so the frontend keeps working.
3. **Operation API** — element/page create/patch/move/delete; `DesignerStore` sends intents.
4. **Trusted submissions** — server re-validates against the published version, writes `answers`.
   Ship behind a flag.
5. **Orgs** — memberships, invites, `OrgRoleGuard`, personal-org data migration.
6. **Outbox, webhooks, email** — worker, HMAC-signed retrying webhooks, mail rules.

## Rules while doing this

- Schema changes only via migrations (`AGENTS.md` → Database & migrations).
- Every phase keeps `npm run check` and the e2e suite green and the API backwards compatible until
  the frontend moves over.
