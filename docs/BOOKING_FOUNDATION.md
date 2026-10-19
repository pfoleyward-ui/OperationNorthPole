# Booking foundation — Phase 3

This is a database-independent domain library, not an active booking system. Public pages retain their existing routes, content, styling, and email inquiry actions. There are no forms, API routes, database connections, OAuth clients, notification providers, or paid resources.

## Catalog

`src/config/services.ts` is the only approved price source. `serviceRates` defines seven typed offerings in integer USD cents, with pricing basis, fixed duration (or null when agreement is required), and one of the existing five marketing category IDs. `bookableServices` adds approved description references and catalog version. The existing `services` presentation export derives its price labels from those rates. `completeParty` supplies the existing Services feature without independent numeric prices. The pre-change marketing content is pinned in a test-only fixture.

Stable bookable IDs: `home-visits`, `photography`, `dj-parties`, `photo-booth`, `complete-party`, `meet-greet`, `trivia`. Public marketing category IDs and anchors are unchanged. A standalone booth does not reserve Santa; the complete party requires Santa, booth, and attendant resources.

## Request validation

`validateBookingRequest(unknown, nowEpochMilliseconds)` returns either a normalized JSON-serializable request or path/code issues. It does not reserve a date, authorize a user, or determine availability.

Inputs include service ID, preferred timing, optional alternative timing, adult customer contact, location, event type, optional guest count/flexibility/instructions, optional duration for variable services, and service-specific planning answers. Unknown fields (including client prices and Elf Notes) are rejected. Questions are optional planning prompts, not new business eligibility requirements. Their final customer-facing wording/requiredness remains a future form decision.

Dates use `YYYY-MM-DD`; times use 24-hour `HH:mm`. All wall-clock input is interpreted in `America/New_York` via explicit Intl timezone formatting. Nonexistent spring-forward times are rejected. Repeated fall-back times require `earlier` or `later`. An optional `latestTime` is the end of a preferred **start-time window**, not the event end; each ambiguous endpoint needs its own disambiguation. Windows are within one local date. Overnight appointments are represented by concrete start/end instants at quote stage.

Christmas Eve and Day are rejected for preferred and alternative requests, and occupied event intervals cannot cross into either day. Intervals are half-open: an event ending exactly at local midnight on December 24 does not occupy December 24. Fixed durations use elapsed minutes, including across DST. Trivia/Meet & Greet request durations may remain unknown; confirmation requires a concrete interval. A one-year technical duration bound prevents unbounded validation work and is not a marketed service limit.

## Quotes and lifecycle

Quotes contain booking/service identity, catalog version, positive integer cents, USD currency, revision, concrete appointment interval, creation and explicit expiry instants. There is no default expiry, automatic travel surcharge, hourly rounding, discount engine, or calculated final quote. Santa supplies the final total; deviations from the published base unit amount require a disclosed explanation. Meet & Greet now has the owner-approved $200 one-hour minimum and $100 per additional 30 minutes. Off-increment durations are rejected rather than silently rounded. Trivia stays $300/session with a concrete duration agreed before confirmation.

Acceptance includes an immutable snapshot of exact quoted terms and is tied to quote ID/revision and records a timestamp and either customer agreement or Santa's recorded offline agreement. It does not confirm the booking. First proposals start at revision one; changed proposals advance exactly one revision and retain their quote identity. Stored quotes must belong to the booking/service on every transition; old acceptance is cleared when returning to review.

Lifecycle: requested → under review → alternative proposed (optional draft) → awaiting customer acceptance → confirmed → completed. Santa may decline/cancel only along explicit allowed transitions. Terminal states cannot be reopened through this API. Customers cannot directly confirm or cancel via the operator transition function. Future customer cancellation requests must be mediated by the authorized application workflow.

Confirmation requires a valid sent quote, matching acceptance, optimistic booking version, and a current conflict-check result. Booth/party confirmation additionally requires staffing verification. Completion requires the event to have ended. Reminder acknowledgment is intentionally not a booking transition and cannot automatically cancel anything.

`TransitionContext.actor` and scheduling checks are trusted **application-layer inputs**, not authentication or proof of availability. Future D1 implementation must authorize callers, compare versions, recheck conflicts, reserve all resources, and persist changes atomically. This library alone cannot prevent concurrent approvals.

Confirmed-booking rescheduling needs a separate pending change proposal while retaining the current confirmed appointment; it is intentionally not implemented by moving a confirmed booking backward through this state machine.

## Scheduling primitives

`requiredResources`, `occupiedInterval`, and `overlaps` describe resource requirements and half-open overlap rules. Buffers must be supplied explicitly; no travel-time provider or default buffer policy is assumed. These functions operate on supplied snapshots and cannot claim live availability. Future D1 constraints must enforce equivalent rules for both inserts and updates.

## Checks and scope

- `npm run test:booking` — Node 24 built-in test runner with TypeScript stripping; no new dependency.
- `npm run typecheck:booking` — strict TypeScript checks for catalog, domain, and tests without changing the legacy application's strictness.
- Existing production build, TypeScript, service, and five-width browser checks remain required.
- `tests/booking/fixtures/approved-marketing.json` pins all approved marketing fields and the exact Santa note.

`vercel.json` disables automatic Git deployments for `phase3/booking-foundation` only. Other branches retain their default behavior. Do not merge or deploy without owner approval.

Before real booking collection: settle hourly billing/duration policy, service question wording/requiredness, quote expiry policy, and any travel/setup buffers. Secret Elf Notes remain excluded until consent, retention, encryption, and deletion policy are approved. These decisions do not block this foundation.
