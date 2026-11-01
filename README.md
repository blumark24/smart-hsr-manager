# SMART HSR — Smart Municipal Platform

**آخر مراجعة للتوثيق: 1 نوفمبر 2026.** هذا الملف يصف مستودع المصدر وحالة المرشح قيد الفحص، **ولا يعدّ اعتمادًا رسميًا أو تفويضًا لتشغيل البلدية**.

## ملخص تنفيذي

SMART HSR منصة SaaS بلدية عربية (RTL) متعددة الخدمات: لوحة مالك المنصة، إدارة البلديات (Tenants)، لوحة مدير البلدية، مركز المستخدمين والأدوار، الحصر الميداني، حصر منح الأراضي، الحركة الذكية، الخرائط والتوأم الرقمي. تُبنى الإجراءات على صلاحيات وإثباتات قابلة للتدقيق، ويظل كل منتج خاضعًا لاختبارات قبول مستقلة.

**الحالة المعتمدة للتسليم: HOLD / NO-GO.** تعكس مصفوفة Baseline 001 **32/100 نقطة أدلة داخلية** (35 نقطة تم تقييمها، و65 لم تُقيّم)، **وليست نسبة اكتمال البرمجة أو شهادة أمنية**. راجع [مصفوفة الأدلة PR #108](https://github.com/blumark24/smart-hsr-manager/pull/108) و[بوابة الأمن #73](https://github.com/blumark24/smart-hsr-manager/issues/73).

## المعمارية المبنية على المصدر

| المكوّن | الواجهات/الملفات | حدود التحقق |
|---|---|---|
| المالك والاشتراكات | `owner.html` و`owner-organizations.js` و`owner-invoices.js` و`api/_lib/ownerBillingUpgrade.js` | فواتير الترقية في المرشح Pending فقط؛ ليست إيصال دفع أو فاتورة ضريبية معتمدة |
| المدير والموظفون | `manager.html` و`api/admin/users.js` و`api/admin/employees.js` | صلاحيات حقيقية تحتاج UAT بأدوار مصرح بها بعد العزل |
| الحصر الميداني | `department-head.html` و`field-head-runtime.js` | رحلة الحالة في نسخة العرض المحلية ليست تكاملًا حيًا كاملًا |
| منح الأراضي | `lands/index.html` و`api/_lib/embeddedLandsRuntime.js` | حماية الهوية والاعتماد المشروط موجودة في Draft؛ ملفات الأدلة وSSO الحي غير مقبولين نهائيًا |
| الحركة الذكية | `department-head.html?mode=mobility` و`workspace-access.js` | الأدوار والتفويضات تحتاج اختبارات جهاز/حساب فعلية |
| الخرائط والتوأم | `operational-map.html` و`twin.html` | الخرائط والبيانات المكانية تحتاج مصدر GPS موثوقًا وقبول واجهات |
| الهوية وتخزين الأدلة | Firebase Authentication/Firestore وBackblaze B2 عبر خوادم/واجهات موثوقة | عزل Firebase/B2 بين Staging وProduction لم يحصل على مصادقة مراجِع مستقل |

**ملاحظة AI:** ليس كل مساعد ظاهري يستخدم نموذجًا خارجيًا؛ مساعد الأراضي في المسار الحالي حتمي/قراءة فقط. **لا نفترض تفعيل Vision AI أو السماح بإرسال بيانات بلدية إلى LLM خارجي دون مراجعة وأدلة صريحة.**

## بيئة التطوير الصحيحة

- **Runtime:** Node.js **22.x** كما هو مثبت في `package.json` وGitHub Actions.
- **Frontend:** HTML/CSS/JavaScript وTailwind CSS، بواجهة عربية وRTL.
- **Server-side:** Vercel serverless API تحت `api/`، وFirebase Admin/Auth/Firestore.
- **التخزين:** Backblaze B2 عبر تكامل S3 SDK عند تفعيله بإعدادات مصرح بها.
- **Deployment:** Vercel، مع فصل واضح بين Production وPreview. **هذا المشروع لا يُنشر حاليًا باستخدام Replit Autoscale أو Python HTTP Server بوصفه مسار التسليم البلدي.**
- **الحالة التجارية:** لا تفترض أن Vercel Hobby المجاني صالح لتشغيل SaaS بلدي تجاري؛ راجع شروط مقدم الخدمة والمتطلبات الحكومية قبل التعاقد.

### اختبار محلي دون أسرار

```bash
npm ci --ignore-scripts --no-audit --no-fund
node --test test/municipal-release-gate.test.cjs test/field-case-demo.test.cjs
node scripts/municipal-release-gate.cjs --report-only
```

الاختبار الأخير متوقع أن يعلن `NO-GO` عند عدم وجود دليل وتوقيعات، وهذا **سلوك صحيح وليس عطلًا**. اختبارات Firestore Emulator وChromium تُجرى وفق ملفات GitHub Actions باستخدام **مشروع Demo وبيانات اصطناعية فقط**. لا يُستخدم `npm test` العام بوصفه خط اختبارات معتمدًا؛ `package.json` يحتوي أمرًا افتراضيًا يفشل عمدًا.

### نموذج حصر ميداني محلي مستقل

- صفحة اختبار RTL: `test/fixtures/smart-hsr-field-case-demo.html`.
- حالة اصطناعية `SYN-FIELD-0001`: رصد → إسناد → تنفيذ → تحقق → إغلاق بشروط دور/بلدية وموافقة بشرية.
- نفس `caseId` و`status` و`updatedAt` يظهر في إسقاطات المدير والخريطة والتوأم.
- **لا تتصل** هذه الصفحة بواجهات Firebase/API، ولا تعرض GPS حقيقيًا أو نموذج Twin ثلاثي الأبعاد.
- اختبارات: `test/field-case-demo.test.cjs` و`test/field-case-demo-browser.e2e.cjs`.

## إثباتات الحالة الحالية (لقطة بتاريخ 1 نوفمبر 2026)

| العنصر | الدليل | القيد |
|---|---|---|
| المرشح المعزول | [Draft PR #113](https://github.com/blumark24/smart-hsr-manager/pull/113) | غير مدمج، وAuto Deploy على الفرع معطل |
| اختبارات المرشح | [304/304 اختبارات اصطناعية](https://github.com/blumark24/smart-hsr-manager/actions/runs/41331067059) | لا تعني تجربة Live Auth أو ترخيص بلدي |
| اختبارات العزل المحلية | [3 وظائف PASS](https://github.com/blumark24/smart-hsr-manager/actions/runs/41331067024) | محاكي Offline وليس إثبات صلاحيات IAM النافذة |
| CodeQL | [تحليل ساكن](https://github.com/blumark24/smart-hsr-manager/actions/runs/41331067077) | **17 نتيجة في 5 قواعد** تحتاج فرزًا |
| npm audit | [تذكرة الاعتمادات](https://github.com/blumark24/smart-hsr-manager/issues/115) | Critical=0، High=0، Moderate=7 حسب الفحص الأخير |
| Production | `smart.blumark24.com` — SHA `c07ec531de800a405e2d168e97c3dc492a622bdc` | إصدار أقدم ولا يحمل تغييرات Draft |

هذه نتائج مؤرخة؛ يُعاد التحقق قبل أي قرار تسليم.

## بوابات التسليم الإلزامية

1. **G1:** إثبات مستقل للمشروع/الصلاحيات الفعلية في Firebase Staging مقابل Production، بما في ذلك Admin IAM وAuth وFirestore والمناطق.
2. **G2:** إثبات استقلال مفتاح/دلو B2 الفعلي وVercel Preview عن Production، ومراجعة مكان بيانات المنح الحساسة.
3. **G3:** **مراجِع أمني مستقل مؤهل** يوثق قرار APPROVE/HOLD على SHA نفسه؛ فحوص CI ليست توقيعه.
4. **G4:** بعد إغلاق G1–G3 وموافقة صريحة: Preview محمي مطابق SHA واختبار U1–U8 والمالك والمدير والأراضي والحصر والحركة والخرائط/التوأم والاستعادة والتراجع، مع بيانات **اصطناعية فقط**.
5. **القانون والحوكمة:** وثيقة نطاق بيانات وPDPL وNCA/CCC بحسب التطبيق الفعلي، واعتماد مالك البيانات والمسؤول المخول قبل ملفات حقيقية.

**محظور دون تفويض:** دمج Draft أو نشر Preview/Production أو تعديل الدومين، أو بيانات Firebase/B2 الحقيقية، أو رفع مفاتيح/مستندات مستفيدين إلى GitHub. لا تُحفظ الأسرار أو بيانات الهوية في Issues العامة.

## سجل العمل والتسليم

- [P0 الأمن والموافقة — #73](https://github.com/blumark24/smart-hsr-manager/issues/73)
- [ملاحظات الواجهات ومركز المستخدمين — #75](https://github.com/blumark24/smart-hsr-manager/issues/75)
- [الحوكمة وPDPL وAI — #92](https://github.com/blumark24/smart-hsr-manager/issues/92)
- [قبول الحصر الميداني — #109](https://github.com/blumark24/smart-hsr-manager/issues/109)
- [عقد SaaS متعدد الجهات — #112](https://github.com/blumark24/smart-hsr-manager/issues/112)
- [مسار التدقيق المجاني — #114](https://github.com/blumark24/smart-hsr-manager/issues/114)
- [CodeQL — #116](https://github.com/blumark24/smart-hsr-manager/issues/116)
- [خطة Blumark24 2026–2030 — #117](https://github.com/blumark24/smart-hsr-manager/issues/117)

## الهوية والتواصل

**الهوية البصرية المعتمدة:** SMART HSR بالنيلي والأخضر، RTL، تصميم بلدي هادئ وواضح؛ لا تُستبدل العلامة ولا تُعاد الواجهات المعتمدة بسبب تحديث هذا المستند.

هذا الملف توثيق تطوير داخلي منشور ضمن المستودع، ولا يَحِل محل العقد التجاري أو شهادة الأمان أو مستندات القبول الموقعة.
