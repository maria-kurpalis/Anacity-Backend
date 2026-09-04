# Anacity backend

Minimal Express API using TypeScript, PostgreSQL, and Sequelize. Requires Node.js 22+ and PostgreSQL 13+ (for the built-in `gen_random_uuid()` function).

## Setup

1. Run `npm ci` to install dependencies.
2. Copy `.env.example` only if `.env` does not exist, then fill the settings listed in the root README (including NODE_ENV, PORT and DATABASE_URL). Example files contain names only.
3. Run `npm run build` and `npm run db:migrate`.
4. Run `npm run dev`.

For a disposable local database, `npm run db:reset` recreates the schema and loads development samples in one command. It refuses to run when `NODE_ENV=production`.

The server checks database connectivity before listening. It does not create the database or modify its schema. All sixteen models use `sequelize.define()` and TypeScript interfaces: Community, Unit, Resident, Admin, MoveRequest, MoveRequestDetails, Document, CommunityWorkflowConfig, RequestChecklist, RequestComment, AgentConversation, AgentAssessment, AuditLog, StatusHistory, Notification, and AgentToolExecution. Import them from `src/models` so that all associations are initialized. Cross-model imports within model files are type-only; runtime association wiring lives in `src/models/index.ts`.

## Prototype identity contract

Request reads require `X-Resident-Id` for the owning resident or `X-Admin-Id` for an admin in the request's community. Resident PATCH, submit and document writes require `X-Resident-Id`. Admin community lists/dashboards require `X-Admin-Id`; admin review reads also accept `?adminId=...`. Endpoints already accepting actor IDs in the body/query retain that contract. The frontend supplies identity headers from its email lookup result stored in sessionStorage. Include these headers when using the endpoint examples below.

`POST /api/demo/login` accepts only `{ "email": "..." }`. It trims/lowercases input, compares `lower(email)` safely in both existing tables, returns a flat safe identity object, and rejects zero matches (404) or multiple matches within/across tables (409). Validation errors return 400. Errors retain the standard success/errors envelope, with a top-level message for expected login errors. No password, token, cookie or server session is created; email knowledge is not authentication. Existing non-unique email indexes are unchanged; ambiguity is detected explicitly. See [login implementation notes](../docs/email-login.md).

These IDs are self-selected prototype identities, not authenticated credentials. Server ownership/community checks prevent a selected actor from crossing scope; authentication is still needed to prevent impersonation. Resident cancellation uses `POST /api/move-requests/:id/cancel` with `{ "residentId": "<resident-uuid>", "reason": "Plans changed." }` and atomically records history, audit and community-admin notifications.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run TypeScript with automatic restart |
| `npm run build` | Type-check and compile into `dist/` |
| `npm start` | Run the compiled server |
| `npm run db:migrate` | Apply pending compiled migrations |
| `npm run db:migrate:undo` | Roll back the most recent migration |
| `npm run db:migrate:status` | List applied and pending migrations |
| `npm run db:seed` | Apply pending development seeders after migrations |
| `npm run db:seed:undo` | Revert the latest tracked development seed |
| `npm run db:seed:status` | List applied and pending seeders |
| `npm run db:reset` | Drop/recreate all registered application tables and seed local data |
| `npm run test:schema` | Build and verify schema against `TEST_DATABASE_URL` |
| `npm run test:reset` | Verify development reset against an empty `TEST_DATABASE_URL` |
| `npm run test:api` | Verify resident MoveRequest HTTP APIs against an empty `TEST_DATABASE_URL` |
| `npm run test:admin-api` | Verify admin MoveRequest HTTP APIs against an empty `TEST_DATABASE_URL` |
| `npm run test:document-api` | Verify document HTTP APIs against an empty `TEST_DATABASE_URL` |
| `npm run test:workflow-collaboration-api` | Verify workflow config, checklist, and comment HTTP APIs against an empty `TEST_DATABASE_URL` |
| `npm run test:history-notification-api` | Verify history/audit reads and transactional database notifications |
| `npm run test:agent-api` | Verify agent APIs with a mocked AI adapter and an empty `TEST_DATABASE_URL` |
| `npm run test:dashboard-agent-history-api` | Verify dashboard aggregates, conversation pagination, shared context, and agent health |

## Structure

```text
src/
  app.ts          Express app and middleware
  server.ts       Startup and graceful shutdown
  config/         Environment validation and Sequelize connection
  controllers/    HTTP handlers
  routes/         API routes
  services/       Application logic
  models/         Typed sequelize.define() models and associations
  migrations/     Ordered schema migrations and Umzug runner
  seeders/        Shared development data, fixtures, and tracked seeder runner
  scripts/        Development-only database reset
  middleware/     Error and not-found handlers
  types/          Shared TypeScript types
  validation/     HTTP input parsing and field allowlists
```

## Health

`GET /api/health` returns HTTP 200:

```json
{"status":"ok","timestamp":"2026-09-02T00:00:00.000Z","uptime":12.34}
```

This is a process liveness check, not an ongoing database readiness check. Unknown routes return JSON 404 responses; request errors return sanitized JSON.

## Production

Build with `npm ci` and `npm run build`, then run `npm prune --omit=dev`. Apply pending migrations with `npm run db:migrate` before `npm start`. Supply `NODE_ENV=production`, `PORT`, and `DATABASE_URL` through the deployment environment. Keep `.env` out of version control. Set `DB_SSL=true` when the database requires TLS; certificates are verified. For private certificate authorities, configure Node's `NODE_EXTRA_CA_CERTS` with your CA file.

SIGINT and SIGTERM stop accepting requests, drain active requests, and close the database pool, with a 10-second shutdown deadline. Use migrations for future schema changes; startup intentionally does not call `sequelize.sync()`.

## Schema decisions

