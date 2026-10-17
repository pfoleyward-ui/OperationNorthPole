# Repeatable visual review

## Authoritative target and limitations

The approved render shown in the conversation is 1024 × 1536. Its raw downloadable image is not yet available in this checkout. Do not substitute a screenshot of the old website for that render. Reference overlay/difference evidence therefore remains pending the original file. The owner also reports Vercel deployment, but no production URL was supplied during this refinement; localhost is not a public preview.

## Capture and checks

Use Node 24 and Chromium. Playwright Core is a development dependency; Chromium is supplied by this cloud machine. Set `CHROMIUM_PATH` if it is installed elsewhere.

```sh
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run build
npm run typecheck
npm run start
# In another terminal, with only that server on port 3000:
npm run check:visual
```

`VISUAL_BASE_URL` selects another served URL; `VISUAL_OUTPUT_DIR` changes the output directory. The runner tests 390, 768, 1024, 1440, and 1920px. It checks exact approved hero text, image decoding, HTTP errors, navigation targets, email/phone/Facebook destinations, keyboard focus, decoration hit testing, and hero overlap/overflow. It captures full-page JPEGs and a 1024 × 1536 viewport, plus a JSON report. Reduce-motion mode stabilizes captures. This is not a comprehensive accessibility audit or evidence of reference fidelity on its own.

## Compare against the original

```sh
npm run compare:visual -- --reference /path/to/original-render.png --actual public/review/viewport-1024.jpg --output public/review
```

The script requires the actual 1024 × 1536 reference, normalizes to sRGB, and uses the first 1536 pixels of the website without geometric stretching. It creates a labeled side-by-side, 50% overlay, absolute pixel difference, and JSON report. The channel difference is informational, not a quality score: the approved copy is longer and the workshop/village art is separately generated. Review composition, Santa scale, workshop identity, decorative continuity, and typography separately from raster differences. Preserve and inspect full-page screenshots too; the longer greeting and new footer extend below the old reference's canvas.

## Before/after evidence available now

```sh
npm run compare:visual -- --baseline public/review/baseline-1024.jpg --actual public/review/viewport-1024.jpg --output public/review
```

`baseline-1024.jpg` was captured from commit `4fa3142` before modifications at a 1024 × 1536 viewport. Outputs named `baseline-*` compare **previous website vs refined website**, not the approved render. They are explicitly labeled accordingly.

## Owner delivery

After deployment, `/review` provides an image gallery with full-resolution desktop/mobile captures, other widths, and before/after images. Do not provide a guessed Vercel URL or a local filesystem path as a public preview. Confirm the deployed homepage has the new greeting, workshop illustration, and clickable phone number before reporting deployment success.

## Principal discrepancies addressed

The previous website had a bright sunset, oversized cropped hero, outdoor About photograph, paper-like sign instead of aged wood, hard rectangular transitions, conventional photo framing, and a business-style footer. The refinement adds twilight lighting, a smaller undistorted hero image, identity-referenced workshop artwork, irregular wood signs, snowy ledges, decorative photo integration, a handwritten note, and a correspondence-style contact/social area.

## Remaining visual differences

The requested longer greeting needs more room than the original two-line headline. Generated village/workshop/ornament artwork follows the reference composition but is not its exact artwork. Five-card experience imagery is retained as requested; it differs from the reference's specific illustrations. Font shapes and decorative silhouettes differ. No pixel-perfect claim is supported. Final exact reference review awaits the original image file, and the generated likeness needs owner review.

## Final current-instance validation

A clean frozen-lockfile `npm ci`, production build, and TypeScript check passed. The production server then passed the full five-width capture suite and keyboard/reduced-motion check. `/review` returned HTTP 200; its images decoded and every linked screenshot/comparison artifact returned HTTP 200. Original JPG byte comparisons passed against `4fa3142`. Exact approved-reference overlays and the Vercel URL check remain outstanding; the available overlay is explicitly a before/after comparison.

## Services & pricing content update (2026-10-17)

Run `npm run check:services` against a production server using `VISUAL_BASE_URL` if needed. It checks all five homepage destinations by clicking them, service prices and approved Santa note, party package CTA, holiday unavailability, booking confirmation conditions, supported booth content, inquiry email destinations, image loading, text containment, and horizontal overflow at 390, 768, 1024, 1440, and 1920px. `npm run check:visual` continues to check preserved homepage copy, imagery, contact/social links, hero layout, keyboard focus, and reduced-motion rendering.

Updated homepage screenshots and five Services screenshots are available under `/review` after deployment. The five desktop parchment cards are taller to accommodate all approved headlines, descriptions, prices, and CTAs; mobile uses a single column. This is the expected consequence of the approved content update, not a redesign of the surrounding homepage. All original source photographs are unchanged.

Deployment of application commit `49caf81` was verified at https://operation-north-pole.vercel.app/services using TLS-verified HTTPS responses. Homepage destination URLs, service anchors/prices, complete party, Santa note, availability conditions, review route, and desktop/mobile screenshot artifacts were confirmed. Chromium live checks were blocked by the local proxy certificate trust error (`ERR_CERT_AUTHORITY_INVALID`); local production browser checks passed. No TLS validation bypass was used.
