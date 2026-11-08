# Phase 6 — Santa HQ

Phase 7 now adds the separately reviewed [calendar/notification integration](CALENDAR_NOTIFICATIONS.md), including the approved reminder/escalation defaults and authenticated acknowledgment. The Phase 6 future-work statements below are historical; all production delivery and notes-collection gates remain off.

`phase6/santa-hq` is stacked on PR #3, commit `8824969` (`phase5/secure-booking-backend`). This is local implementation for review, not deployment. No remote/paid resource, production migration, public intake, outbound notification, or Secret Elf Notes collection is activated. Public pages, prices, imagery, sensory accommodations, and the practice wizard are unchanged.

## Santa’s daily desk

The authenticated `/hq` dashboard is served by the existing Cloudflare Worker next to its private D1 binding. Customer records do not travel through Next.js or public read endpoints. The new parchment/evergreen/burgundy/gold interface has labeled 48px buttons, responsive forms, focus indicators, contact shortcuts, and no browser storage of booking details.

- **New Requests** is the open correspondence queue: Pending, under review, alternative proposed, and awaiting agreement. A letter does not disappear when Santa starts reviewing it. Results use 25-row keyset pages.
- **Today’s Events** uses the server’s current America/New_York day and confirmed/completed appointment intervals, not browser-provided “today.”
- **Calendar** is a New York day agenda with a date picker, requested dates, confirmed appointments, and controls to block/release unavailable Santa, booth, or attendant time. Requests never reserve resources.
- **Add Booking** records phone/text/Facebook requests with adult contact, location/type, service, timing/duration, guest count, and optional boolean sensory preference. It starts Pending and collects no private child/preparation notes.

Details include requested/alternative times, actual quoted appointment, location, service, sensory preference, contact details, reference, quote/revision, agreement, and source. Call/email/Apple Maps links are user-initiated; no address is automatically sent to a map provider. User content enters the DOM only through textContent, never HTML.

Review, decline, quote proposal, recorded offline quote sharing, exact customer agreement, confirmation, reschedule proposal/sharing/agreement/application, cancellation, completion, staffing verification, and invitation preparation are separate actions. Decline/cancel also prompt for browser confirmation. Failed/stale writes show an error and a reload control. No action automatically sends a message, takes payment, or confirms a request without agreement and a successful database commit.

## Authentication and operational configuration

Every HQ HTML/JS/CSS/read/write requires a cryptographically verified Cloudflare Access application JWT. JOSE checks RS256 signature against the configured team’s HTTPS JWKS, exact issuer/audience, expiry, issued-at, not-before where present, and required claims. The maximum accepted age is 24 hours; shorter provider session settings still apply. A verified interactive email claim is required, but roles use configured immutable subject IDs, never email headers, request bodies, cookie text, or `actor: "santa"`.

Santa’s subject allowlist grants daily operation access. Backup subjects are denied unless an administrator explicitly enables the server-side escalation gate. The UI cannot enable escalation or grant roles. Backup actions are audited as `backup`, not Santa. Configure Cloudflare Access for `/hq` and `/hq/*`, with an interactive identity policy, the intended audience, MFA, appropriate session duration, recovery, and owner-reviewed escalation access. A service-token policy is not a substitute for Santa’s sign-in. The Worker independently verifies tokens even if an edge rule is accidentally omitted. The JWKS URL comes only from the validated server team hostname, not JWT headers or user input.

| Server setting | Purpose |
| --- | --- |
| `HQ_ENABLED` | Committed `false`; enable only in separately approved configured staging. |
| `HQ_ORIGIN` | Exact HTTPS origin, without path or trailing slash. |
| `ACCESS_TEAM_DOMAIN` | Actual `<team>.cloudflareaccess.com` hostname. |
| `ACCESS_AUDIENCE` | Actual HQ Access application audience. |
| `SANTA_SUBJECTS` | JSON array of Santa’s verified Access subject IDs. |
| `BACKUP_SUBJECTS` | Separate JSON array of escalation backup subject IDs. |
| `BACKUP_ESCALATION_ENABLED` | Committed `false`; server-controlled, never a request flag. |
| `INTAKE_HMAC_SECRET` | Stable high-entropy server secret, at least 32 characters, reused from Phase 5. Never expose it to browsers/chat. |
| `DB` | Private D1 binding with both migrations reviewed/applied in an approved environment. |

