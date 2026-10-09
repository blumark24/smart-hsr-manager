// AI Command Center module for the Owner Command Center (#/ai).
//
// Final delivery: this screen displays architecture facts only.
// The authenticated Inspector path performs real analysis through
// /api/ai/analyze, which resolves Gemini or OpenAI server-side and fails
// closed when provider/storage/configuration is unavailable. This Owner
// module intentionally does not invent a "connected/disconnected" status
// because no provider-health telemetry endpoint exists for this screen.
export function initAIModule({ navigate, showNotif } = {}) {
  const capabilityCardsRoot = document.getElementById('aiCapabilityCards');
  const imageAnalysisRoot = document.getElementById('aiImageAnalysisCenter');
  const governanceRoot = document.getElementById('aiGovernanceSection');

  const CAPABILITY_CARDS = [
    {
      title: 'الرؤية الاصطناعية (Vision AI)',
      status: 'مزود حقيقي عند الطلب', statusTone: 'ok',
      lines: [
        'المسار الفعلي: /api/ai/analyze',
        'المزوّد الخادمي: Gemini أو OpenAI حسب إعداد SMART_HSR_AI_PROVIDER',
        'أي فشل في المزود أو التخزين يعاد كفشل صريح — لا توجد نتيجة بديلة مصطنعة',
      ],
    },
    {
      title: 'بوابة الذكاء الاصطناعي (AI Gateway)',
      status: 'Fail-closed', statusTone: 'ok',
      lines: [
        'تتطلب Firebase ID Token ودور مراقب فعلي ونطاق مؤسسة مطابق',
        'تقرأ الدليل من التخزين الخاص على الخادم قبل استدعاء المزود',
      ],
    },
    {
      title: 'الذكاء البلدي العربي',
      status: 'مراجعة بشرية إلزامية', statusTone: 'ok',
      lines: [
        'التحليل استرشادي ولا يغيّر حالة البلاغ تلقائيًا',
        'الحفظ والاعتماد والإسناد تبقى إجراءات بشرية صريحة',
      ],
    },
    {
      title: 'اختبارات الجودة',
      status: 'QA فقط', statusTone: 'pending',
      lines: [
        'Fixtures والمحاكاة محصورة في الاختبارات وlocalhost',
        'لا تدخل بيانات الاختبار إلى Runtime المستضاف أو سجلات البلدية',
      ],
    },
  ];

  function renderCapabilityCards(){
    if (!capabilityCardsRoot) return;
    capabilityCardsRoot.innerHTML = '';
    CAPABILITY_CARDS.forEach(card => {
      const el = document.createElement('div');
      el.className = 'card p-4';

      const title = document.createElement('p');
      title.className = 'text-sm font-bold mb-2';
      title.textContent = card.title;

      const badge = document.createElement('span');
      badge.className = 'status-chip';
      const dot = document.createElement('span');
      dot.className = 'status-dot ' + card.statusTone;
      badge.appendChild(dot);
      badge.append(' ' + card.status);

      const list = document.createElement('ul');
      list.className = 'muted text-xs mt-2 space-y-1';
      card.lines.forEach(line => {
        const li = document.createElement('li');
        li.textContent = line;
        list.appendChild(li);
      });

      el.appendChild(title);
      el.appendChild(badge);
      el.appendChild(list);
      capabilityCardsRoot.appendChild(el);
    });
  }

  const WORKFLOW_STEPS = [
    'بلاغ صورة',
    'Vision AI Analysis',
    'اكتشاف نوع المشكلة',
    'تصنيف الأولوية',
    'الملخص العربي',
    'الإجراء المقترح',
  ];

  function renderImageAnalysisCenter(){
    if (!imageAnalysisRoot) return;
    imageAnalysisRoot.innerHTML = '';

    const title = document.createElement('h3');
    title.className = 'text-sm font-bold muted mb-3';
    title.textContent = 'مركز تحليل الصور بالذكاء الاصطناعي';
    imageAnalysisRoot.appendChild(title);

    const flow = document.createElement('div');
    flow.className = 'flex flex-col items-center gap-1';
    WORKFLOW_STEPS.forEach((step, i) => {
      const chip = document.createElement('span');
      chip.className = 'status-chip';
      chip.textContent = step;
      flow.appendChild(chip);
      if (i < WORKFLOW_STEPS.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'muted text-lg leading-none';
        arrow.textContent = '↓';
        flow.appendChild(arrow);
      }
    });
    imageAnalysisRoot.appendChild(flow);

    const note = document.createElement('p');
    note.className = 'empty-state-desc mt-4';
    note.textContent = 'التحليل الفعلي يتم من مساحة عمل المراقب على صورة حقيقية عبر البوابة الخادمية. شاشة المالك لا تنفذ تحليلًا تجريبيًا ولا تختلق حالة مزود.';
    imageAnalysisRoot.appendChild(note);
  }

  const GOVERNANCE_ITEMS = [
    { label: 'الهوية والصلاحيات', value: 'Firebase Auth + دور مراقب + عزل organizationId قبل أي تحليل', tone: 'ok' },
    { label: 'المزوّد الخارجي', value: 'اتصال HTTPS خادمي فقط إلى مزود مسموح؛ لا مفاتيح أو Prompt داخل المتصفح', tone: 'ok' },
    { label: 'القرار البشري', value: 'إلزامي — التحليل لا يسند ولا يغلق ولا يغيّر Workflow تلقائيًا', tone: 'ok' },
    { label: 'بيانات الاختبار', value: 'محصورة في QA/localhost ولا تستخدم كبيانات تشغيلية', tone: 'ok' },
  ];

  function renderGovernance(){
    if (!governanceRoot) return;
    governanceRoot.innerHTML = '';

    const title = document.createElement('h3');
    title.className = 'text-sm font-bold muted mb-3';
    title.textContent = 'حوكمة الذكاء الاصطناعي';
    governanceRoot.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'space-y-2 text-sm';
    GOVERNANCE_ITEMS.forEach(item => {
      const li = document.createElement('li');
      li.className = 'flex items-start gap-2';

      const dot = document.createElement('span');
      dot.className = 'status-dot ' + item.tone;
      dot.style.marginTop = '.4rem';

      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = item.label + ': ';
      const value = document.createElement('span');
      value.className = 'muted';
      value.textContent = item.value;
      text.appendChild(strong);
      text.appendChild(value);

      li.appendChild(dot);
      li.appendChild(text);
      list.appendChild(li);
    });
    governanceRoot.appendChild(list);
  }

  function render(){
    renderCapabilityCards();
    renderImageAnalysisCenter();
    renderGovernance();
  }

  render();

  return Object.freeze({ render });
}
