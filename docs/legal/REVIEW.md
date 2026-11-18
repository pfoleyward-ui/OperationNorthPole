# Published policies and Elf Notes launch scope — November 18, 2026

Owner authorized including Elf Notes and building the policy links, then selected **30 days after the visit** as the retention period. Automatic deletion was explicitly left off.

Verified live, without sign-in:

- Privacy Policy: https://santablizard.com/privacy
- Terms of Service: https://santablizard.com/terms
- Guardian notice section: https://santablizard.com/privacy#elf-notes

Current copies: [Privacy Policy](privacy-policy.md), [Terms of Service](terms-of-service.md). The former `.draft.md` files are historical drafts. The website's single copy source is `src/content/legal.ts`.

Google Branding can now use the two live URLs. Home page is `https://santablizard.com`, app name SantaBlizard Bookings, support email the approved Gmail inbox. Save Branding first; external-production switching and any further Google verification remain owner actions. Terms may be optional if Google's form allows it.

The policy describes optional guardian-provided notes, restricted uses/fields, encrypted storage, private invitation access, Santa-only administration, no note content in email/Calendar, consent, correction/deletion, a 30-day manual deadline and backup/request handling. It does not claim real collection has opened. No payment/deposit/cancellation/refund schedule was invented.

A policy-only public website release published these pages and footer links. Production backend deployments/gates and secret-binding names are unchanged; public photo hashes and the first 900 pixels of the prior-live homepage are identical at five widths. All business/collection/automatic-deletion gates remain off. This is an authorized exception to earlier public-version-preservation checkpoints, confined to the requested policy links.

Family routing and manual review are prepared/tested: the separate `notes-staging.santablizard.com` ingress only forwards exact note paths, verifies invitation syntax, origin/body limits and edge requests, and strips cookies/Access assertions. Actual private invitation validity remains checked by the booking backend. No Everyone/service-token bypass or Access policy change was made. Real HTTPS browser tests at 390/1440px used a disposable synthetic database, then deleted the notes, worker and database and restored a closed ingress (503). The production family manifest is default-off and unrouted; it is not a live family collection URL.

Santa's authenticated **Elf Notes privacy review** screen shows metadata-only deadlines for the next seven days and canceled visits. A checkbox and explicit delete action are required. Collection can stay off while Santa deletes records. Ordinary notes reads are blocked after the 30-day deadline. Review this screen daily once real collection opens; handle cancellations/deletion requests promptly and delete by each deadline. Automatic cleanup remains disabled: `ELF_RETENTION_APPROVED=false` controls automated deletion, not approval of the manual period.

Validation: 118 full backend tests, 148 domain tests, 15 focused family/notes tests, app/backend/domain types, public OpenNext build, public/default-off family dry-runs, local privacy/HQ browser checks, real five-width legal/homepage/Services checks, real family HTTPS checks and final metadata/gate checks passed. Initial family probe/deployment-propagation failures were retained in the attempt-history evidence; the final run passed and cleanup was verified. Real owner private-family usage and production activation are not inferred.

**Next owner action only:** paste the live Privacy Policy and Terms URLs into Google Branding and save. No extra phone settings task is needed now. Retain every production activation gate until the remaining Google/production/account/recovery gates and explicit launch approval are handled.
