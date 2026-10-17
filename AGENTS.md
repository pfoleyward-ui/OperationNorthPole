# Operation North Pole

## Product and design

Build SantaBlizard’s nostalgic, polished Christmas website for Hudson Valley, New York. The approved homepage mockup governs implementation; the render was received in this conversation and has guided the current implementation. Use evergreen, burgundy, parchment, antique gold, warm light, and a storybook atmosphere. Preserve existing work when recovered.

The homepage needs branding and location, Home/Experiences/About Santa/Memories navigation, “Invite Santa to Visit” actions, and the approved greeting “Ho Ho Ho! You Found Me! I Knew I Should've Hidden Behind a Bigger Tree!” Experiences are Home Visits, Christmas in July, DJ Santa, Photo Booths, and Elves & More. Include Meet SantaBlizard, Memories, and a clear footer invitation.

## Architecture and development

Prefer Next.js App Router, React, TypeScript, reusable components, CSS Modules, semantic HTML, accessible controls, responsive layouts, and optimized images. No database is needed for the homepage. Keep dependencies minimal. Use the existing isolated checkout; do not create worktrees unless explicitly requested.

No application or dependency configuration was present at the initial audit. Do not describe new implementation as a repair of recovered source. Inspect newly supplied source before choosing versions or installing dependencies.

## Assets and constraints

Recovered inputs: approved visual mockup, starter homepage, santa-standing.jpg, santa-peeking.jpg, and santa-family.jpg. The starter is a partial project, not the full Windows working directory. The original Windows directory is not accessible from this environment. Do not replace missing brand photographs with unrelated stock images or invent testimonials, pricing, contact information, or business claims. Confirm commercial-use permission for photographs featuring children before public launch. Ask before changing the approved design, adding paid services, or discarding substantial work.

Santa HQ, payments, scheduling, and customer management are future scope, not current implementation authorization.

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

The authoritative render is 1024 × 1536. Capture the website at 1024px with `npm run check:visual`, then use `npm run compare:visual -- --reference /path/to/original.png --actual public/review/viewport-1024.jpg`. Never label a before/after baseline as the approved reference. Until the original render bytes are supplied, exact reference overlays remain blocked. Test 390, 768, 1024, 1440, and 1920px. Preserve the approved copy except for explicitly requested changes. The Santa-and-child source must remain untouched. Review the generated likeness with the owner; do not call an AI scene an actual event photograph. The owner reports Vercel deployment; a verified public URL is still needed before claiming a live deployment check. Do not present workspace file paths as public screenshot links.
