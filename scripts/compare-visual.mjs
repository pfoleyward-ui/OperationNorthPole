import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const get = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const actual = get("--actual");
const reference = get("--reference");
const baseline = get("--baseline");
const output = get("--output") || "public/review";
if (!actual || (!reference && !baseline)) {
  console.error(
    "Usage: npm run compare:visual -- --actual screenshot --reference original-1024x1536-render --output directory\nUse --baseline instead of --reference for a separately labeled before/after comparison.",
  );
  process.exit(1);
}
const source = reference || baseline;
const kind = reference ? "reference" : "baseline";
const width = 1024,
  height = 1536;
const meta = await sharp(source).metadata();
if (reference && (meta.width !== width || meta.height !== height))
  throw new Error(
    "The approved original must be 1024 × 1536; do not silently replace or distort the reference.",
  );
const actualMeta = await sharp(actual).metadata();
if (actualMeta.width !== width)
  throw new Error(
    "Capture the actual website at a 1024px viewport before comparison.",
  );
await mkdir(output, { recursive: true });
// Fontconfig needs a writable cache when rendering the comparison labels in the cloud sandbox.
if (!process.env.XDG_CACHE_HOME) {
  process.env.XDG_CACHE_HOME = path.resolve(".cache");
  await mkdir(process.env.XDG_CACHE_HOME, { recursive: true });
}
// Viewport comparison: take the first 1536px, never stretch the website's text or images.
const normalize = async (input) => {
  const m = await sharp(input).metadata();
  if (m.width !== width || m.height < height)
    throw new Error(
      "Comparison inputs need width 1024 and height at least 1536.",
    );
  return sharp(input)
    .extract({ left: 0, top: 0, width, height })
    .removeAlpha()
    .toColourspace("srgb")
    .png()
    .toBuffer();
};
const [left, right] = await Promise.all([normalize(source), normalize(actual)]);
const labels = Buffer.from(
  `<svg width="2048" height="52"><rect width="2048" height="52" fill="#23190f"/><g fill="#f5e4c0" font-family="sans-serif" font-size="22"><text x="24" y="34">${reference ? "Approved 1024 × 1536 render" : "Previous website — NOT the approved reference"}</text><text x="1048" y="34">Current website — actual 1024px viewport</text></g></svg>`,
);
await sharp({
  create: {
    width: width * 2,
    height: height + 52,
    channels: 3,
    background: "#23190f",
  },
})
  .composite([
    { input: labels, left: 0, top: 0 },
    { input: left, left: 0, top: 52 },
    { input: right, left: width, top: 52 },
  ])
  .jpeg({ quality: 90 })
  .toFile(path.join(output, `${kind}-side-by-side.jpg`));
const [a, b] = await Promise.all([
  sharp(left).raw().toBuffer(),
  sharp(right).raw().toBuffer(),
]);
const overlay = Buffer.alloc(width * height * 3),
  diff = Buffer.alloc(width * height * 3);
let error = 0;
for (let i = 0; i < a.length; i++) {
  overlay[i] = Math.round((a[i] + b[i]) / 2);
  const delta = Math.abs(a[i] - b[i]);
  diff[i] = delta;
  error += delta;
}
await sharp(overlay, { raw: { width, height, channels: 3 } })
  .jpeg({ quality: 92 })
  .toFile(path.join(output, `${kind}-overlay-50.jpg`));
await sharp(diff, { raw: { width, height, channels: 3 } })
  .png()
  .toFile(path.join(output, `${kind}-difference.png`));
const report = {
  comparison: reference ? "approved-reference" : "previous-website-only",
  normalization: "sRGB; first 1024 × 1536 pixels; no geometric stretching",
  meanAbsoluteChannelDifference: error / a.length,
  warning: reference
    ? "Pixel differences include the explicitly changed hero copy and separately generated art; this is not a pass/fail quality score."
    : "This does NOT measure fidelity to the approved reference. The original render file is still required.",
};
await writeFile(
  path.join(output, `${kind}-comparison.json`),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
