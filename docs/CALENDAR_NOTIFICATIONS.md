# Phase 7 — Calendar, notifications, and the Mrs. Claus Protocol

Branch `phase7/calendar-notifications` is stacked on PR #4, `phase6/santa-hq` at `3db7e74`. The earlier failed attempt changed nothing. This implementation was built and tested after the environment recovered. No real message, Google calendar, paid service, remote migration, merge, or deployment was performed.

## What is implemented

- An additive D1 integration migration and a separate scheduled Worker consume the existing intake/HQ outboxes, reconcile bookings, plan reminders, and track durable delivery state.
- A Google OAuth/calendar adapter creates a dedicated **SantaBlizard Bookings** calendar after explicit authorized setup, maintains confirmed appointments, applies reschedules, removes canceled events, and repairs drift. All Google traffic in validation is mocked.
- A private notification-gateway adapter uses stable delivery keys, authoritative receipt lookups, bounded retries, and uncertain-outcome handling. All notification traffic in validation uses the in-memory mock gateway. No vendor-specific SMS/email transport has been selected or provisioned.
- Authenticated Santa HQ shows calendar/delivery settings, per-booking status/attempts, a compact mobile **Got It!** panel, expandable history, and safe status-check controls. Notification links open the protected booking/reminder panel; links never acknowledge by GET or contain bearer tokens.
- The approved configurable reminder/escalation defaults are implemented. Consent, acknowledgments, duplicates, quiet hours, early events, reschedules, provider failure, and late/in-flight receipts are covered by tests.

All committed activation flags are **false**: HQ/public intake remain off, as do integration planning, Google OAuth, calendar sync, and notification delivery. Vercel automatic deployment is disabled for this branch. The two Worker configs use the same local placeholder D1 binding; no remote service or database was created.

## Approved timing configuration

`REMINDER_POLICY_JSON` is shared by the booking/HQ Worker and scheduled Worker. Defaults are declared in configuration and validated centrally, not scattered through delivery code:

```json
{
  "timeZone": "America/New_York",
  "morningTime": "08:00",
  "quietStart": "21:00",
  "quietEnd": "08:00",
  "sevenDayHours": 168,
  "acknowledgmentHours": 24,
  "finalReminderHours": 3,
  "escalationMinutes": [0, 120, 240, 360],
  "reconcileMinutes": 15
}
```

New requests generate one generic Santa alert. A new confirmed appointment cycle plans confirmation, 7-day, 24-hour acknowledgment, 3-hour, and local morning reminders when applicable. Elapsed-hour offsets use actual instants; local morning/quiet-hour boundaries use New York wall time and DST resolution. Repeated wall times resolve once, not twice. A nonexistent configured morning time is skipped. Defaults at 08:00 avoid DST gap/fold ambiguity.

Offsets already past when an appointment was confirmed are not backfilled. A late-confirmed booking can therefore have no 24-hour check/escalation cycle. Reminders never dispatch at or after the event starts. An early appointment at/before 08:00 has no late morning reminder; quiet hours are not bypassed to force one. Current messages are treated as nonurgent and wait until quiet hours end; no unapproved urgency exception is added. Dispatch rechecks the clock after provider lookup, so a slow request cannot cross into quiet hours or past the appointment deadline unnoticed.

The four levels are:

| Level | Recipient | Default offset |
| --- | --- | --- |
| A Gentle Jingle | Santa | 24-hour check |
| The Elves Are Concerned | Santa | 2 hours after Level 1 |
| Mrs. Claus Has Been Notified | Mrs. Claus by SMS, with consent | 4 hours after Level 1 |
| Santa Is Officially in the Doghouse | Technical administrator, final backup | 6 hours after Level 1 |

An actual deferred Level 1 dispatch becomes the timing anchor. If quiet hours delay an intermediate dispatch, its next stage retains the configured step spacing rather than sending a catch-up burst. Nothing is sent after the appointment starts. Earlier provider delivery failure does **not** suppress the later fallback attempts; an unacknowledged check must still reach Mrs. Claus/the final technical backup when their routes are available and permitted. Missing Mrs. Claus consent blocks her SMS, not the final technical fallback at its configured time.