- Core tables are `communities`, `units`, `residents`, `admins`, and `move_requests`; columns retain the supplied camelCase names.
- All IDs are UUIDs, generated by Sequelize on model creation or by PostgreSQL for direct inserts. Core fields are required except `requestedDate`, `requestedTimeSlot`, `submittedAt`, `reviewedBy`, `reviewedAt`, and `rejectionReason`. Schedule fields may remain null while a draft is being filled in.
- `isActive` defaults to `true`; move request status defaults to `DRAFT`. Resident type, admin role, and request type must be supplied. Enum values are enforced by PostgreSQL.
- `requestedDate` is a PostgreSQL `DATE`, represented as a `YYYY-MM-DD` string in TypeScript. `requestedTimeSlot` is a string up to 100 characters. `floor` is an integer; `tower` is a required string. Review/submission timestamps are timezone-aware timestamps.
- Community codes are unique. Unit numbers are unique within a community and tower. Resident/admin emails have community-scoped lookup indexes but are not assumed to be unique.
- Every foreign key has an index, either alone or as the leading columns of a composite index. Requests have a `(communityId, status, requestedDate)` index for community queues.
- Composite foreign keys require residents to belong to their unit's community and requests to match their resident's community and unit. Reviewers must belong to the request's community. These constraints are migration-owned because Sequelize associations only describe single-column references. Changing a resident's community/unit while requests reference that membership is rejected.
- Required references use `ON DELETE RESTRICT`. Deleting a reviewing admin sets `reviewedBy` to null and preserves the request and its review timestamp. Prefer `isActive` for deactivation when reviewer identity must be retained. The admin association is named `reviewer`; its inverse is `reviewedMoveRequests`.
- Sequelize maintains `updatedAt` on ORM updates. Direct SQL writers must update it explicitly; migrations do not install timestamp triggers.

## Request details and workflow tables

Migrations `202609020006` through `202609020010` add the following tables without modifying the original migrations:

| Model / table | Associations and constraints |
| --- | --- |
| MoveRequestDetails / `move_request_details` | `MoveRequest.details` (has one), inverse `moveRequest`; unique `moveRequestId` enforces at most one details row per request. Detail fields may be null in drafts; supplied vehicle/occupant counts are nonnegative integers. |
| Document / `documents` | `MoveRequest.documents`, inverse `moveRequest`; `Admin.verifiedDocuments`, inverse `verifier`. Indexes cover request/status and verifier lookups. |
| CommunityWorkflowConfig / `community_workflow_configs` | `Community.workflowConfigs`, inverse `community`; unique `(communityId, requestType)` permits one configuration for each MOVE_IN/MOVE_OUT type per community. |
| RequestChecklist / `request_checklists` | `MoveRequest.checklistItems`, inverse `moveRequest`; unique `(moveRequestId, key)`, plus request/status and completer lookup indexes. |
| RequestComment / `request_comments` | `MoveRequest.comments`, inverse `moveRequest`; request/creation-time and author lookup indexes. |

`vehicleDetails`, `requiredFields`, `requiredDocuments`, `allowedDays`, and `allowedTimeSlots` use PostgreSQL JSONB. The shared `JsonData` TypeScript type supports objects and arrays with nested JSON values. Workflow configuration fields must be supplied; `vehicleDetails` may be null in incomplete drafts. The submission API's configuration format is documented below. JSONB content indexes are deferred until query patterns are defined.

Document and checklist status default to `PENDING`. `uploadedAt` defaults to the current timestamp in both Sequelize and PostgreSQL. Detail fields (`movingCompany`, `vehicleCount`, `vehicleDetails`, `occupantCount`, `notes`) may be null; configured completeness is checked on submission. `instructions` remains required. The other nullable extension fields are `verifiedBy`, `verifiedAt`, `completedByType`, `completedById`, `completedAt`, and `authorId`.

New parent foreign keys follow `ON DELETE RESTRICT`. Deleting an admin sets document `verifiedBy` to null and retains `verifiedAt`. `completedById` and `authorId` are nullable UUIDs representing polymorphic actors, so they intentionally have no foreign key to a single table. Services enforce actor existence, permissions, document verifier community access, and workflow transitions.

## Agent, tracking, and notification tables

Migrations `202609030001` through `202609030006` add six tables. Every association below has a `moveRequest` inverse; all request references have a `(moveRequestId, createdAt)` index.

| Model / table | MoveRequest association | Additional indexes |
| --- | --- | --- |
| AgentConversation / `agent_conversations` | `agentConversations` | `(role, createdAt)` |
| AgentAssessment / `agent_assessments` | `agentAssessments` | `(recommendation, createdAt)` |
| AuditLog / `audit_logs` | `auditLogs` | `(actorType, actorId, createdAt)`, `createdAt` |
| StatusHistory / `status_histories` | `statusHistories` | `(changedByType, changedById, createdAt)`, `(toStatus, createdAt)` |
| Notification / `notifications` | `notifications` | `(recipientType, recipientId, createdAt)`, `(status, createdAt)` |
| AgentToolExecution / `agent_tool_executions` | `agentToolExecutions` | `(status, createdAt)`, `(toolName, createdAt)` |

AuditLog, Notification, and AgentToolExecution allow a null `moveRequestId` for records not tied to a request. Required fields and nullable fields follow their model definitions. Actor and recipient IDs are UUIDs with no single-table foreign key because their target depends on the actor/recipient type. The database enforces any supplied request reference, using `ON DELETE RESTRICT` to preserve related records.

AgentConversation metadata, AgentAssessment issues, AuditLog snapshots/metadata, and AgentToolExecution input/output use nullable JSONB. Their `JsonValue` typing permits nested objects, arrays, scalars, and null; this allows snapshots such as a status string or a tool's boolean result. Assessment `confidence` is a nullable floating-point number with no assumed scoring range. There is no unique request constraint on assessments, so successive assessments retain their history. Notifications default to `PENDING`; `sentAt` is nullable and supplied explicitly when sent.

AuditLog, StatusHistory, and AgentToolExecution have `createdAt` only (`updatedAt: false`). AuditLog and StatusHistory are append-only: migration-owned PostgreSQL triggers reject UPDATE, DELETE, and TRUNCATE, including ORM and bulk writes. Insert a new record to describe a correction. Their request foreign keys use `ON UPDATE RESTRICT`, so changing a request ID cannot rewrite historical links. `fromStatus` and `toStatus` use the same enum values as MoveRequest status, with only `fromStatus` nullable. Agent recommendations never trigger workflow status transitions, and notifications are stored without external dispatch.

