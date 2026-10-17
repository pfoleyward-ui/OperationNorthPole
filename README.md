# Operation North Pole

SantaBlizard homepage recovered from the supplied starter archive. Uses Next.js App Router, React, TypeScript, and CSS Modules; no database or credentials required.

## Development

Use Node.js 24 and npm 11. In this directory:

```sh
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run dev
```

Use one server on port 3000. Check existing processes before starting another. For validation, run `npm run build` and `npm run typecheck`. To serve the production build, stop the development server and run `npm run start`.

Do not commit `.env` files, dependencies, or build outputs. Read AGENTS.md and PROJECT_STATUS.md before changing the design. Invitation links open email to santablizard@gmail.com; no booking form or confirmation service is implemented. The homepage follows the supplied visual render and includes the user-provided Facebook profile link. Child-photo commercial-use permission must be confirmed before launch.

## Visual review workflow

With the application running on port 3000, run `npm run check:visual` to validate and capture 390, 768, 1024, 1440, and 1920px layouts. Chromium is required (`CHROMIUM_PATH` can override its location). The `/review` route exposes the committed screenshot gallery after deployment.

Use `npm run compare:visual -- --reference /path/to/original-render.png --actual public/review/viewport-1024.jpg` for the approved-reference side-by-side, overlay, and difference. The original render must be 1024 × 1536; it is not currently available as a file here. Existing `baseline-*` artifacts compare the previous website, not the approved render. See docs/VISUAL_REVIEW.md.

The owner reports Vercel deployment. A production URL is still needed to verify that deployment; publishing the Codex environment does not deploy this website. Contact details are maintained in `src/config/contact.ts`. Only active social accounts with verified URLs render.

Services and pricing: `/services`, with shared approved content in `src/config/services.ts`. Run `npm run check:services` against the production server to validate prices, card destinations, booking conditions, and responsive layouts. `/review` includes the corresponding screenshots.