Only an authenticated, authorized Santa identity may acknowledge the current appointment cycle, once its check is due. Backup identities cannot acknowledge for Santa. A stale reschedule link cannot acknowledge a new appointment. Acknowledgment is idempotent, audited, and cancels unsent escalation work. It does not change booking status/version, availability, price, or reservations. Ordinary applicable reminders can still occur after acknowledgment. Rescheduling creates a new cycle; cancellation/completion resolves the old cycle and invalidates future reminders.

Resolution notices are deduplicated per previously alerted recipient/route/channel. Receipt recovery handles messages accepted before an acknowledgment but reported afterward. An already handed-off message cannot be recalled; if it finishes in flight, its receipt causes the corresponding resolution notice. Unknown outcomes remain visible and are checked by stable key before another attempt. No reminder failure or missing acknowledgment cancels or modifies a booking.

## Durable delivery and low-cost reconciliation

`integration_jobs` stores stable keyed identity, booking/cycle/kind, due/deadline/next-check times, attempts, a fenced lease, provider receipt metadata, and state. States distinguish queued, sending, retry, unknown, accepted, delivered, blocked, failed, uncertain, canceled, and expired. Accepted is not falsely reported as delivered. Responses/logging never contain provider bodies, tokens, family notes, or child information.

Only one worker can claim a job at a time. A timed-out claim can be recovered; stale workers cannot overwrite a newer result. The first authorized handoff freezes the generic payload and recipient route; retries never reuse a key with changed content or a changed destination. Provider failures back off exponentially, with a cap and an `uncertain` state after repeated unsuccessful checks. HQ’s “check again” schedules another safe lookup; it does not bypass delivery gates or blindly resend a delivered message. Retries of an acknowledgment repair missing resolution jobs without resetting the acknowledgment.

Outbox receipts and round-robin keyset scans recover missed planning work. Plans remember their expected job identities, so reconciliation can restore missing records. An unchanged booking/policy does not rewrite every future reminder each minute; calendar checks are requeued at the configured minimum interval, subject to bounded scan progress. Due work is processed in bounded batches. Policy changes update unsent work and cancel obsolete checks without resetting delivered history or recorded acknowledgments. No booking-retention or automatic deletion policy is invented.

The HMAC secret that generates cycle/job identities must remain stable. A stored one-way fingerprint makes an unexpected key change fail closed instead of resetting acknowledgments or duplicating deliveries. Rotation requires a reviewed migration. Keep the installation identifier stable too. AES token-encryption key rotation is separate and supports an active key plus retained decryption keys.

## Notification gateway contract and real-provider boundary

`NOTIFY` is a **private Cloudflare service binding**, not a browser URL. Its implementation must use server-only provider credentials and an approved SMS/email provider. It must durably retain idempotency keys/receipt state through retries and uncertain outcomes. A raw “send SMS” endpoint or a provider’s short-lived dedupe header is not sufficient by itself.

The adapter uses:

- `GET /deliveries/<key>`: returns the authoritative outcome for that key.
- `POST /deliveries/<key>` with matching `Idempotency-Key`: accepts the same message once, even during retries/concurrent calls.
- JSON replies contain `idempotencyKey`, `status` (`not_found`, `accepted`, `delivered`, or `failed`), and an optional opaque `providerId`.

`not_found` must mean no accepted/in-flight delivery exists for the key. If a gateway cannot prove an outcome, it must return a retryable error rather than claim `not_found`. The application then records unknown/uncertain and seeks reconciliation instead of blindly sending another SMS. A missing receipt for a previously accepted message is treated as uncertain, not an invitation to resend. Gateway/provider implementation and this contract must be verified before any live delivery approval; no exactly-once guarantee is claimed for an unspecified external provider.

