import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BrainCircuit, Check,
  CircleDot, Code2, Cpu, Database, Fingerprint,
  GitBranch, Globe2, Layers3, LockKeyhole, Menu, Network, Shield,
  ShieldAlert, Terminal, Workflow, X,
} from 'lucide-react';
import { agents, capabilities, differentiators } from './data/agents';
import { metrics } from './data/metrics';
import { roadmap } from './data/roadmap';
import { BrandLogo } from './components/BrandLogo';

type Lang = 'ar' | 'en';

const copy = {
  ar: {
    navAria: 'التنقل الرئيسي', menuOpen: 'فتح القائمة', menuClose: 'إغلاق القائمة',
    nav: [['#capabilities', 'المنصة'], ['#agents', 'الوكلاء'], ['#architecture', 'البنية'], ['#threat-intel', 'استخبارات التهديدات'], ['#workflow', 'سير العمل'], ['#technology', 'التقنيات']],
    command: 'دخول مركز القيادة', event: 'NEXUS SYSTEMS / AI-POWERED AUTONOMOUS CYBER DEFENSE',
    overline: 'عمليات أمنية مستقلة', heroSub: 'منصة دفاع سيبراني مستقلة متعددة الوكلاء',
    heroIntro: 'شبكة ذكية من وكلاء الأمن السيبراني المتخصصين، مصممة لتنسيق التحقيقات وتوضيح الأدلة وإبقاء القرار الأمني تحت إشراف الإنسان.',
    exploreArchitecture: 'استكشف البنية', exploreWorkflow: 'استكشف سير العمل', heroDisclaimer: 'تصور توضيحي فقط. لا توجد حماية أو معالجة أمنية فعلية متصلة.',
    scroll: 'تابع للاستكشاف', signal: 'فجوة الإشارة والضجيج / 01', problemTitleA: 'فرق الأمن', problemTitleB: 'تحتاج سياقًا أوضح',
    problemBody: 'تواجه فرق العمليات الأمنية تدفقًا متزايدًا من الإشارات. يطرح NEXUS SHIELD AI تصورًا لتنسيق الفحص والتحقيق ودعم القرار، دون ادعاء نتائج تشغيلية.',
    placeholder: 'المؤشرات هنا أهداف أو عناصر نائبة؛ لا توجد بيانات أداء موثقة.',
    architectureEyebrow: 'تصميم النظام / 02', architectureTitle: 'بنية متعددة الوكلاء', architectureSub: 'تصور لشبكة منسقة من وكلاء الذكاء الاصطناعي المتخصصين.',
    map: 'خريطة البنية', specialists: '6 متخصصين + منسق مفاهيمي', chooseAgent: 'اختر وكيلاً لاستكشاف دوره',
    coordinator: 'وكيل التنسيق', selected: 'العقدة المحددة', activeView: 'عرض تفاعلي', expected: 'المخرجات المقترحة',
    chooseNode: 'اختر عقدة أخرى من الشبكة لاستكشاف دورها.', chooseFromMap: 'اختر وكيلاً من المخطط لعرض دوره ومخرجاته.',
    principles: [
      ['المنسق', 'يوجه المهام ويدير السياق وينسق التعاون بين الوكلاء.'],
      ['ناقل الرسائل', 'تصور لتواصل غير متزامن بين الوكلاء باستخدام سياق مشترك.'],
      ['قابلية التفسير', 'ملخصات قرارات مرتبطة بالأدلة وعوامل القرار؛ لا تعرض سلسلة التفكير الداخلية.'],
      ['طبقة الأمان', 'ضوابط مقترحة للأفعال ومشاركة الإنسان في القرارات الحرجة.'],
    ],
    agentEyebrow: 'أدوار متخصصة / 03', agentTitle: 'وكلاء متخصصون', agentSub: 'ستة أدوار تخصصية + منسق واحد؛ جميعها تصورات غير متصلة.',
    workflowEyebrow: 'تسلسل التحقيق / 04', workflowTitle: 'سير عمل التحقيق', workflowSub: 'من الإشارة إلى التقييم — تصور لسير عمل منسق.',
    workflow: [
      ['استلام المُدخل', 'مدخل توضيحي: بريد أو رابط أو ملف؛ لا يتم رفع أي محتوى.'],
      ['وكيل اكتشاف التهديدات', 'تصنيف مقترح لإشارات التصيد أو الروابط المشبوهة.'],
      ['وكيل استخبارات التهديدات', 'إثراء تصوري؛ لا توجد مصادر استخبارات متصلة.'],
      ['وكيل تحليل البرمجيات الخبيثة', 'تصور لمراجعة مؤشرات الملفات والسلوك.'],
      ['وكيل الاستجابة للحوادث', 'اقتراح خطة احتواء؛ لا يتم تنفيذ إجراءات.'],
      ['وكيل الامتثال', 'ربط مقترح بأطر الأمن والحوكمة ذات الصلة.'],
      ['وكيل إعداد التقارير', 'ملخص تنفيذي وتقرير تقني نموذجي.'],
      ['التقييم الأمني النهائي', 'تقييم توضيحي وإجراءات موصى بها؛ ليس نتيجة تحليل.'],
    ],
    sequence: 'تسلسل منسق', evidence: 'أدلة ← سياق ← تقييم',
    collabEyebrow: 'وحدة التعاون / 05', collabTitle: 'NEXUS LIVE — وحدة العرض', collabSub: 'سجل تفاعلي لمحتوى توضيحي؛ ليس تدفق أحداث حيًا.',
    warning: 'وضع المحاكاة — لا يجري تحليل حقيقي', exampleLog: 'كل سجل أدناه محتوى نموذجي.',
    simulated: 'وضع المحاكاة', session: 'جلسة: DEMO-0001', notLive: 'سجل توضيحي · ليس مباشرًا', consensus: 'ملخص توضيحي',
    illustrative: 'توضيحي', verdict: 'التقييم', agentsLabel: 'الوكلاء', total: 'المدة', human: 'تدخل بشري', safeMode: 'عرض آمن · لا إجراءات',
    run: 'تشغيل المحاكاة', rerun: 'إعادة تشغيل المحاكاة', running: 'جارٍ عرض المثال',
    simulationNote: 'محاكاة واجهة فقط. لا يتم رفع ملفات أو الاتصال بمصادر أو إجراء تحليل أو تنفيذ استجابة.',
    intelEyebrow: 'رصد المؤشرات / 06', intelTitle: 'خريطة استخبارات توضيحية', intelSub: 'تصوير جغرافي تجريدي لمؤشرات محجوزة للأمثلة؛ لا تُعرض بيانات استخبارات حقيقية.',
    simMode: 'وضع المحاكاة', mapTitle: 'عرض تجريدي / غير متصل', demoCase: 'DEMO CASE / NO PROVIDER', mapNote: 'روابط بصرية توضيحية فقط', origin: 'مصدر توضيحي', destination: 'وجهة توضيحية', noIntel: 'لم يتم إجراء استعلام خارجي أو تصنيف أو إسناد للمؤشر.',
    reservedIp: '192.0.2.10', reservedDomain: 'example.com', noLookup: 'لم يتم إجراء استعلام خارجي',
    explainEyebrow: 'قابلية التفسير / 07', explainTitle: 'أدلة وعوامل قرار واضحة', explainBody: 'تعرّف على نوع السياق الذي يمكن عرضه للمراجع البشري: أدلة مصرح بها، عوامل قرار مرئية، وملخص قابل للمراجعة — لا سلسلة التفكير الداخلية للنموذج.',
    evidenceLabel: 'أمثلة أدلة', factorsLabel: 'عوامل قرار ظاهرة', summaryLabel: 'ملخص التفسير',
    evidence: ['رأس رسالة تجريبي', 'رابط example.com محجوز للأمثلة', 'سياق إدخال توضيحي'],
    factors: [['مصدر المؤشر', 'مدخل تجريبي فقط'], ['صلة السياق', 'غير متحققة'], ['سياسة التصعيد', 'مراجعة بشرية'], ['مصادر خارجية', 'غير متصلة']],
    explainSummary: 'مثال توضيحي: ترتبط الإشارة بمدخل تجريبي فقط. لا توجد نتيجة تحليل أو درجة ثقة، وتتطلب أي خلاصة تحققًا من الإنسان.',
    noThought: 'لا نعرض سلسلة التفكير (Chain of Thought) أو استدلالًا داخليًا. تعرض هذه اللوحة الأدلة وعوامل القرار وملخصًا موجزًا فقط.',
    layersEyebrow: 'دفاع بطبقات / 08', layersTitle: 'طبقات الحماية المفاهيمية', layersSub: 'تصور طبقي لنطاقات التحكم؛ لا تمثل خدمات مفعّلة أو ضوابط منشورة.',
    layerNames: [['المحيط', 'مصادر وأصول مصرح بها ضمن التصميم المستقبلي.'], ['التحليل', 'تنسيق إشارات وأدلة في سير عمل مقترح.'], ['الحوكمة', 'سياسات وصول ومراجعة ومساءلة.'], ['الاستجابة', 'توصيات فقط؛ أي تنفيذ مستقبلي يتطلب موافقة بشرية.']],
    diffEyebrow: 'ما يميز التصور / 09', diffTitleA: 'دفاع تعاوني', diffTitleB: 'بمنظور أوضح',
    diffBody: 'يستكشف NEXUS SHIELD AI طريقة لتنسيق التحقيق والتحليل ودعم الاستجابة عبر وكلاء متخصصين مع الإبقاء على الإنسان في الحلقة.',
    coordinationLink: 'استكشف طريقة التنسيق', capabilityEyebrow: 'قدرات المنصة / 10', capabilityTitle: 'مخطط للدفاع المؤسسي',
    learnMore: 'استكشف', techEyebrow: 'الأساس والتصور / 11', techTitle: 'مجموعة التقنيات',
    techSub: 'الأساس الفعلي للموقع منفصل بوضوح عن الخيارات المقترحة وغير المهيأة.',
    techDesign: 'الأساس الحالي للموقع', techBody: 'واجهة العرض الحالية مبنية باستخدام React وVite وTailwind CSS. لا توجد خدمات تحليل أو استخبارات متصلة.',
    planned: 'مخطط / غير مهيأ', referenceStack: 'الأساس الفعلي', stackDisclaimer: 'التقنيات الأخرى أدناه أفكار مخططة فقط؛ لا خدمات أو واجهات API أو تكاملات مهيأة.',
    plannedStack: 'تقنيات مقترحة فقط', impactEyebrow: 'إطار القياس / 12', impactTitle: 'مؤشرات مستقبلية للقياس',
    impactSub: 'المقاييس التالية عناصر نائبة تنتظر تعريف المنهجية والبيانات الموثوقة.',
    impactNote: 'لا تُعرض نتائج أو معدلات أداء أو أرقام أمنية موثقة. الشرطات تعني أن القياس غير متاح.',
    roadmapEyebrow: 'مراحل التطوير / 13', roadmapTitle: 'خارطة طريق مستقبلية', roadmapSub: 'كل المراحل مخططة وغير متاحة حاليًا.',
    plannedTag: 'مخطط للمستقبل · غير متاح حاليًا',
    roadmapNote: 'جميع المراحل الخمس تصورات مستقبلية، وليست قدرات مباشرة أو متاحة حاليًا.',
    finalTitle: 'دفاع سيبراني مستقل بالذكاء الاصطناعي — بقرار بشري واضح',
    finalText: 'NEXUS SHIELD AI هو تصور لمنصة دفاع سيبراني متعددة الوكلاء، يركز على تنسيق العمل ووضوح الأدلة والحوكمة.',
    footerLine: 'دفاع سيبراني منسق.<br />قرارات أوضح. الإنسان في الحلقة.', explore: 'استكشف', platform: 'المنصة', simulation: 'المحاكاة',
    footerDescription: 'تصور لمنصة دفاع سيبراني متعددة الوكلاء.', footerTag: 'مصمم لعمليات الأمن',
    noClaim: 'عرض توضيحي / محاكاة فقط — لا توجد خدمات أمنية فعلية متصلة.',
    coordinatorLabel: 'منسق النظام', outputs: 'مخرجات', layer: 'طبقة', technologies: 'التقنيات',
  },
  en: {
    navAria: 'Main navigation', menuOpen: 'Open menu', menuClose: 'Close menu',
    nav: [['#capabilities', 'Platform'], ['#agents', 'Agents'], ['#architecture', 'Architecture'], ['#threat-intel', 'Threat Intel'], ['#workflow', 'Workflow'], ['#technology', 'Technology']],
    command: 'ENTER COMMAND CENTER', event: 'NEXUS SYSTEMS / AI-POWERED AUTONOMOUS CYBER DEFENSE',
    overline: 'AUTONOMOUS SECURITY OPERATIONS', heroSub: 'AI-Powered Autonomous Cyber Defense',
    heroIntro: 'A network of specialist cybersecurity agents, designed to coordinate investigations, clarify evidence and keep security decisions under human oversight.',
    exploreArchitecture: 'Explore Architecture', exploreWorkflow: 'View Agent Workflow', heroDisclaimer: 'Illustrative concept only. No live protection or security response is connected.',
    scroll: 'SCROLL TO EXPLORE', signal: 'THE SIGNAL-TO-NOISE GAP / 01', problemTitleA: 'Security teams', problemTitleB: 'need clearer context',
    problemBody: 'Security operations face a growing stream of signals. NEXUS SHIELD AI proposes a way to coordinate triage, investigation and decision support—without claiming operational results.',
    placeholder: 'Indicators are targets or placeholders; no verified performance data is available.',
    architectureEyebrow: 'SYSTEM DESIGN / 02', architectureTitle: 'Multi-agent architecture', architectureSub: 'A coordinated network of specialist AI agents, shown as a design concept.',
    map: 'ARCHITECTURE MAP', specialists: '6 SPECIALISTS + CONCEPTUAL COORDINATOR', chooseAgent: 'Choose an agent to inspect its role',
    coordinator: 'Coordination Agent', selected: 'SELECTED NODE', activeView: 'INTERACTIVE VIEW', expected: 'Proposed outputs',
    chooseNode: 'Select another node in the network to explore its role.', chooseFromMap: 'Select an agent on the map to see its role and outputs.',
    principles: [
      ['Orchestrator', 'Routes tasks, manages context and coordinates collaboration between agents.'],
      ['Message Bus', 'A concept for asynchronous agent communication using shared context.'],
      ['Explainability', 'Decision summaries tied to evidence and visible factors; no internal chain of thought.'],
      ['Safety Layer', 'Proposed action controls and human involvement in critical decisions.'],
    ],
    agentEyebrow: 'SPECIALIST ROLES / 03', agentTitle: 'Specialist agents', agentSub: 'Six specialist roles + one coordinator; all are disconnected concepts.',
    workflowEyebrow: 'INVESTIGATION SEQUENCE / 04', workflowTitle: 'Investigation workflow', workflowSub: 'From signal to assessment — a coordinated workflow concept.',
    workflow: [
      ['Input received', 'Example input: email, URL or file; no content is uploaded.'],
      ['Threat Detection Agent', 'Proposed classification for phishing or suspicious-link signals.'],
      ['Threat Intelligence Agent', 'Illustrative enrichment; no intelligence sources are connected.'],
      ['Malware Analysis Agent', 'Conceptual review of file and behavior indicators.'],
      ['Incident Response Agent', 'Suggest a containment plan; no action is executed.'],
      ['Compliance Agent', 'Proposed mapping to relevant security and governance frameworks.'],
      ['Reporting Agent', 'Example executive summary and technical report.'],
      ['Final security assessment', 'Illustrative assessment and recommendations—not analysis results.'],
    ],
    sequence: 'ORCHESTRATED SEQUENCE', evidence: 'EVIDENCE → CONTEXT → ASSESSMENT',
    collabEyebrow: 'COLLABORATION / 05', collabTitle: 'NEXUS LIVE — demo console', collabSub: 'An interactive sample log; this is not a live event stream.',
    warning: 'SIMULATION MODE — no real analysis is performed', exampleLog: 'Every entry below is sample content.',
    simulated: 'SIMULATION MODE', session: 'SESSION: DEMO-0001', notLive: 'ILLUSTRATIVE LOG · NOT LIVE', consensus: 'Illustrative summary',
    illustrative: 'ILLUSTRATIVE', verdict: 'Assessment', agentsLabel: 'Agents', total: 'Duration', human: 'Human input', safeMode: 'SAFE DEMO · NO ACTIONS',
    run: 'Run simulation', rerun: 'Replay simulation', running: 'Showing example',
    simulationNote: 'Interface simulation only. No files are uploaded, no sources are contacted, and no analysis or response is performed.',
    intelEyebrow: 'INDICATOR VIEW / 06', intelTitle: 'Simulated threat-intelligence map', intelSub: 'Abstract geography using documentation-reserved demo indicators; no real intelligence is shown.',
    simMode: 'SIMULATION MODE', mapTitle: 'ABSTRACT VIEW / DISCONNECTED', demoCase: 'DEMO CASE / NO PROVIDER', mapNote: 'Illustrative visual links only', origin: 'DEMO SOURCE', destination: 'DEMO DESTINATION', noIntel: 'No external lookup, classification, or indicator attribution has been performed.',
    reservedIp: '192.0.2.10', reservedDomain: 'example.com', noLookup: 'NO EXTERNAL LOOKUP PERFORMED',
    explainEyebrow: 'EXPLAINABILITY / 07', explainTitle: 'Evidence and decision factors', explainBody: 'See the context a human reviewer could be shown: authorized evidence, visible decision factors and a concise reviewable summary—not private model reasoning.',
    evidenceLabel: 'EXAMPLE EVIDENCE', factorsLabel: 'VISIBLE DECISION FACTORS', summaryLabel: 'EXPLAINABILITY SUMMARY',
    evidence: ['Example message header', 'example.com reserved example domain', 'Illustrative input context'],
    factors: [['Indicator source', 'Demo input only'], ['Context relevance', 'Not verified'], ['Escalation policy', 'Human review'], ['External sources', 'Not connected']],
    explainSummary: 'Illustrative example: the signal is associated with demo input only. No analysis result or confidence score exists; any conclusion would require human verification.',
    noThought: 'We do not expose model chain of thought or private reasoning. This panel shows evidence, decision factors and a concise summary only.',
    layersEyebrow: 'LAYERED DEFENSE / 08', layersTitle: 'Conceptual security layers', layersSub: 'A layered control-plane concept; these are not enabled services or deployed controls.',
    layerNames: [['Perimeter', 'Authorized sources and assets in a future design.'], ['Analysis', 'Coordinating signals and evidence in a proposed workflow.'], ['Governance', 'Access, review and accountability policies.'], ['Response', 'Recommendations only; any future execution requires human approval.']],
    diffEyebrow: 'THE DIFFERENCE / 09', diffTitleA: 'Collaborative defense', diffTitleB: 'with clearer context',
    diffBody: 'NEXUS SHIELD AI explores a way to coordinate investigation, analysis and response support across specialist agents—while keeping people in the loop.',
    coordinationLink: 'Explore agent coordination', capabilityEyebrow: 'PLATFORM CAPABILITIES / 10', capabilityTitle: 'A blueprint for enterprise defense',
    learnMore: 'Explore', techEyebrow: 'FOUNDATION & BLUEPRINT / 11', techTitle: 'Technology stack',
    techSub: 'The live site foundation is clearly separated from proposed, unconfigured options.',
    techDesign: 'Current site foundation', techBody: 'This demonstration interface is built with React, Vite and Tailwind CSS. No analysis or intelligence services are connected.',
    planned: 'PLANNED / NOT CONFIGURED', referenceStack: 'ACTUAL FOUNDATION', stackDisclaimer: 'All other technologies listed are planning ideas only; no services, APIs or integrations are configured.',
    plannedStack: 'PROPOSED TECHNOLOGIES ONLY', impactEyebrow: 'MEASUREMENT FRAMEWORK / 12', impactTitle: 'Future measurement indicators',
    impactSub: 'These indicators are placeholders pending a defined methodology and reliable data.',
    impactNote: 'No results, performance rates or verified security metrics are shown. Dashes mean measurement is unavailable.',
    roadmapEyebrow: 'DEVELOPMENT HORIZON / 13', roadmapTitle: 'Future roadmap', roadmapSub: 'All five phases are planned and not currently available.',
    plannedTag: 'PLANNED FOR THE FUTURE · NOT AVAILABLE',
    roadmapNote: 'All five phases are future concepts, not live or currently available capabilities.',
    finalTitle: 'AI-powered autonomous cyber defense—with clear human decisions',
    finalText: 'NEXUS SHIELD AI is a multi-agent cyber defense concept focused on coordinated work, evidence clarity and governance.',
    footerLine: 'Coordinated cyber defense.<br />Clearer decisions. Human in the loop.', explore: 'EXPLORE', platform: 'PLATFORM', simulation: 'Simulation',
    footerDescription: 'A multi-agent cyber defense concept.', footerTag: 'DESIGNED FOR SECURITY OPERATIONS',
    noClaim: 'Demonstration / simulation only — no live security services are connected.',
    coordinatorLabel: 'SYSTEM COORDINATOR', outputs: 'OUTPUTS', layer: 'LAYER', technologies: 'TECHNOLOGIES',
  },
} as const;

