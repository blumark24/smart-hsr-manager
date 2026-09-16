'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { installFbMock } = require('./lib/fb-mock');
const { startHarness } = require('./lib/harness');
const { loginAs } = require('./lib/login');

const OUT_DIR = path.join(__dirname, '.generated', 'user-center-design');
const PHASE_SCRIPTS = [
  'manager-phase11b-user-center-v2.js',
  'manager-phase11b-modal-layer-fix.js',
  'manager-phase11b-controls-fix.js',
  'manager-phase11c-user-center-core.js',
  'manager-phase11c-user-center-dialogs.js',
  'manager-phase11c-user-center-import.js',
  'manager-phase11c-legacy-account-bridge.js',
  'manager-phase11d-user-center-enhancements.js',
  'manager-phase11e-user-center-interactions.js',
  'manager-phase11g-user-center-design-system.js',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function injectPhaseScripts(page, baseUrl) {
  for (const file of PHASE_SCRIPTS) {
    await page.addScriptTag({ url: `${baseUrl}/${file}` });
  }
}

async function firstVisible(locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = locator.nth(i);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function waitForUserCenterSurface(page) {
  await page.locator('[data-uc-v2="true"]').waitFor({ timeout: 15000 });
}

async function tryAccountMenuPath(page) {
  const account = await firstVisible(page.getByRole('button', { name: 'قائمة الحساب', exact: true }));
  if (!account) return false;

  await account.click();
  const permissions = await firstVisible(page.getByText('الصلاحيات والسجل', { exact: true }));
  if (!permissions) return false;

  await permissions.click();
  await waitForUserCenterSurface(page);
  return true;
}

async function tryMunicipalityNavPath(page) {
  const adminToggle = await firstVisible(page.getByRole('button', { name: 'إدارة البلدية', exact: true }));
  if (adminToggle) {
    await adminToggle.click();
    await page.waitForTimeout(200);
  }

  const anchors = page.locator('a').filter({ hasText: 'مركز المستخدمين' });
  if (await anchors.count()) {
    // The manager can intentionally collapse sidebar labels at some widths.
    // dispatchEvent exercises the real bound navigation handler even if the
    // text span itself is visually hidden by the responsive sidebar token.
    await anchors.first().dispatchEvent('click');
    await waitForUserCenterSurface(page);
    return true;
  }

  const quick = page.locator('a').filter({ hasText: 'فتح مركز المستخدمين' });
  if (await quick.count()) {
    await quick.first().dispatchEvent('click');
    await waitForUserCenterSurface(page);
    return true;
  }

  return false;
}

async function openUserCenter(page) {
  await page.waitForFunction(
    () => document.body && document.body.innerText.includes('تسجيل الخروج'),
    { timeout: 15000 },
  );

  let direct = await firstVisible(page.getByText('مركز المستخدمين', { exact: true }));
  if (direct) {
    await direct.click();
    await waitForUserCenterSurface(page);
    return;
  }

  if (await tryAccountMenuPath(page)) return;
  if (await tryMunicipalityNavPath(page)) return;

  const snapshot = await page.evaluate(() => ({
    title: document.title,
    path: location.pathname,
    hasAccountButton: !!document.querySelector('[aria-label="قائمة الحساب"]'),
    text: (document.body?.innerText || '').slice(0, 3000),
  }));
  throw new Error(`User Center navigation could not be activated. Diagnostics: ${JSON.stringify(snapshot)}`);
}

async function assertGlobalNoOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(overflow.scrollWidth <= overflow.clientWidth + 2, `${label}: global horizontal overflow detected (${overflow.scrollWidth} > ${overflow.clientWidth}).`);
}

async function assertTheme(page, expected) {
  await page.waitForFunction(
    (mode) => document.documentElement.getAttribute('data-smart-hsr-theme') === mode,
    expected,
    { timeout: 5000 },
  );
}

async function assertCenteredDialog(page) {
  const add = page.getByRole('button', { name: 'إضافة موظف', exact: true });
  await add.click();
  const dialog = page.locator('.iuc [role="dialog"]').last();
  await dialog.waitFor({ timeout: 5000 });

  const geometry = await dialog.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  const cx = geometry.x + geometry.width / 2;
  const cy = geometry.y + geometry.height / 2;
  assert(Math.abs(cx - geometry.viewportWidth / 2) < 90, 'Add Employee dialog is not horizontally centered.');
  assert(Math.abs(cy - geometry.viewportHeight / 2) < 130, 'Add Employee dialog is not vertically centered.');

  const close = dialog.getByRole('button', { name: 'إغلاق النافذة' });
  assert(await close.count() === 1, 'Dialog close button is missing an accessible name.');
  await close.click();
}

async function runDesktop(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await assertTheme(page, 'night');
  await assertGlobalNoOverflow(page, 'desktop/night');

  const heading = page.getByRole('heading', { name: 'مركز إدارة المستخدمين' });
  assert(await heading.count() > 0, 'Institutional User Center heading was not found.');

  const search = page.locator('[data-uc-v2="true"] input[type="search"]');
  assert(await search.count() === 1, 'User Center search input was not found.');
  assert((await search.getAttribute('aria-label')) === 'بحث في سجل الموظفين', 'Search input is missing its accessible Arabic label.');

  await assertCenteredDialog(page);

  const dayButton = page.getByRole('button', { name: 'النمط النهاري' });
  await dayButton.click();
  await assertTheme(page, 'day');
  await assertGlobalNoOverflow(page, 'desktop/day');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, 'desktop-day.png'), fullPage: false });

  const nightButton = page.getByRole('button', { name: 'النمط الليلي' });
  await nightButton.click();
  await assertTheme(page, 'night');
  await page.screenshot({ path: path.join(OUT_DIR, 'desktop-night.png'), fullPage: false });
}

async function runMobile(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await assertGlobalNoOverflow(page, 'mobile/night');

  const search = page.locator('[data-uc-v2="true"] input[type="search"]');
  const fontSize = Number.parseFloat(await search.evaluate((el) => getComputedStyle(el).fontSize));
  assert(fontSize >= 16, `Mobile search input font-size must be >=16px; got ${fontSize}px.`);

  const add = page.getByRole('button', { name: 'إضافة موظف', exact: true });
  const box = await add.boundingBox();
  assert(box && box.height >= 40, 'Primary mobile action is too small to operate reliably.');

  await page.screenshot({ path: path.join(OUT_DIR, 'mobile-night.png'), fullPage: false });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const harness = await startHarness();
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await installFbMock(context);
    const page = await loginAs(context, harness.baseUrl, 'manager@e2e.test');

    await injectPhaseScripts(page, harness.baseUrl);
    await openUserCenter(page);
    await runDesktop(page);
    await runMobile(page);

    console.log(JSON.stringify({
      status: 'PASS',
      surface: 'SMART HSR User Center',
      checks: [
        'RTL institutional surface loaded',
        'day/night design-token bridge',
        'desktop global overflow',
        'mobile global overflow',
        'accessible search label',
        'centered Add Employee dialog',
        'accessible dialog close button',
        'mobile input size',
        'desktop/mobile screenshots',
      ],
      screenshots: OUT_DIR,
    }, null, 2));

    await context.close();
  } finally {
    await browser.close();
    await harness.stop();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