Rollback deliberately drops these tables, their enum types, and the audit/status trigger functions. Trigger enforcement uses PostgreSQL's [statement-level trigger support](https://www.postgresql.org/docs/current/sql-createtrigger.html).

## Migrations and verification

Migrations are the production schema source of truth. They contain their own historical enum values and never import model definitions. Each migration runs in a transaction; rollback removes tables in reverse dependency order and cleans up their PostgreSQL enum types. Umzug records applied files in `SequelizeMeta`. The only application-schema `sequelize.sync({ force: true })` call is in the explicitly development-only reset script.

Run `npm run build` after changing migrations and before any migration command. Execute migrations from a single deployment job at a time. `db:migrate:undo` drops the last migration's table and its data; use it only when rollback is intended.

For verification, set `TEST_DATABASE_URL` in the process environment to a dedicated empty PostgreSQL database and run `npm run test:schema`. The test refuses databases that already contain tables, then creates and removes its test schema. It checks upgrades through the five-table and ten-table schema versions with existing data, staged rollback, full rollback/reapplication, all sixteen models' column/index parity, associations, JSONB round trips, enums, defaults, uniqueness, foreign keys, count checks, and deletion rules. Tracking tests additionally cover nullable request references, assessment history, createdAt-only records, notification updates, append-only enforcement through ORM/bulk/upsert/raw SQL, and trigger cleanup on rollback. `DB_SSL` applies to the test connection too.

## Development sample data

To preserve a migration-created schema and load samples separately:

```sh
npm run build
npm run db:migrate
npm run db:seed
```

The seed creates 30 application rows: two communities, six units, four residents (one owner and one tenant per community), two admins, four workflow configurations, three move requests, three details rows, and six checklist items. Emails use the reserved `.test` domain and all identities/contact details are sample data.

| Community | Units | Residents | Admin |
| --- | --- | --- | --- |
| Green Heights (`GREEN_HEIGHTS`) | A-101, A-102, B-201 | Ananya Rao (OWNER, A-101), Rohan Mehta (TENANT, A-102) | Meera Desai (ADMIN) |
| Marina Residence (`MARINA_RESIDENCE`) | M-101, M-102, M-201 | Kavya Nair (TENANT, M-101), Arjun Iyer (OWNER, M-201) | Vikram Shah (ADMIN) |

Both communities have the requested MOVE_IN/MOVE_OUT JSONB configuration. The samples are a DRAFT move-in for Ananya, a SUBMITTED move-out for Rohan, and an APPROVED move-in for Kavya. Dates fall on the next Monday, Tuesday, and Wednesday respectively, using each community's approved time slots. Submission/review timestamps and the move-details/admin-review checklist entries match the sample state. Document uploads can be added during local testing.

Seed implementation lives in `src/seeders/development-data.ts`, with fixtures in `src/seeders/fixtures/local-workflow.ts`. The Umzug seeder and reset script both call `seedDevelopmentData()`. Seed history uses `SequelizeSeedMeta`, separate from migration history; this is bookkeeping, not an additional application model. Repeating `db:seed` skips an already applied seed.

Apply/revert are transactional. Stable generated primary keys identify seed-owned rows; foreign keys come from actual community/unit/resident/admin lookups. An existing sample community code causes the seed to stop without overwriting it. `db:seed:undo` removes only seed-owned rows in reverse dependency order. If newly created records reference sample rows, revert refuses without deleting those records or bypassing immutable history. Revert seeds before rolling back their schema migrations.

## One-command local reset

```sh
npm run db:reset
```

The command runs `tsx src/scripts/resetDatabase.ts` using the existing environment configuration and Sequelize connection. It checks `NODE_ENV` before importing the connection, initializes all model associations, connects, and drops/recreates registered tables with `sync({ force: true })`. It then restores the migration-owned SQL defaults, composite foreign keys, count checks, and append-only triggers before loading the same development seed data. Existing models and their schema definitions are unchanged; historical constraint DDL is shared from `src/migrations/support/initial-constraints.ts`.

Reset deletes existing application data, including audit/status history, by dropping the tables. It clears stale migration history and records the development seed as applied. It does not mark migration files as executed: use the reset command for this disposable database, and a separate migration-created database to test migration execution. Running `db:seed` immediately after reset is a no-op; after reverting its seed, use `db:reset` again to restore the local samples.

The script closes the connection in `finally`, exits nonzero on errors, and prints:

```text
Connecting to database...
Dropping and recreating tables...
Database schema created.
Seeding development data...
Seed data created.
Database reset completed successfully.
```

`npm run test:schema` also verifies seed contents, repeat execution, scoped revert, and collision/dependency protection. `npm run test:reset` uses a dedicated empty `TEST_DATABASE_URL` and tests the production guard, reset over a populated migrated database, seed contents, preserved constraints/defaults, and connection cleanup on success and failure. These tests remove the data they create.

## Resident MoveRequest APIs

Build and apply migration `202609030007-allow-incomplete-drafts` before using these APIs:

```sh
npm run build
npm run db:migrate
npm run dev
```

For a disposable database created with the sync-based reset, run `npm run db:reset` to recreate the latest schema. The new migration permits incomplete schedules and details instead of inventing dates or placeholder values. Its rollback refuses while null values remain and does not fill in or delete drafts.

All IDs are UUID strings, including `residentId`; numeric values such as `1` are rejected. Find development resident IDs in the database, for example `SELECT id, email FROM residents;`, or use the development identity selector. Ownership is checked through the prototype identity contract above. Submission attributes the action to the request's stored resident ID.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/move-requests` | Create a DRAFT from `residentId` and `type`; derive community/unit from Resident. Returns 201. |
| GET | `/api/residents/:residentId/move-requests` | List the resident's requests newest first, with basic community/unit fields. Returns 200, including an empty array for a resident with no requests. |
| GET | `/api/move-requests/:id` | Return the request with `resident`, `community`, `unit`, `details`, `documents`, `checklistItems`, `comments`, and `statusHistories`. |
| PATCH | `/api/move-requests/:id` | Update schedule and/or details for DRAFT or NEEDS_CHANGES requests. Create the details row on its first edit. |
| POST | `/api/move-requests/:id/submit` | Validate the current community/type config and atomically update status, submission time, status history, and audit log. No body is required. |