const workflowData = [
  { enActor: 'USER INPUT', arActor: 'مدخل المستخدم', enType: 'Input', arType: 'مُدخل', enText: 'Example input received: sample.eml (not uploaded)', arText: 'استلام مدخل توضيحي: sample.eml (لم يتم رفعه)', color: '#cbd8ce' },
  { enActor: 'THREAT DETECTION', arActor: 'اكتشاف التهديدات', enType: 'Detection', arType: 'كشف', enText: 'Example signal added to the illustrative stream.', arText: 'إضافة إشارة نموذجية إلى السجل التوضيحي.', color: '#d0f576' },
  { enActor: 'THREAT INTELLIGENCE', arActor: 'استخبارات التهديدات', enType: 'Intel', arType: 'استخبارات', enText: 'No external intelligence source queried.', arText: 'لم يتم الاستعلام من أي مصدر استخبارات خارجي.', color: '#7fc9ce' },
  { enActor: 'MALWARE ANALYSIS', arActor: 'تحليل البرمجيات الخبيثة', enType: 'Analysis', arType: 'تحليل', enText: 'Sample attachment placeholder; no file analyzed.', arText: 'مرفق نموذجي؛ لم يتم تحليل أي ملف.', color: '#d5b985' },
  { enActor: 'INCIDENT RESPONSE', arActor: 'الاستجابة للحوادث', enType: 'Response', arType: 'استجابة', enText: 'Illustrative recommendations; no action performed.', arText: 'توصيات توضيحية؛ لم يتم تنفيذ أي إجراء.', color: '#d0a39b' },
  { enActor: 'COMPLIANCE', arActor: 'الامتثال', enType: 'Compliance', arType: 'امتثال', enText: 'Example control mapping; not verified.', arText: 'مواءمة نموذجية للضوابط؛ غير متحققة.', color: '#b6a5d0' },
  { enActor: 'REPORTING', arActor: 'إعداد التقارير', enType: 'Report', arType: 'تقرير', enText: 'Sample executive and technical report outline.', arText: 'مخطط نموذجي لتقرير تنفيذي وتقني.', color: '#e2d18e' },
] as const;

