'use strict';
// Phase 10: responsive/visual QA. Logs in as each seeded role against the
// real emulator-backed app (no mocked data, no faked auth) and captures a
// screenshot at every required viewport, so a human can review real
// rendering rather than take "it looks fine" on faith.

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { installFbMock } = require('./lib/fb-mock');
const { startHarness } = require('./lib/harness');
const { loginAs } = require('./lib/login');

const CHROMIUM_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT_DIR = path.join(__dirname, '.generated', 'screenshots');

const VIEWPORTS = [
  { name: 'desktop-1600x990', width: 1600, height: 990 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'desktop-1366x768', width: 1366, height: 768 },
  { name: 'ipad13-landscape', width: 1032, height: 1376 },
  { name: 'ipad13-portrait', width: 834, height: 1210 },
  { name: 'ipad11-landscape', width: 954, height: 1373 },
  { name: 'ipad11-portrait', width: 834, height: 1194 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-412', width: 412, height: 915 },
  { name: 'mobile-430', width: 430, height: 932 },
];

const ROLES = [
  { key: 'manager', email: 'manager@e2e.test', landingPage: 'smart-mobility.html' },
  { key: 'deptHead', email: 'depthead@e2e.test', landingPage: 'smart-mobility.html' },
  { key: 'adminAffairs', email: 'adminaffairs@e2e.test', landingPage: 'smart-mobility.html' },
  { key: 'mobilityHead', email: 'mobilityhead@e2e.test', landingPage: 'smart-mobility.html' },
  { key: 'employee', email: 'employee@e2e.test', landingPage: 'smart-mobility.html' },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const harness = await startHarness();
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const results = [];

  try {
    for (const role of ROLES) {
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        await installFbMock(context);
        const page = await loginAs(context, harness.baseUrl, role.email);
        // manager@e2e.test lands on the pre-existing Manager Dashboard
        // (manager.html) first, same as any real manager. Its own nav link
        // to Smart Mobility collapses into a per-viewport mobile menu at
        // narrow widths (a separate, already-covered interaction) — for
        // this screenshot pass we only care about Smart Mobility's own
        // rendering, so navigate there directly rather than replicating
        // every width's specific menu-opening flow.
        if (role.key === 'manager') {
          await page.goto(`${harness.baseUrl}/smart-mobility.html?useEmulators=1`);
          await page.waitForTimeout(1500);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
        const shotPath = path.join(OUT_DIR, `${role.key}-${vp.name}.png`);
        await page.screenshot({ path: shotPath, fullPage: false });
        results.push({ role: role.key, viewport: vp.name, horizontalOverflow: overflow, screenshot: shotPath });
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await harness.stop();
  }

  const overflowing = results.filter((r) => r.horizontalOverflow);
  console.log(JSON.stringify({ total: results.length, horizontalOverflowCount: overflowing.length, overflowing }, null, 2));
  if (overflowing.length > 0) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
