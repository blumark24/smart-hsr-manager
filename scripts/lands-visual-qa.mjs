import { chromium } from "playwright";
import fs from "node:fs/promises";

const sourceBase = process.env.LANDS_PREVIEW_URL;
const localReview = sourceBase && ['127.0.0.1', 'localhost'].includes(new URL(sourceBase).hostname);
const base = localReview ? 'http://lands-visual-qa.vercel.app' : sourceBase;
if (!base) throw new Error("LANDS_PREVIEW_URL is required");
const outDir = "artifacts/lands-visual-qa";
await fs.mkdir(outDir, { recursive: true });

const roles = [
  { id: "manager", role: "lands_department_manager" },
  { id: "employee", role: "lands_employee" }
];
const viewports = [
  { id: "desktop-1440", width: 1440, height: 1000 },
  { id: "ipad-1024", width: 1024, height: 900 },
  { id: "mobile-390", width: 390, height: 844 }
];
const views = ["center", "map", "decisions"];

const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    if (localReview) {
      await context.route(base + '/**', async route => {
        const requested = new URL(route.request().url());
        const response = await route.fetch({ url: new URL(requested.pathname + requested.search, sourceBase).toString() });
        await route.fulfill({ response });
      });
    }
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", err => consoleErrors.push(String(err)));

    for (const role of roles) {
      for (const view of views) {
        consoleErrors.length = 0;
        const url = `${base}/lands/?review=1&reviewRole=${role.role}&view=${view}`;
        await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
        try {
          await page.locator("#appShell").waitFor({ state: "visible", timeout: 30000 });
        } catch (error) {
          const diag = await page.evaluate(() => ({
            href: location.href,
            readyState: document.readyState,
            appHidden: document.querySelector("#appShell")?.hidden ?? null,
            bootText: document.querySelector("#bootScreen")?.textContent?.trim().slice(0, 500) ?? null,
            loginHidden: document.querySelector("#loginScreen")?.hidden ?? null,
            deniedHidden: document.querySelector("#deniedScreen")?.hidden ?? null,
            bodyClasses: document.body?.className ?? "",
          })).catch(() => null);
          console.error("LANDS_VISUAL_QA_BOOT_DIAGNOSTIC", JSON.stringify({ vp: vp.id, role: role.id, view, diag, consoleErrors }, null, 2));
          throw error;
        }
        await page.waitForTimeout(800);

        const managerModeVisible = await page.locator("#managerModeToggle").isVisible();
        const usersVisible = await page.locator('[data-view="users"]').isVisible();
        const auditVisible = await page.locator('[data-view="audit"]').isVisible();
        const reviewsVisible = await page.locator('[data-view="reviews"]').isVisible();

        if (role.id === "employee" && (managerModeVisible || usersVisible || auditVisible || reviewsVisible)) {
          failures.push(`${vp.id}/${role.id}/${view}: privileged controls visible`);
        }
        if (role.id === "manager" && (!managerModeVisible || !auditVisible || !reviewsVisible)) {
          failures.push(`${vp.id}/${role.id}/${view}: reviewer controls missing`);
        }

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
        if (overflow) failures.push(`${vp.id}/${role.id}/${view}: horizontal overflow`);

        const name = `${vp.id}__${role.id}__${view}.png`;
        await page.screenshot({ path: `${outDir}/${name}`, fullPage: true });

        if (consoleErrors.length) {
          await fs.writeFile(`${outDir}/${vp.id}__${role.id}__${view}.console.txt`, consoleErrors.join("\n"), "utf8");
        }
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const result = {
  base,
  generatedAt: new Date().toISOString(),
  failures
};
await fs.writeFile(`${outDir}/summary.json`, JSON.stringify(result, null, 2), "utf8");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("LANDS VISUAL QA PASS");