const stackGroups = [
  { en: 'Application', ar: 'التطبيق', icon: Code2, live: true, enItems: ['React', 'Vite', 'Tailwind CSS'], arItems: ['React', 'Vite', 'Tailwind CSS'] },
  { en: 'Backend', ar: 'الخلفية', icon: Cpu, enItems: ['FastAPI — planned'], arItems: ['FastAPI — مخطط'] },
  { en: 'AI & orchestration', ar: 'الذكاء الاصطناعي والتنسيق', icon: BrainCircuit, enItems: ['OpenAI — planned', 'LangGraph — planned'], arItems: ['OpenAI — مخطط', 'LangGraph — مخطط'] },
  { en: 'Data', ar: 'البيانات', icon: Database, enItems: ['PostgreSQL — planned', 'Vector DB — planned'], arItems: ['PostgreSQL — مخطط', 'قاعدة بيانات متجهية — مخططة'] },
  { en: 'Threat intelligence', ar: 'استخبارات التهديدات', icon: Globe2, enItems: ['VirusTotal · AbuseIPDB · OSINT — planned'], arItems: ['VirusTotal · AbuseIPDB · OSINT — مخطط'] },
  { en: 'Deployment', ar: 'النشر', icon: Layers3, enItems: ['Vercel · Docker — planned'], arItems: ['Vercel · Docker — مخطط'] },
];

