# santablizard.com public website release

The owner authorized public website deployment from Phase 8 `f766514`. The release changes are confined to a public-only manifest, routing safeguards, asset packaging and verification. Existing homepage/services/photos/prices/styles/sensory messaging remain unchanged. No merge to `main` is performed.

## Current outcome

**Prepared and locally tested; not deployed or verified live from this environment.**

- `wrangler whoami`: **not authenticated**.
- `curl -I https://api.cloudflare.com/client/v4/user/tokens/verify`: network proxy rejects CONNECT with **403 Forbidden**.
- `curl -I https://santablizard.com`: same proxy CONNECT **403**, before website/TLS verification. This is not evidence that the domain or its certificate is faulty.
- Environment network draft saved with `api.cloudflare.com`, `dash.cloudflare.com`, `santablizard.com`, `www.santablizard.com`, preserving the previously proposed `api.github.com`. Draft changes require review/save in Environment Settings and **Publish**; saving the draft did not activate these hosts.

Target: **https://santablizard.com**, with **https://www.santablizard.com** redirecting to the apex. Neither URL is represented here as a successful live deployment.

## Public-only configuration

`wrangler.public.jsonc` derives from the tested Phase 8 `wrangler.site.jsonc`, using the same OpenNext build and Worker entry. It attaches both custom domains to `operationnorthpole` and uses the existing static image variants. It has no booking/notification service bindings, D1 database, cron trigger, provider/OAuth secrets or backend deployment. Only the standard OpenNext self-reference binding remains.

`PUBLIC_WEBSITE_ONLY=true` serves `/`, `/services`, and the static asset paths used by those pages. `/book`, `/hq*`, `/api*`, `/webhooks*`, `/review*`, encoded path attempts and other non-public paths return 404. Allowed public paths reject writes with 405. The synthetic wizard is not publicly accessible and no D1/test seeds or fixture database is uploaded. Development review assets are removed from the generated upload, without deleting source files. All activation flags remain false; no Secret Elf Notes collection is available.

The Worker issues a permanent 308 redirect from `www` to `https://santablizard.com`, preserving path/query. HTTP requests for either configured domain canonicalize to HTTPS. It fails closed if HQ or staging is mistakenly enabled. `workers_dev` and preview URLs remain disabled.

## Exact owner login and deployment instructions

No passwords or API tokens should be sent in chat. On an owner-controlled terminal with Node 24/npm and Git, obtain this reviewed branch (skip cloning if already checked out):

```sh
git clone --branch phase8/integration-launch-readiness https://github.com/pfoleyward-ui/OperationNorthPole.git
cd OperationNorthPole
npm ci
npx wrangler login
npx wrangler whoami
npm run build:public
npx wrangler deploy --dry-run --config wrangler.public.jsonc
npm run deploy:public
```

`wrangler login` opens Cloudflare's official browser authorization page and uses a local callback. Sign in privately to the account that owns the Active `santablizard.com` zone. If multiple accounts appear, select that account; do not invent an account ID. In a remote/cloud terminal whose localhost callback is unreachable, use the installed Wrangler's device flow instead:

```sh
npx wrangler login --device
npx wrangler whoami
```

Complete its verification URL/code privately in your browser, then run the same build/dry-run/deploy commands. The cloud environment also needs the network draft applied as described above; owner-terminal deployment does not depend on this environment's proxy. Do not paste credentials or login codes into chat.

**Deploy only `wrangler.public.jsonc`.** The single deploy command publishes the website and attaches both custom domains through Cloudflare. It does not deploy the booking, integrations or notification Workers, run migrations, enable intake or create customer records. No extra paid image/storage service is configured.

The domain is owner-reported Active. Wrangler will use Cloudflare-managed custom-domain DNS/TLS. If it reports a conflict with an existing apex or `www` A/AAAA/CNAME record, inspect those exact web records before replacing them; preserve unrelated MX, SPF, DKIM, TXT and other services. Do not add a redirect to an invented Workers hostname. If certificate issuance is pending, allow issuance to finish and verify HTTPS before announcing launch.

## Verify after deployment

From a terminal with access to the domain:

```sh
curl -I https://santablizard.com/
curl -I https://santablizard.com/services
curl -I 'https://www.santablizard.com/services?source=invite'
curl -I http://santablizard.com/
PUBLIC_BASE_URL=https://santablizard.com node scripts/check-public-boundary.mjs
VISUAL_BASE_URL=https://santablizard.com VISUAL_OUTPUT_DIR=/tmp/santablizard-live-home npm run check:visual
VISUAL_BASE_URL=https://santablizard.com VISUAL_OUTPUT_DIR=/tmp/santablizard-live-services npm run check:services
```

The environment-variable prefixes above are POSIX syntax; on PowerShell set `$env:PUBLIC_BASE_URL` or `$env:VISUAL_BASE_URL`/`$env:VISUAL_OUTPUT_DIR` before the corresponding command. Never use `curl -k` or disable browser TLS verification to make live checks pass.

Expected: HTTPS apex homepage/services/images 200; `www` HTTPS redirects 308 to the HTTPS apex with path/query intact; HTTP redirects to HTTPS; disabled route GET/POST checks return 404 and cannot store a booking. The boundary script sends only empty `{}` bodies to disabled routes, not synthetic customer data. It checks the real `www` redirect only when pointed at the live apex; its local mode explicitly records that live-domain verification is pending.

Run manual iPhone Safari checks for photos, service navigation, sensory messaging and contact links after the HTTP checks pass. Verify the owner-approved phone/email/Facebook destinations; testing those links does not authorize sending messages.

## Completed local checks

- Three new release boundary tests passed: read-only public allowlist, private/synthetic preview isolation, exact canonical redirect matrix, fail-closed misconfiguration.
- Complete backend suite: **85 tests passed**. Application/backend TypeScript passed.
- OpenNext public production build and Wrangler public deployment **dry-run** passed; no remote deploy was executed.
- Actual local public Worker: homepage/services/images 200; booking/HQ/webhook/review GET and POST 404; no private bindings or seeds.
- Phase 8 comparison: **zero hero pixel difference** and unchanged existing section geometry/copy at all five widths.
- Public visual/service checks: 390/768/1024/1440/1920px; images, navigation, approved prices/content, sensory messaging, keyboard/reduced motion, no overflow. See local evidence under `docs/review/public-release`.
- Local development uses `wrangler dev --config wrangler.public.jsonc --local --infer-origin-from-routes=false --port 8799`. This avoids Wrangler mapping loopback requests to the real HTTP domain and rewriting the HTTPS canonical redirect into a local loop. Live HTTP/HTTPS/`www` checks remain blocked, not simulated as successful.

Do not announce a live site until post-deployment HTTP and browser checks succeed. Previous Phase 8 booking-system staging/launch blockers remain separate; this authorization covers the approved public website only.

## Connected production build — 2026-11-09

Cloudflare Workers Builds uses `phase8/integration-launch-readiness` as the production branch. The public-only commands are `npm run build:public` and `npm run deploy:public`, both targeting `wrangler.public.jsonc`. Check each new build against its triggering commit SHA; the earlier failed build from `main` does not establish this branch's build result.
