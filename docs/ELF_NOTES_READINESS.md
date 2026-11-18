# Secret Elf Notes readiness

Owner selected Elf Notes for initial launch and a **30-day retention period after the visit**, enforced by manual review/deletion. **Real collection and automatic deletion remain disabled** until final launch activation. The preparation panel is not an invitation sent to a family. Skipping notes never changes a booking, its price, confirmation or reservation.

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

## Family access and manual retention prepared November 18

The live [Privacy Policy](https://santablizard.com/privacy#elf-notes) and [Terms](https://santablizard.com/terms) cover guardian consent, permitted fields, private bearer access, restricted use and the approved manual 30-day period. The parent screen links to them and records `guardian-v2-20261118` on saves.

The separate family ingress serves only exact `/elf-notes` assets and read/save/delete APIs. It rejects other routes/methods, foreign origins, missing/malformed invitation headers, oversized bodies and redirects, and forwards no Santa cookies/Access assertions/actor headers. Edge IP buckets use keyed hashes, never raw stored addresses. Actual random-invitation authorization, crypto and state/version checks remain in the private backend. No Access policy or Everyone/service-token bypass was added.

Real HTTPS tests on `notes-staging.santablizard.com` passed at mobile/desktop widths against a disposable synthetic database. The temporary data/worker/database were removed; this ingress is restored **off (503)** and points back to booking-staging, which also has collection off. No real family invitation was issued. Production family routing is prepared in a default-off, unrouted manifest for the later release.

Santa's **Elf Notes privacy review** button lists metadata only (reference, visit/deletion dates) for upcoming seven-day deadlines and canceled visits. Review daily when real collection is open. Delete each record by its deadline, and promptly process cancellation/guardian deletion requests. Each deletion requires a checkbox and deliberate submit; booking/price/reservation are unchanged. The deletion endpoint works for authenticated Santa even when collection is off. Ordinary notes reads stop after 30 days. Canceled notes become immediately due for manual review. No automatic cleanup was enabled. `ELF_RETENTION_APPROVED` stays false: it is the automation gate, distinct from the now-approved manual period.

## Remaining before real collection

- Complete production private-family routing/bindings and final collection activation under the final launch approval. Do not repurpose the Santa-only staging Access policy or open HQ to families.
- Preserve and securely archive the existing dedicated keyrings and review operational backup/deletion-request custody. Recovery must not reintroduce records that should have been deleted.
- Follow the published notice and require guardian consent before each save. Do not collect real child information while the collection gate is closed.
- Automatic deletion remains a separate future decision; approval of 30-day retention did not authorize a schedule.
