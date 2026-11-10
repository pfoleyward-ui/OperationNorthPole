# SantaBlizard production launch — 2026-11-10

**Production activation is withheld.** The public website remains on its existing deployment. Private services and isolated databases have been provisioned, but public intake, HQ access, Google OAuth/sync, email delivery, planning and optional child-note collection remain disabled. Automatic Elf Notes deletion remains pending at the owner's explicit request.

## Actual resources and changes

Initial Cloudflare discovery found only `operationnorthpole`, its two custom domains, and two empty staging D1 databases. No Access applications, identity providers, Turnstile widgets, queues, provider secrets or private service Workers were present. An existing Zero Trust team domain was subsequently supplied by the owner: `proud-shape-91a4.cloudflareaccess.com`.

| Resource | Production | Staging |
|---|---|---|
| Public website | Existing `operationnorthpole`; unchanged | Full-site upload blocked; local browser staging passed |
| Booking + HQ + Elf Notes | `operation-north-pole-booking` | `operation-north-pole-booking-staging` |
| Scheduler | `operation-north-pole-integrations` | `operation-north-pole-integrations-staging` |
| Email gateway | `operation-north-pole-notifications` | `operation-north-pole-notifications-staging` |
| Private HQ/notes gateway | `operation-north-pole-site` | `operation-north-pole-site-staging` |
| Booking D1 | `a2c79b9c-a578-4d0c-86c4-27f0b1e72b8c` | Reused `4db01c7d-9271-4b68-9839-323bb6887c6f` |
| Email D1 | `2f5bf022-d088-48a8-af05-c9958be3c5a0` | Reused `6ae1f1e9-7014-4cd8-abcb-ba12e2549cf7` |

All four databases have actual API-verified migration histories: booking 0001–0005; gateway 0001. Historical booking migrations 0001–0004 were preserved. New 0005 isolates encrypted optional notes, hashed invitations, transactional arrival alerts and bounded rate-limit records. No production test records were inserted.

The zone has no Worker path routes. Its only Worker custom domains are the existing apex/www mappings to `operationnorthpole`. HTTPS certificates are active; the zone reports TLS mode `full`. DNS record listing returned Authentication error (10000), so DNS Read/Edit permission is needed before inspecting/applying Resend's actual records.

All private services have workers.dev and preview URLs disabled, no public routes, and observability/body logging disabled. Scheduler and email reconciliation have one-minute Cron triggers; activation gates prevent work. No queue is needed: the existing D1 outbox, claims and delivery receipts provide the durable workflow. No paid plan was purchased or upgraded. Account subscription/quotas cannot be verified with the current token.

Distinct staging/production HMAC secrets and AES-256 keyrings were generated privately and installed as Cloudflare secrets. Google OAuth and Elf Notes use separate encryption keyrings. No secret values are included in source, inventories or this report. Secure owner-controlled archival of these application keys remains a launch requirement; changing stable HMAC identities or losing encryption keys requires a recovery/migration plan.

`wrangler.private-site.jsonc` deploys a small private gateway without public assets. The full Next staging asset upload failed because the configured credential proxy rejected Cloudflare's temporary asset-upload authorization. The existing public Worker was not rebuilt or redeployed as a workaround. `wrangler.site.jsonc` remains available for full-site preparation; do not substitute the private gateway for the public website.

Run `node scripts/prepare-launch-staging.mjs` to reproduce disabled gitignored staging configurations with the reused database IDs. It preserves existing configuration files and never copies secrets or deploys anything. Deploy private services in order: notifications, booking, integrations, private-site. Do not deploy `wrangler.public.jsonc` as part of backend setup.

## Secret Elf Notes implementation

