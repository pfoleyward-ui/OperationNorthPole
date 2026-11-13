# Operation North Pole

## Cloudflare agent integration

Official Cloudflare skills are vendored under `.agents/skills/`; read only relevant skills when needed. Use the existing project-local Wrangler for this repository; do not install the optional beta `cf` CLI or migrate the application as part of agent setup. Source provenance and hashes are recorded in `.agents/cloudflare-provenance.json`.

Read `docs/CLOUDFLARE_AGENT_SETUP.md` for the official MCP configuration, OAuth/network requirements and verified persistence limits. A local MCP registration does not prove the managed Cloud task has loaded its tools. Keep OAuth credentials outside Git and never send the API credential to a new host without its configured destination binding. Setup validation is read-only: no deployments, booking activation, real notifications, child-data collection or production data changes.

## Product and design

Build SantaBlizard’s nostalgic, polished Christmas website for Hudson Valley, New York. The approved homepage mockup governs implementation; the render was received in this conversation and has guided the current implementation. Use evergreen, burgundy, parchment, antique gold, warm light, and a storybook atmosphere. Preserve existing work when recovered.

The homepage needs branding and location, Home/Experiences/About Santa/Memories navigation, “Invite Santa to Visit” actions, and the approved greeting “Ho Ho Ho! You Found Me! I Knew I Should've Hidden Behind a Bigger Tree!” The approved services update supersedes the original experience labels: Santa Makes House Calls!, Santa & Photography, DJ Santa & Christmas Parties, Santa Photo Booth, and Santa’s Off-Season Adventures. Keep the five-card composition and link to the corresponding /services anchors. Authoritative approved copy and base prices live in src/config/services.ts. Include Meet SantaBlizard, Memories, and a clear footer invitation.

## Architecture and development

Prefer Next.js App Router, React, TypeScript, reusable components, CSS Modules, semantic HTML, accessible controls, responsive layouts, and optimized images. No database is needed for the homepage. Keep dependencies minimal. Use the existing isolated checkout; do not create worktrees unless explicitly requested.

No application or dependency configuration was present at the initial audit. Do not describe new implementation as a repair of recovered source. Inspect newly supplied source before choosing versions or installing dependencies.

## Assets and constraints

Recovered inputs: approved visual mockup, starter homepage, santa-standing.jpg, santa-peeking.jpg, and santa-family.jpg. The starter is a partial project, not the full Windows working directory. The original Windows directory is not accessible from this environment. Do not replace missing brand photographs with unrelated stock images or invent testimonials, pricing, contact information, or business claims. Confirm commercial-use permission for photographs featuring children before public launch. Ask before changing the approved design, adding paid services, or discarding substantial work.

Santa HQ booking operations are authorized within the Phase 6 boundary below. Payments, production deployment, and public intake activation remain outside current authorization.

## Verification and continuity

Run the application and production build. Verify image containment and positioned parents for fill images, CSS class application, navigation, keyboard access, and desktop/tablet/mobile rendering. Use browser screenshots against the approved mockup; a build alone does not verify appearance. Record commands, outcomes, and unrun checks in PROJECT_STATUS.md. Never claim a preview, GitHub save, publication, or visual match without evidence.

## Confirmed public links

Use 845-234-2858 (tel:8452342858) for telephone contact and santablizard@gmail.com for email invitations and https://www.facebook.com/profile.php?id=61584693927127 for Facebook. Do not send messages on the owner’s behalf. Social components are outbound links. The reusable component supports Facebook, Instagram, YouTube, and TikTok, but only active accounts with owner-verified HTTPS URLs may render. Do not invent URLs or embed feeds without a request. Preserve original photographs alongside processed derivatives; document generated illustration provenance in docs/ASSETS.md.

## Visual fidelity

Preserve the reference’s continuous Christmas-world composition: warm street-level village, the approved longer greeting with deliberate line breaks, Santa portrait on the right at desktop, tactile ivory paper layered over timber, overlapping evergreen and holly, warm lantern light, shaped signage, and distinctive self-hosted typography. Avoid smooth yellow gradients, rigid beveled section boxes, and a distant cold-blue panorama. Compare actual screenshots to the supplied reference; build success alone does not establish a visual match. The owner explicitly approved an AI-generated workshop scene using the supplied SantaBlizard photographs as identity references. Use the generated workshop composition for About; preserve the original peeking photograph as source material.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Reference comparison and delivery

The authoritative render is 1024 × 1536. Capture the website at 1024px with `npm run check:visual`, then use `npm run compare:visual -- --reference /path/to/original.png --actual public/review/viewport-1024.jpg`. Never label a before/after baseline as the approved reference. Until the original render bytes are supplied, exact reference overlays remain blocked. Test 390, 768, 1024, 1440, and 1920px. Preserve the approved copy except for explicitly requested changes. The Santa-and-child source must remain untouched. Review the generated likeness with the owner; do not call an AI scene an actual event photograph. The owner supplied https://operation-north-pole.vercel.app/; the domain was reachable on 2026-10-17. Verify the deployed service content before claiming the latest update is live. Do not present workspace file paths as public screenshot links.

## Phase 3 booking foundation

The owner authorized a typed seven-service catalog and database-independent booking rules/tests on `phase3/booking-foundation`. Read docs/BOOKING_FOUNDATION.md before extending them. Do not add forms, HQ, persistence, OAuth, notifications, or deployment in this phase. Preserve the five-category public presentation. All approved numeric service prices belong in src/config/services.ts. Run `npm run test:booking` and `npm run typecheck:booking` in addition to existing checks. Do not merge or deploy without approval; this development branch has automatic Vercel deployment disabled.

## Phase 4 review boundary