The current cloud environment has no production identity settings or HMAC binding. No identities or credentials were invented/provisioned. Real Access/MFA/recovery and staging ingress remain untested. Keep `PUBLIC_INTAKE_ENABLED=false`; no outgoing sender is implemented. Workers.dev, preview URLs, HQ, and intake are disabled in committed Worker configuration, and Vercel automatic deployment is disabled for this branch.

Mutations require POST, exact HTTPS Origin, JSON content type, a bounded streaming body, an operation key, and verified authorization. Cross-site requests/unsupported fields are rejected. Responses are private/no-store/noindex with self-only script/style/connect CSP, framing denial, suppressed referrers, and no customer/token/SQL error logs.

## D1 state, scheduling, and lifecycle

The migration is additive. Phase 5 `booking_requests` remains the immutable original request/receipt. `hq_bookings` holds versioned operational state. Existing receipts appear as Pending/version one; their first authorized operation creates an HQ state row without rewriting the receipt. The intake’s original Pending receipt is not a public current-status API.

The pure lifecycle retains quote identity/revision, exact acceptance, holiday/DST validation, completion timing, and terminal-state guards. Only authenticated server code derives the Santa actor context. Clients cannot submit an actor, acceptance object, schedule-check flags, status, final version, or quote identity to bypass those checks.

Each operation compares the stored version using a conditional D1 update. All later writes in that same transactional batch are gated by its unique operation marker. A stale screen cannot replace another operation’s reservations. HMAC-keyed per-subject operation IDs support retries: matching commands return the original committed state; changed commands conflict. State, audit metadata, resources, and a PII-free future outbox marker commit together or roll back together.

Confirmed bookings reserve the existing catalog resources: Santa; booth plus attendant; or all three for the complete party. Half-open intervals permit true adjacency. Before/after buffers are explicitly chosen by Santa, including zero. No travel calculator, default business hours, extra capacity, or new booking-retention policy is invented. SQL triggers reject overlapping reservations and unavailable intervals. Creating an unavailable block also rejects conflicts with existing confirmed reservations. Block/release operations are idempotent and separately audited.

Booth/party confirmation requires a stored staffing verification for the exact quote ID/revision/appointment. An authenticated operator supplies the attendant business reference after actually verifying staffing; a client boolean is insufficient. The existing model has one Santa, one booth, and one attendant resource. Additional team/equipment capacity requires a reviewed model change. No external staffing provider is claimed.

### Quotes and rescheduling

All approved numeric prices remain in the shared catalog. Blank custom total uses the server’s duration price. Fixed durations, Meet & Greet’s approved minimum/increments, and Trivia’s agreed duration/session price remain enforced. Custom totals require the existing adjustment explanation, and below-minimum Meet pricing is forbidden. Santa explicitly chooses quote expiry; there is no new automatic expiry policy.

Recording a quote as shared means Santa has discussed these exact terms by phone/text/Facebook/in person outside HQ. It sends nothing. Recorded customer agreement binds the exact snapshot/revision and server recording time as `recorded_offline`; it does not confirm automatically.

A confirmed reschedule is a separate change proposal. The original confirmed quote, acceptance, and reservations remain while changed terms are prepared, shared, and agreed. Applying the change validates agreement/version and atomically swaps reservations. A new booth appointment/revision requires new staffing verification. Conflict or write failure preserves the original booking; discarding a proposal keeps it too. Confirmed bookings are not moved backward through the request lifecycle. Cancellation/completion release resources atomically, and completion still requires the event to have ended. Reminder acknowledgment cannot cancel anything.

Booking/audit retention, verified deletion requests, and retry/tombstone behavior after deletion still need owner decisions. No automatic booking deletion was added. Existing foreign-key cascades preserve future controlled-deletion capability.

## Secret Elf Notes — metadata only

