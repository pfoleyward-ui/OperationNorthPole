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
