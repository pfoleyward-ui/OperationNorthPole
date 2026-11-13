## Phase 8: customer booking integration and email-only launch preparation

Stacked on PR #5 (`phase7/calendar-notifications`, `2e162d1`). The four-step wizard can now submit real-input synthetic records in protected staging through Turnstile and secure D1 intake, returning a Pending reference and safely retrying a lost response. Santa HQ retains explicit quote/agreement/atomic confirmation. Default public intake stays disabled.

Adds a private, durable **email-only Resend gateway**, customer confirmation/scheduling updates, all four consent-gated email escalation levels, authenticated Got It, signed delivery receipt recovery and native Calendar popups that avoid quiet hours/email reminder collisions. No SMS provider or sending code. Gateway acceptance and provider delivery are distinct; ambiguous outcomes never cause a blind resend.

Prepares four Cloudflare manifests, additive booking migration 0004 (original three unchanged), separate gateway D1 migration, owner account/DNS/Access/OAuth/secret/cost runbook and a repeatable synthetic end-to-end demonstration. Static image variants preserve the existing storybook rendering without a paid image service; automatic Vercel deployment is disabled for this branch.

Validation: 82 backend tests, 148 booking rules, strict/application TypeScript, Next/OpenNext build, four Wrangler dry-runs, actual local Cloudflare service bindings, full six-width customer→HQ→email→calendar→Got It browser workflow, HQ/integration mobile suites and public design/price/preview regressions. Zero hero pixel delta versus Phase 7 at five public widths. Full npm audit: zero advisories. External providers are mocked; real messages sent: zero.

[PASS/BLOCKED readiness report](docs/PHASE8_READINESS.md) and [owner staging instructions](docs/PHASE8_STAGING.md) identify account/domain/device/privacy requirements. Real staging, public intake, delivery, notes collection, merge and production deployment remain disabled pending separate approval.