Only confirmed home visits can prepare an invitation plan, enforced by application guards and a D1 trigger. The plan stores booking ID, preparing operator/time, and database-constrained `collection_enabled=0`. It creates no bearer link, family portal, consent record, note content, recipient notification, or child questionnaire. Cancellation makes a prepared plan ineligible for use.

The UI states that sharing will be entirely voluntary and skipping will never affect the visit. There is no notes-submission route, child-name/diagnosis/birthdate/school column, or flag that can enable collection. Before implementation, review consent/withdrawal wording, family/Santa-only private access, invitation/token lifecycle, encryption/key handling, approved fields/minimization, retention, authenticated deletion, and backup handling.

Future submitted notes must reference their booking. A future notification may contain only opaque booking/note references and a generic “notes received” indication—never notes, child information, or sensitive URL parameters. No unapproved notes schema or retention period is implemented.

## Local verification

Use the existing checkout and Node 24; no worktree or remote/paid account is required.

```sh
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run test:backend
npm run test:booking
npm run typecheck:backend
npm run typecheck:booking
npm run typecheck
npm run build
npm run check:hq
```

The 42 local workerd/D1 backend tests include 24 HQ and 18 inherited intake tests. HQ uses real RSA signatures with synthetic JWKS responses. Coverage includes invalid/expired/forged/wrong-audience/unauthorized identities, backup gates, origin/body limits, Phase 5 receipts, manual retries, quote/agreement guards, version races, simultaneous conflicts, buffers/unavailability, exact staffing revisions, rollback, rescheduling/cancellation, prices/DST/holidays, audit failure, and disabled Elf collection. No real Access login is claimed.

`check:hq` starts an ephemeral loopback/D1 fixture with synthetic adult records and signed test identities. It translates only its own loopback Origin to the synthetic HTTPS origin, modeling the same-origin handler; no test bypass exists in the Worker. It checks 390/430px touch emulation and 768/1024/1440/1920px layouts, anonymous denial, manual Pending creation, Today/calendar/contact links, hostile text remaining text, large controls, keyboard navigation, no overflow/browser storage, and disabled notes collection. The 390px flow additionally exercises custom pricing, quote sharing/agreement, confirmation, reschedule, cancellation, and resource block/release. This is Chromium emulation, not a physical iPhone/Safari test.

The public homepage/Services/practice-booking browser suites also passed at five widths. Preserved-layout checks report unchanged original section sizes/copy and zero hero pixel delta against Phase 5. There are no changes to `src/app`, `src/config`, or `public`. Selected [synthetic HQ screenshots/report](review/phase6/README.md) are review evidence, not a public preview/deployment. Exact approved-homepage-render comparison still needs the previously missing original image.

`npm run dev:backend` starts the actual bundled Worker locally with both gates closed: `/hq` returns 503 `hq_disabled`; POST `/api/bookings` returns 503 `intake_disabled`. Wrangler’s optional Request.cf bootstrap is blocked by this workspace proxy, but local startup and these responses were verified. Do not use `--remote`, deploy, or change gates for a demonstration.

## Phase 7 readiness and blockers

The review foundation is present: stable booking references, durable versions/quotes/agreements, atomic reservations, authorized private reads, audited mutations, and transactional PII-free event markers. No Google account, event mapping, sync/delivery consumer, reminder scheduler, or Mrs. Claus automation exists yet.

Before Phase 7 activation, obtain the intended Google account/calendar, minimum OAuth scopes/token storage, event privacy choices, idempotent delivery/retry/reconciliation design, reminder channels/templates/timezone/timing/opt-outs, and exact Mrs. Claus Protocol rules (triggers, acknowledgments, recipient/delay, and permitted actions). Do not infer that silence/missed reminders cancel bookings, contact a person, or confirm anything.

Phase 6 is ready for code/design review and subsequent Phase 7 development planning. Operational readiness still needs approved Access/D1/secret/routing configuration, real Santa sign-in/recovery and staging tests, and outstanding privacy/retention decisions. Local tests do not establish production readiness. Automated PR creation also remains blocked until the saved `api.github.com` environment allowance is applied.
