# Phase 5 — secure booking backend (intake disabled)

Phase 6 adds separately authenticated [Santa HQ](SANTA_HQ.md). Its additive migration retains immutable Phase 5 receipts and disabled public intake. References below to absent administrative endpoints describe the historical Phase 5 scope.

Stacked on PR #2 (`phase4/customer-booking-preview`), itself stacked on PR #1. No merge, deployment, remote migration, resource provisioning, payment, notification delivery, or production intake activation is authorized. The Worker and D1 are tested locally using synthetic adult data only. All existing pages, wizard behavior, prices, sensory accommodations, styles, and photographs remain unchanged.

## Architecture and contract

`workers/booking/index.ts` is a standalone Cloudflare Worker, separate from the Next.js frontend. It uses a private D1 binding, not a public database URL or browser SDK. No customer account is required. The Worker is not imported by client components; the existing practice wizard still makes no submission requests and keeps private inputs locked to fictional samples. No public link activates it.

Only `POST /api/bookings` is implemented. Intake is disabled unless the deployment gate equals the literal `true`, all required bindings exist, and the configured HTTPS origin is valid. The committed configuration sets the gate to `false`, disables workers.dev, preview URLs, and observability, defines no public routes, and uses a local-only placeholder D1 ID. Vercel automatic deployment is disabled for the Phase 5 branch as well as the previous two branches.

The future request envelope is `{ "request": <booking input>, "botToken": <fresh Turnstile proof> }`, with `Content-Type: application/json`, exact allowed `Origin`, and `Idempotency-Key` (16–128 ASCII letters, digits, underscores or hyphens). Clients should generate a cryptographically random UUID per new submission and retain that same key and booking payload for retries; each HTTP retry needs a fresh Turnstile proof. The token is excluded from payload identity. JSON object key order is ignored; all values and array ordering are significant. The server revalidates unknown booking input using the shared catalog, New York/DST/holiday rules, fixed durations, and field allowlists. Client status, prices, catalog versions, calculated times, private notes, and unsupported fields cannot override server values.

Successful responses contain only `requestId` (UUID reference), `receivedAt` (server epoch milliseconds), `status: "pending"`, and the exact message **Your Letter Is on Its Way to Santa!** They contain no contact/location data. The future live UI must display that message only after receiving this durable success response. It is intentionally not wired into the practice receipt in this PR. A Pending receipt means received, never accepted, quoted, available, reserved, or confirmed.

Responses: 400 malformed/invalid input or unsupported notes; 403 origin/IP/bot failure; 405 unsupported method; 409 key reused with different booking information; 413 size limit; 415 non-JSON; 429 rate limit (with Retry-After); 503 disabled, missing configuration, or dependency failure. Responses are no-store and never echo user values, arbitrary field names, SQL/provider errors, or customer details. There are no application request/error logs.

## Atomicity and lifecycle

The migration creates a Pending request row with version one and a unique HMAC of the idempotency key. Payload identity is also an HMAC, preventing offline guessing of personal data from a plain payload hash. The long-lived HMAC secret must remain stable for retries; a future secret rotation requires an explicit migration/dual-key design before rollout.

D1 `batch()` atomically inserts the request and idempotency metadata, inserts a PII-free outbox marker, and selects the committed reference. A unique constraint arbitrates concurrent retries: matching requests return the original receipt; different information conflicts without altering the original. Failures roll back the whole batch and cannot issue a receipt. The local D1 integration tests verify this with an aborting outbox trigger. Outbox rows are not notification delivery and no consumer exists.

Different keys always represent separate requests, even for identical events, names, venues, or dates. Pending inserts reserve no resources and perform no availability blocking. The pure lifecycle now starts at `pending` instead of `requested`; the remaining quote/acceptance/conflict/staffing/version guards are preserved. No administrative HTTP endpoint or authentication provider is added. Caller-supplied `actor: "santa"` remains a pure domain input, **not authentication**. The intake schema deliberately allows only initial Pending/version-one writes; a later authenticated/authorized Santa HQ implementation needs a reviewed migration and atomic compare-version/resource-conflict writes before it can update bookings. No public caller can confirm, decline, cancel, or reschedule through this Worker. Confirmed rescheduling remains the existing deferred change-proposal workflow.

