import { chromium } from "playwright";
import fs from "node:fs/promises";
import { writeFileSync } from "node:fs";

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
const themes = ["light", "dark"];

const browser = await chromium.launch({ headless: true });
const failures = [];
let activeCase = null;
let activeStep = "initialization";
let caseTimer = null;
function bounded(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("LANDS_QA_TIMEOUT:" + label)), timeoutMs); })
  ]).finally(() => clearTimeout(timer));
}
async function step(label, action) {
  activeStep = label;
  console.log("LANDS_VISUAL_STEP", JSON.stringify({ case: activeCase, step: label }));
  return action();
}
function armCaseDeadline(consoleErrors) {
  clearTimeout(caseTimer);
  caseTimer = setTimeout(() => {
    const diagnostic = { case: activeCase, step: activeStep, consoleErrors, error: "Case exceeded 120 seconds" };
    writeFileSync(outDir + "/timeout.json", JSON.stringify(diagnostic, null, 2));
    console.error("LANDS_VISUAL_CASE_TIMEOUT", JSON.stringify(diagnostic));
    process.exit(1);
  }, 120000);
}
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
    page.setDefaultTimeout(20000);
    const consoleErrors = [];
    page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", err => consoleErrors.push(String(err)));

    for (const role of roles) {
      for (const view of views) {
       for (const theme of themes) {
        consoleErrors.length = 0;
        const url = `${base}/lands/?review=1&reviewRole=${role.role}&view=${view}`;
        activeCase = { viewport: vp.id, role: role.id, view, theme };
        armCaseDeadline(consoleErrors);
        console.log("LANDS_VISUAL_CASE_START", vp.id, role.id, view, theme);
        await step("navigate", () => page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }));
        try {
          await step("wait-app", () => page.locator("#appShell").waitFor({ state: "visible", timeout: 30000 }));
        } catch (error) {
          const diag = await bounded(page.evaluate(() => ({
            href: location.href,
            readyState: document.readyState,
            appHidden: document.querySelector("#appShell")?.hidden ?? null,
            bootText: document.querySelector("#bootScreen")?.textContent?.trim().slice(0, 500) ?? null,
            loginHidden: document.querySelector("#loginScreen")?.hidden ?? null,
            deniedHidden: document.querySelector("#deniedScreen")?.hidden ?? null,
            bodyClasses: document.body?.className ?? "",
          })), 5000, "boot-diagnostic").catch(error => ({ diagnosticError: String(error) }));
          console.error("LANDS_VISUAL_QA_BOOT_DIAGNOSTIC", JSON.stringify({ vp: vp.id, role: role.id, view, diag, consoleErrors }, null, 2));
          throw error;
        }
        await page.waitForTimeout(800);

        await step("theme", () => page.locator(theme === "dark" ? "#themeNightButton" : "#themeDayButton").click());
        activeStep = "role-controls";
        const managerModeVisible = await page.locator("#managerModeMenuItem").evaluate(el => !el.hidden);
        const usersVisible = await page.locator('[data-view="users"]').isVisible();
        const auditVisible = await page.locator('[data-view="audit"]').isVisible();
        const reviewsVisible = await page.locator('[data-view="reviews"]').isVisible();

        if (role.id === "employee" && (managerModeVisible || usersVisible || auditVisible || reviewsVisible)) {
          failures.push(`${vp.id}/${role.id}/${view}: privileged controls visible`);
        }
        if (role.id === "manager" && (!managerModeVisible || !auditVisible || !reviewsVisible)) {
          failures.push(`${vp.id}/${role.id}/${view}: reviewer controls missing`);
        }

        activeStep = "layout";
        if (vp.width > 760) {
          const sidebar = await page.locator(".shell > .side").boundingBox();
          const main = await page.locator(".shell > .main").boundingBox();
          if (!sidebar || !main || sidebar.x < main.x + main.width - 2) {
            failures.push(`${vp.id}/${role.id}/${view}/${theme}: sidebar is not on the right`);
          }
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
        if (overflow) failures.push(`${vp.id}/${role.id}/${view}: horizontal overflow`);

        const name = `${vp.id}__${role.id}__${view}__${theme}.png`;
        await step("screenshot", () => page.screenshot({ path: `${outDir}/${name}`, fullPage: true, animations: "disabled", timeout: 20000 }));
        clearTimeout(caseTimer);
        console.log("LANDS_VISUAL_CASE_DONE", name);

        if (consoleErrors.length) {
          await fs.writeFile(`${outDir}/${vp.id}__${role.id}__${view}__${theme}.console.txt`, consoleErrors.join("\n"), "utf8");
        }
       }
      }
    }
    await bounded(context.close(), 10000, "context-close");
  }
} catch (error) {
  writeFileSync(outDir + "/error.json", JSON.stringify({ case: activeCase, step: activeStep, error: String(error) }, null, 2));
  console.error("LANDS_VISUAL_QA_ERROR", JSON.stringify({ case: activeCase, step: activeStep, error: String(error) }));
  process.exitCode = 1;
} finally {
  clearTimeout(caseTimer);
  await bounded(browser.close(), 10000, "browser-close").catch(error => {
    console.error(String(error));
    process.exit(1);
  });
}
if (process.exitCode) process.exit(process.exitCode);

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
