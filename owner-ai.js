// AI Command Center module for the Owner Command Center (#/ai).
//
// Sprint 6.6.3: builds the AI Command Center as an honest, static
// architecture-status experience. No live AI backend is connected to
// this application — platform/ai/* is server-only CommonJS code that is
// explicitly designed to fail closed outside a local/Node evaluation
// context (see local-ai-runtime-guard.js / real-provider-activation-guard.js),
// and no real Gemini/OpenRouter call has ever been made from inside this
// application (see the Sprint 5 evaluation reports). This module
// therefore renders fixed, accurate descriptions of what exists and its
// current (inactive) connection state — it does not fetch, poll, or
// simulate any live status, and it performs no image analysis.
//
// getAIStatus()/getVisionStatus()/getEvaluationStatus() are deliberately
// NOT implemented — there is no real backend status source yet. Only
// navigate/showNotif are accepted, matching what other owner modules
// already use, and kept for forward-compatibility once a real status
// source exists.
export function initAIModule({ navigate, showNotif } = {}) {
  const capabilityCardsRoot = document.getElementById('aiCapabilityCards');
  const imageAnalysisRoot = document.getElementById('aiImageAnalysisCenter');
  const governanceRoot = document.getElementById('aiGovernanceSection');

  const CAPABILITY_CARDS = [
    {
      title: 'الرؤية الاصطناعية (Vision AI)',
      status: 'غير متصل', statusTone: 'pending',
      lines: [
        'المزوّدون جاهزون في الكود: Gemini، OpenRouter',
        'لم يتم تفعيل أي مزود داخل التطبيق الفعلي بعد',
      ],
    },
    {
      title: 'بوابة الذكاء الاصطناعي (AI Gateway)',
      status: 'معطّلة افتراضيًا', statusTone: 'pending',
      lines: [
        'محمية بسياسة أمان تتحقق من كل مدخل ومخرج',
        'مصمَّمة للعمل محليًا فقط، ولا تتصل بالشبكة العامة',
      ],
    },
    {
      title: 'الذكاء العربي (Arabic Intelligence)',
      status: 'نشطة كسياسة تحقق', statusTone: 'ok',
      lines: [
        'تتحقق تلقائيًا من صياغة الملخصات البلدية القصيرة',
        'العربية الفصحى فقط، جملة واحدة، دون رموز أو تخمين',
      ],
    },
    {
      title: 'محرك التقييم (Evaluation Engine)',
      status: 'بيئة اختبار آلية', statusTone: 'ok',
      lines: [
        'بيئة اختبار شاملة (١٨٠+ اختبار آلي ناجح)',
        'التقييم الميداني الحقيقي محدود جدًا (عيّنة واحدة) ولم يُعتمد بعد',
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
    note.textContent = 'سيتم تفعيل التحليل الآلي للصور بعد ربط مزود الرؤية الاصطناعية.';
    imageAnalysisRoot.appendChild(note);
  }

  const GOVERNANCE_ITEMS = [
    { label: 'سياسة أمان الذكاء الاصطناعي', value: 'نشطة — تتحقق من كل مدخل ومخرج وتمنع تسرب البيانات الحساسة', tone: 'ok' },
    { label: 'سياسة الملخص العربي', value: 'نشطة — تفرض صياغة بلدية رسمية دون رموز أو تخمين', tone: 'ok' },
    { label: 'عزل بيئة التشغيل', value: 'مفعّل — يمنع أي اتصال بالسحابة أو الشبكة العامة افتراضيًا', tone: 'ok' },
    { label: 'جاهزية التقييم الميداني', value: 'تجريبية محليًا فقط — لا تتوفر بيانات كافية للاعتماد', tone: 'pending' },
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