Messages contain a generic playful subject, a short operational instruction, and an authenticated HQ link with only an opaque booking reference/anchor. They contain no family names, contact information, addresses, service answers, Secret Elf Notes, diagnoses, or other child information. Calendar content has its own explicitly approved minimal projection below.

`NOTIFICATION_TARGETS_JSON` maps roles (`santa`, `mrs_claus`, `technical_admin`) to an opaque gateway `recipientKey` and `channel` (`email`/`sms`). No real destination is inferred from the public business phone/email. Actual destinations remain private provider/gateway configuration. Mrs. Claus always uses SMS and requires `MRS_CLAUS_CONSENT_JSON` with `granted: true`, the exact matching `recipientKey`, an opaque consent `reference`, and a past `grantedAt` timestamp. There is no UI checkbox that fabricates her consent. Revoked/missing consent also blocks a new resolution SMS to her route.

## Google OAuth and calendar security

Santa-only, same-origin HQ POST begins OAuth. It uses a single-use, short-lived, subject-bound state and S256 PKCE. State verifiers and tokens are encrypted in D1 with AES-256-GCM, random IVs, explicit key IDs, and context-bound additional data. The browser never receives stored access/refresh tokens, client secrets, encryption keys, or raw connection records. New authorization flows supersede older flows so a late callback cannot overwrite the newer connection.

