import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { resolveFirebaseConfig } from "../firebase-runtime-config.js";
import { createServices, getGPS } from "./services.mjs";
import {
  statuses,
  routes,
  escapeHTML as e,
  coordinates,
  distance,
  validGPS,
  canAttachAfter,
} from "./domain.mjs";
import { icon } from "./icons.mjs";
import { mountMap } from "./map.mjs";
const $ = (id) => document.getElementById(id),
  main = $("main");
let auth,
  api,
  profile,
  items = [],
  cursor = null,
  counts = null,
  position = null,
  center = null,
  route = "home",
  selected = null;
let disposeMap = () => {},
  renderVersion = 0,
  objectURLs = [],
  loading = false,
  ready = false,
  draft = null,
  saveBusy = false,
  afterBusy = false,
  focusBeforeSheet;
const sheet = $("case-sheet");
for (const [i, name] of ["home", "tasks", "plus", "chart", "user"].entries())
  $("nav").querySelectorAll("a span")[i].innerHTML = icon(name);
$("notifications").innerHTML = icon("bell");
let sessionEpoch = 0;
let thumbObserver,
  thumbURLs = [],
  pendingFocus = null;
function thumbnail(item) {
  const key = item.imageObjectKey || item.imagePath;
  return key
    ? `<span class="report-thumb" data-evidence="${e(key)}" aria-label="دليل الرصد">${icon("pin")}</span>`
    : `<span class="report-icon">${icon("pin")}</span>`;
}
function lazyThumbnails() {
  thumbObserver?.disconnect();
  const version = renderVersion;
  thumbObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const target = entry.target;
      thumbObserver.unobserve(target);
      api
        .evidence(target.dataset.evidence)
        .then((url) => {
          if (version !== renderVersion || !target.isConnected) {
            URL.revokeObjectURL(url);
            return;
          }
          thumbURLs.push(url);
          const img = new Image();
          img.alt = "صورة الرصد";
          img.src = url;
          img.loading = "lazy";
          target.replaceChildren(img);
        })
        .catch(() => {
          if (target.isConnected)
            target.setAttribute("aria-label", "الدليل غير متاح");
        });
    }
  });
  main
    .querySelectorAll("[data-evidence]")
    .forEach((el) => thumbObserver.observe(el));
}
function notice(message, error = false) {
  $("notice").textContent = message;
  $("notice").classList.toggle("error", error);
}
function errorMessage(error) {
  if (error.status === 401 || error.code === "reauthentication-required")
    return "انتهت الجلسة. سجّل الدخول مجدداً.";
  if (error.status === 403)
    return "لا تملك الصلاحية المطلوبة أو أن الخدمة غير مفعلة لمؤسستك.";
  if (error.name === "AbortError")
    return "لم يصل تأكيد الخادم خلال المهلة. أعد المحاولة بنفس البلاغ للتحقق من نتيجته.";
  return (
    {
      gps_invalid_or_stale:
        "الموقع غير دقيق أو قديم؛ أعد تحديد GPS بدقة لا تتجاوز 30 متر.",
      outside_service_area:
        "الموقع خارج نطاق خدمة المؤسسة. تحقق من الموقع مع المشرف.",
      invalid_image:
        "اختر صورة JPEG أو PNG أو WebP صالحة بحجم أقل من 20 ميغابايت.",
      image_too_large: "الصورة أكبر من الحد المسموح بعد الضغط.",
      after_evidence_already_exists:
        "تم توثيق صورة بعد المعالجة بالفعل؛ لن تُستبدل الأدلة.",
      service_unavailable:
        "الخدمة غير متاحة. تحقق من تهيئة الخادم والفهرس والاتصال.",
    }[error.message] ||
    "تعذر تنفيذ الطلب. احتُفظ بمدخلاتك؛ تحقق من الاتصال وأعد المحاولة."
  );
}
function pill(item) {
  return `<span class="pill" data-status="${e(item.status)}">${e(statuses[item.status] || item.status)}</span>`;
}
function dist(item) {
  const d = distance(position, item);
  return d === null
    ? "المسافة تتطلب GPS"
    : d < 1000
      ? `${d} م`
      : `${(d / 1000).toFixed(1)} كم`;
}
function row(item) {
  return `<button class="report-row" data-case="${e(item.id)}">${thumbnail(item)}<span class="copy"><strong>${e(item.title)}</strong><small>${e(item.id.slice(0, 12))} · ${e(dist(item))}</small><br>${pill(item)}</span><span aria-hidden="true">‹</span></button>`;
}
function list(data) {
  return data.length
    ? data.map(row).join("")
    : '<div class="glass empty">لا توجد بلاغات في هذا النطاق.</div>';
}
function revokeImages() {
  for (const url of objectURLs) URL.revokeObjectURL(url);
  objectURLs = [];
}
function releaseView() {
  thumbObserver?.disconnect();
  for (const url of thumbURLs) URL.revokeObjectURL(url);
  thumbURLs = [];
  disposeMap();
  disposeMap = () => {};
  renderVersion++;
}
async function refresh(more = false) {
  const epoch = sessionEpoch;
  if (loading) return;
  loading = true;
  try {
    const result = await api.list(more ? cursor : null);
    if (epoch !== sessionEpoch) return;
    profile = result.profile;
    cursor = result.nextCursor;
    items = more
      ? [...new Map([...items, ...result.items].map((i) => [i.id, i])).values()]
      : result.items;
    ready = true;
    $("greeting").textContent = profile.name
      ? `مرحباً ${profile.name}`
      : "مرحباً بك";
    notice(
      "بيانات مؤكدة من الخادم · " +
        new Date().toLocaleTimeString("ar-SA", {
          hour: "2-digit",
          minute: "2-digit",
        }),
    );
    render();
  } catch (error) {
    notice(errorMessage(error), true);
    if (!ready)
      main.innerHTML =
        '<div class="glass empty">تعذر فتح مساحة المراقب.<div class="actions"><button data-action="refresh">إعادة المحاولة</button><a class="button" href="login.html">تسجيل الدخول</a></div></div>';
  } finally {
    if (epoch === sessionEpoch) loading = false;
  }
}
function mapHTML() {
  const current =
    items.find((i) => i.id === selected) ||
    items.find((i) => i.status !== "COMPLETED");
  return `<section class="map-panel" aria-label="خريطة العمل"><div class="map-tools"><select id="map-filter" aria-label="تصفية الخريطة"><option value="all">الحالات · الكل</option>${Object.entries(
    statuses,
  )
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join(
      "",
    )}</select><button data-action="locate">⌖ موقعي</button><a class="button" href="#map" aria-label="فتح الخريطة">↗</a></div><div id="operational-map" class="map-canvas" aria-label="خريطة البلاغات">جارٍ تحميل الخريطة…</div>${current ? `<button class="map-case" data-case="${e(current.id)}"><strong>${e(current.title)}</strong>${e(dist(current))} ‹</button>` : ""}<div class="ai-strip"><span class="ai-orb">AI</span><div><h3>المساعد الذكي</h3><p>استشارة اختيارية؛ القرار للمراقب والمراجعة الرسمية</p></div><button data-action="ai-current" ${current ? "" : "disabled"}>عرض المقترحات ✧</button></div></section>`;
}
async function showMap() {
  const element = $("operational-map");
  if (!element) return;
  const version = renderVersion;
  try {
    const cleanup = await mountMap(element, {
      items,
      position,
      center,
      onSelect: (id) => {
        selected = id;
        openCase(id);
      },
      selected,
    });
    if (version !== renderVersion) cleanup();
    else disposeMap = cleanup;
  } catch (_) {
    if (element.isConnected)
      element.textContent =
        "تعذر تحميل الخريطة. البلاغات وتفاصيل الموقع متاحة في القائمة.";
  }
}
function render() {
  releaseView();
  route = location.hash.slice(1) || "home";
  if (!routes.includes(route)) {
    location.hash = "home";
    return;
  }
  for (const link of $("nav").querySelectorAll("a")) {
    if (link.dataset.route === route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (!ready) return;
  if (route === "home") {
    const mission =
      items.find((i) => i.status === "IN_PROGRESS") ||
      items.find((i) => i.status !== "COMPLETED");
    main.innerHTML = `<div class="context"><div><b>●</b> ${position ? `دقة GPS ${Math.round(position.accuracy)} م` : "GPS غير محدد"}</div><button data-action="locate">⌖ تحديد الموقع</button><div>المؤسسة<br><b>${e(profile.organizationName || "المؤسسة الحالية")}</b></div></div><div class="home-grid"><div>${mapHTML()}</div><div class="secondary"><h2>مهمتك الحالية</h2><section class="glass mission">${mission ? `<div class="mission-top"><h3>${e(mission.title)}</h3>${pill(mission)}</div><small>${e(dist(mission))}</small><p class="muted">من بلاغاتك النشطة · لا توجد مهلة SLA مؤكدة</p><div class="actions"><button class="primary" data-navigate="${e(mission.id)}" ${coordinates(mission) ? "" : "disabled"}>➤ الاتجاه إلى الموقع</button><button data-case="${e(mission.id)}">تفاصيل الحالة ▤</button></div>` : '<p class="empty">لا توجد حالة نشطة ضمن البلاغات المحملة.</p>'}</section><h2>إجراءات سريعة</h2><div class="quick-grid"><a href="#new" data-focus="photo"><span>${icon("camera")}</span>إضافة صورة</a><a href="#new" data-focus="note"><span>${icon("tasks")}</span>ملاحظة</a><a href="#new"><span>${icon("pin")}</span>رصد سريع</a><a href="#map"><span>${icon("scan")}</span>مسح الموقع</a></div></div></div><div class="section-head"><h2>أحدث بلاغاتي</h2><a href="#tasks">عرض الكل ‹</a></div><div class="recent-grid report-list">${list(items.slice(0, 3))}</div>`;
    showMap();
  } else if (route === "tasks") {
    main.innerHTML = `<div class="section-head"><h2>مهامي وبلاغاتي</h2><button data-action="refresh">تحديث</button></div><p class="muted">بلاغاتك فقط. الإسناد الرسمي للمقاول يظهر داخل تفاصيل الحالة.</p><input id="task-search" aria-label="بحث في البلاغات المحملة" placeholder="ابحث في البلاغات المحملة"><select id="task-status" aria-label="حالة البلاغ"><option value="all">جميع الحالات</option>${Object.entries(
      statuses,
    )
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join(
        "",
      )}</select><p class="field-info">${items.length} بلاغاً محملاً${cursor ? " · تتوفر صفحات إضافية" : ""}</p><div id="tasks-list" class="report-list">${list(items)}</div>${cursor ? '<button data-action="more">تحميل المزيد</button>' : ""}`;
  } else if (route === "map") {
    main.innerHTML = `<h2>الخريطة التشغيلية</h2><p class="muted">تعرض مواقع بلاغاتك المحملة فقط؛ لا تمثل جميع حالات البلدية.</p>${mapHTML()}<h2>الحالات على الخريطة</h2><div class="report-list">${list(items.filter(coordinates))}</div>${cursor ? '<button data-action="more">تحميل المزيد من البلاغات</button>' : ""}`;
    showMap();
  } else if (route === "new") renderCapture();
  else if (route === "statistics") {
    main.innerHTML =
      '<h2>إحصائياتي</h2><p class="muted">إجماليات بلاغاتك من الخادم، عبر جميع الصفحات.</p><div id="statistics" class="stats-grid">جارٍ الحساب…</div>';
    const version = renderVersion;
    api
      .summary()
      .then((result) => {
        counts = result.counts;
        if (version === renderVersion)
          $("statistics").innerHTML = Object.entries(statuses)
            .map(
              ([k, v]) =>
                `<div class="stat"><strong>${e(counts[k])}</strong>${v}</div>`,
            )
            .join("");
      })
      .catch((error) => {
        if (version === renderVersion)
          $("statistics").textContent = errorMessage(error);
      });
  } else if (route === "account")
    main.innerHTML = `<h2>الحساب</h2><section class="glass account"><dl><dt>الاسم</dt><dd>${e(profile.name || "غير مسجل")}</dd><dt>الدور</dt><dd>مراقب ميداني</dd><dt>المؤسسة</dt><dd>${e(profile.organizationId)}</dd><dt>معرّف الحساب</dt><dd>${e(profile.uid)}</dd></dl><p class="muted">إدارة الحساب والصلاحيات من مسؤول المؤسسة.</p><button data-action="logout">تسجيل الخروج</button></section>`;
  lazyThumbnails();
}
function newDraft() {
  return {
    id: crypto.randomUUID(),
    title: "",
    details: "",
    type: "MAINTENANCE",
    file: null,
    objectKey: null,
    gps: null,
    ai: null,
    payload: null,
  };
}
function readForm() {
  if (!draft || !$("capture-form")) return;
  draft.title = $("report-title").value;
  draft.details = $("report-note").value;
  draft.type = $("report-type").value;
}
function renderCapture() {
  draft ??= newDraft();
  main.innerHTML = `<h2>بلاغ جديد</h2><form id="capture-form" class="glass"><p class="muted">صورة وموقع دقيق وتصنيف بشري. لا يُعتمد الحفظ قبل تأكيد الخادم.</p><label>صورة الرصد<input id="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" ${draft.objectKey ? "disabled" : ""}></label><p id="photo-info" class="field-info">${e(draft.file?.name || "لم تُختَر صورة")}</p><label>عنوان البلاغ<input id="report-title" maxlength="160" required value="${e(draft.title)}" ${draft.payload ? "disabled" : ""}></label><label>التصنيف<select id="report-type" ${draft.payload ? "disabled" : ""}>${Object.entries(
    {
      MAINTENANCE: "صيانة",
      CLEANLINESS: "نظافة",
      SAFETY: "سلامة",
      OTHER: "أخرى",
    },
  )
    .map(
      ([k, v]) =>
        `<option value="${k}" ${k === draft.type ? "selected" : ""}>${v}</option>`,
    )
    .join(
      "",
    )}</select></label><label>ملاحظات المراقب<textarea id="report-note" maxlength="3000" ${draft.payload ? "disabled" : ""}>${e(draft.details)}</textarea></label><button type="button" data-action="capture-gps" ${draft.payload ? "disabled" : ""}>⌖ التحقق من GPS</button><p id="gps-info" class="field-info">${draft.gps ? `الدقة ${Math.round(draft.gps.accuracy)} متر · ${draft.gps.latitude.toFixed(5)}, ${draft.gps.longitude.toFixed(5)}` : "الموقع غير محدد؛ يلزم GPS حديث ودقته ≤ 30 متر."}</p><button type="button" data-action="draft-ai" ${saveBusy ? "disabled" : ""}>✧ استشارة AI اختيارية</button><p id="draft-ai-result" class="field-info">${e(draft.ai || "لا يغير AI التصنيف أو الحالة تلقائياً.")}</p><label><input type="checkbox" id="human-review" required>راجعت الموقع والتصنيف والملاحظة بنفسي</label><button type="submit" class="primary" ${saveBusy ? "disabled" : ""}>${saveBusy ? "بانتظار تأكيد الخادم…" : "حفظ البلاغ"}</button><p id="save-result" role="status" aria-live="polite"></p></form>`;
}
async function prepareEvidence() {
  if (!draft.file && !draft.objectKey) throw new Error("invalid_image");
  if (!draft.objectKey) {
    draft.uploadPromise ??= api.upload(draft.file, draft.id).catch((error) => {
      draft.uploadPromise = null;
      throw error;
    });
    draft.objectKey = await draft.uploadPromise;
    if ($("photo")) $("photo").disabled = true;
  }
}
function advisoryText(result) {
  const a = result.analysis || {};
  return (
    a.shortSummaryAr ||
    a.summary ||
    a.description ||
    a.issueDescription ||
    "تم حفظ الاستشارة للمراجعة الرسمية. راجعها مع المسؤول؛ لم تتغير حالة البلاغ."
  );
}
async function saveCapture(event) {
  event.preventDefault();
  if (saveBusy) return;
  readForm();
  if (!$("human-review").checked) return;
  saveBusy = true;
  const button = $("capture-form").querySelector("[type=submit]");
  button.disabled = true;
  try {
    if (!draft.payload) {
      if (!validGPS(draft.gps)) throw new Error("gps_invalid_or_stale");
      await prepareEvidence();
      draft.payload = {
        id: draft.id,
        title: draft.title,
        details: draft.details,
        type: draft.type,
        objectKey: draft.objectKey,
        ...draft.gps,
      };
    }
    for (const input of $("capture-form").querySelectorAll(
      "input:not([type=checkbox]),textarea,select,[data-action]",
    ))
      input.disabled = true;
    notice("جارٍ حفظ البلاغ والتحقق من الأدلة على الخادم…");
    const saved = await api.save(draft.payload);
    if (saved.confirmed !== true) throw new Error("unconfirmed");
    const old = draft;
    draft = null;
    if (old.ai)
      api
        .request("/api/ai/bind-analysis", { observationId: old.id })
        .catch(() =>
          notice(
            "البلاغ محفوظ؛ لم يتأكد ربط استشارة AI. يمكن طلبها من تفاصيل البلاغ.",
            true,
          ),
        );
    location.hash = "tasks";
    await refresh();
    notice(`تم تأكيد حفظ البلاغ: ${saved.id}`);
  } catch (error) {
    if (
      ["gps_invalid_or_stale", "outside_service_area"].includes(error.message)
    ) {
      draft.payload = null;
      saveBusy = false;
      renderCapture();
    }
    notice(errorMessage(error), true);
    if ($("save-result")) $("save-result").textContent = errorMessage(error);
  } finally {
    saveBusy = false;
    if (button.isConnected) button.disabled = false;
  }
}
function closeSheet() {
  sheet.close();
  revokeImages();
  focusBeforeSheet?.focus?.();
}
$("close-sheet").onclick = closeSheet;
sheet.addEventListener("close", revokeImages);
async function openCase(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  selected = id;
  const mapCard = main.querySelector(".map-case");
  if (mapCard) {
    mapCard.dataset.case = id;
    mapCard.innerHTML = `<strong>${e(item.title)}</strong>${e(dist(item))} ‹`;
  }
  revokeImages();
  focusBeforeSheet = document.activeElement;
  $("case-title").textContent = item.title;
  $("case-content").innerHTML =
    `<small>${e(item.id)}</small><p>${pill(item)}</p><p class="sheet-details">${e(item.details)}</p><p class="muted">${e(item.location || "الموقع غير متوفر")} · ${e(dist(item))}</p><p>المقاول المسؤول: ${e(item.assignedContractorUid || "لم يُسند إلى مقاول")}</p>${item.supervisorNote ? `<p>ملاحظة المشرف: ${e(item.supervisorNote)}</p>` : ""}<div class="evidence-grid"><div><h3>قبل المعالجة</h3><div id="before-evidence">${item.imageObjectKey || item.imagePath ? "جارٍ تحميل الدليل…" : "لا يوجد دليل"}</div></div><div><h3>بعد المعالجة</h3><div id="after-evidence">${item.afterImagePath ? "جارٍ تحميل الدليل…" : "لا يوجد دليل"}</div></div></div><p>${e(item.resolutionNote || "")}</p><div class="actions"><button class="primary" data-navigate="${e(id)}" ${coordinates(item) ? "" : "disabled"}>الاتجاه إلى الموقع</button><button data-ai="${e(id)}">استشارة AI</button></div><div class="actions"><button data-advisory="root-cause" data-id="${e(id)}">إرشادات التحقق الميداني</button><button data-advisory="work-order" data-id="${e(id)}">مسودة نطاق العمل</button></div><div id="advisory-output" class="field-info"></div><p id="case-ai" class="field-info">${e(item.aiAnalysis?.explanation || "استشارة فقط؛ الاعتماد والإغلاق يخضعان للمسؤول المخوّل.")}</p>${canAttachAfter(item) ? `<form id="after-form"><h3>توثيق المعالجة</h3><p class="field-info">إضافة دليل فقط؛ لا يُغيّر الحالة ولا يغلق البلاغ.</p><label>صورة بعد المعالجة<input id="after-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required></label><label>ملاحظة المعالجة<textarea id="after-note" maxlength="3000" required></textarea></label><button type="submit">حفظ دليل المعالجة</button><p id="after-result" role="status"></p></form>` : '<p class="field-info">تعديل دليل المعالجة غير متاح لهذه الحالة وفق الصلاحيات الحالية.</p>'}`;
  if (!sheet.open) sheet.showModal();
  for (const [field, key] of [
    ["before-evidence", item.imageObjectKey || item.imagePath],
    ["after-evidence", item.afterImagePath],
  ]) {
    const target = $(field);
    if (!key) continue;
    api
      .evidence(key)
      .then((url) => {
        if (selected !== id || !sheet.open || !target.isConnected) {
          URL.revokeObjectURL(url);
          return;
        }
        objectURLs.push(url);
        const image = new Image();
        image.alt =
          field === "before-evidence"
            ? "دليل قبل المعالجة"
            : "دليل بعد المعالجة";
        image.loading = "lazy";
        image.src = url;
        target.replaceChildren(image);
      })
      .catch(() => {
        if (target.isConnected)
          target.textContent = "تعذر قراءة الدليل عبر خدمة التخزين المعتمدة.";
      });
  }
  let afterKey = null;
  $("after-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (afterBusy) return;
    afterBusy = true;
    const form = event.currentTarget,
      button = form.querySelector("button");
    button.disabled = true;
    try {
      afterKey ??= await api.upload($("after-photo").files[0], id, "after");
      $("after-photo").disabled = true;
      $("after-note").disabled = true;
      const result = await api.after({
        id,
        objectKey: afterKey,
        note: $("after-note").value,
      });
      if (!result.confirmed) throw new Error("unconfirmed");
      $("after-result").textContent =
        "تم تأكيد حفظ الدليل دون تغيير حالة البلاغ.";
      await refresh();
      closeSheet();
    } catch (error) {
      if ($("after-result"))
        $("after-result").textContent = errorMessage(error);
    } finally {
      afterBusy = false;
      button.disabled = false;
    }
  });
}
async function locate(forDraft = false) {
  notice("جارٍ تحديد الموقع…");
  try {
    const gps = await getGPS();
    position = gps;
    if (forDraft) {
      draft.gps = gps;
      if ($("gps-info"))
        $("gps-info").textContent =
          `دقة GPS ${Math.round(gps.accuracy)} م · ${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`;
    } else render();
    notice(
      validGPS(gps)
        ? "تم التحقق من الموقع."
        : "دقة الموقع لا تكفي للحفظ. انتقل لمكان مفتوح وأعد المحاولة.",
      !validGPS(gps),
    );
  } catch (_) {
    notice(
      "تعذر تحديد الموقع. تحقق من إذن GPS واتصال HTTPS ثم أعد المحاولة.",
      true,
    );
  }
}
function readableAdvisory(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value))
    return value.map(readableAdvisory).filter(Boolean).join(" • ");
  if (typeof value === "object")
    return Object.entries(value)
      .filter(
        ([key, v]) =>
          [
            "probableCauses",
            "confidence",
            "confidenceReason",
            "supportingEvidence",
            "missingEvidence",
            "verificationSteps",
            "workType",
            "scopeOfWork",
            "recommendedDiscipline",
            "executionSteps",
            "safetyConsiderations",
            "requiredEvidence",
            "closureRequirements",
          ].includes(key) && typeof v !== "boolean",
      )
      .map(([, v]) => v)
      .map(readableAdvisory)
      .filter(Boolean)
      .join(" — ");
  return typeof value === "string" ? value : "";
}
function navigate(id) {
  const item = items.find((i) => i.id === id),
    c = coordinates(item);
  if (!c) return;
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${c[0]},${c[1]}`,
    "_blank",
    "noopener,noreferrer",
  );
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button,a");
  if (!button) return;
  if (button.dataset.case) {
    openCase(button.dataset.case);
    return;
  }
  if (button.dataset.navigate) {
    navigate(button.dataset.navigate);
    return;
  }
  if (button.dataset.focus) {
    pendingFocus = button.dataset.focus;
    if (route === "new")
      $(button.dataset.focus === "photo" ? "photo" : "report-note")?.focus();
  }
  if (button.dataset.advisory) {
    button.disabled = true;
    const target = $("advisory-output");
    try {
      const result = await api.request(
        "/api/report/" + button.dataset.advisory,
        { observationId: button.dataset.id },
      );
      const value = result.rootCause || result.workOrder;
      target.textContent = "استرشادي فقط — " + readableAdvisory(value);
    } catch (error) {
      target.textContent = errorMessage(error);
    } finally {
      button.disabled = false;
    }
    return;
  }
  if (button.dataset.ai) {
    button.disabled = true;
    try {
      const result = await api.analyze({ observationId: button.dataset.ai });
      if ($("case-ai")) $("case-ai").textContent = advisoryText(result);
    } catch (error) {
      if ($("case-ai")) $("case-ai").textContent = errorMessage(error);
    } finally {
      button.disabled = false;
    }
    return;
  }
  const action = button.dataset.action;
  if (!action) return;
  if (action === "locate") return locate();
  if (action === "capture-gps") {
    readForm();
    return locate(true);
  }
  if (action === "refresh") return refresh();
  if (action === "more") {
    button.disabled = true;
    await refresh(true);
    button.disabled = false;
    return;
  }
  if (action === "logout") {
    api.cancel();
    releaseView();
    revokeImages();
    draft = null;
    items = [];
    ready = false;
    try {
      await signOut(auth);
    } catch (error) {
      notice(errorMessage(error), true);
    }
    return;
  }
  if (action === "ai-current") {
    const item =
      items.find((i) => i.id === selected) ||
      items.find((i) => i.status !== "COMPLETED");
    if (item) openCase(item.id);
    return;
  }
  if (action === "draft-ai") {
    readForm();
    button.disabled = true;
    try {
      await prepareEvidence();
      const result = await api.analyze({
        observationId: draft.id,
        draftImageObjectKey: draft.objectKey,
        existingDescription: draft.details,
      });
      draft.ai = advisoryText(result);
      if ($("draft-ai-result")) $("draft-ai-result").textContent = draft.ai;
    } catch (error) {
      notice(errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  }
});
main.addEventListener("submit", (event) => {
  if (event.target.id === "capture-form") saveCapture(event);
});
main.addEventListener("input", (event) => {
  if (["task-search", "task-status"].includes(event.target.id)) {
    const q = $("task-search").value.toLowerCase(),
      s = $("task-status").value;
    $("tasks-list").innerHTML = list(
      items.filter(
        (i) =>
          (s === "all" || i.status === s) &&
          `${i.title} ${i.details} ${i.id}`.toLowerCase().includes(q),
      ),
    );
  } else readForm();
});
main.addEventListener("change", (event) => {
  if (event.target.id === "photo") {
    draft.file = event.target.files[0];
    $("photo-info").textContent = draft.file?.name || "لم تُختَر صورة";
  }
  if (event.target.id === "map-filter") {
    const value = event.target.value;
    const card = main.querySelector(".map-case");
    if (card) {
      const chosen = items.find((i) => i.id === card.dataset.case);
      card.hidden = value !== "all" && chosen?.status !== value;
    }
    disposeMap();
    const element = $("operational-map");
    const version = renderVersion;
    mountMap(element, {
      items: items.filter((i) => value === "all" || i.status === value),
      position,
      center,
      onSelect: openCase,
      selected,
    })
      .then((clean) => {
        if (version === renderVersion) disposeMap = clean;
        else clean();
      })
      .catch(() => notice("تعذر تحديث الخريطة", true));
  }
});
window.addEventListener("hashchange", () => {
  readForm();
  if (sheet.open) closeSheet();
  render();
  main.focus();
  if (route === "new") {
    const focus = pendingFocus;
    pendingFocus = null;
    if (focus) $(focus === "photo" ? "photo" : "report-note")?.focus();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    readForm();
    releaseView();
    // Sheet evidence stays bounded to two images and is released on close/pagehide.
  } else if (ready) render();
});
window.addEventListener("pagehide", () => {
  api?.cancel();
  releaseView();
  revokeImages();
});
try {
  auth = getAuth(initializeApp(await resolveFirebaseConfig()));
  api = createServices(auth);
  onAuthStateChanged(auth, async (user) => {
    sessionEpoch++;
    api.cancel();
    loading = false;
    if (!user) {
      ready = false;
      items = [];
      draft = null;
      releaseView();
      revokeImages();
      location.replace("login.html");
      return;
    }
    if (profile && profile.uid !== user.uid) {
      items = [];
      profile = null;
      ready = false;
      draft = null;
      cursor = null;
      center = null;
      releaseView();
      revokeImages();
      main.replaceChildren();
    }
    await refresh();
    if (ready)
      api
        .request("/api/organization/context")
        .then((value) => {
          if (value.organizationId === profile.organizationId) {
            center = value.mapCenter;
            profile.organizationName =
              value.organizationName || profile.organizationName;
            if (route === "home" || route === "map") render();
          }
        })
        .catch(() => {});
  });
} catch (error) {
  notice(
    "تعذر تهيئة الاتصال الآمن. تحقق من إعداد Firebase ثم أعد تحميل الصفحة.",
    true,
  );
  main.innerHTML =
    '<a class="button" href="login.html">العودة إلى تسجيل الدخول</a>';
}
