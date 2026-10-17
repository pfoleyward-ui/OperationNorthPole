import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.VISUAL_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.VISUAL_OUTPUT_DIR || "public/review";
const origin = new URL(base).origin;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
  headless: true,
});
const report = [];
try {
  for (const width of [390, 768, 1024, 1440, 1920]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 1024 ? 1536 : 1000 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (
        r.url().startsWith(origin) &&
        r.status() >= 400 &&
        !r.url().endsWith("/favicon.ico")
      )
        errors.push(`${r.status()} ${r.url()}`);
    });
    const response = await page.goto(base, { waitUntil: "networkidle" });
    if (response.status() !== 200) throw new Error(`HTTP ${response.status()}`);
    await page.evaluate(() => document.fonts.ready);
    for (const image of await page.locator("main img").all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate((i) => i.decode());
    }
    for (const link of await page.locator("nav a").all()) {
      if (!(await link.isVisible()))
        throw new Error(`Hidden navigation at ${width}`);
      await link.click();
      const href = await link.getAttribute("href");
      if (!(await page.locator(href).count()))
        throw new Error(`Missing target ${href}`);
    }
    const facebook = page.getByRole("link", { name: /FIND SANTABLIZARD ON/ });
    if (
      (await facebook.count()) !== 1 ||
      (await facebook.getAttribute("href")) !==
        "https://www.facebook.com/profile.php?id=61584693927127" ||
      (await facebook.getAttribute("target")) !== "_blank" ||
      (await facebook.getAttribute("rel")) !== "noopener noreferrer"
    )
      throw new Error("Facebook link mismatch");
    const phone = page.locator('a[href="tel:8452342858"]');
    if (
      (await phone.count()) !== 1 ||
      (await phone.textContent()).trim() !== "845-234-2858"
    )
      throw new Error("Phone mismatch");
    // Check that decorative overlays do not intercept essential contact actions.
    for (const anchor of await page
      .locator('a[href^="mailto:"],a[href^="tel:"]')
      .all()) {
      await anchor.scrollIntoViewIfNeeded();
      const reachable = await anchor.evaluate((a) => {
        const b = a.getBoundingClientRect();
        return a.contains(
          document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
        );
      });
      if (!reachable) throw new Error(`Blocked contact action at ${width}`);
    }
    const data = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const hero = h1.closest("section");
      const content = h1.parentElement;
      const portrait = hero.querySelector("img").parentElement;
      const rect = (e) => {
        const b = e.getBoundingClientRect();
        return {
          x: b.x,
          y: b.y + scrollY,
          width: b.width,
          height: b.height,
          right: b.right,
          bottom: b.bottom + scrollY,
        };
      };
      return {
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        brokenImages: [...document.images].filter(
          (i) => !i.complete || !i.naturalWidth,
        ).length,
        heading: h1.textContent.replace(/\s+/g, " ").trim(),
        eyebrow: content
          .querySelector("p")
          .textContent.replace(/\s+/g, " ")
          .trim(),
        supporting: content
          .querySelectorAll("p")[1]
          .textContent.replace(/\s+/g, " ")
          .trim(),
        hero: rect(hero),
        content: rect(content),
        portrait: rect(portrait),
        headingSize: getComputedStyle(h1).fontSize,
        mail: [...document.querySelectorAll('a[href^="mailto:"]')].map((a) =>
          a.getAttribute("href"),
        ),
        sections: [
          ...document.querySelectorAll("main>section,main>footer"),
        ].map((e) => ({ id: e.id, ...rect(e) })),
      };
    });
    if (
      errors.length ||
      data.overflow ||
      data.brokenImages ||
      !data.mail.length ||
      data.mail.some((h) => !h.startsWith("mailto:santablizard@gmail.com"))
    )
      throw new Error(JSON.stringify({ width, errors, data }));
    if (
      data.heading !==
        "Ho Ho Ho! You Found Me! I Knew I Should've Hidden Behind a Bigger Tree!" ||
      data.eyebrow !== "A Little North Pole Magic, Right Here at Home"
    )
      throw new Error(`Approved copy mismatch: ${data.heading}`);
    if (
      data.supporting !==
      "Since you've found your way to my little corner of the North Pole, perhaps it's time I found my way to yours. What do you say we make a little Christmas magic together?"
    )
      throw new Error("Supporting copy mismatch");
    if (data.content.bottom > data.hero.bottom + 2)
      throw new Error(
        `Hero content extends beyond scene at ${width}: ${data.content.bottom - data.hero.bottom}px`,
      );
    if (width > 700 && data.content.right > data.portrait.x + 2)
      throw new Error(`Hero content overlaps Santa at ${width}`);
    if (width <= 700 && data.content.bottom > data.portrait.y + 2)
      throw new Error(`Mobile greeting overlaps Santa at ${width}`);
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      scrollTo(0, 0);
    });
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: path.join(output, `homepage-${width}.jpg`),
      fullPage: true,
      type: "jpeg",
      quality: 88,
    });
    if (width === 1024)
      await page.screenshot({
        path: path.join(output, "viewport-1024.jpg"),
        type: "jpeg",
        quality: 90,
      });
    report.push({ ...data, errors });
    console.log(
      `PASS ${width}px: copy, navigation, image loading, contact links, Facebook, no overlap or overflow`,
    );
    await page.close();
  }
  const keyboard = await browser.newPage({ reducedMotion: "reduce" });
  await keyboard.goto(base);
  await keyboard.keyboard.press("Tab");
  if (
    !(await keyboard.evaluate(() =>
      document.activeElement?.matches("a:focus-visible"),
    ))
  )
    throw new Error("Keyboard focus not visible");
  console.log("PASS keyboard focus / reduced-motion rendering");
  await writeFile(
    path.join(output, "capture-report.json"),
    JSON.stringify(
      { base, createdAt: new Date().toISOString(), checks: report },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
