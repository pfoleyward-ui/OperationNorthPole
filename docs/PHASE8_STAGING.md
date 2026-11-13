# Phase 8: private staging and launch preparation

Stack: PR #5 / `2e162d1` → `phase8/integration-launch-readiness`. No deployment, remote database, Google authorization, recipient setup, or actual email delivery is performed by development/test commands.

The owner’s latest email-only instruction supersedes Phase 7 SMS references. There is no SMS provider, telephone-number purchasing, or SMS sending implementation. Phone/text/Facebook remain valid sources for bookings Santa receives personally.

## Reproduce the working demonstration

Requires Node 24, npm, Chromium (`/usr/bin/chromium`, or `CHROMIUM_PATH`). From the checkout:

```sh
npm ci
npm run build
npm run check:staging
```

`check:staging` starts/stops a loopback Next production server and a synthetic API bridge. It applies the three original booking migrations **and additive `0004_customer_email.sql`** to ephemeral local D1, plus the separate email gateway migration. It uses signed synthetic Access identities, intercepts the Turnstile script in the test browser, mocks siteverify/Google/Resend, and executes the actual intake, HQ, calendar, reminder and gateway handlers. No mocked proof or provider bypass exists in application code. The bridge trusts synthetic headers only inside this local script; never deploy it.

At 390/430/768/1024/1440/1920px it fills the four-step wizard, receives a Pending reference, verifies no reservation, sends an alert through the durable gateway to the mocked email API, reviews/shares/records explicit agreement/confirms through HQ, syncs Google, advances the synthetic clock, and records authenticated Got It. At 390px it loses the first committed intake response and retries with the same key, proving one persisted request. Screenshots and JSON are in `/tmp/santablizard-staging-review` (or `VISUAL_OUTPUT_DIR`). These are local artifacts, not a published staging URL or physical iPhone test.

Additional checks:

```sh
npm run test:booking
npm run test:backend
npm run typecheck:booking
npm run typecheck:backend
npm run typecheck
npm run build:cloudflare
npm run check:deployment
npm run check:hq
npm run check:integrations
```

`check:deployment` is Wrangler **dry-run only**. It creates local bundles without deploying or creating accounts/resources. Existing public visual scripts run against a normally started Next server, with `CUSTOMER_BOOKING_MODE` unset; the default preview still makes no writes.

## Architecture and defaults

- Website: Next/OpenNext Cloudflare Worker, approved images served as build-time WebP variants with unchanged layout and the existing Next resize/quality settings. The adapter requires Next >=16.4.5, so Next is patched from 16.4.2 to 16.4.5. Patched `glob`/`minimatch` overrides remove the adapter’s reported transitive advisories; the tested adapter is not downgraded. No R2/Images paid binding is needed; the site does not use ISR.
- Site Worker proxies only `/api/bookings` and `/hq*` to the private booking Worker and `/webhooks/resend` to the private email gateway. Assets run through the site Worker first. API/HQ do not run in Next and do not trust an `actor` body field.
- Protected staging: `CUSTOMER_BOOKING_MODE=staging`, `SITE_STAGING_ENABLED=true` and verified Santa Access identity are all required. `STAGING_INTAKE_ENABLED=true` adds the same verified-identity requirement to intake while `PUBLIC_INTAKE_ENABLED=false`. All committed activation flags remain false/disabled.
- Turnstile uses action `booking`; server checks hostname, size, allowlists, rate limits and fresh proof on every attempt. The wizard keeps a payload/key in memory for retries, clears expired proofs and never uses browser storage. Reloading loses an uncertain attempt key: the UI instructs retrying the same letter; contact Santa before starting a replacement after an uncertain result.
- Contact data belongs to the adult organizer. No child names, diagnoses, birthdates, school details or free-text preparation notes are requested. Optional sensory preference and numeric/boolean service questions remain. Pending means received, with no reserved dates, payment or acceptance.
- Booking D1 remains authoritative. Original migrations 0001–0003 are unchanged; **0004** extends durable job constraints while preserving existing receipts. Do not modify already-applied migrations. Gateway D1 has its own `migrations/gateway/0001_notification_gateway.sql`.
- Scheduler uses the reviewed Phase 7 timings: New York including DST, 08:00 morning, 7 days/24 hours/3 hours, escalation offsets 0/120/240/360 minutes, quiet hours 21:00–08:00, no late reminders after event start. Acknowledgment changes no booking/reservation.
- Mrs. Claus and technical backup receive generic email only. Her consent binds to the configured opaque recipient route; route changes require new consent. No destination is inferred from the public website’s contact details.
- Customer confirmation, shared proposal, applied reschedule, decline and cancellation emails use private booking addresses. Scheduling copy comes from validated system state, without organizer names, addresses, child details, prices, free-text notes or HQ links. Agreement is still explicitly recorded by Santa after actual discussion; email sending never records agreement or confirms a request.
- Google events remain confirmed-only and private. `NATIVE_CALENDAR_REMINDER_MINUTES=10` prepares one configurable popup, not another Google email. It adds a short arrival alert distinct from the approved email reminder times; Santa can adjust it during staging. Native popups are skipped during quiet hours and when their configured time coincides with an email reminder. Gateway handoffs re-check the clock before contacting the provider. Native popup timing is independent of Got It and does not count as acknowledgment. Leave native reminder configuration unset to suppress it. No attendees or Google email invitations are created.