Success responses are `{ "success": true, "data": ... }`, where `data` is a request or a list of requests. Request bodies must be JSON objects; unsupported fields are rejected. Create accepts only:

```json
{
  "residentId": "<resident-uuid>",
  "type": "MOVE_IN"
}
```

PATCH accepts the following fields at the top level. Supply any subset; omitted values remain unchanged, and explicit null clears a draft field:

```json
{
  "requestedDate": "2026-09-07",
  "requestedTimeSlot": "09:00-12:00",
  "vehicleCount": 1,
  "vehicleDetails": [{ "vehicleType": "SMALL_TRUCK", "registrationNumber": "KA-01-DE-1234" }],
  "occupantCount": 2,
  "notes": "Please reserve the service lift."
}
```

IDs, `type`, `status`, and review fields cannot be changed through PATCH. Dates must be real calendar dates in `YYYY-MM-DD` format. Slots use increasing 24-hour `HH:mm-HH:mm` ranges. Counts must be nonnegative PostgreSQL integers. Notes are trimmed; vehicle details accept JSON objects/arrays. No past-date rule is imposed. The nullable movingCompany database column remains historical only; it is no longer collected or accepted by request PATCH/agent updates. The data-only retirement migration removes it and TENANCY_AGREEMENT from existing required arrays without deleting historical records.

Submission requirements are read from `CommunityWorkflowConfig` on every attempt:

- `requiredFields`: an array containing any of the six editable field names above. Null, blank text, and empty JSON arrays/objects count as missing; numeric zero is present.
- `requiredDocuments`: an array of document-type strings. Each type must have an existing record for this request, a nonempty `fileUrl`, and PENDING or VERIFIED status. REJECTED records do not qualify. This API does not upload or fetch files.
- `allowedDays`: an array of uppercase English weekdays, such as `MONDAY`. A supplied date's calendar weekday must be in the list.
- `allowedTimeSlots`: an array of `{ "start": "09:00", "end": "12:00" }` objects. A supplied slot must exactly match one configured range. Empty day/slot lists allow no supplied schedule values; omitted schedule fields are only required when listed in `requiredFields`.

Missing configuration returns 409. Unsupported fields or malformed configuration fail closed with a structured 500 response. Requirements do not depend on hardcoded community names or codes.

Validation failures return 422 with all applicable field errors:

```json
{
  "success": false,
  "errors": [
    { "field": "vehicleCount", "message": "Vehicle count is required." },
    { "field": "documents.IDENTITY_DOCUMENT", "message": "Upload a non-rejected IDENTITY_DOCUMENT document." }
  ]
}
```

Malformed input returns 400; missing residents/requests return 404; attempts to edit or submit other statuses return 409. Unexpected errors return a sanitized 500 response without database details. Successful submit and resubmit lock the request row and create a RESIDENT StatusHistory entry plus a `MOVE_REQUEST_SUBMITTED` AuditLog entry. A failure in any write rolls back all three changes. Concurrent PATCH/submit operations acquire the same request lock, and repeated submission after success returns 409.

`npm run test:api` requires a dedicated empty `TEST_DATABASE_URL`. It exercises all five endpoints, partial drafts, protected fields, both communities' requirements, live configuration changes, document status, schedules, resubmission, migration rollback protection, and a forced audit-write failure.

## Admin MoveRequest APIs

These endpoints use the existing schema and need no additional migration. IDs are UUID strings, including `adminId`; obtain development admin IDs with `SELECT id, name, "communityId" FROM admins;`. Reads require the selected admin identity as described above; writes accept the supplied admin ID and check that the admin exists and belongs to the request's community. This membership check does not authenticate the caller.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/admin/communities/:communityId/move-requests` | List only this community's requests, newest first, with `resident`, `unit`, and `details`. |
| GET | `/api/admin/move-requests/:id` | Return the full resident detail response plus `workflowConfig` for this request's community and type. |
| POST | `/api/admin/move-requests/:id/review` | Start review of a SUBMITTED request. Body: `adminId`. |
| POST | `/api/admin/move-requests/:id/approve` | Approve an UNDER_REVIEW request. Body: `adminId` and optional `comment`. |
| POST | `/api/admin/move-requests/:id/request-changes` | Change an UNDER_REVIEW request to NEEDS_CHANGES. Body: `adminId` and required `reason`. |
| POST | `/api/admin/move-requests/:id/reject` | Reject an UNDER_REVIEW request and store `rejectionReason`. Body: `adminId` and required `reason`. |

The community list accepts optional `status`, `type` (`MOVE_IN`/`MOVE_OUT`), and `residentId` filters together, for example `?status=SUBMITTED&type=MOVE_OUT&residentId=<resident-uuid>`. Invalid, repeated, or unsupported query parameters return 400. A resident filter from another community returns an empty list. A missing community returns 404. Missing workflow configuration appears as `workflowConfig: null` in the review response; the community/type lookup uses the current stored configuration.

All successful admin endpoints return 200 with `{ "success": true, "data": ... }`. Action bodies are strict JSON objects; arbitrary status, review, identity, and other unsupported fields are rejected. Reason/comment strings are trimmed; a supplied reason or comment must be nonempty text. Review accepts:

```json
{ "adminId": "<admin-uuid>" }
```

Approval accepts:

```json
{ "adminId": "<admin-uuid>", "comment": "All requirements verified." }
```

Request-changes and rejection accept:

```json
{ "adminId": "<admin-uuid>", "reason": "Please upload the correct identity document." }
```

`src/services/move-request-state.service.ts` is the shared transition validator used by resident submission and all admin actions:

