'use strict';
// login.html signs in against the Auth/Firestore emulators when it carries
// ?useEmulators=1 itself, but its own post-login redirect
// (window.location.href = 'manager.html' / 'smart-mobility.html') does NOT
// propagate that query param — by design, since production users must never
// see it. For E2E purposes that means the landing page would otherwise load
// against real (network-blocked) Firebase instead of the emulator. This
// helper logs in, lets the redirect happen, then re-navigates to the same
// landing page with the flag added so smart-mobility-adapter.js /
// manager-dashboard-adapter.js pick up the emulator connection too. The
// Auth emulator session set up on the login page is real and persists
// (browserLocalPersistence), so this reload keeps the same signed-in user.

const PASSWORD = 'MayorDemo!2026Pass';

async function loginAs(context, baseUrl, email, password = PASSWORD) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login.html?useEmulators=1`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#loginButton');
  await page.waitForFunction(
    () => location.pathname.includes('smart-mobility.html') || location.pathname.includes('manager.html'),
    { timeout: 15000 },
  );
  const landingPath = new URL(page.url()).pathname;
  await page.goto(`${baseUrl}${landingPath}?useEmulators=1`);
  await page.waitForTimeout(1500);
  return page;
}

async function waitForGateClear(page, { timeoutMs = 20000 } = {}) {
  await page.getByText('تسجيل الخروج').first().waitFor({ timeout: timeoutMs });
}

module.exports = { loginAs, waitForGateClear, PASSWORD };