The sole requested scope is `https://www.googleapis.com/auth/calendar.app.created`. Broadened grants are rejected. This permits app-created secondary calendars/events without broad access to Santa’s other calendars. Scope selection was checked against Google’s [official discovery schema](https://github.com/googleapis/google-api-go-client/blob/main/calendar/v3/calendar-api.json). Calendar-list permissions are deliberately not requested.

After connecting, Santa explicitly creates **SantaBlizard Bookings**. A setup marker binds it to the installation. Primary/unrelated calendars are rejected. If calendar creation might have succeeded but its response was lost, setup is marked uncertain; it never automatically creates another calendar. Santa can recover the known ID from Google settings, and the server verifies its name/installation marker. A ready binding cannot silently be replaced by a different calendar.

Refresh is serialized; new tokens are encrypted before storage. Disconnect first blocks further token use, requests Google revocation, and clears local ciphertext only after successful revocation. Failed revocation remains visible as pending for a safe retry. Disconnect does not delete a calendar or bookings. Provider redirects and unchecked token destinations are forbidden.

Only confirmed appointments create/update events. D1 stays authoritative. Pending proposals/requests never reserve Google time, and proposed reschedules do not move an event until applied in HQ. Cancellations remove owned events idempotently. Completed appointments keep their existing calendar history; the adapter does not newly create an event for a completed appointment.

The event projection includes only the shared service name, appointment start/end in New York, event address, opaque reference, and protected HQ logistics link. It excludes all free-text instructions/answers, adult contact details, sensory/private notes, child information, and Secret Elf Notes. Events are private/opaque, have no attendees, suppress Google invite/update messages, and disable default Google reminders. Review calendar sharing settings before staging/live use.

Event IDs are deterministic per booking/installation and persisted before an external write. Ownership markers and ETags prevent touching unrelated events and protect competing updates. A definitive owned-event tombstone can advance to one durably recorded successor ID. Retry/reconciliation repairs uncertain writes and remote drift without creating duplicate events. Cross-system changes are eventually consistent: a request already in flight may briefly reflect an older state, then a new job/reconciliation applies D1’s current desired state. Google never writes booking state back into HQ.

## Configuration required before real end-to-end testing

The current environment has no Google or notification credentials/recipient configuration. The mock test harness supplies synthetic values only. Enter real secrets securely in Worker/environment settings, never chat or tracked files.

| Requirement | Purpose |
| --- | --- |
| Existing Phase 6 Access/HTTPS HQ setup and private `DB` binding | Authorized Santa operations and one authoritative D1 database |
| `INTEGRATION_PLANNER_ENABLED` | Scheduled planning/reconciliation gate; committed false |
| `CALENDAR_SYNC_ENABLED` | Google event delivery gate; committed false |
| `NOTIFICATION_DELIVERY_ENABLED` | SMS/email delivery gate; committed false |
| `GOOGLE_OAUTH_ENABLED` | Authorized connect/setup/revoke gate; committed false |
| `REMINDER_POLICY_JSON` | Same approved configuration in HQ and scheduler |
| Stable `INTAKE_HMAC_SECRET` | Existing identity/deduplication secret; no unplanned rotation |
| Stable `INTEGRATION_INSTALLATION_ID` | Calendar ownership namespace, 16–100 safe characters |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Approved OAuth project/client with the exact HTTPS `/hq/oauth/google/callback` redirect |
| `GOOGLE_TOKEN_KEYS`, `GOOGLE_TOKEN_ACTIVE_KEY` | Secret JSON keyring of base64 32-byte keys and selected key ID; retain old keys until re-encryption is reviewed |
| Private `NOTIFY` service binding | Reviewed durable gateway implementing the contract above |
| `NOTIFICATION_TARGETS_JSON` | Approved opaque Santa/Mrs. Claus/admin destinations/channels |
| `MRS_CLAUS_CONSENT_JSON` | Actual prior consent for her exact SMS route |

Apply all three migrations only in an approved staging environment first. No remote migration/deployment is part of this work. Review queued/due records before enabling delivery so historical work is understood. Verify Google consent/refresh/revocation, private calendar settings, callback routing, provider receipts/idempotency, failure/reconciliation, real recipient consent, and physical iPhone/Safari behavior before requesting any real send or production activation. The technical administrator remains a final backup; an escalation notification does not grant HQ access or change Phase 6’s explicit backup-access gate.

## Validation and readiness

```sh
npm run test:backend
npm run test:booking
npm run typecheck:backend
npm run typecheck:booking
npm run typecheck
npm run build
npm run check:integrations
npm run check:hq
```

The backend suite has 71 local workerd/D1 tests: 29 Phase 7 and 42 inherited security/lifecycle/intake tests. They exercise retries, concurrent claims, lost responses, missing-record repair, low-write steady state, timing overrides, DST/quiet hours, early appointments, event deadlines, consent, failure fallback, acknowledgment races/rollback/stale cycles, safe resolution notices, key stability, OAuth scope/state/key rotation, calendar ownership/tombstones/drift, refresh and revocation. The 148 domain tests preserve existing prices and lifecycle rules. All build/type checks passed.

Both new integration and inherited HQ browser suites pass at 390/430px touch emulation and 768/1024/1440/1920px. They verify authenticated links, the compact Got It panel, unchanged booking state after acknowledgment, expandable status history, disabled OAuth controls, settings, preserved booking operations, no overflow/storage, and no private field collection. Providers/JWKS/records are synthetic; harness Origin translation exists only in test code. Selected [review artifacts](review/phase7/README.md) are not a deployed service.

The public homepage/Services/practice-booking suites passed at all five original widths, with unchanged source/content and zero hero pixel delta against Phase 6. The actual scheduled Worker starts locally, returns 404 to ordinary HTTP, and its local scheduled entry runs with planning/delivery disabled. The bundled HQ/intake denial responses are also checked. Wrangler’s optional Request.cf bootstrap is blocked by the workspace proxy; local Worker execution is available.

Ready for review and mocked end-to-end testing. Real end-to-end testing remains blocked on the settings, gateway/provider implementation, credentials, consent, and approval above. No real Google account login, calendar change, email, SMS, physical Safari test, paid provisioning, merge, or deployment is claimed. Automated PR creation separately needs the existing `api.github.com` network allowance applied if the runtime still denies it.

Secret Elf Notes stays the Phase 6 confirmed-home-visit invitation **plan only**. Sharing is entirely optional, skipping never affects a visit, and no collection route/sender is added. Its eventual private booking-linked storage, consent, encryption, retention/deletion controls, and generic “notes received” event still require separate review. An invitation-plan outbox marker does not send an invitation or export notes.
