import {
  Activity, Bug, ClipboardCheck, FileBarChart2, GitBranch, Globe2, Radar, ShieldCheck,
} from 'lucide-react';

export const agents = [
  {
    number: '01', short: { en: 'DETECT', ar: 'الكشف' }, name: { en: 'Threat Detection', ar: 'اكتشاف التهديدات' },
    description: { en: 'Triage suspicious signals and identify what needs a closer look. Analysis is conceptual until a verified service is connected.', ar: 'فرز الإشارات المريبة وتحديد ما يستحق المراجعة. يبقى التحليل تصوريًا حتى توصيل خدمة موثقة.' },
    outputs: { en: ['Signal indicators', 'Initial severity · not measured', 'Investigation trigger'], ar: ['مؤشرات الإشارة', 'الشدة الأولية · غير مقاسة', 'بدء التحقيق'] }, icon: Radar,
  },
  {
    number: '02', short: { en: 'INTEL', ar: 'الاستخبارات' }, name: { en: 'Threat Intelligence', ar: 'استخبارات التهديدات' },
    description: { en: 'A planned enrichment step for authorized reputation and IOC sources. No source is queried in this preview.', ar: 'خطوة إثراء مخططة لمصادر السمعة ومؤشرات الاختراق المصرح بها. لا يستعلم هذا العرض عن أي مصدر.' },
    outputs: { en: ['Source status', 'Reputation context · unavailable', 'Correlation notes'], ar: ['حالة المصدر', 'سياق السمعة · غير متاح', 'ملاحظات الارتباط'] }, icon: Globe2,
  },
  {
    number: '03', short: { en: 'ANALYZE', ar: 'التحليل' }, name: { en: 'Malware Analysis', ar: 'تحليل البرمجيات الخبيثة' },
    description: { en: 'A proposed workflow for safe static and behavioral analysis. No files are uploaded, opened, or executed here.', ar: 'سير عمل مقترح للتحليل الثابت والسلوكي الآمن. لا تُرفع الملفات أو تُفتح أو تُشغّل هنا.' },
    outputs: { en: ['File indicators · sample only', 'Behavioral summary · not run', 'Risk assessment · not measured'], ar: ['مؤشرات الملف · مثال فقط', 'ملخص السلوك · لم يُنفذ', 'تقييم المخاطر · غير مقاس'] }, icon: Bug,
  },
  {
    number: '04', short: { en: 'RESPOND', ar: 'الاستجابة' }, name: { en: 'Incident Response', ar: 'الاستجابة للحوادث' },
    description: { en: 'Drafts response options for human review. No containment or production actions are connected.', ar: 'يصوغ خيارات استجابة لمراجعتها بشريًا. لا يوجد اتصال بالاحتواء أو بإجراءات الإنتاج.' },
    outputs: { en: ['Response options', 'Review checklist', 'Human approval gate'], ar: ['خيارات الاستجابة', 'قائمة مراجعة', 'بوابة موافقة بشرية'] }, icon: ShieldCheck,
  },
  {
    number: '05', short: { en: 'GOVERN', ar: 'الحوكمة' }, name: { en: 'Compliance', ar: 'الامتثال' },
    description: { en: 'Planned references to NIST, ISO 27001, SOC 2 and MITRE ATT&CK. No control mapping is currently verified.', ar: 'مراجع مخططة لـ NIST وISO 27001 وSOC 2 وMITRE ATT&CK. لم يتم التحقق من أي مواءمة للضوابط حتى الآن.' },
    outputs: { en: ['Framework references · planned', 'Audit trail · planned', 'Governance notes'], ar: ['مراجع الأطر · مخطط', 'مسار التدقيق · مخطط', 'ملاحظات الحوكمة'] }, icon: ClipboardCheck,
  },
  {
    number: '06', short: { en: 'REPORT', ar: 'التقارير' }, name: { en: 'Reporting', ar: 'إعداد التقارير' },
    description: { en: 'Organizes verified findings into technical and executive formats when a real investigation pipeline exists.', ar: 'ينظم النتائج الموثقة بصيغ تقنية وتنفيذية عند توفر مسار تحقيق فعلي.' },
    outputs: { en: ['Executive format', 'Technical format', 'Incident record'], ar: ['صيغة تنفيذية', 'صيغة تقنية', 'سجل الحادثة'] }, icon: FileBarChart2,
  },
  {
    number: '07', short: { en: 'ORCHESTRATE', ar: 'التنسيق' }, name: { en: 'Orchestration', ar: 'التنسيق' },
    description: { en: 'Coordinates agent tasks and context. This page illustrates the architecture; no autonomous agents are running.', ar: 'ينسق مهام الوكلاء والسياق. توضح الصفحة البنية فقط؛ ولا تعمل فيها وكلاء ذاتيون.' },
    outputs: { en: ['Task routing · concept', 'Conflict checks · planned', 'Final review handoff'], ar: ['توجيه المهام · تصور', 'فحص التعارض · مخطط', 'إحالة للمراجعة النهائية'] }, icon: GitBranch,
  },
] as const;