| Action | Allowed current status | Next status |
| --- | --- | --- |
| Resident submit/resubmit | DRAFT, NEEDS_CHANGES | SUBMITTED |
| Admin review | SUBMITTED | UNDER_REVIEW |
| Admin approve | UNDER_REVIEW | APPROVED |
| Admin request changes | UNDER_REVIEW | NEEDS_CHANGES |
| Admin reject | UNDER_REVIEW | REJECTED |

A resubmitted request must start review again before a decision. DRAFT, NEEDS_CHANGES, and terminal requests cannot receive admin decisions directly. Repeating an action after it succeeds returns an invalid-transition error. Completion is APPROVED → COMPLETED; resident cancellation is permitted from DRAFT, SUBMITTED and NEEDS_CHANGES.

Each admin action locks the request row, validates the admin's community and transition, then updates `status`, `reviewedBy`, and `reviewedAt`. Review fields identify the admin who performed the latest review action. The same transaction creates an ADMIN StatusHistory and AuditLog. Request-changes/rejection also create an ADMIN RequestComment containing the reason; approval creates one only if a comment was supplied. Any failed write rolls back every change. Resident PATCH/submit and admin actions use the same parent-row lock.

Audit actions are `MOVE_REQUEST_REVIEW_STARTED`, `MOVE_REQUEST_APPROVED`, `MOVE_REQUEST_CHANGES_REQUESTED`, and `MOVE_REQUEST_REJECTED`. Logs preserve the previous and new status/review values, the admin ID, and any comment. Community-specific submission requirements continue to come from CommunityWorkflowConfig through the resident submission service; admin decisions do not introduce additional community rules.

Admin errors use the existing `{ "success": false, "errors": [{ "field": "...", "message": "..." }] }` shape: 400 for invalid input/transitions, 404 for missing requests/admins/communities, and 403 when the admin belongs to another community. Resident status conflicts continue to return 409.

`npm run test:admin-api` requires a dedicated empty `TEST_DATABASE_URL`. It applies migrations and seeds, exercises all six endpoints over HTTP, checks filters and community isolation, verifies all status pairs, runs the resident edit/resubmit/review cycle, and forces an audit-write failure for each admin action to verify atomic rollback. It removes the data it creates. Authentication, external notification delivery, frontend, and storage upload remain outside these APIs.

## MoveRequest document APIs

These APIs use the existing Document, AuditLog, and RequestComment models; no schema migration is needed. All path IDs and `adminId` are UUID strings. No files are uploaded, fetched, inspected, or deleted from storage: `fileUrl` is stored as a trimmed, nonempty string. Send the literal URL string, without Markdown link syntax.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/move-requests/:id/documents` | Add a PENDING document with a new `uploadedAt`. Returns 201. |
| GET | `/api/move-requests/:id/documents` | List only this request's documents by `uploadedAt` descending, then `createdAt` and ID descending. Replacements appear with the newest uploads. |
| PATCH | `/api/move-requests/:id/documents/:documentId` | Replace `fileUrl`, reset status to PENDING, clear `verifiedBy`/`verifiedAt`, and refresh `uploadedAt`. |
| DELETE | `/api/move-requests/:id/documents/:documentId` | Delete the document record and preserve its previous values in the audit log. |
| POST | `/api/admin/move-requests/:id/documents/:documentId/verify` | Mark the document VERIFIED and record the reviewing admin and time. |
| POST | `/api/admin/move-requests/:id/documents/:documentId/reject` | Mark the document REJECTED, record the reviewing admin and time, and store the reason in audit metadata and an ADMIN RequestComment. |

Add accepts only:

```json
{
  "documentType": "IDENTITY_DOCUMENT",
  "fileUrl": "https://example.com/file.pdf"
}
```

`documentType` is trimmed, nonempty text of at most 100 characters. It is not an enum or a hardcoded allowlist; custom community types are accepted. Required-document checks continue to use the current CommunityWorkflowConfig during submission. Multiple documents of the same type are allowed.

PATCH accepts only `fileUrl`:

```json
{ "fileUrl": "https://example.com/new-file.pdf" }
```

DELETE needs no body. Verify accepts only `{ "adminId": "<admin-uuid>" }`. Reject requires nonempty reason text:

```json
{ "adminId": "<admin-uuid>", "reason": "Document is unclear." }
```

All mutations validate that the request exists. Document-specific operations look up the document within the supplied request and return 404 for mismatched or missing records. Resident add, replace, and delete are allowed only in DRAFT or NEEDS_CHANGES; other states return 409. Verification/rejection require an existing admin in the request's community (404 if missing, 403 for a community mismatch). Document review is independent of MoveRequest status and never changes the request status. Either review decision sets `verifiedBy` and `verifiedAt` to the latest reviewing admin and timestamp; replacement clears them. Rejecting a document does not automatically request changes to the MoveRequest: use the existing admin request-changes endpoint for that transition.

Every mutation uses a transaction, including resident operations, so document changes and their audit records succeed or fail together. Rejection's comment participates in the same transaction. Request/document mutations acquire the shared parent-request lock before changing documents, serializing them with submission, resident edits, and admin request actions. Audit actions are `DOCUMENT_ADDED`, `DOCUMENT_UPDATED`, `DOCUMENT_DELETED`, `DOCUMENT_VERIFIED`, and `DOCUMENT_REJECTED`. Each log identifies the document in metadata and preserves relevant before/after values. Rejection metadata also contains `reason`. Resident actions use the request's stored resident ID; admin actions use the validated supplied admin ID. Authentication is not implemented.

Except for add (201), successful endpoints return 200 with `{ "success": true, "data": ... }`. Data is the document, the document list, or `{ "id": "<deleted-document-uuid>" }` after deletion. A request with no documents returns an empty list. Invalid IDs, blank/non-string fields, and unsupported fields return structured 400 errors. Clients cannot set status, reviewer fields, timestamps, document ownership, or change `documentType` through PATCH.

Run `npm run test:document-api` with a dedicated empty `TEST_DATABASE_URL`. The suite applies migrations and seeds, exercises all six endpoints, validates request/admin scoping and edit-state guards, checks verification resets and audit/comment contents, injects an audit-write failure for every mutation, and tests configurable required documents through submission/resubmission. It removes the test data it creates.

## Community workflow configuration APIs

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/communities/:communityId/workflow-config/:requestType` | Return the configuration for this community and MOVE_IN/MOVE_OUT, or 404 if not configured. |
| PUT | `/api/admin/communities/:communityId/workflow-config/:requestType` | Create or fully replace the configuration after validating the admin belongs to the community. |