## Durable email gateway (Resend)

The private service binding accepts reviewed generic templates only; it rejects SMS and arbitrary recipients/content. Operational recipients are resolved from secret `GATEWAY_RECIPIENTS_JSON`. Customer destinations are resolved from private `BOOKING_DB`, never from a submitted `to` address. Customer template/state must still match D1 at dispatch. Gateway D1 stores frozen payload hash/content, destination, provider ID, attempt/status/error fields and webhook IDs. Access to this database is restricted to the gateway and authorized technical maintenance.

Concurrent acceptance uses a committed unique key and atomic sending fence. Same key/different payload conflicts. Accepted is distinct from delivered. Known 429 rejection backs off and returns through the booking runner’s current acknowledgment/version/quiet-hour/deadline checks before retrying. Network errors, invalid success receipts and 5xx after handoff remain **uncertain** and are never blindly resent. Resend also receives the same idempotency key, but safety does not depend on its finite key lifetime. Known IDs are polled; signed Resend/Svix webhooks recover lost IDs through an opaque delivery tag, check timestamp/HMAC, suppress duplicate webhook IDs and prevent delayed sent events downgrading terminal receipts. Uncertain notification jobs periodically check status without authorizing a fresh send; HQ can also request a safe status check.

If no valid receipt/webhook ever arrives, a handoff remains uncertain. Santa/technical backup must inspect that opaque delivery key in Resend before any separately approved replacement email. Do not clear the durable key or restore only one database to force a resend. This deliberate manual recovery boundary prevents duplicate messages. Failed/bounced messages remain visible; correct the address with the customer through an authorized booking process before planning a separate communication.

## Owner actions before any real staging deployment

These instructions are preparation only. Get explicit authorization for real staging accounts, remote provisioning/deployment and controlled test emails before executing remote commands. Never put secrets in Git or chat. Use Cloudflare dashboard secrets or `wrangler secret put NAME --config <private-config>`.