## Spam protection and privacy

Technical defaults: 32 KiB streaming body limit (also checking Content-Length), five requests per Cloudflare source IP per fixed UTC minute, and mandatory Turnstile verification for every attempt, including receipt replays. Turnstile must return success, the configured origin hostname, and action `booking`; provider errors/timeouts fail closed. The trusted edge `CF-Connecting-IP` header is used only in the Cloudflare Worker. Do not host this handler behind a server that accepts arbitrary client-supplied versions of that header. No permissive CORS or credential-bearing public read API exists.

The D1 rate limiter uses an atomic capped UPSERT, including during concurrent requests. IPs are HMACed with the minute bucket; raw IPs and bot tokens are never persisted. Expired rate counters are removed during later requests, after two minutes; this is ephemeral abuse metadata, not a booking-retention policy. Booking records and idempotency data have **no automatic expiry or deletion job**. Pending request JSON contains only normalized allowlisted adult contact/event information. Sensory preference is boolean only and changes neither price nor service identity.

Initial intake rejects instructions, flexibility notes, and all string-valued optional planning answers: these are deferred unstructured note channels, not required booking eligibility questions. Count/boolean planning answers remain accepted. There is no Secret Elf Notes field or child questionnaire. Structured child names, diagnoses, medical data, birthdates, schools, and other unsupported fields are rejected. General text fields cannot semantically guarantee that a person will never type sensitive content; privacy guidance, approved notice/consent wording, and review of the minimal contact/location/event controls remain activation blockers. Do not introduce an automated sensitive-content classification policy without approval.

Customer records are accessible only through the private D1 binding and Cloudflare administrative access; restrict account roles and database access before production. References are not bearer authorization to read records. The outbox foreign key cascades on booking deletion, enabling a later controlled deletion workflow without orphaned notification markers. No public deletion/admin endpoint exists. Final retention duration, deletion request verification, and retry/tombstone behavior after a deletion need owner approval; do not invent a retention period or run destructive booking cleanup. Secret Elf Notes require their own approved consent/access/encryption/retention/deletion design and stay excluded.

## Local verification

Use the existing checkout and Node 24; no worktree is needed. `npm ci --cache /workspace/.npm-cache --no-audit --no-fund` installs pinned tooling. Miniflare is pinned to the version bundled with the pinned Wrangler; its supplied V4 conversion helper adapts the documented configuration to the current runtime.

```sh
npm run test:backend
npm run test:booking
npm run typecheck:backend
npm run typecheck:booking
npm run typecheck
npm run build
npm run dev:backend -- --port 8787
```

The backend suite uses a fresh, ephemeral workerd/D1 database and the real migration; Turnstile responses are injected test doubles, not live Cloudflare verification. It tests concurrent matches/conflicts, retries after event time, separate-key requests, rollback/retry, rate saturation/recovery/concurrency, disabled gate, public read/admin rejection, origin checks, invalid/oversized inputs, private-field rejection, bot/provider/database failures, and SQL parameter binding. The committed Worker started locally returns HTTP 503 `intake_disabled` for POST. Do not add real customer data to local fixtures or review artifacts.

To exercise migrations in a separate local database, use `npx wrangler d1 migrations apply operation-north-pole-booking --local --config wrangler.booking.jsonc`. Never use `--remote` during this phase. No account credentials are required for the local tests. Run the existing frontend browser suites against `npm run start`, saving screenshots outside the checkout.

## Remaining activation work — do not enable intake

Owner approval is still required before production intake or deployment. Independently required technical work: real D1 resource/binding configuration and restricted account access; stable server HMAC and Turnstile secrets; approved hostname/Turnstile widget with action `booking`; reviewed Cloudflare routing from the frontend; live UI retry/receipt/error handling and privacy copy; authenticated/authorized HQ and deletion workflows when introduced; and staging end-to-end tests with real bot verification. No claim of tested production ingress, live Turnstile, authenticated HQ, delivered notification, or deployed workflow is made by the local tests. The unapproved booking retention period remains a documented policy blocker, not an invented value.
