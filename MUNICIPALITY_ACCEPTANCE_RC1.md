# SMART HSR — Municipality Acceptance RC1

## هدف المرحلة
هذه المرحلة هي بوابة الإغلاق والتسليم لرئيس البلدية. لا تضيف خدمات أو ميزات جديدة إلا لمعالجة خلل P0/P1.

## خط الأساس
- Base branch: phase18-contractors-registry-v1
- Base SHA: 0a53419aafa82afa39f6a00ebfab0d3f43ac4b43
- Production/main: غير مستهدفين في هذه المرحلة.
- Preview only until Municipality Acceptance PASS.

## معيار 100%
لا يعني 100% عدم وجود أي تحسين مستقبلي؛ يعني 100% من نطاق V1 المتفق عليه:
1. Identity / One Path / One Workspace — PASS
2. User Center / Employee Master Registry — PASS
3. Field Survey — PASS
4. Smart Lands — PASS
5. Smart Mobility — PASS
6. Administrative Affairs — PASS
7. Contractors Registry — PASS
8. Manager Executive Review — PASS
9. Security / RBAC / Tenant Isolation — PASS
10. Responsive / Day / Night / RTL — PASS
11. Cross-role UAT — PASS
12. Release Candidate + Handover Package — PASS

## Automated Acceptance
PHASE19 workflow يجمع الاختبارات المحمية من المراحل 13D.5 حتى 18 في Gate واحد:
- Institutional identity and user center
- Field Survey
- Smart Lands
- Smart Mobility
- Administrative Affairs
- Contractors Registry
- Firestore security rules

أي فشل في هذا الـGate يمنع RC1.

## Manual UAT المطلوب

### 1. مدير البلدية
- Login
- Dashboard
- User Center
- Add/edit employee
- Correct institutional path
- Lands executive access
- Mobility executive access
- Contractors registry
- Logout/session behavior

### 2. رئيس قسم الحصر
- Login direct to Field workspace
- Visual distortion lifecycle
- Assignment to contractor
- Evidence Before/After
- Operational map
- Verification / closure / audit

### 3. مراقب الحصر
- Capture / evidence / GPS / AI path
- Submit observation
- Verify contractor result

### 4. رئيس قسم الأراضي
- Login / SSO
- Registry
- Review / approve
- Digital record / GIS

### 5. موظف الأراضي
- Login / SSO
- Create/update record
- Documents
- No approval privilege

### 6. رئيس الحركة
- Missions
- Allocate vehicle
- Handover / return
- Incidents
- Fleet boundaries

### 7. رئيس أي قسم بلدي
- Request mobility mission for own department only
- No cross-department access

### 8. رئيس الشؤون الإدارية
- Direct login to Administrative Affairs workspace
- Approve/reject/return mission
- Vehicle authorization decision
- No fleet allocation/handover privilege

### 9. موظف مستلم للمركبة
- Receive assigned mission
- Start / incident / complete
- No administrative privileges

### 10. شركة متعاقدة
- Separate external identity
- Active contract required
- No employee registry presence
- Assigned cases only
- Evidence submission path

## Severity Gate
- P0: يوقف التسليم.
- P1: يوقف إغلاق القسم/الـRC.
- P2: يصلح قبل التسليم إن كان ظاهرًا للمستخدم أو يوثق بقرار صريح.
- P3: تحسين لاحق فقط إذا لا يؤثر على التشغيل أو الأمان.

## التسليم النهائي
لا يعتمد إلا بعد:
- PHASE19 Automated Gate PASS
- Manual UAT PASS
- Manager Executive QA PASS
- Visual/Responsive QA PASS
- Release SHA ثابت
- Handover package مكتملة