1. **Domain and Cloudflare:** choose the owned domain and a dedicated hostname such as `staging.<owned-domain>`; `<owned-domain>` is a placeholder, not a purchased or configured name. Add the zone to Cloudflare, copy the exact assigned nameservers into the registrar, and wait for active status. Do not alter current production records. Attach only the chosen staging hostname as the site Worker custom domain after approval; Cloudflare manages its DNS/TLS. Keep all other Workers without routes, `workers_dev=false`, `preview_urls=false`. Do not enable request-body logging or Logpush for these services.
2. **Private config copies:** copy the four `wrangler.*.jsonc` manifests into gitignored `wrangler.<service>.staging.jsonc` variants in the same repository directory and give all four Workers unique `-staging` names. Update every service binding to those exact staging names, including `WORKER_SELF_REFERENCE`. Replace placeholder D1 IDs; do not reuse the all-zero IDs or production databases. Keep the static asset `run_worker_first=true`, `html_handling=none`, `not_found_handling=none`. Use the staging site config for the OpenNext build (`opennextjs-cloudflare build --config <site-staging-config>`).
3. **D1:** create two staging databases after authorization (`wrangler d1 create operation-north-pole-booking-staging` and `wrangler d1 create operation-north-pole-email-staging`). Set booking `DB` in booking/scheduler and gateway `BOOKING_DB` to the first ID; gateway `DB` to the second. Apply all four booking migrations using the private booking config, and the one gateway migration using the private gateway config. Verify migration list and empty synthetic-only tables before activation. Back up both databases and preserve OAuth/HMAC encryption keys before changes; test restoration into isolated databases with delivery disabled.
4. **Cloudflare Access for Santa:** create a Zero Trust team and an interactive identity provider (e.g. Google with MFA). Create a self-hosted Access application for the entire staging hostname, exact approved Santa email only, no Everyone/Service Auth bypass. Copy its audience and `<team>.cloudflareaccess.com` into site and booking Worker config; disable ordinary backup access. Sign in once on iPhone Safari, verify identity via Cloudflare’s Access identity page, and privately set the immutable Access `user_uuid`/JWT `sub` in `SANTA_SUBJECTS` as a JSON array. Verify the app’s actual `sub` matches before granting access. Never use an unverified header to enroll an identity. For staging delivery receipts use the separate machine endpoint `https://webhooks-staging.santablizard.com/webhooks/resend`. Its tiny ingress exposes only POST on that exact path and forwards raw bytes to the private gateway for timestamped Svix HMAC verification. Do not add an Access Everyone/bypass/service-token policy; keep the main staging hostname protected by its exact-email policy.
5. **Turnstile:** create a widget restricted to the selected staging hostname. Set site Worker runtime `TURNSTILE_SITE_KEY` to its public site key and booking Worker secret `TURNSTILE_SECRET` to its private key. Keep action `booking`. Set `BOOKING_ORIGIN` and `HQ_ORIGIN` to the same exact HTTPS staging origin, no trailing slash. Test challenge success, expiration, blocked script and rejection; do not use local test proofs for a real account.
6. **Google:** create/select the owner’s Cloud project, enable Calendar API, set up OAuth consent screen and a Web Application OAuth client. Add the exact redirect `https://<staging-host>/hq/oauth/google/callback`; configure Santa as a test user while the consent screen is in Testing. Store client ID/secret privately on booking/scheduler. Scope is only `https://www.googleapis.com/auth/calendar.app.created`; do not grant broad calendar scopes. Set a stable installation ID, active key ID and JSON AES-256 keyring. Generate each 32-byte key with a password manager/cryptographic generator; keep private backups outside D1. Enable OAuth only in the authorized staging copy. In protected HQ choose Connect Google securely, authorize as Santa, then explicitly create **SantaBlizard Bookings**. Do not manually pre-create a different calendar: the app-created permission and ownership marker are verified. If creation is uncertain, verify/recover its ID rather than creating another calendar. Google OAuth Testing refresh tokens can expire after seven days; resolve consent-screen production/verification requirements before launch.
7. **iPhone calendar:** add Santa’s same Google account in iPhone Settings → Apps → Calendar → Calendar Accounts (path varies by iOS). Enable Calendars, select **SantaBlizard Bookings** in the Calendar app and ensure its sync/alerts are enabled. If the secondary calendar is missing, enable it for that account at https://calendar.google.com/calendar/syncselect and refresh the iPhone calendar list. Review notification previews/lock-screen privacy. Verify the configured 10-minute native popup on a synthetic confirmed appointment and avoid adding another Google email reminder at the same offsets. Test DST, reschedule/cancel propagation and iOS Focus settings on the physical device. These device checks cannot be established by desktop Chromium emulation.
8. **Resend email only:** create an owner-controlled Resend account, add a dedicated sending subdomain, and enter exactly the DKIM/SPF/MX records Resend supplies into Cloudflare DNS. Do not invent DNS values or replace existing MX/SPF records; use a separate subdomain to avoid disrupting existing mail. Add/verify a From address and set the actual reply address. Disable open/click tracking; delivery receipts are sufficient for this workflow. Create a gateway-only API key permitting both sending and retrieving email receipts (Resend currently requires its full-access permission for retrieval; keep it only on this private Worker and review this vendor permission boundary). Set `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` privately. Configure a webhook for `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed` at `https://webhooks-staging.santablizard.com/webhooks/resend`; copy its `whsec_...` signing secret into `RESEND_WEBHOOK_SECRET`. Confirm the webhook includes the `onp_delivery` tag (object/array representations supported); without it, known-ID polling still works but unknown-ID recovery is blocked. Never route other gateway endpoints publicly.
9. **Recipients and consent:** privately set scheduler `NOTIFICATION_TARGETS_JSON` and gateway `GATEWAY_RECIPIENTS_JSON`, e.g. `{"santa":{"recipientKey":"santa-stage","channel":"email"},"mrs_claus":{"recipientKey":"mrs-stage","channel":"email"},"technical_admin":{"recipientKey":"backup-stage","channel":"email"}}` and `{"santa-stage":{"channel":"email","destination":"<owner-approved-test-email>"},...}`. The destination placeholder is not a valid address. Record Mrs. Claus’s prior consent outside this implementation; set `MRS_CLAUS_CONSENT_JSON={"granted":true,"recipientKey":"mrs-stage","reference":"<consent-record-id>","grantedAt":<actual-epoch-ms>}` only after consent. Revocation clears `granted`. Require new consent before reusing a route key for a different mailbox; never silently repoint it. Create stable **distinct** random HMAC secrets for intake/scheduler (`INTAKE_HMAC_SECRET`) and gateway (`GATEWAY_HMAC_SECRET`), each >=32 characters. Changing integration HMAC identity requires a planned migration, not a config-only rotation.
10. **Controlled activation:** after explicit staging authorization only, enable site staging/HQ, staging intake, planner, calendar, OAuth, customer email, notification delivery and gateway delivery in the private staging copies. Keep `PUBLIC_INTAKE_ENABLED=false` and backups false. Enable real delivery last, to specifically approved controlled test mailboxes only, after mocked checks pass. Secret Elf Notes has no collection or sending activation flag. Review logs/status in HQ without exposing tokens/destinations. Deploying any staging variant remains an owner-approved action; no command here performs it automatically.