export const differentiators = [
  { icon: Radar, title: { en: 'Collaborative reasoning', ar: 'استدلال تعاوني' }, body: { en: 'Specialist roles share a common context in the proposed system.', ar: 'تتشارك الأدوار المتخصصة سياقًا موحدًا في النظام المقترح.' } },
  { icon: GitBranch, title: { en: 'Decision support', ar: 'دعم القرار' }, body: { en: 'A connected path from signal to human-reviewed recommendations.', ar: 'مسار متصل من الإشارة إلى توصيات يراجعها الإنسان.' } },
  { icon: ClipboardCheck, title: { en: 'Explainability', ar: 'قابلية التفسير' }, body: { en: 'Expose evidence and decision factors rather than private chain-of-thought.', ar: 'عرض الأدلة وعوامل القرار بدلًا من سلسلة التفكير الخاصة.' } },
  { icon: ShieldCheck, title: { en: 'SOC-mirrored architecture', ar: 'بنية تحاكي مركز العمليات' }, body: { en: 'A product concept organized around security operations work.', ar: 'تصور منتج منظم حول عمل مراكز العمليات الأمنية.' } },
] as const;

export const capabilities = [
  { icon: Radar, title: { en: 'Autonomous threat investigation', ar: 'التحقيق المستقل في التهديدات' }, body: { en: 'A proposed path from first signal to a documented review.', ar: 'مسار مقترح من الإشارة الأولى إلى مراجعة موثقة.' } },
  { icon: Globe2, title: { en: 'Threat intelligence enrichment', ar: 'إثراء استخبارات التهديدات' }, body: { en: 'Planned connections to authorized, attributable sources.', ar: 'اتصالات مخططة بمصادر مصرح بها وقابلة للتوثيق.' } },
  { icon: Bug, title: { en: 'Malware analysis workflow', ar: 'سير تحليل البرمجيات الخبيثة' }, body: { en: 'A future safe-review workflow; no uploaded files are scanned here.', ar: 'مسار مراجعة آمن مستقبلي؛ لا تُفحص ملفات مرفوعة هنا.' } },
  { icon: ShieldCheck, title: { en: 'Human-approved response', ar: 'استجابة بموافقة بشرية' }, body: { en: 'Recommendations only until safe controls are implemented and tested.', ar: 'توصيات فقط إلى أن تُنفذ الضوابط الآمنة وتُختبر.' } },
  { icon: ClipboardCheck, title: { en: 'Compliance mapping', ar: 'مواءمة الامتثال' }, body: { en: 'Framework references with evidence and version tracking.', ar: 'مراجع للأطر مرتبطة بالأدلة وتتبع الإصدارات.' } },
  { icon: FileBarChart2, title: { en: 'Explainable reporting', ar: 'تقارير قابلة للتفسير' }, body: { en: 'Evidence, decision factors and concise summaries—not hidden chain-of-thought.', ar: 'أدلة وعوامل قرار وملخصات موجزة، لا سلسلة تفكير خفية.' } },
  { icon: GitBranch, title: { en: 'Multi-agent coordination', ar: 'تنسيق متعدد الوكلاء' }, body: { en: 'A coordinated architecture concept, not a currently running agent service.', ar: 'تصور لبنية منسقة، لا خدمة وكلاء تعمل حاليًا.' } },
  { icon: Activity, title: { en: 'Contextual risk assessment', ar: 'تقييم المخاطر السياقي' }, body: { en: 'A proposed way to organize risk factors; no score is calculated in this preview.', ar: 'طريقة مقترحة لتنظيم عوامل المخاطر؛ لا تُحسب أي درجة في هذه المعاينة.' } },
] as const;
