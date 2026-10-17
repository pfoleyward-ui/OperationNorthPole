import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:3000';
const output = process.env.VISUAL_OUTPUT_DIR || 'public/review';
await mkdir(output, { recursive: true });
const expected = [
  ['home-visits', 'Santa Makes House Calls!', '$150 · 30-minute visit'],
  ['photography', 'Santa & Photography', '$1,500 · 8-hour studio day'],
  ['dj-parties', 'DJ Santa & Christmas Parties', '$750 · 4-hour DJ / MC'],
  ['photo-booth', 'Santa Photo Booth', '$800 · 4-hour staffed booth'],
  ['off-season', "Santa's Off-Season Adventures", 'Appearances from $200/hour · Trivia $300/session'],
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const report = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
try {
  for (const width of [390, 768, 1024, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    const cards = page.locator('#experiences a');
    assert(await cards.count() === 5, 'Expected five cards');
    for (let i = 0; i < expected.length; i++) {
      const [id, name, price] = expected[i];
      const card = cards.nth(i);
      assert(await card.getAttribute('href') === `/services#${id}`, `Wrong destination: ${id}`);
      assert((await card.innerText()).includes(name) && (await card.innerText()).includes(price), `Wrong card copy: ${id}`);
      await card.click();
      await page.waitForURL(`**/services#${id}`);
      assert(await page.locator(`#${id}`).isVisible(), `Missing section: ${id}`);
      assert((await page.locator(`#${id}`).innerText()).includes(price), `Wrong section price: ${id}`);
      await page.goto(base, { waitUntil: 'networkidle' });
    }
    await page.goto(`${base}/services`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    for (const image of await page.locator('img').all()) { await image.scrollIntoViewIfNeeded(); await image.evaluate(i => i.decode()); }
    const text = await page.locator('main').innerText();
    assert(text.includes("I've been making Christmas memories for a long, long time, and I believe every family deserves a little extra joy. That's why I offer visits for different budgets, with clear prices and no surprises—well, except the one at your front door! Ho Ho Ho!"), 'Missing approved Santa note');
    assert(text.includes('Santa is unavailable on Christmas Eve and Christmas Day.'), 'Missing holiday availability');
    assert(text.includes('A requested date or time does not guarantee availability.'), 'Missing confirmation condition');
    assert((await page.locator('#complete-party').innerText()).includes('$1,550 · 4 hours'), 'Missing package');
    assert(await page.locator('#complete-party').getByRole('link', { name: 'Bring the North Pole to Your Party' }).count() === 1, 'Missing package CTA');
    assert(!/online galleries|digital delivery|AI photo|social-media uploads/i.test(text), 'Unsupported booth features');
    for (const link of await page.locator('a[href^="mailto:"]').all()) assert((await link.getAttribute('href')).startsWith('mailto:santablizard@gmail.com'), 'Wrong inquiry address');
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, broken: [...document.images].some(i => !i.complete || !i.naturalWidth), clipped: [...document.querySelectorAll('h1,h2,h3,p,li,a')].filter(e => (() => { const range = document.createRange(); range.selectNodeContents(e); const text = range.getBoundingClientRect(); const box = e.getBoundingClientRect(); return text.right > box.right + 2 || text.left < box.left - 2; })()).map(e => e.textContent) }));
    assert(!layout.overflow && !layout.broken && !layout.clipped.length && !errors.length, JSON.stringify({ width, layout, errors }));
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0); });
    await page.screenshot({ path: `${output}/services-${width}.jpg`, fullPage: true, type: 'jpeg', quality: 85 });
    report.push({ width, passed: true, ...layout });
    console.log(`PASS ${width}px: five card destinations, prices, service copy, package, availability, inquiries, images, layout`);
    await page.close();
  }
  await writeFile(`${output}/services-report.json`, JSON.stringify({ createdAt: new Date().toISOString(), base, checks: report }, null, 2) + '\n');
} finally { await browser.close(); }