- Confirmed, future home visits alone can receive a new invitation. Families may skip notes without affecting a booking. Up to 12 children per booking; all six child fields are optional and bounded.
- Parent/legal guardian consent is required on every save; consent version and time are recorded. No diagnosis, medical, school, birthdate or other unknown structured fields are accepted. The form explicitly instructs guardians to exclude sensitive information from every optional text field; semantic content cannot be reliably classified by field validation alone.
- Invitations use 256-bit random bearer capabilities in the URL fragment, not the HTTP URL. JavaScript immediately removes the fragment from browser history. Only HMAC token hashes are stored. Replacement links revoke earlier links. No token or notes are stored in localStorage/sessionStorage, cookies, emails, Calendar events or logs.
- Notes use authenticated AES-256-GCM encryption with booking-specific associated data and a separate keyring. Responses are private/no-store/no-referrer/noindex, with restrictive CSP and frame denial. Family access uses POST + bearer header + exact-origin validation; reads never use query strings.
- Families can read/update their optional notes and delete them immediately. Version checks prevent stale/concurrent overwrites. Cancellations revoke reading and further collection while valid guardians and Santa retain deletion controls. Expired-link holders can request deletion through Santa.
- Only the authenticated Santa role can create invitations, read notes inside HQ, or delete them. Backup access cannot read notes. The HQ has a secure **Read Elf Notes** button. Values use DOM textContent, never HTML interpolation.
- Transactional D1 triggers create generic arrival-alert records. The durable private email gateway receives only an opaque booking reference and the generic notice; no note contents or invitation capabilities cross it. Delivery remains disabled pending provider/recipient setup.
- The 30-day purge is implemented against the current visit end, so reschedules update its effective deadline. Both `ELF_RETENTION_APPROVED=true` and a nonempty approval reference are required. The owner chose to leave this pending; deployed retention gates are false. This policy never deletes booking history.
- Invitations expire 30 days after the scheduled visit even while automatic deletion remains pending. This limits capability lifetime; it does not silently apply the unapproved retention policy.

## Verification and evidence boundaries

Final verification: **94/94 backend tests and 148/148 booking-rule tests passed**. Backend/domain/application type checks passed, the Cloudflare production build passed, and all four deployment dry-runs passed. Existing staging/HQ/integration browser suites passed at 390/430/768/1024/1440/1920px; the new optional-note browser suite passed at 390/768/1440px. Mobile screenshots were inspected. These are desktop browser emulations, not physical-device tests.

The final remote scheduled run, `launch-test-20261110-v5`, persisted **46/46 passed checks** in actual Cloudflare D1, including synthetic-record cleanup. The temporary test Worker was removed afterward. Earlier runs are retained as failed/incomplete evidence, not reported as successes. One interrupted run required verified synthetic-only cleanup through the API. Duplicate per-booking outbox planning was reduced before the successful rerun. Simulated email handoff receipts were accepted; no real delivery or provider account was tested.

Read the companion launch evidence for the final test counts, deployment versions and remote synthetic-run outcome. Local tests exercise real Miniflare D1 migrations/transactions and signed synthetic Access identities. Browser staging uses simulated Turnstile, Google and Resend; no messages are sent.

The private scheduled Cloudflare test runner has no fetch route. It uses the actual staging D1 databases, real Worker runtime and private service-binding gate probes, then invokes the application handlers with simulated provider responses and a synthetic signed Access identity. Its persisted evidence contains only check names/statuses and safe diagnostic codes. It cleans its synthetic bookings and delivery records. **This does not verify real Google authorization, real Turnstile, Resend deliverability, actual Access login or iPhone behavior.**

Actual Cloudflare execution exposed a defect missed by local tests: Workers rejects `Request.redirect="error"`. Notification service-binding requests and Google/Resend server requests now use `manual`; existing response-status checks reject redirects without following them or forwarding credentials. The browser's supported `redirect="error"` behavior remains unchanged. Provider redirect regression coverage was added.

Public HTTP checks: `/` and `/services` 200; www 308; `/book`, `/hq`, `/api/bookings`, `/review`, `/elf-notes` and `/webhooks/resend` 404. No public copy, CSS, service prices, approved images or booking preview were changed.

Recovery: actual API schema backups of both empty production databases were restored into temporary isolated D1 databases. Exact schema and migration histories matched (booking 37 schema objects/5 migrations; email 4 objects/1 migration). Temporary databases were deleted. This verifies empty-schema recovery only. Full D1 export creation succeeded, but downloading its R2 export was blocked by network policy; a populated-data backup/restore and coordinated provider reconciliation remain unverified.

Live Wrangler tail streaming returned HTTP 403. Deployment API responses and the private runner's persisted evidence are available; production log streaming is not verified. No deployment success is inferred solely from compilation.

## Missing credentials and owner actions