function SectionHeading({ eyebrow, title, subtitle, light, lang }: { eyebrow: string; title: string; subtitle?: string; light?: boolean; lang: Lang }) {
  return <div className={`section-heading ${light ? 'light-heading' : ''}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <div className="eyebrow">{eyebrow}</div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}
  </div>;
}

function NetworkVisual({ lang, selected, onSelect }: { lang: Lang; selected: number | null; onSelect: (id: number) => void }) {
  const coords = [{ x: 114, y: 66 }, { x: 283, y: 78 }, { x: 377, y: 180 }, { x: 286, y: 290 }, { x: 108, y: 290 }, { x: 26, y: 178 }];
  return <div className="network-visual" aria-label={lang === 'ar' ? 'شبكة مفاهيمية تفاعلية للوكلاء' : 'Interactive conceptual agent network'}>
    <div className="network-topline"><span><i /> NEXUS AGENT FABRIC</span><span className="mono">CONCEPT / 07 NODES</span></div>
    <svg className="network-svg" viewBox="0 0 410 360" role="group" aria-label={copy[lang].chooseAgent}>
      <defs><radialGradient id="core" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#82ad43" stopOpacity=".4" /><stop offset="100%" stopColor="#82ad43" stopOpacity="0" /></radialGradient></defs>
      <circle cx="204" cy="180" r="104" fill="url(#core)" className="pulse-ring" /><circle cx="204" cy="180" r="68" fill="none" stroke="#426159" strokeDasharray="2 7" /><circle cx="204" cy="180" r="94" fill="none" stroke="#354f49" strokeDasharray="2 9" />
      {coords.map((point, index) => {
        const active = selected === index + 1;
        const agent = agents[index];
        return <g key={agent.number}>
          <line x1="204" y1="180" x2={point.x + 20} y2={point.y + 20} className={`agent-link ${active ? 'line-active' : ''}`} stroke={active ? agent.color : '#67877a'} strokeWidth={active ? 1.7 : 1} opacity={selected === null || active ? .78 : .25} />
          <g className={`agent-node node-float ${active ? 'node-active' : ''}`} transform={`translate(${point.x}, ${point.y})`} tabIndex={0} role="button" aria-label={agent.name[lang]} aria-pressed={active} onClick={() => onSelect(index + 1)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(index + 1); } }}>
            <rect className="node-box" width="42" height="42" rx="11" stroke={active ? agent.color : '#58756a'} /><circle cx="35" cy="7" r="3" fill={agent.color} /><text x="21" y="26" textAnchor="middle" className="node-number">{agent.number}</text><text x="21" y="60" textAnchor="middle" className="node-label">{agent.short[lang]}</text>
          </g>
        </g>;
      })}
      <g className="orchestrator-node"><circle cx="204" cy="180" r="46" fill="#1b3030" stroke="#c5f34b" strokeWidth="1.3" /><circle cx="204" cy="180" r="37" fill="none" stroke="#c5f34b" strokeOpacity=".3" /><path d="M204 151l17 7v12c0 13-8 22-17 27-9-5-17-14-17-27v-12z" fill="#7f9e3d" fillOpacity=".4" stroke="#d0f576" /><path d="M197 174l5 5 10-12" fill="none" stroke="#e9f6ce" strokeWidth="2" /><text x="204" y="231" textAnchor="middle" className="core-label">NEXUS CORE</text></g>
    </svg>
    <div className="network-foot"><span><span className="live-dot" /> CONCEPTUAL COORDINATION</span><span className="mono">NO LIVE AGENTS</span></div>
  </div>;
}

function Header({ lang, setLang }: { lang: Lang; setLang: (language: Lang) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const t = copy[lang];
  return <header className="topbar"><div className="nav-inner">
    <a href="#home" className="brand-link" aria-label="NEXUS SHIELD AI home"><BrandLogo tone="light" /></a>
    <nav id="main-nav" className={`nav-links ${menuOpen ? 'open' : ''}`} aria-label={t.navAria}>
      {t.nav.map(([href, text]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{text}</a>)}
      <button className="language-toggle" data-testid="button-language-switch" onClick={() => { setLang(lang === 'ar' ? 'en' : 'ar'); setMenuOpen(false); }} aria-label={lang === 'ar' ? 'Switch language to English' : 'التبديل إلى العربية'}>{lang === 'ar' ? 'AR / EN' : 'AR / EN'}</button>
      <a className="nav-cta" href="#collaboration" onClick={() => setMenuOpen(false)}>{t.command}<ArrowUpRight size={13} /></a>
    </nav>
    <button className="menu-toggle" aria-label={menuOpen ? t.menuClose : t.menuOpen} aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(!menuOpen)} data-testid="button-menu-toggle">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
  </div></header>;
}

function Hero({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="home" className="hero"><div className="hero-grid" /><div className="section-wrap hero-inner">
    <div className="hero-copy" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="event-badge"><span className="badge-square" />{t.event}</div><div className="hero-overline latin">{t.overline}</div>
      <h1 className="latin">NEXUS<br /><span>SHIELD</span><br />AI<span className="hero-period">.</span></h1>
      <div className="hero-subtitle latin">{t.heroSub}</div><p className="hero-arabic">{t.heroIntro}</p>
      <div className="hero-actions"><a className="button button-primary" href="#architecture">{t.exploreArchitecture}<ArrowUpRight size={15} /></a><a className="button button-ghost" href="#workflow">{t.exploreWorkflow}<ArrowDown size={14} /></a></div>
      <div className="hero-metrics" dir="ltr">{metrics.hero.map((metric, i) => <div className="hero-metric" key={metric.value} data-testid={`metric-hero-${i}`}><strong className="latin">{metric.value}</strong><span dir={lang}>{metric.label[lang]}</span><small dir={lang}>{metric.note[lang]}</small></div>)}</div>
      <div className="hero-disclaimer">{t.heroDisclaimer}</div>
    </div>
    <div className="hero-art"><NetworkVisual lang={lang} selected={null} onSelect={() => document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' })} /><div className="art-caption mono">FIG 01 — COOPERATIVE DEFENSE FABRIC · CONCEPT</div></div>
  </div><a className="scroll-cue" href="#problem"><span>{t.scroll}</span><ArrowDown size={13} /></a><div className="hero-index mono">NX / 01 — CONCEPT</div></section>;
}

function Problem({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="problem" className="problem-section section-pad"><div className="section-wrap">
    <div className="problem-intro" dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="eyebrow">{t.signal}</div><h2>{t.problemTitleA}<br /><em>{t.problemTitleB}</em></h2><p>{t.problemBody}</p></div>
    <div className="problem-side"><div className="problem-cards" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{metrics.problem.map((metric, i) => <div className="problem-card" key={`${metric.value}-${i}`} data-testid={`metric-problem-${i}`}><span className="card-serial mono">0{i + 1} / INDICATOR</span><strong className="latin">{metric.value}</strong><span>{metric.label[lang]}</span><div className="card-ticks"><i /><i /><i /><i /><i /><i /><i /><i /></div></div>)}</div><div className="placeholder-note" dir={lang === 'ar' ? 'rtl' : 'ltr'}><ShieldAlert size={16} />{t.placeholder}</div></div>
  </div></section>;
}

function Architecture({ lang, selectedAgent, onSelectAgent }: { lang: Lang; selectedAgent: number; onSelectAgent: (agentNumber: number) => void }) {
  const t = copy[lang];
  const currentAgent = agents[selectedAgent - 1];
  const principleIcons = [Workflow, Network, Fingerprint, LockKeyhole];
  return <section id="architecture" className="architecture-section section-pad"><div className="section-wrap">
    <SectionHeading lang={lang} eyebrow={t.architectureEyebrow} title={t.architectureTitle} subtitle={t.architectureSub} />
    <div className="architecture-layout"><div className="architecture-canvas"><div className="canvas-label"><span>{t.map}</span><span className="mono">{t.specialists}</span></div>
      <NetworkVisual lang={lang} selected={selectedAgent < 7 ? selectedAgent : null} onSelect={onSelectAgent} />
      <button className="coordination-node" type="button" aria-pressed={selectedAgent === 7} onClick={() => onSelectAgent(7)}><span className="coord-icon"><GitBranch size={16} /></span><span><small>AGENT 07 — CONCEPT</small><strong>{t.coordinator}</strong></span><ArrowUpRight size={14} /></button>
    </div>
    <aside className="agent-inspector" dir={lang === 'ar' ? 'rtl' : 'ltr'} aria-live="polite"><div className="inspector-top"><span className="eyebrow">{t.selected}</span><span className="inspector-state"><i />{t.activeView}</span></div>
      {currentAgent ? <><div className="inspector-number mono">AGENT {currentAgent.number}</div><div className="inspector-name">{(() => { const Icon = currentAgent.icon; return <Icon size={24} style={{ color: currentAgent.color }} />; })()}<h3>{currentAgent.name[lang]}</h3></div><p>{currentAgent.description[lang]}</p><div className="output-title">{t.expected}<span className="mono">PROPOSED OUTPUTS</span></div><ul className="output-list">{currentAgent.outputs.map((output) => <li key={output.en}><Check size={13} /><span>{output[lang]}</span></li>)}</ul><div className="inspector-hint">{t.chooseNode}</div></> : <div className="inspector-empty">{t.chooseFromMap}</div>}
    </aside></div>
    <div className="architecture-principles" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t.principles.map(([title, text], i) => { const Icon = principleIcons[i]; return <div className="principle-card" key={title}><span className="principle-num mono">0{i + 1}</span><Icon size={18} /><h3>{title}</h3><p>{text}</p></div>; })}</div>
  </div></section>;
}

function Agents({ lang, selectedAgent, onSelectAgent }: { lang: Lang; selectedAgent: number; onSelectAgent: (agentNumber: number) => void }) {
  const t = copy[lang];
  return <section id="agents" className="agents-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.agentEyebrow} title={t.agentTitle} subtitle={t.agentSub} />
    <div className="agents-grid">{agents.map((agent) => { const Icon = agent.icon; const agentNumber = Number(agent.number); return <button className={`agent-card ${selectedAgent === agentNumber ? 'agent-card-selected' : ''}`} key={agent.number} dir={lang === 'ar' ? 'rtl' : 'ltr'} aria-pressed={selectedAgent === agentNumber} aria-label={`${agent.name[lang]} — ${lang === 'ar' ? 'استكشف الدور' : 'inspect role'}`} onMouseEnter={() => onSelectAgent(agentNumber)} onFocus={() => onSelectAgent(agentNumber)} onClick={() => { onSelectAgent(agentNumber); document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' }); }}>
      <div className="agent-card-top"><span className="mono">AGENT {agent.number} · CONCEPT</span><Icon size={18} style={{ color: agent.color }} /></div>
      <div className="agent-card-title"><small>{agent.label[lang]}</small><h3>{agent.name[lang]}</h3></div><p>{agent.description[lang]}</p>
      <div className="agent-output-heading"><span>{t.expected}</span><span className="mono">{t.outputs}</span></div><div className="agent-tags">{agent.outputs.map((output) => <span key={output.en}>{output[lang]}</span>)}</div><span className="agent-card-index latin">{agent.number}</span>
    </button>; })}</div>
  </div></section>;
}

function WorkflowSection({ lang }: { lang: Lang }) {
  const t = copy[lang]; const [selectedStep, setSelectedStep] = useState<number | null>(null);
  return <section id="workflow" className="workflow-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.workflowEyebrow} title={t.workflowTitle} subtitle={t.workflowSub} light />
    <div className="workflow-track" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t.workflow.map(([title, body], i) => <button className={`workflow-step ${selectedStep === i ? 'step-selected' : ''}`} key={title} aria-pressed={selectedStep === i} onClick={() => setSelectedStep(selectedStep === i ? null : i)}><div className="step-head"><span className="step-number mono">{String(i + 1).padStart(2, '0')}</span><span className="step-dot"><i /></span></div><h3>{title}</h3><p>{body}</p><div className="step-connector" /></button>)}</div>
    <div className="workflow-foot"><span><CircleDot size={13} />{t.sequence}</span><span className="mono">{t.evidence}</span></div>
  </div></section>;
}

function Collaboration({ lang }: { lang: Lang }) {
  const t = copy[lang]; const [count, setCount] = useState(4); const [running, setRunning] = useState(false); const interval = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearInterval(interval.current), []);
  const runSimulation = () => {
    if (running) return;
    setCount(0); setRunning(true); let index = 0;
    interval.current = window.setInterval(() => { index += 1; setCount(Math.min(index, workflowData.length)); if (index >= workflowData.length) { window.clearInterval(interval.current); window.setTimeout(() => setRunning(false), 500); } }, 420);
  };
  return <section id="collaboration" className="collab-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.collabEyebrow} title={t.collabTitle} subtitle={t.collabSub} />
    <div className="simulation-warning" role="note"><ShieldAlert size={17} /><strong>{t.warning}</strong><span>{t.exampleLog}</span></div>
    <div className="terminal-window" dir="ltr"><div className="terminal-bar"><div className="terminal-lights"><i /><i /><i /></div><div className="terminal-title mono"><Terminal size={13} /> NEXUS / AGENT COLLABORATION</div><span className="terminal-status"><i />{t.simulated}</span></div>
      <div className="terminal-body"><div className="terminal-meta mono"><span>{t.session}</span><span>{t.notLive}</span></div><div className="terminal-scroll" tabIndex={0} aria-label={lang === 'ar' ? 'سجل المحاكاة القابل للتمرير أفقيًا' : 'Horizontally scrollable simulation log'}><div className="terminal-stream">
        {workflowData.slice(0, count).map((event, i) => <div className="terminal-row" key={event.enActor} style={{ animationDelay: `${i * 25}ms` }}><span className="terminal-time mono">DEMO-{String(i + 1).padStart(2, '0')}</span><span className="terminal-actor mono" style={{ color: event.color }}>{lang === 'ar' ? event.arActor : event.enActor}</span><span className="terminal-type">{lang === 'ar' ? event.arType : event.enType}</span><span className="terminal-message">{lang === 'ar' ? event.arText : event.enText}</span><Check className="terminal-check" size={13} /></div>)}
        {!running && count === workflowData.length && <div className="consensus-block"><div className="consensus-title"><span className="consensus-check"><Check size={14} /></span><strong>{t.consensus}</strong><span className="mono">{t.illustrative}</span></div><div className="consensus-grid"><span><small>{t.verdict}</small><strong className="verdict">{lang === 'ar' ? 'مثال فقط' : 'EXAMPLE ONLY'}</strong></span><span><small>{t.agentsLabel}</small><strong>07 · concept</strong></span><span><small>{t.total}</small><strong>—</strong></span><span><small>{t.human}</small><strong>Required</strong></span></div></div>}
        {running && <div className="typing-line"><span /><span /><span />{t.running}</div>}
      </div></div><div className="terminal-bottom"><span><i />{t.safeMode}</span><button className="run-simulation" onClick={runSimulation} disabled={running} data-testid="button-run-simulation">{running ? t.running : count === workflowData.length ? t.rerun : t.run}<ArrowRight size={13} /></button></div></div>
    <p className="sim-note" dir={lang === 'ar' ? 'rtl' : 'ltr'}><Shield size={13} />{t.simulationNote}</p>
  </div></section>;
}

function ThreatIntel({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="threat-intel" className="intel-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.intelEyebrow} title={t.intelTitle} subtitle={t.intelSub} light />
    <div className="intel-grid"><div className="intel-map" role="img" aria-label={lang === 'ar' ? 'خريطة عالمية تجريدية توضيحية في وضع المحاكاة' : 'Abstract illustrative world map in simulation mode'}>
      <div className="map-stamp simulation-stamp">{t.simMode}</div>
      <svg viewBox="0 0 700 390" className="map-svg" aria-hidden="true">
        <path className="map-land" d="m75 110 26-22 46-8 22-20 39 11 16 28-17 16 8 19-31 15-8 24-24 9-9 31-27 2-4-24-24-13-8-31-25-13zM235 210l27 7 22 24-4 28-17 14-9 43-19 20-12-21 2-36-12-23 8-32zM327 91l33-15 31 5 22-15 55 9 24-12 51 12 20 20-24 15-6 22-39 10-18 19-31-8-23 15-31-11-20 14-36-16-8-24-31-4-11-22zM369 199l31 2 15 23 4 31-21 14-9 36-22 19-21-16 7-35-15-27zM523 250l19-12 28 6 12 19-16 16-35-4z" />
        <path className="map-route" d="M170 150 Q320 98 470 158M170 150 Q325 238 515 176M470 158 Q488 196 515 176" fill="none" />
        <circle className="map-point" cx="170" cy="150" r="6" /><circle className="map-point" cx="470" cy="158" r="6" /><circle className="map-point" cx="515" cy="176" r="6" />
        <text className="map-label" x="132" y="139">{t.origin}</text><text className="map-label" x="454" y="143">{t.destination}</text><text className="map-label" x="306" y="257">{t.mapNote}</text>
      </svg>
    </div>
    <div className="intel-side"><div className="intel-alert"><div className="intel-alert-head"><span>{t.demoCase}</span><span className="simulation-stamp">{t.simMode}</span></div><h3>{lang === 'ar' ? 'مؤشر تجريبي محجوز' : 'Reserved demo indicator'}</h3><p>{t.noIntel}</p></div>
      <div className="intel-data"><div><small>{t.origin} / DOCUMENTATION RANGE</small><strong>{t.reservedIp}</strong></div><div><small>{t.destination} / RESERVED DOMAIN</small><strong>{t.reservedDomain}</strong></div></div>
    </div></div>
  </div></section>;
}

function Explainability({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="explain-section section-pad"><div className="section-wrap explain-grid">
    <div className="explain-copy" dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="eyebrow">{t.explainEyebrow}</div><h2>{t.explainTitle}</h2><p>{t.explainBody}</p><div className="explain-note"><Fingerprint size={17} />{t.noThought}</div></div>
    <div className="evidence-panel" dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="evidence-top"><span>{t.evidenceLabel}</span><span className="mono">DEMO / NOT VERIFIED</span></div>
      <div className="evidence-tags">{t.evidence.map((item) => <span key={item}>{item}</span>)}</div>
      <div className="evidence-top"><span>{t.factorsLabel}</span><span className="mono">VISIBLE ONLY</span></div>
      <div className="factor-list">{t.factors.map(([label, value]) => <div className="factor" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
      <div className="evidence-summary"><b>{t.summaryLabel} — </b>{t.explainSummary}</div>
    </div>
  </div></section>;
}

function SecurityLayers({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="layers-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.layersEyebrow} title={t.layersTitle} subtitle={t.layersSub} />
    <div className="layers-layout"><div className="rings-visual" aria-label={lang === 'ar' ? 'أربع طبقات أمن مفاهيمية متحدة المركز' : 'Four concentric conceptual security layers'}>
      <div className="ring ring-1">{t.layer} 04</div><div className="ring ring-2">{t.layer} 03</div><div className="ring ring-3">{t.layer} 02</div><div className="ring ring-4">{t.layer} 01</div><div className="ring-core">NEXUS<br />CORE</div>
    </div><div className="layer-list" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t.layerNames.map(([title, description], i) => <div className="layer-row" key={title}><span>0{i + 1}</span><div><h3>{title}</h3><p>{description}</p></div></div>)}</div></div>
  </div></section>;
}

function WhySection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="why-section section-pad"><div className="section-wrap"><div className="why-layout"><div className="why-copy" dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="eyebrow">{t.diffEyebrow}</div><h2>{t.diffTitleA}<br /><em>{t.diffTitleB}</em></h2><p>{t.diffBody}</p><a href="#architecture" className="text-link">{t.coordinationLink}<ArrowLeft size={15} /></a></div>
    <div className="difference-list">{differentiators.map(({ icon: Icon, title, body }, i) => <article className="difference-row" key={title.en} dir={lang === 'ar' ? 'rtl' : 'ltr'}><span className="difference-index mono">0{i + 1}</span><span className="difference-icon"><Icon size={18} /></span><div><h3>{title[lang]}</h3><p>{body[lang]}</p></div><ArrowUpRight className="difference-arrow" size={16} /></article>)}</div>
  </div></div></section>;
}

function Capabilities({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="capabilities" className="capabilities-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.capabilityEyebrow} title={t.capabilityTitle} />
    <div className="capability-grid">{capabilities.map(({ icon: Icon, title, body }, i) => <a className="capability-card" href="#technology" key={title.en} dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="capability-top"><span className="mono">CAP / 0{i + 1}</span><Icon size={19} /></div><h3>{title[lang]}</h3><p>{body[lang]}</p><span className="learn-more">{t.learnMore}<ArrowUpRight size={12} /></span></a>)}</div>
  </div></section>;
}

function Technology({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="technology" className="technology-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.techEyebrow} title={t.techTitle} subtitle={t.techSub} light />
    <div className="stack-layout"><div className="stack-intro" dir={lang === 'ar' ? 'rtl' : 'ltr'}><span className="stack-mark"><Code2 size={23} /></span><div className="eyebrow">{t.referenceStack}</div><h3>{t.techDesign}</h3><p>{t.techBody}</p><span className="planned-chip"><Check size={12} />REACT · VITE · TAILWIND CSS</span></div>
      <div className="stack-layers">{stackGroups.map(({ en, ar, icon: Icon, live, enItems, arItems }, i) => <div className="stack-row" key={en} dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="stack-label"><Icon size={15} /><span>{lang === 'ar' ? ar : en}</span><small className="mono">{live ? 'LIVE SITE FOUNDATION' : t.plannedStack} · 0{i + 1}</small></div><div className="stack-items">{(lang === 'ar' ? arItems : enItems).map((item) => <span className={`stack-pill latin ${live ? 'actual' : ''}`} key={item}>{item}</span>)}</div></div>)}</div>
    </div><div className="stack-disclaimer"><LockKeyhole size={13} />{t.stackDisclaimer}</div>
  </div></section>;
}

function Impact({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="impact-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.impactEyebrow} title={t.impactTitle} subtitle={t.impactSub} />
    <div className="impact-grid" dir="ltr">{metrics.impact.map((metric, i) => <article className="impact-card" key={`${metric.value}-${i}`} data-testid={`metric-impact-${i}`}><span className="mono">INDICATOR / 0{i + 1}</span><strong className="latin">{metric.value}</strong><p>{metric.label[lang]}</p><div className="impact-line"><i /></div></article>)}</div><div className="placeholder-note impact-note" dir={lang === 'ar' ? 'rtl' : 'ltr'}><ShieldAlert size={16} />{t.impactNote}</div>
  </div></section>;
}

function Roadmap({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="roadmap" className="roadmap-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.roadmapEyebrow} title={t.roadmapTitle} subtitle={t.roadmapSub} light />
    <div className="roadmap-status"><ShieldAlert size={16} /><span>{t.roadmapNote}</span></div>
    <div className="roadmap-track" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{roadmap.map((phase) => <article className="roadmap-card" key={phase.phase} tabIndex={0}><div className="roadmap-card-top"><span className="roadmap-phase mono">PHASE {phase.phase}</span><span className="planned-mini">{lang === 'ar' ? 'مخطط / غير متاح' : 'PLANNED / UNAVAILABLE'}</span></div><h3>{phase.title[lang]}</h3><p dir="auto">{phase.description[lang]}</p><span className="roadmap-index">{phase.phase}</span></article>)}</div>
  </div></section>;
}

function FinalCTA({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="final-cta section-pad"><div className="section-wrap final-cta-inner" dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="eyebrow">{lang === 'ar' ? 'التصور القادم / 14' : 'THE NEXT HORIZON / 14'}</div><h2>{t.finalTitle}</h2><p>{t.finalText}</p><div className="hero-actions"><a className="button button-primary" href="#architecture">{t.exploreArchitecture}<ArrowUpRight size={15} /></a><a className="button button-ghost" href="#workflow">{t.exploreWorkflow}<ArrowDown size={14} /></a></div><small>{t.noClaim}</small></div></section>;
}

function Footer({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <footer className="site-footer"><div className="section-wrap"><div className="footer-main"><div className="footer-brand"><a href="#home" className="brand-link"><BrandLogo tone="light" /></a><p dir={lang === 'ar' ? 'rtl' : 'ltr'} dangerouslySetInnerHTML={{ __html: t.footerLine }} /></div>
    <div className="footer-nav" dir={lang === 'ar' ? 'rtl' : 'ltr'}><div><span className="mono">{t.explore}</span><a href="#architecture">{lang === 'ar' ? 'البنية' : 'Architecture'}</a><a href="#agents">{lang === 'ar' ? 'الوكلاء' : 'Agents'}</a><a href="#workflow">{lang === 'ar' ? 'سير العمل' : 'Workflow'}</a><a href="#roadmap">{lang === 'ar' ? 'خارطة الطريق' : 'Roadmap'}</a></div><div><span className="mono">{t.platform}</span><a href="#capabilities">{lang === 'ar' ? 'القدرات' : 'Capabilities'}</a><a href="#technology">{lang === 'ar' ? 'التقنيات' : 'Technology'}</a><a href="#threat-intel">{lang === 'ar' ? 'استخبارات التهديدات' : 'Threat Intel'}</a><a href="#collaboration">{t.simulation}</a></div></div>
    <a className="back-top" href="#home" aria-label={lang === 'ar' ? 'العودة إلى الأعلى' : 'Back to top'}><ArrowUpRight size={18} /></a></div>
    <div className="footer-track" dir={lang === 'ar' ? 'rtl' : 'ltr'}><span>NEXUS SYSTEMS · CONCEPT</span><span>Agentic AI · Multi-Agent Systems</span><span>Human-centered security workflows</span></div>
    <div className="footer-bottom" dir={lang === 'ar' ? 'rtl' : 'ltr'}><span>© 2026 NEXUS SHIELD AI</span><span>{t.footerDescription}</span><span className="mono">{t.footerTag}</span></div>
  </div></footer>;
}

function App() {
  const [lang, setLang] = useState<Lang>('ar');
  const [selectedAgent, setSelectedAgent] = useState(1);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    const title = lang === 'ar' ? 'NEXUS SHIELD AI — دفاع سيبراني مستقل بالذكاء الاصطناعي' : 'NEXUS SHIELD AI — AI-Powered Autonomous Cyber Defense';
    const description = lang === 'ar'
      ? 'تصور توضيحي لمنصة دفاع سيبراني متعددة الوكلاء. لا توجد خدمات تحليل أو استخبارات أو استجابة أمنية متصلة.'
      : 'An illustrative multi-agent cyber defense concept. No analysis, intelligence or security response services are connected.';
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
  }, [lang]);
  return <div className={`site-shell grain locale-${lang}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <Header lang={lang} setLang={setLang} />
    <main><Hero lang={lang} /><Problem lang={lang} /><Architecture lang={lang} selectedAgent={selectedAgent} onSelectAgent={setSelectedAgent} /><Agents lang={lang} selectedAgent={selectedAgent} onSelectAgent={setSelectedAgent} /><WorkflowSection lang={lang} /><Collaboration lang={lang} /><ThreatIntel lang={lang} /><Explainability lang={lang} /><SecurityLayers lang={lang} /><WhySection lang={lang} /><Capabilities lang={lang} /><Technology lang={lang} /><Impact lang={lang} /><Roadmap lang={lang} /><FinalCTA lang={lang} /></main>
    <Footer lang={lang} />
  </div>;
}

export default App;
