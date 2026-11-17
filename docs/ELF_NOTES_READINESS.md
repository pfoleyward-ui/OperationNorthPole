# Secret Elf Notes readiness

Secret Elf Notes is implemented, but **real collection and automatic deletion remain disabled**. The preparation panel is not an invitation sent to a family. Skipping notes never changes a booking, its price, confirmation or reservation.

## What the backend supports

- Confirmed home-visit invitations issued only by authenticated Santa. Links use a random private bearer token; only its HMAC is stored. Reissuing a link invalidates the previous link. The browser removes the fragment from its address bar, stores no token in local/session storage and sends it only in an Authorization header.
- Explicit parent/legal-guardian consent on every save. Up to 12 optional child entries with first name, interests, toys, pets, achievements and traditions; field/count/length limits and a strict structured-field allowlist. The screen prohibits surnames, medical/diagnostic information, schools, birthdates, contact details and sensitive family information. Free-text instructions cannot guarantee that a guardian never types prohibited information.
- AES-GCM ciphertext, using a dedicated note keyring and booking-bound authenticated data. Notes are separate from booking details. Wrong-booking ciphertext or tampered records fail closed. Santa can read notes through authenticated HQ; the backup role cannot.
- Family read/edit/delete through the private link, version checks to reject stale saves, and Santa deletion. Cancellation blocks reading/saving while keeping authorized deletion controls. Manual family deletion is separate from automatic retention.
- A generic Santa email saying optional preparation notes are ready. Neither child content nor the family bearer link enters email or Calendar. Durable gateway receipts prevent replacement sends after ambiguous handoffs. A failed notes transport does not block normal booking/Calendar/reminder processing.
- Final pre-send checks suppress unsent note alerts after cancellation, family deletion, seven-day alert expiry or a quiet-hour boundary crossed during a slow receipt lookup. A handoff already in flight can still complete.

## Synthetic verification and release boundaries

Local workerd/D1 and browser tests cover consent, private/expired/rotated links, encryption, wrong-booking/tampered ciphertext, multi-child saves, stale edits, family/Santa deletion, backup denial, no browser storage, private response headers, no layout overflow and unchanged booking/reservations. A separate disposable Cloudflare D1 rehearsal tests the same application functions; no real family/child data or operational encryption keys are used.

For a future separately authorized repeat, `python scripts/check-isolated-backend.py --send-approved-staging-emails` explicitly runs the live-email rehearsal using the existing private staging configs. It creates its own database and restores the original disabled services before deleting the database. Do not rerun merely to recheck an uncertain receipt; reconcile that original receipt instead. The default-off `workers/backend-readiness-test.ts` has no HTTP trigger. Its enabled rehearsal requires a pre-seeded disposable-database guard and rejects operational staging IDs. Only its isolated application environment enables synthetic notes. It can send three approved-inbox staging messages through the existing private gateway: generic notes alert, real-clock 24-hour reminder and acknowledgment resolution. A synthetic principal acknowledges only the disposable booking; this does not impersonate Santa on the deployed HQ or establish a real interactive Got It test. The reminder's fixture appointment is tomorrow, with the normal 24-hour reminder becoming due two to three real minutes after preparation. Other jobs are not dispatched; Calendar/customer-email remain off. Links in these generic test emails refer to disposable fixture IDs and are not family invitation links or operational booking records.

## Decisions still required before collecting real notes

1. Review the family notice/guardian-consent copy and authorized uses. Existing copy limits use to visit preparation and explicitly says skipping never affects the visit.
2. Approve and verify family routing. The existing exact-email Access policy protects the entire staging host; families cannot use this hostname without being that approved owner. No Everyone or service-token bypass is permitted or has been created. A family link's bearer access model and separate route/domain require an explicit review before release.
3. Decide retention and the handling of requests, expired links, backups and provider copies. Current invitation access expires 30 days after the visit; this is separate from data deletion. No automatic retention/deletion approval is inferred. Existing proposed 30-day deletion remains off.
4. Securely archive the existing distinct keyrings and confirm the approved operational recovery/custody process. Preserve existing keys; do not rotate them to satisfy this checklist.
5. Separately approve collection activation. Adult booking launch can proceed with Secret Elf Notes disabled once its own launch gates pass.

The current panel can safely remain “preparation only” while these decisions are pending. No owner phone setup is required to finish the independent backend tests.