1. **Cloudflare token permissions:** Access app creation returned `auth.forbidden` (1010). Organization/user reads returned Authentication error (10000). Grant the configured token Access Apps and Policies Edit, Access Organizations Read and Access Users Read. Turnstile widget listing succeeds and is empty; creation returned Authentication error, so Turnstile Edit is also required. Do not paste token values in chat. With those permissions, automation can create restricted applications and widgets directly.
2. **Santa Access identity:** approved email is `santablizard@gmail.com`. Prepare exact-email allow policies for `staging.santablizard.com` and `hq.santablizard.com`; no Everyone/bypass/service-token policy. The owner must complete interactive sign-in so the immutable verified JWT subject can be enrolled in `SANTA_SUBJECTS`. Audience IDs and subjects are not invented. Backup access stays off. Verify issuer/audience/signature/expiry and anonymous denial before attaching any route.
3. **Google:** supply owner-controlled OAuth client ID/secret through secure settings, enable Calendar API and the narrow `calendar.app.created` scope. Configure exact callback `https://staging.santablizard.com/hq/oauth/google/callback`, and separately the approved production callback `https://hq.santablizard.com/hq/oauth/google/callback`. Santa must authorize the app and explicitly create the dedicated calendar. No real Google connection or calendar currently exists in D1. Production consent-screen readiness, token lifetime and physical iPhone sync/alerts remain unverified.
4. **Resend:** supply API key, verified sender/reply-to and webhook signing secret through secure settings. Supply the actual verified-domain DNS records before any DNS write; never infer DKIM/SPF/MX values or replace existing mail records. DNS write permissions may be needed to apply provider-supplied records. Disable tracking. Only the signature-verified webhook path may be public, never arbitrary gateway routes. No sender, webhook or real delivery is configured.
5. **Approved private recipients:** supply controlled test mailboxes and opaque route keys through secret configuration. Configure Santa, Mrs. Claus and technical backup explicitly; do not infer notification recipients from the public contact email. Mrs. Claus needs actual recorded consent bound to her exact route. The synthetic test consent is not real consent and is never installed on production services.
6. **Secure recovery:** archive generated application HMAC/encryption keyrings in owner-controlled secure storage; preserve matching database snapshots and keys together. Enable the allowed export-download host for full backup testing, and the required live-log transport if streaming logs are required. Asset-upload credential scope/proxy behavior must be corrected before full-site staging uploads can be validated.
7. **Privacy and device checks:** review final adult booking privacy/deletion operations and physical iPhone Access/Calendar/Focus/lock-screen behavior. The 30-day optional-note policy remains explicitly pending; no approval is inferred from elapsed time or this deployment.

Missing deployment settings (provide secret values only through secure settings):

| Service | Missing settings |
|---|---|
| Booking + full staging site/private gateway | `ACCESS_AUDIENCE`, verified `SANTA_SUBJECTS`; team domain is already prepared |
| Booking | Real `TURNSTILE_SECRET`; staging frontend also needs public `TURNSTILE_SITE_KEY` |
| Booking + scheduler | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; real OAuth authorization and dedicated-calendar setup; private `NOTIFICATION_TARGETS_JSON` and actual `MRS_CLAUS_CONSENT_JSON` |
| Email gateway | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, verified `EMAIL_FROM`, `EMAIL_REPLY_TO`, approved `GATEWAY_RECIPIENTS_JSON` |

App HMAC/encryption keys are installed. Only the booking service holds Elf Notes decryption/invitation secrets; the scheduler has Google token keys and its stable HMAC but no child-note decryption key. No real recipient/consent/provider values were fabricated.

## Activation and rollback checklist

- [x] Discover live resources; reuse existing staging databases.
- [x] Deploy private booking/HQ, scheduling, email and HQ gateway code in staging and production without public routes.
- [x] Isolate staging/production database IDs and keyrings; apply and verify additive migrations.
- [x] Preserve the original public Worker, domain mappings, approved design and service prices.
- [x] Test local workflow/security/failures and optional-note browser flows; verify empty-schema recovery.
- [x] Complete 46-check private remote synthetic workflow with simulated providers and remove its temporary test Worker.
- [ ] Resolve token permissions and configure Access applications, audiences and verified Santa subject.
- [ ] Deploy protected full-site staging and real Turnstile; verify direct/binding/asset bypass denial.
- [ ] Configure/authorize real Google and Resend; approve controlled test recipients and record Mrs. Claus consent.
- [ ] Complete controlled live provider workflow, webhook/failure/reconciliation tests and physical-device validation.
- [ ] Verify populated backup/restore, owner key archival, quotas/costs and observable live logs.
- [ ] Obtain a separate final approval before public intake, real notifications, child-note collection or public private-service routes.
- [ ] Obtain separate retention-policy approval before automatic optional-note deletion.

For rollback, disable all activation gates first. Preserve the unchanged public Worker deployment and apex/www mapping. Roll private Workers back to recorded previous versions without reversing applied migrations. Do not restore one delivery database in isolation or clear durable idempotency keys to force a resend. Reconcile already handed-off provider messages and Google events before retrying. Restore into an isolated database first and verify schema/data/key compatibility before changing bindings. No automatic rollback or missed acknowledgment may cancel a customer's visit.

**Do not activate the system from this report.** Request final production activation approval only after the remaining critical gates actually pass.
