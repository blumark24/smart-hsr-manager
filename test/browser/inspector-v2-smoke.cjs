"use strict";
// Isolated browser integration: explicit test-only Firebase/API doubles. Never uses real accounts/data.
let playwright;
try { playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright'); }
catch (_) { playwright=require('/opt/codex/cua_node/lib/node_modules/playwright-core'); }
const {chromium}=playwright;
const fs = require("node:fs"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const screenshots = "/tmp/inspector-v2-screenshots";
  fs.mkdirSync(screenshots, { recursive: true });
  const report = [];
  for (const [name, width, height] of [
    ["mobile", 390, 844],
    ["tablet", 820, 1180],
    ["desktop", 1440, 1000],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      permissions: ["geolocation"],
      geolocation: { latitude: 21.5, longitude: 39.2, accuracy: 8 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let records = [
        {
          id: "existing-report",
          title: "حفرة في الطريق",
          details: "حالة اختبار معزولة",
          type: "MAINTENANCE",
          status: "IN_PROGRESS",
          imageObjectKey:
            "observations/test-org/existing-report/before/test.jpg",
          location: "21.5,39.2",
          correctedLat: 21.5,
          correctedLng: 39.2,
        },
      ],
      postCount = 0,
      failSave = true;
    await page.route("https://www.gstatic.com/firebasejs/**", async (route) => {
      const auth = route.request().url().includes("firebase-auth");
      await route.fulfill({
        contentType: "application/javascript",
        body: auth
          ? `export const getAuth=()=>({currentUser:{getIdToken:async()=> 'test-token'}});export const onAuthStateChanged=(a,cb)=>{cb(a.currentUser)};export const signOut=async()=>{};`
          : `export const initializeApp=c=>({options:c});`,
      });
    });
    await page.route(
      "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/**",
      (route) =>
        route.fulfill({
          contentType: route.request().url().endsWith(".css")
            ? "text/css"
            : "application/javascript",
          body: fs.readFileSync(
            route.request().url().endsWith(".css")
              ? "/tmp/inspector-leaflet.css"
              : "/tmp/inspector-leaflet.js",
          ),
        }),
    );
    await page.route("https://tile.openstreetmap.org/**", (route) =>
      route.abort(),
    );
    await page.route("**/api/**", async (route) => {
      if (new URL(route.request().url()).pathname === "/api/storage/read") {
        await route.fulfill({
          contentType: "image/jpeg",
          body: fs.readFileSync("test/fixtures/vision/asphalt-pothole.jpg"),
        });
        return;
      }
      const request = route.request(),
        url = new URL(request.url()),
        body = request.postDataJSON();
      let value,
        status = 200;
      assert.equal(request.headers().authorization, "Bearer test-token");
      if (
        url.pathname === "/api/inspector/observations" &&
        request.method() === "GET"
      )
        value = url.searchParams.has("summary")
          ? {
              counts: {
                PENDING: 0,
                IN_PROGRESS: records.length,
                PENDING_REVIEW: 0,
                COMPLETED: 0,
              },
            }
          : {
              items: records,
              nextCursor: null,
              profile: {
                name: "حساب اختبار",
                uid: "test-inspector",
                organizationId: "test-org",
                role: "inspector",
              },
            };
      else if (url.pathname === "/api/organization/context")
        value = {
          organizationId: "test-org",
          mapCenter: { lat: 21.5, lng: 39.2 },
        };
      else if (url.pathname === "/api/storage/upload")
        value = {
          ok: true,
          objectKey: `observations/test-org/${body.observationId}/${body.scope}/test.jpg`,
        };
      else if (
        url.pathname === "/api/inspector/observations" &&
        request.method() === "POST"
      ) {
        postCount++;
        if (failSave) {
          status = 503;
          value = { error: "service_unavailable" };
          failSave = false;
        } else {
          records.push({
            ...body,
            status: "PENDING",
            location: `${body.latitude},${body.longitude}`,
          });
          value = { confirmed: true, id: body.id };
        }
      } else if (
        url.pathname === "/api/inspector/observations" &&
        request.method() === "PATCH"
      ) {
        const record = records.find((r) => r.id === body.id);
        record.afterImagePath = body.objectKey;
        record.resolutionNote = body.note;
        value = { confirmed: true, id: body.id };
      } else if(url.pathname === '/api/admin/users' && body.action === 'verifyFieldObservation') {
        const record=records.find(r=>r.id===body.observationId);
        const verificationStatus=body.decision==='ACCEPT'?'VERIFIED':'RETURNED';
        record.inspectorVerification={status:verificationStatus};
        if(body.decision==='RETURN')record.status='IN_PROGRESS';
        value={status:record.status,verificationStatus};
      } else if (url.pathname === "/api/ai/analyze") {
        status = 403;
        value = {
          ok: false,
          errorCode: "AI_APPLICATION_ORGANIZATION_NOT_ENABLED",
        };
      } else {
        status = 404;
        value = { error: "not_found" };
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    });
    await page.goto("http://127.0.0.1:5000/inspector.html");
    await page.locator("h1").filter({ hasText: "حساب اختبار" }).waitFor();
    await page.locator(".leaflet-container").waitFor();
    await page.screenshot({
      path: `${screenshots}/${name}-home.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${name} home horizontal overflow`,
    );
    assert.equal(await page.locator('#notifications').isDisabled(),true);
    await page.locator('.quick-grid a[href="#map"]').click();
    await page.getByRole('heading',{name:'الخريطة التشغيلية',exact:true}).waitFor();
    await page.locator('#map-filter').selectOption('IN_PROGRESS');
    await page.locator('#nav a[href="#home"]').click();
    await page.locator(".map-case").click();
    await page.locator("dialog[open]").waitFor();
    await page.locator("#before-evidence img").waitFor();
    await page
      .locator("#after-photo")
      .setInputFiles("test/fixtures/vision/asphalt-pothole.jpg");
    await page.locator("#after-note").fill("توثيق معالجة للاختبار");
    await page.locator("#after-form [type=submit]").click();
    await page.waitForFunction(
      () => !document.getElementById("case-sheet").open,
    );
    records.push({id:'review-report',title:'حالة مراجعة تجريبية',status:'PENDING_REVIEW',assignedContractorUid:'test-contractor',afterImagePath:'observations/test-org/review-report/after/test.jpg',resolutionNote:'معالجة موثقة'});
    await page.locator('#nav a[href="#tasks"]').click();
    await page.locator('[data-action="refresh"]').click();
    await page.locator('[data-case="review-report"]').click();
    await page.locator('#review-note').fill('راجعت الأدلة');
    await page.locator('[data-review="ACCEPT"]').click();
    await page.waitForFunction(()=>!document.getElementById('case-sheet').open);
    assert.equal(records.find(r=>r.id==='review-report').inspectorVerification.status,'VERIFIED');
    assert.equal(records.find(r=>r.id==='review-report').status,'PENDING_REVIEW');
    assert.equal(records[0].status, "IN_PROGRESS");
    assert.ok(records[0].afterImagePath);
    await page.locator('#nav a[href="#tasks"]').click();
    await page.locator("#task-search").fill("غير موجود");
    assert.equal(await page.locator("#tasks-list .report-row").count(), 0);
    await page.locator("#task-search").fill("");
    await page.locator('#nav a[href="#statistics"]').click();
    await page.locator(".stat").first().waitFor();
    await page.locator('#nav a[href="#account"]').click();
    await page.getByText("test-org", { exact: true }).waitFor();
    await page.locator('#nav a[href="#new"]').click();
    await page.locator("#report-title").fill("رصد جديد للاختبار");
    await page.locator("#report-note").fill("تفاصيل اختبار المتصفح");
    await page
      .locator("#photo")
      .setInputFiles("test/fixtures/vision/asphalt-pothole.jpg");
    await page.locator('[data-action="capture-gps"]').click();
    await page.locator("#gps-info").filter({ hasText: "دقة GPS" }).waitFor();
    await page.locator("#human-review").check();
    await page.locator("#capture-form [type=submit]").click();
    await page
      .locator("#save-result")
      .filter({ hasText: "الخدمة غير متاحة" })
      .waitFor();
    assert.equal(
      await page.locator("#report-title").inputValue(),
      "رصد جديد للاختبار",
    );
    await page.locator("#capture-form [type=submit]").click();
    await page.waitForURL("**/inspector.html#tasks");
    assert.equal(postCount, 2);
    await page.getByText("رصد جديد للاختبار", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${name} tasks overflow`,
    );
    await page.goto("http://127.0.0.1:5000/dashboard.html");
    await page.waitForURL("**/inspector.html");
    assert.equal(await page.locator("iframe").count(), 0);
    assert.deepEqual(errors, []);
    report.push({
      viewport: name,
      width,
      height,
      routes: "PASS",
      captureRetry: "PASS",
      afterEvidenceWithoutClosure: "PASS",
      contractorVerificationWithoutClosure: "PASS",
      mapSelection: "PASS",
      overflow: "PASS",
      legacyRedirect: "PASS",
      pageErrors: errors.length,
    });
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(
    "/tmp/inspector-v2-browser-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
