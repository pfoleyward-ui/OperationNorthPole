# Phase 4 — customer booking preview and sensory-friendly visits

This branch is stacked on the revised, unmerged PR #1. Neither PR may be merged or deployed without owner approval. Vercel automatic Git deployment is disabled for both development branches.

## Implemented

- A shared parchment Sensory-Friendly Santa Visits panel appears on the homepage and Services page. It uses owner-approved statements: experience with children with special needs; quiet, patient, child-led interaction; flexibility for individual comfort; no forced hugs or photos; no added charge to the existing $150/30-minute house call. There are still seven paid services, not eight.
- `/book?service=<id>` demonstrates the four approved steps, with seven-service preselection, preferred start/window and alternative date, sample event location, sample adult contact and service-specific questions, review, and a clearly labeled practice receipt. It uses the existing catalog, date/DST validators, and approved Meet & Greet/Trivia pricing.
- Optional sensory-friendly preference is a boolean; no reason, diagnosis, medical details, child names, or private preparation notes are requested. Domain validation rejects those unsupported structured fields. Ordinary future free-text fields will require privacy guidance and minimization before activation.
- A submission availability gate always reports secure persistence unavailable. A repository interface describes the future server-side, idempotent requested-booking save; no database implementation, API route, server action, provider, or network request exists.

## Activation boundary

The preview intentionally cannot collect a real booking. Contact, venue, guest-count, event-type, instructions, and planning-question values are locked to fictional examples. Only service, dates/times, duration, and an optional sensory-friendly preference are interactive, in ephemeral React state. There is no localStorage/sessionStorage, payload in URLs, submission fetch, receipt ID, or claimed availability. Current public inquiry buttons retain their existing mailto links; no public booking button points to this unfinished route.

The final action says **Check practice letter — nothing sent**. Its receipt says **Practice Letter Complete — Nothing Sent**. The future live “Your Letter Is on Its Way to Santa!” copy must appear only after a server confirms successful durable persistence. This preview must not be represented as accepting requests.

## Next implementation step

Implement a server-only submission service and D1 repository in a separate, approved phase. Revalidate unknown input independently on the server; rate-limit/spam-protect it; atomically persist a requested booking plus idempotency metadata and future outbox record; return a receipt only after commit. Add tests for duplicate/retried requests, rollback, authorization boundaries, and provider/database failure without false receipts. Confirm privacy notices and adult data retention before real collection. Santa HQ consumes these central requested bookings later. No provisioning or adapter implementation occurs in this PR.

Private preparation notes remain deferred until explicit consent, access controls, encryption, retention, and deletion controls are approved. Do not enable a free-text sensory/medical questionnaire.

## Verification

- `npm run test:booking`: pricing, quote identity/revision, DST/date validation, sensory boolean and excluded private fields, fail-closed submission.
- `npm run typecheck:booking`, `npm run typecheck`, `npm run build`.
- `npm run check:booking-preview` against a production server: five widths; complete practice flow; holiday and alternative-date rejection; all seven query selections; Meet minimum/increments; fixed Trivia session price; DST gap/fold; synthetic read-only contact fields; no network writes/browser storage; no public links activating the unfinished route.
- Existing `check:visual` and `check:services` remain required. `node scripts/check-preserved-layout.mjs <baseline capture directory> <current capture directory>` verifies existing homepage section sizes and copy and compares hero pixels, allowing the intentionally added sensory panel to shift later sections.

Browser artifacts are generated outside the checkout by default. Selected fictional-data screenshots under docs/review/phase4 are review evidence, not a public preview or deployed booking system.