Configuration placement:

| Setting | Site | Booking | Scheduler | Gateway |
|---|---|---|---|---|
| Access team/audience/subjects, HQ enabled | yes | yes | no | no |
| HTTPS HQ origin | yes | yes | yes | yes |
| Booking origin, Turnstile secret, intake flags | no | yes | no | no |
| Customer booking mode, public Turnstile site key, staging-site gate | yes | no | no | no |
| Stable intake HMAC | no | yes | yes | no |
| Google client/encryption/installation settings | no | yes | yes | no |
| Policy, targets, Mrs. Claus consent, planner/calendar/delivery/customer flags, native popup | no | yes | yes | policy only |
| Provider key/sender/reply-to/webhook secret/recipient map/gateway HMAC/gateway delivery | no | no | no | yes |

The booking Worker has integration settings because authenticated HQ can start OAuth, acknowledge and request reconciliation; only the scheduler runs cron dispatch. The site requires no provider, D1 or OAuth secrets.

## Costs and launch gates

Planning estimates as of 2026-11-08, **not a quote or purchased plan**: at small booking volumes Cloudflare Workers/D1/Access and Resend may fit their free tiers. Budget roughly $5/month if a Workers paid plan is needed; D1/storage/CPU overages are separate. Resend’s published free allowance is commonly 3,000 emails/month with a 100/day cap; budget roughly $20/month if upgrading is necessary. Confirm current quotas/pricing in the actual account before approval: [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [Access](https://www.cloudflare.com/plans/zero-trust-services/), [Resend](https://resend.com/pricing). Google Calendar API is quota-limited without a separate per-request charge; existing Google Workspace subscriptions, if chosen, are additional. Domain registration/renewal varies by registrar/TLD: allow approximately $10–30/year. No SMS, telephone number, R2, Cloudflare Images, paid monitoring or purchased account is required by these manifests. Free quotas may be unsuitable for the combined reminder/escalation/customer mail volume; each stage, resolution and customer update counts as an email.

Public launch remains blocked on actual owner accounts/domain, approved remote staging and controlled email/device tests, production OAuth readiness, final adult customer privacy notice/retention and deletion handling, photo permissions already noted in AGENTS, and explicit intake/launch authorization. No retention period or irreversible deletion schedule is invented. For an authorized deletion request, technical maintenance must delete the customer’s booking and cascading HQ/integration rows and separately delete gateway rows matching `customer_<booking UUID>`/relevant operational delivery keys, plus review Google/provider copies/backups. This is a documented future operational requirement, not an exposed unauthenticated delete endpoint. Secret Elf Notes remains disabled pending separate consent/private access/encryption/retention/deletion implementation and review.

## November 11 continuation: staging asset transport

The account-owned credential verifies at `/accounts/{account_id}/tokens/verify`, not `/user/tokens/verify`. Required product permissions and the exact-email staging Access application are now verified; see the current launch-status document for remaining owner-login gates.

Wrangler's bulk upload still receives a credential-proxy 401 for its temporary JWT. The staging-only helper uses the same documented API and inherited proxy/CA settings, with one asset per multipart request. It keeps the API token and session JWTs in memory and prints counts only. It neither deploys nor changes routing or credential/network configuration. A failed run can be resumed: Cloudflare returns only missing asset hashes on the next session.

After building the private staging manifest and setting `SITE_STAGING_ENABLED=true` in that gitignored copy while keeping intake/HQ off:

```sh
python scripts/upload-staging-assets.py
npx wrangler deploy --config wrangler.site.staging.jsonc
```

The helper refuses production Worker names, public preview URLs, route-bearing manifests, an unprotected site, enabled public intake, a changed asset directory, custom ignore rules or symlinks. Continue to leave every business activation gate off. Do not invent a Santa subject to make the protected site accessible; enroll it only after a real verified owner login. Preserve all existing HMAC/AES keys.

## Isolated Turnstile readiness page

The protected staging frontend can enable `TURNSTILE_READINESS_ENABLED=true` in its gitignored staging manifest and install the existing staging widget's `TURNSTILE_SECRET` privately. This is a narrow exception to the normal site-only-public-key arrangement: the isolated `/launch-readiness/turnstile` checker calls siteverify directly, with no D1/private booking or outbound messaging action. All production manifests omit this gate; the route returns 404 outside the exact protected staging origin. The site still requires the enrolled Santa's signed Access assertion. Intake and backend HQ remain disabled. The page validates the distinct `launch_readiness` action, not a booking submission. Never use its test result or proof as a booking bypass.

## Controlled email test recipient and signed webhook ingress

The owner selected only `santablizard@gmail.com` for controlled staging tests. `STAGING_TEST_RECIPIENT` is installed privately on the staging gateway; for the exact staging origin, delivery requires that field and every resolved operational/customer destination must match it. Test subjects are prefixed `[STAGING TEST]` after reviewed template validation. This does not authorize real customer, Mrs. Claus or oversight mail. Only the Santa opaque test route is configured, with no Mrs. Claus consent or backup/oversight route inferred. Sending remains off until the bounded real-email test step.

`wrangler.resend-webhook.jsonc` is disabled and unrouted by default. `prepare-launch-staging.mjs` prepares a gitignored staging copy with staging service bindings; set `RESEND_WEBHOOK_INGRESS_ENABLED=true` only in that private copy for the approved webhook hostname. No Worker API key, Google secret, D1 or public send endpoint is bound to the ingress. It forwards only exact-host/path JSON POSTs, preserves raw signature bytes, bounds declared size and relies on the gateway's streamed size limit and replay-safe signature checks. Gateway/webhook handler logs do not retain raw payloads or email addresses. Main staging Access protection is unchanged and no bypass policy is used. Configure the Resend endpoint and its private signing key before attempting real sends.

## Private provider preflight and one-time email test

The staging gateway's private service-binding-only `GET https://notify.internal/readiness/resend` reads fixed Resend domain endpoints and returns sanitized authentication/domain/tracking booleans. It is unavailable on production origin, public ingress or ordinary public URLs. It never returns a key, raw provider body, email content or domain-account metadata.

`workers/email-readiness-test.ts` and its default-disabled, unrouted manifest provide operator-controlled `preflight` and `send` modes. It receives no Resend API key and exposes no public trigger. Only a fixed reviewed test subject/body and `santa-stage` route are permitted. A test-D1 claim is committed before the handoff; future invocations read the same durable receipt, with no replacement send after a crash/uncertain response. Sending requires verified domain, tracking explicitly false, a bounded expiry and the gateway's sole approved destination. Subjects receive the existing staging prefix. Tests cover private diagnostics, content restrictions and duplicate/lost-response behavior.

A new Cron registration may not propagate promptly. The November 13 run temporarily used the already-established, otherwise disabled staging integrations scheduler with this runner and staging email D1/private gateway bindings, then restored the original scheduler module, booking-D1 binding and disabled flags. The newly created runner was removed. Do not leave the harness/sending enabled, alter the original HMAC/AES keys, clear its durable claim to force a replacement, or use a production database. Existing delivery records must be reconciled before another independently authorized test key. This helper is not part of normal development commands or production deployment.