Both return 200 with `{ "success": true, "data": ... }`. Use UUID strings for community/admin IDs. PUT requires all five configuration fields plus `adminId`; omitted fields return 400 rather than silently preserving or clearing old rules. Example:

```json
{
  "adminId": "<admin-uuid>",
  "requiredFields": ["requestedDate", "requestedTimeSlot", "vehicleCount"],
  "requiredDocuments": ["IDENTITY_DOCUMENT"],
  "allowedDays": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  "allowedTimeSlots": [{ "start": "09:00", "end": "12:00" }],
  "instructions": "Moving is allowed only during approved timings."
}
```

Configuration writes and resident submission share the rules parser in `src/validation/workflow-config.ts`. `requiredFields` may name any of the six resident-editable fields documented above. Document types remain configurable nonempty strings, at most 100 characters. Arrays must contain the expected strings/objects; strings are trimmed. Days use uppercase weekday names. Each time slot must contain only `start` and `end`, use valid 24-hour `HH:mm` times, and end after it starts. Instructions must be a string and may be empty. Empty arrays are valid and retain the submission semantics described above. Unsupported body fields and malformed structures return 400.

PUT returns 404 for a missing community/admin and 403 for an admin from another community. It locks the community row so concurrent creation cannot produce multiple configurations for a community/type. Update/create and the `WORKFLOW_CONFIG_UPDATED`/`WORKFLOW_CONFIG_CREATED` audit record share one transaction. These audit records use `moveRequestId: null` and identify the community, request type, and configuration ID in metadata, with the previous/new configuration values. New rules apply on the next resident submission; existing request statuses are unchanged.

## Request checklist and comment APIs

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/move-requests/:id/checklist` | List this request's checklist by `createdAt` ascending, then ID ascending. |
| PATCH | `/api/admin/move-requests/:id/checklist/:checklistId` | Update an existing checklist item's status, completion details, and audit log atomically. |
| GET | `/api/move-requests/:id/comments` | List only this request's comments oldest first, with ID as the timestamp tie-breaker. |
| POST | `/api/move-requests/:id/comments` | Validate resident ownership and create a RESIDENT comment. |
| POST | `/api/admin/move-requests/:id/comments` | Validate admin community membership and create an ADMIN comment. |

Checklist PATCH accepts only:

```json
{ "adminId": "<admin-uuid>", "status": "COMPLETED" }
```

Allowed statuses are PENDING, COMPLETED, and NOT_APPLICABLE. COMPLETED records ADMIN, the supplied validated admin ID, and the current time in the completion fields. PENDING and NOT_APPLICABLE clear all three completion fields. The service validates that the checklist item belongs to the request, locks the parent and item, and writes `CHECKLIST_ITEM_UPDATED` with previous/new values and `metadata.checklistId`. Audit failure rolls back the checklist update. No checklist creation or automatic status changes to MoveRequest are introduced.

Resident comment body:

```json
{ "residentId": "<resident-uuid>", "comment": "I have uploaded the requested document." }
```

Admin comment body:

```json
{ "adminId": "<admin-uuid>", "comment": "Please verify your move date." }
```

Comments must be nonempty text and are trimmed. The server sets author type/ID; clients cannot set author fields or request ownership. Resident ownership and admin membership checks are reusable helpers in `src/services/move-request-access.service.ts`. An existing resident who does not own the request receives 403, including another resident of the same community. An admin from another community also receives 403. Missing request, resident, admin, or request-scoped checklist item returns 404; malformed IDs, statuses, comments, and unsupported fields return 400. IDs are UUIDs, not numeric values such as `1`.

Comment creation returns 201; lists and checklist updates return 200, all with the existing success/data envelope. Existing requests with no checklist/comments return empty lists. Comment creation locks the request and validates the supplied identity within the transaction. Checklist/comment operations impose no additional request-status restrictions. Identity is still supplied by the client; authentication is not implemented.

No models or migrations are needed for these groups. `npm run test:workflow-collaboration-api` uses a dedicated empty `TEST_DATABASE_URL`, applies migrations/seeds, and checks all seven endpoints, configuration creation/replacement, shared submission rules, ownership/community isolation, ordering, completion resets, and audit-failure rollback for config creation/update and checklist updates. It removes the test data it creates.

## Status history, audit logs, and notifications

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/move-requests/:id/status-history` | Validate the request and return its history oldest first. |
| GET | `/api/admin/move-requests/:id/audit-logs?adminId=<admin-uuid>` | Validate the admin's community and return request audit logs newest first. Optional exact-match `actorType` and `action` filters can be combined. |
| GET | `/api/residents/:residentId/notifications` | Validate the resident and list RESIDENT notifications for that ID, newest first. |
| GET | `/api/admin/:adminId/notifications` | Validate the admin and list ADMIN notifications for that ID, newest first. |

All return 200 with the existing success/data envelope and an empty list when no records exist. Ordering uses `createdAt` and ID as a tie-breaker. Audit queries require a UUID `adminId`; missing/malformed IDs or filters return 400, missing records return 404, and community mismatch returns 403. History includes from/to status, actor type/ID, reason, and timestamp. No update/delete endpoints are provided; existing database triggers preserve append-only history/audits.

All application audit writes use `createAuditLog()` in `src/services/audit-log.service.ts`. It accepts the event fields, optional JSONB before/after/metadata, and an optional transaction; existing actions retain their payloads. Community-level events use a null request ID.

`createNotification()` in `src/services/notification.service.ts` creates database records only. Channel defaults to IN_APP, status is always PENDING, and `sentAt` is null. It accepts an optional transaction and nullable request ID. Submission/resubmission creates one notification per admin row in the request's community, including staff. Approval, request-changes, and rejection notify the request's resident; change/rejection messages include the reason. Starting review alone creates no notification. Communities with no admins produce no admin notifications.