The owner authorized sensory-friendly public messaging and a four-step customer booking preview, stacked on PR #1. Read docs/CUSTOMER_BOOKING_PREVIEW.md. Keep contact/location and free-text answers locked to synthetic data until approved server-side validation and secure persistence exist. Do not activate public links to the unfinished wizard, collect private child information, provision paid services, merge, or deploy. Sensory-friendly preference is an optional boolean, not an eighth paid service. Run check:booking-preview and check-preserved-layout alongside existing checks. Meet & Greet is $200 minimum/60 minutes plus $100 per 30-minute extension; Trivia is $300/session with duration agreed before confirmation.

## Phase 5 secure backend boundary

Read docs/SECURE_BOOKING_BACKEND.md. The owner approved server-only Cloudflare D1 intake, atomic idempotency, server validation, bot/rate protection, and initial `pending` status on a branch stacked on PR #2. Pending never reserves dates. Distinct keys represent distinct requests; matching key/payload retries return the original receipt and changed payloads conflict. Keep PUBLIC_INTAKE_ENABLED false, the frontend practice-only, and public/administrative read or lifecycle endpoints absent. Do not merge, deploy, provision remote resources, or enable intake. Secret Elf Notes and sensitive child information remain excluded. No booking deletion/retention period is approved; do not invent one. Run test:backend and typecheck:backend alongside existing booking, frontend, and browser checks. The lifecycle actor field is not authentication; future HQ must authenticate and authorize actual callers before using the pure lifecycle.

## Phase 6 Santa HQ boundary

Phase 6 supersedes the historical HQ prohibition in earlier phase scopes. Read docs/SANTA_HQ.md. The owner approved a separately stacked PR on PR #3 (`8824969`) for authenticated Santa HQ, manual bookings, quote/agreement/lifecycle operations, atomic D1 reservations/staffing/version checks, and mobile review. Verify Access JWT signature/issuer/audience/expiry and configured subjects for every HQ read/write/asset; never authorize a user-supplied actor. Santa owns daily operations; backup subjects are denied unless server-side escalation is explicitly enabled. Keep HQ/public intake and outbound notifications disabled in committed configuration. Preserve public designs/content/prices/sensory accommodations. Do not merge, deploy, or provision paid/remote services. Confirmed reschedules retain original reservations until an agreed atomic swap succeeds. Secret Elf Notes is confirmed-home-visit invitation metadata only: sharing voluntary, skipping never affects visits, no collection/sending until separate consent/private-access/encryption/deletion/retention review. Run check:hq alongside backend/domain/type/build/public visual checks. Phase 7 Google/reminder/Mrs. Claus rules require separate configuration/business decisions; do not invent escalation/cancellation or retention policies.

## Phase 7 integration boundary

Read docs/CALENDAR_NOTIFICATIONS.md. Phase 7 is authorized as a new branch on PR #4 (`3db7e74`) with mocked Google/notification providers only. Approved configurable defaults: New York timezone, 08:00 morning, 24-hour Got It check, escalation offsets 0/120/240/360 minutes, quiet hours 21:00–08:00, no reminders/escalation after event start, and no booking changes because of missed acknowledgment. Only Santa may acknowledge the current cycle; stop unsent escalation and resolve previously alerted routes. Mrs. Claus SMS requires actual recorded consent for her exact configured route. Technical backup is the final level, never an automatic booking operator. Preserve stable HMAC identities, encrypted OAuth tokens, narrow app-created-calendar scope, D1 authority, and private provider bindings. Do not invent recipient destinations or claim a vendor-specific gateway exists. Keep planning/OAuth/calendar/delivery/public intake/notes collection disabled in committed configs. No real messages, paid provisioning, merge, or deployment without approval. Test retries, ambiguous outcomes, quiet hours/DST, stale cycles, race conditions, reconciliation, security, and mobile layouts with test:backend and check:integrations alongside existing checks. Secret Elf Notes remains invitation-plan metadata only until separate consent/access/encryption/retention/deletion approval.

## Phase 8 integration and launch-readiness boundary

Read docs/PHASE8_STAGING.md and docs/PHASE8_READINESS.md. Phase 8 is authorized on PR #5 (`2e162d1`) as a separate branch. The owner's latest instruction supersedes Phase 7 SMS requirements: **email and Google Calendar notifications only; do not implement SMS**. Preserve all four email-only escalation levels, private recipient configuration and Mrs. Claus consent. Add customer scheduling emails without automatic agreement/confirmation. Real-input wizard is protected staging only; public intake, real outbound delivery, OAuth/planner activation and notes remain disabled in committed configuration. Use synthetic records/mocked external providers until owner authorizes real staging accounts and controlled test delivery. Keep all three historical booking migrations unchanged and apply additive 0004 plus the separate gateway migration. Do not merge, provision paid services, enable public intake or deploy production. Follow the runbook for owner accounts/secrets/domain/cost requirements. Run check:staging, backend/domain/security/type/build/deployment dry-run and mobile/public layout checks; do not claim actual iPhone or live provider validation from emulated tests.

## Owner-authorized public website release

The owner explicitly authorized deployment of the approved existing public website/photos/services/sensory messaging to santablizard.com, based on Phase 8 `f766514`. This supersedes earlier production-deployment prohibitions only for this public website. Read docs/PUBLIC_WEBSITE_RELEASE.md. Use `wrangler.public.jsonc`/`build:public`/`deploy:public`; do not deploy backend manifests, merge experimental branches into main, enable bookings/HQ/OAuth/notifications/notes, provision backend data or upload seeds. Public-only mode blocks synthetic preview/review/private endpoints and attaches apex/www with canonical HTTPS redirects. Authentication must happen privately through Wrangler; never request tokens/passwords in chat. Live publication is unverified until actual domain HTTP/browser checks pass.