Workflow notifications participate in the same transaction as status, history, audit, and comments. Failure—even after some admin notifications were inserted—rolls everything back. No external delivery, send-status updates, or notification creation API is exposed. `npm run test:history-notification-api` checks authorization, filters, ordering, append-only enforcement, recipient isolation, defaults, workflow integration, and failure rollback against an empty test database.

## Resident chat and admin agent assessments

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/agent/move-requests/:id/chat` | Validate resident ownership, interpret a message, save the USER/AGENT pair, and apply safe field updates. Returns 200. |
| POST | `/api/admin/move-requests/:id/agent-assessment` | Validate admin community, run deterministic checks, generate and append an advisory assessment. Returns 201. |
| GET | `/api/admin/move-requests/:id/agent-assessment?adminId=<admin-uuid>` | Validate admin community and return the latest assessment by creation time/ID, or 404. |

Chat accepts only:

```json
{ "residentId": "<resident-uuid>", "message": "I want to move next Saturday morning." }
```

Messages must be nonempty text of at most 8000 characters. Assessment generation accepts only `{ "adminId": "<admin-uuid>" }`. All IDs remain UUIDs; identities are supplied by the caller because authentication is not implemented.

OpenAI and Google Gemini are supported behind the same `AIProvider` interface. Configure one provider in the environment. For Gemini:

```dotenv
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=your-key
AI_TIMEOUT_MS=30000
AI_TIME_ZONE=Asia/Kolkata
```

For OpenAI use `AI_PROVIDER=openai`, an available structured-output model in `AI_MODEL`, and `OPENAI_API_KEY`. Only the selected provider's key is required. Keep keys in `.env` or your deployment's secret environment, never in committed files. AI configuration is validated lazily; ordinary APIs still start without it. Timeout must be 1000–60000 milliseconds and the time zone a valid IANA identifier. Missing/invalid configuration returns 503. Gemini can be used as an alternate provider depending on the API plan and quota available to the developer.

The OpenAI adapter uses the Responses API with a strict JSON schema and `store: false`. The Gemini adapter uses `generateContent` with JSON response MIME type and a JSON response schema. Both adapters return the same chat and assessment structures, share the same instructions and schemas, refuse redirects, enforce the same timeout and 200 KB context limit, and discard raw provider errors. No tools or files are supplied. The shared structured context contains the current request/details, document upload/review metadata, checklist, Community and its request-type configuration, resident name/type, unit, status history, the latest assessment, and the 20 most recent public conversation messages. Both chat and assessment use this context. User-entered notes/messages are included and can contain personal information. Chat also receives the current local date/time zone. Notes, names, messages, and community instructions are treated as untrusted data, not privileged instructions.

Example chat success data for a configuration requiring only a date and time slot:

```json
{
  "message": "Which approved time slot would you prefer on Saturday?",
  "extractedFields": { "requestedDate": "2026-09-05" },
  "missingFields": ["requestedDate", "requestedTimeSlot"],
  "requiresClarification": true,
  "appliedFields": {},
  "validationErrors": [
    { "field": "requestedDate", "message": "Requested date is required." },
    { "field": "requestedTimeSlot", "message": "Requested time slot is required." }
  ],
  "conversationId": "<agent-message-uuid>"
}
```

The example shows an uncommitted proposal; actual missing fields and errors come from the stored configuration. AI-proposed fields pass the same parser and write function as resident PATCH. Only the six resident-editable fields are eligible. Invalid/protected fields reject the response with 502, and null proposals are treated as absent rather than clearing data. Accepted values must satisfy applicable deterministic field/date/slot checks. Remaining required fields/documents can still be filled later. No field updates apply while clarification is needed, when configuration is missing/invalid, or outside DRAFT/NEEDS_CHANGES. Vague scheduling language such as “sometime next weekend” triggers a clarification instead of a guessed date. `appliedFields` is the authoritative record of changes actually saved; `missingFields` is derived from deterministic validation, not invented by the provider.

USER and AGENT records share an interaction ID. Agent JSONB metadata records proposed/applied fields, clarification state, missing fields, and validation errors. The field updates and both messages commit together. A failed provider call, invalid output, or failed persistence saves neither message and makes no field changes, allowing a retry.

Assessment context includes deterministic workflow errors plus unresolved review warnings (request not UNDER_REVIEW, pending checklist items, and documents awaiting admin verification). These warnings constrain advisory recommendations, not the existing admin decision APIs. An AI APPROVE recommendation cannot survive unmet deterministic requirements or unresolved review warnings: normal code replaces it with REQUEST_CHANGES or MANUAL_REVIEW, sets confidence to null, and records the authoritative issues. Other valid outputs retain their recommendation. Each assessment is appended with recommendation, bounded 0–1/null confidence, a short conclusion in `reasoning`, and JSONB issues labeled `deterministic` or `agent`. No raw chain-of-thought is requested or exposed. The service never approves/rejects/submits requests, changes protected fields, invents document records, or completes checklists.

Provider calls run outside database transactions. Short transactions validate authorization and capture/recheck a fingerprint of the request context. If another edit, chat, document/checklist change, or config update makes the result stale, the API returns 409 and saves no AI result; retry with refreshed context. Missing identities/requests return 404, ownership/community mismatch 403, malformed input 400, unusable provider output 502, and provider/configuration failures 503. Latest-assessment reads need no AI key and do not regenerate an assessment; earlier assessments remain historical and may predate later request changes.

`npm run test:agent-api` uses a dedicated empty `TEST_DATABASE_URL` with a mocked provider transport. It checks ownership, structured parsing, context, safe updates, ambiguity, deterministic boundaries, conversation rollback, stale-context detection, retries, assessment history, and provider failures without sending data to a live AI service. `npm run test:ai-provider` checks provider selection, provider-specific configuration, Gemini request/response mapping, malformed output, and safe failures with mocked HTTP. Neither test sends data to a live AI service. Configure a real key/model separately to evaluate natural-language interpretation with your provider. No models or migrations are added by these API groups.

## Dashboard summaries

| Method | Path | Data |
| --- | --- | --- |
| GET | `/api/residents/:residentId/dashboard` | `totalRequests`, `draftRequests`, `submittedRequests`, `needsChangesRequests`, `approvedRequests`, `rejectedRequests`, `completedRequests`, `recentRequests` |
| GET | `/api/admin/communities/:communityId/dashboard` | `totalRequests`, `submittedRequests`, `underReviewRequests`, `needsChangesRequests`, `approvedRequests`, `rejectedRequests`, `completedRequests`, `moveInRequests`, `moveOutRequests`, `recentRequests` |

Both return 200 with `{ "success": true, "data": { ... } }`. IDs are UUIDs; missing residents/communities return 404 and malformed IDs return 400. A scope with no requests has zero counts and an empty `recentRequests`. Admin dashboard/list reads require `X-Admin-Id` and validate that admin's community. This is caller-selected prototype identity validation, not authentication.

Counts use one Sequelize `COUNT` query grouped by status/type. Only the bounded aggregate groups are processed in application memory. A separate query loads at most five requests in `createdAt` descending/ID descending order, with basic resident, unit, and community information. Both queries always use the requested resident/community scope. `totalRequests` includes every status, including CANCELLED; therefore the displayed status-card counts need not sum to the total when some status cards were not requested. Move-in/out counts include every status too.

## Agent conversation history and configuration health

```text
GET /api/move-requests/:id/agent-conversations?residentId=<resident-uuid>&page=1&limit=20
GET /api/move-requests/:id/agent-conversations?adminId=<admin-uuid>&page=2&limit=20
```

Supply exactly one identity. Resident ownership or admin community membership is checked using the shared participant authorization helper before reading messages. Supplying both/neither identity, malformed UUIDs, unsupported query parameters, or invalid pagination returns 400. Missing identities/requests return 404, and ownership/community mismatch returns 403.

Pagination defaults to page 1 and limit 20. Both must be positive integers; limit is capped at 100 and oversized offsets are rejected. Public USER, AGENT, and ADMIN messages are ordered oldest first, then by ID for equal timestamps. SYSTEM messages and all JSONB metadata are excluded from both the results and the pagination total. Returned fields are only `id`, `role`, `message`, and `createdAt`; no provider debug payloads or private reasoning items are exposed.

```json
{
  "success": true,
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

Pages beyond the last page return an empty `data` array while retaining the actual total. No conversation update/delete endpoints are added.

`GET /api/agent/health` returns a health response directly:

```json
{ "agentConfigured": true, "provider": "openai" }
```

This checks only local provider configuration. It does not contact the provider, validate account access, or prove that the key/model works. Missing/invalid configuration returns 200 with `agentConfigured: false`; an unrecognized provider returns `provider: null`. Only a recognized provider name is exposed, never the key, model, timeout, or arbitrary environment values.

## Shared agent context and backend conventions

`buildMoveRequestAgentContext(moveRequestId, options?)` in `src/services/agent-context.service.ts` is the central context builder. It loads MoveRequest, details, Resident, Unit, Community, request-type workflow config, Documents, RequestChecklist, recent public conversation messages, latest AgentAssessment, status history, and current deterministic validation/errors. Optional relationships and missing configuration are represented explicitly; missing configuration remains a deterministic issue.

Resident chat and admin assessment generation both use this builder before/after the provider call. Its fingerprint includes the expanded context, so changed community information, conversation history, or a new assessment also invalidates an in-flight response. `buildMoveRequestAgentSummary()` in `src/services/agent-summary.service.ts` reuses it for a deterministic summary without another provider call. The admin frontend exposes this through `GET /api/admin/move-requests/:id/agent-summary?adminId=<uuid>`. The one-argument builder/summary forms are for trusted internal callers; HTTP consumers always supply the resident/admin identity. Callers can pass an existing transaction to reuse the locked snapshot.

All routers are registered through `src/routes/index.ts`; controllers parse input and delegate. MoveRequest transitions/editability are centralized in `move-request-state.service.ts`, all application audit writes use `createAuditLog`, and notification creation uses `createNotification`. History remains append-only, errors use the shared error middleware, and the only schema-sync call is in the development reset script. Production schema changes continue to use migrations. These final API groups add no models, migrations, authentication, or frontend.

`npm run test:dashboard-agent-history-api` uses a dedicated empty `TEST_DATABASE_URL`. It checks counts across all statuses/types, scope isolation, empty dashboards, grouped SQL and latest-five limits, conversation authorization/pagination/redaction, shared context/summary, and health configuration without a provider call. The agent API suite also verifies that chat and assessment actually receive the expanded shared context.

References: [Sequelize TypeScript models](https://sequelize.org/docs/v6/other-topics/typescript/), [Sequelize associations](https://sequelize.org/docs/v6/core-concepts/assocs/), [Umzug migrations](https://github.com/sequelize/umzug).

## Resident and admin frontend

The React + TypeScript app is in the sibling `../frontend/` directory; see [frontend setup, seeded admin links and workflow documentation](../frontend/README.md). Run backend commands from `Backend/`. Use Node 22.12+, install the frontend with `npm --prefix ../frontend ci`, then run `npm run dev` and `npm run dev:frontend` in separate terminals. Open `http://127.0.0.1:5173/admin` for the admin workspace or `/` for residents. `npm run build:frontend` type-checks and builds both interfaces. The backend's source, migrations, models and tests live entirely inside `Backend/`.

The admin interface adds completion (`POST /api/admin/move-requests/:id/complete`, `{ adminId, comment? }`) and exposes the existing deterministic summary. Completion allows only APPROVED → COMPLETED and atomically appends history, audit, an optional admin comment and a database notification while preserving the approval reviewer. `POST /api/move-requests/:id/comments/admin` aliases the existing admin-comment route. No models, schema changes or authentication are added. Test these additions with `npm run test:admin-frontend-api` and `npm run test:admin-frontend` against a dedicated empty `TEST_DATABASE_URL`.
