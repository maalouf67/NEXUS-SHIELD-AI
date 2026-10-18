import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Boxes, Check, CircleDot,
  Code2, Cpu, Database, FileBarChart2, Fingerprint, GitBranch, Globe2, Layers3,
  LockKeyhole, Menu, Network, Shield, ShieldAlert,
  Terminal, Workflow, X,
} from 'lucide-react';
import { agents, capabilities, differentiators } from './data/agents';
import { metrics } from './data/metrics';
import { roadmap } from './data/roadmap';

type Lang = 'ar' | 'en';
const copy = {
  ar: {
    navAria: 'التنقل الرئيسي', language: 'English', menuOpen: 'فتح القائمة', menuClose: 'إغلاق القائمة',
    nav: [['#architecture', 'البنية'], ['#agents', 'الوكلاء'], ['#workflow', 'سير العمل'], ['#capabilities', 'القدرات'], ['#technology', 'التقنيات'], ['#roadmap', 'خارطة الطريق']],
    launch: 'استكشف المنصة', event: 'HACK AGENT AIX 2026 · TRACK 2 · MULTI-AGENT SYSTEMS', overline: 'عمليات أمنية مستقلة',
    heroSub: 'منصة دفاع سيبراني مستقلة متعددة الوكلاء', heroIntro: 'شبكة ذكية من وكلاء الأمن السيبراني المستقلين الذين يتعاونون للكشف عن التهديدات السيبرانية والتحقيق فيها وتحليلها والاستجابة لها.',
    exploreArchitecture: 'استكشف البنية', exploreWorkflow: 'استكشف سير العمل', heroDisclaimer: 'أهداف توضيحية وليست نتائج مُثبتة. لا توجد حماية أو معالجة فعلية متصلة.',
    scroll: 'تابع للاستكشاف', signal: 'فجوة الإشارة والضجيج / 01', problemTitleA: 'فرق الأمن', problemTitleB: 'غارقة في التنبيهات',
    problemBody: 'تتلقى المؤسسات تنبيهات أمنية كثيرة. التحقيق اليدوي بطيء، يستهلك موارد كبيرة، وعرضة للخطأ البشري.',
    placeholder: 'قيم مؤقتة غير موثقة — تستلزم مصادر موثوقة قبل النشر.',
    architectureEyebrow: 'تصميم النظام / 02', architectureTitle: 'بنية متعددة الوكلاء', architectureSub: 'شبكة منسقة من وكلاء الذكاء الاصطناعي المتخصصين.',
    map: 'خريطة البنية', specialists: '6 متخصصين + منسق واحد', chooseAgent: 'اختر وكيلًا لعرض دوره',
    coordinator: 'وكيل التنسيق', selected: 'العقدة المحددة', activeView: 'عرض تفاعلي', expected: 'المخرجات المقترحة',
    chooseNode: 'اختر عقدة أخرى من الخريطة لاستكشاف دورها.', chooseFromMap: 'اختر وكيلًا من المخطط لعرض دوره ومخرجاته.',
    principles: [
      ['المنسق', 'يوجه المهام ويدير السياق وينسق التعاون بين الوكلاء.'],
      ['ناقل الرسائل', 'تصور لتواصل غير متزامن بين الوكلاء باستخدام سياق مشترك.'],
      ['قابلية التفسير', 'يرتبط كل قرار مقترح بالأدلة وخطوات الاستدلال.'],
      ['طبقة الأمان', 'ضوابط للأفعال ومشاركة الإنسان في القرارات الحرجة.'],
    ],
    agentEyebrow: 'أدوار متخصصة / 03', agentTitle: 'وكلاء متخصصون', agentSub: 'ستة متخصصين + منسق واحد', deliverables: 'المخرجات',
    workflowEyebrow: 'تسلسل التحقيق / 04', workflowTitle: 'سير عمل التحقيق', workflowSub: 'من الإشارة إلى التقييم — تصور لسير عمل منسق.',
    workflow: [
      ['استلام المُدخل', 'يرفع المستخدم بريدًا أو رابطًا أو ملفًا مشبوهًا في التصور.'],
      ['وكيل اكتشاف التهديدات', 'تصنيف Phishing / Malware / Suspicious URL.'],
      ['وكيل استخبارات التهديدات', 'إثراء المؤشرات بمصادر الاستخبارات والسمعة عند توفرها.'],
      ['وكيل تحليل البرمجيات الخبيثة', 'تصور لتحليل ثابت وسلوكي للملفات.'],
      ['وكيل الاستجابة للحوادث', 'اقتراح خطة احتواء وتخفيف للمخاطر.'],
      ['وكيل الامتثال', 'ربط النتائج بأطر الأمن ذات الصلة.'],
      ['وكيل إعداد التقارير', 'ملخص تنفيذي + تقرير تقني نموذجي.'],
      ['التقييم الأمني النهائي', 'تقييم المخاطر والإجراءات الموصى بها — أمثلة توضيحية.'],
    ],
    sequence: 'تسلسل منسق', evidence: 'أدلة ← سياق ← تقييم',
    collabEyebrow: 'وحدة التعاون / 05', collabTitle: 'التعاون بين الوكلاء', collabSub: 'تصور لتبادل الأدلة والسياق لبناء تقييم مشترك.',
    warning: 'محاكاة توضيحية للواجهة — لا يجري تحليل حقيقي', exampleLog: 'كل سجل أدناه مثال تمثيلي فقط.',
    simulated: 'محاكاة', session: 'جلسة: DEMO-7A31', notLive: 'سجل مثالي · ليس مباشرًا', consensus: 'تم الوصول إلى توافق',
    illustrative: 'توضيحي', verdict: 'التقييم', agentsLabel: 'الوكلاء', total: 'المدة', human: 'تدخل بشري', safeMode: 'وضع العرض الآمن',
    run: 'تشغيل المحاكاة', rerun: 'إعادة تشغيل المحاكاة', running: 'جارٍ تشغيل المحاكاة',
    simulationNote: 'هذه الواجهة محاكاة توضيحية فقط. لا يتم رفع ملفات أو الاتصال بمصادر أو تنفيذ أي تحليل فعلي.',
    diffEyebrow: 'ما يميز التصور / 06', diffTitleA: 'دفاع تعاوني', diffTitleB: 'بمنظور أوضح',
    diffBody: 'تقوم الأدوات التقليدية بالكشف. أما CyberShield AI فيستكشف تصورًا للتحقيق والتحليل ودعم الاستجابة عبر التعاون بين الوكلاء.',
    coordinationLink: 'استكشف طريقة التنسيق', capabilityEyebrow: 'قدرات المنصة / 07', capabilityTitle: 'مخطط للدفاع المؤسسي',
    learnMore: 'استكشف', techEyebrow: 'مخطط مرجعي / 08', techTitle: 'مجموعة التقنيات',
    techSub: 'خيارات مرجعية مقترحة — لا تمثل تكاملات مهيأة أو مستخدمة حاليًا.',
    techDesign: 'تصميم طبقي لمنصة قابلة للتوسع.', techBody: 'قائمة تقنية استرشادية للنقاش والتخطيط. لم تتم تهيئة أي خدمة خارجية أو ربطها.',
    planned: 'مخطط / غير مهيأ', referenceStack: 'مخطط تقني مرجعي', stackDisclaimer: 'مخطط مقترح فقط. لم تتم تهيئة خدمات أو واجهات API أو تكاملات.',
    impactEyebrow: 'إطار القياس / 09', impactTitle: 'نتائج دفاعية قابلة للقياس',
    impactSub: 'مؤشرات مقترحة لتقييم الأثر عند توفر بيانات موثوقة.',
    impactNote: 'قيم مؤقتة فقط — لا تمثل أداءً مثبتًا، وستظل كذلك حتى توفر بيانات وقياس فعلي موثوق.',
    roadmapEyebrow: 'مراحل التطوير / 10', roadmapTitle: 'رؤية مستقبلية', roadmapSub: 'الطريق إلى الدفاع الذاتي',
    plannedTag: 'مخطط للمستقبل · غير متاح حاليًا',
    roadmapNote: 'خارطة طريق طموحة. المراحل والتكاملات المعروضة مخططة وليست قدرات مباشرة أو متاحة حاليًا.',
    finalTitle: 'تأمين المستقبل باستخدام وكلاء الذكاء الاصطناعي المستقلين',
    finalText: 'يُظهر CyberShield AI كيف يمكن للأنظمة متعددة الوكلاء تحويل عمليات الأمن السيبراني من خلال التفكير التعاوني والتحقيق والاستجابة.',
    footerLine: 'دفاع سيبراني منسق.<br />قرارات أوضح. الإنسان في الحلقة.', explore: 'استكشف', platform: 'المنصة', simulation: 'المحاكاة',
    footerDescription: 'تصور لمنصة دفاع سيبراني متعددة الوكلاء.', footerTag: 'مبني لعمليات الأمن',
    noClaim: 'عرض توضيحي / محاكاة / معاينة فقط — لا توجد خدمات أمنية فعلية متصلة.',
  },
  en: {
    navAria: 'Main navigation', language: 'العربية', menuOpen: 'Open menu', menuClose: 'Close menu',
    nav: [['#architecture', 'Architecture'], ['#agents', 'Agents'], ['#workflow', 'Workflow'], ['#capabilities', 'Capabilities'], ['#technology', 'Technology'], ['#roadmap', 'Roadmap']],
    launch: 'Launch Platform', event: 'HACK AGENT AIX 2026 · TRACK 2 · MULTI-AGENT SYSTEMS', overline: 'AUTONOMOUS SECURITY OPERATIONS',
    heroSub: 'Autonomous Multi-Agent Cyber Defense Platform', heroIntro: 'A conceptual network of autonomous cybersecurity agents collaborating to investigate, analyze and support response to cyber threats.',
    exploreArchitecture: 'Explore Architecture', exploreWorkflow: 'View Agent Workflow', heroDisclaimer: 'Illustrative targets, not verified results. No live protection or response is connected.',
    scroll: 'SCROLL TO EXPLORE', signal: 'THE SIGNAL-TO-NOISE GAP / 01', problemTitleA: 'Security teams', problemTitleB: 'buried in alerts',
    problemBody: 'Organizations receive a high volume of security alerts. Manual investigation is slow, resource-intensive and prone to human error.',
    placeholder: 'Unverified placeholder values — reliable sources are required before publication.',
    architectureEyebrow: 'SYSTEM DESIGN / 02', architectureTitle: 'Multi-agent architecture', architectureSub: 'A coordinated network of specialist AI agents.',
    map: 'ARCHITECTURE MAP', specialists: '6 SPECIALISTS + 1 COORDINATOR', chooseAgent: 'Select an agent to inspect its role',
    coordinator: 'Coordination Agent', selected: 'SELECTED NODE', activeView: 'INTERACTIVE VIEW', expected: 'Proposed outputs',
    chooseNode: 'Select another node on the map to explore its role.', chooseFromMap: 'Select an agent on the map to see its role and outputs.',
    principles: [
      ['Orchestrator', 'Routes tasks, manages context and coordinates collaboration between agents.'],
      ['Message Bus', 'A concept for asynchronous agent communication using shared context.'],
      ['Explainability', 'Each proposed decision is intended to link to evidence and reasoning steps.'],
      ['Safety Layer', 'Action controls and human involvement in critical decisions.'],
    ],
    agentEyebrow: 'SPECIALIST ROLES / 03', agentTitle: 'Specialist agents', agentSub: 'Six specialists + one coordinator', deliverables: 'DELIVERABLES',
    workflowEyebrow: 'INVESTIGATION SEQUENCE / 04', workflowTitle: 'Investigation workflow', workflowSub: 'From signal to assessment — a coordinated workflow concept.',
    workflow: [
      ['Input received', 'A user submits suspicious email, URL or file in the demo concept.'],
      ['Threat Detection Agent', 'Phishing / Malware / Suspicious URL classification.'],
      ['Threat Intelligence Agent', 'Enrich indicators from intelligence and reputation sources when available.'],
      ['Malware Analysis Agent', 'Conceptual static and behavioral file analysis.'],
      ['Incident Response Agent', 'Propose a containment and mitigation plan.'],
      ['Compliance Agent', 'Map findings to relevant security frameworks.'],
      ['Reporting Agent', 'Example executive summary + technical report.'],
      ['Final security assessment', 'Risk assessment and recommended actions — illustrative examples.'],
    ],
    sequence: 'ORCHESTRATED SEQUENCE', evidence: 'EVIDENCE → CONTEXT → ASSESSMENT',
    collabEyebrow: 'COLLABORATION CONSOLE / 05', collabTitle: 'Agent collaboration', collabSub: 'A demonstration of exchanging evidence and context toward a shared assessment.',
    warning: 'Interface demonstration — no real analysis is performed', exampleLog: 'Every entry below is illustrative sample content.',
    simulated: 'SIMULATED', session: 'SESSION: DEMO-7A31', notLive: 'EXAMPLE STREAM · NOT LIVE', consensus: 'Illustrative consensus',
    illustrative: 'ILLUSTRATIVE', verdict: 'Assessment', agentsLabel: 'Agents', total: 'Duration', human: 'Human input', safeMode: 'SAFE DEMONSTRATION MODE',
    run: 'Run simulation', rerun: 'Replay simulation', running: 'Simulation running',
    simulationNote: 'This is a demonstration interface only. No files are uploaded, no sources are contacted, and no real analysis is performed.',
    diffEyebrow: 'THE DIFFERENCE / 06', diffTitleA: 'Collaborative defense', diffTitleB: 'with clearer context',
    diffBody: 'Traditional tools detect. CyberShield AI explores an approach to investigation, analysis and response support through agent collaboration.',
    coordinationLink: 'Explore agent coordination', capabilityEyebrow: 'PLATFORM CAPABILITIES / 07', capabilityTitle: 'A blueprint for enterprise defense',
    learnMore: 'Explore', techEyebrow: 'REFERENCE BLUEPRINT / 08', techTitle: 'Technology stack',
    techSub: 'Suggested reference options — no integrations are currently configured or in use.',
    techDesign: 'A layered design for an extensible platform.', techBody: 'A reference list for discussion and planning. No external service has been configured or connected.',
    planned: 'PLANNED / NOT CONFIGURED', referenceStack: 'REFERENCE STACK', stackDisclaimer: 'Proposed blueprint only. No services, APIs, or integrations are configured.',
    impactEyebrow: 'MEASUREMENT FRAMEWORK / 09', impactTitle: 'Measurable defense outcomes',
    impactSub: 'Proposed indicators for impact evaluation once reliable data is available.',
    impactNote: 'Placeholder values only — not verified performance, and will remain illustrative until reliable measurement data exists.',
    roadmapEyebrow: 'DEVELOPMENT HORIZON / 10', roadmapTitle: 'Future vision', roadmapSub: 'The path to autonomous defense',
    plannedTag: 'PLANNED FOR THE FUTURE · NOT AVAILABLE',
    roadmapNote: 'An aspirational roadmap. The phases and integrations shown are planned, not live or currently available capabilities.',
    finalTitle: 'Secure the future with autonomous AI agents',
    finalText: 'CyberShield AI demonstrates how multi-agent systems can transform cybersecurity operations through collaborative reasoning, investigation and response.',
    footerLine: 'Coordinated cyber defense.<br />Clearer decisions. Human in the loop.', explore: 'EXPLORE', platform: 'PLATFORM', simulation: 'Simulation',
    footerDescription: 'A multi-agent cyber defense concept.', footerTag: 'BUILT FOR SECURITY OPERATIONS',
    noClaim: 'Demo / Simulation / Preview only — no live security services are connected.',
  },
} as const;

const workflowData = [
  { enActor: 'USER', arActor: 'المستخدم', enType: 'Input', arType: 'مُدخل', enText: 'Example suspicious email submitted: invoice_october.eml', arText: 'مثال: إدخال بريد مشبوه invoice_october.eml', color: '#9aabb1' },
  { enActor: 'THREAT DETECTION AGENT', arActor: 'وكيل اكتشاف التهديدات', enType: 'Detection', arType: 'كشف', enText: 'Illustrative phishing indicator added to the example stream.', arText: 'إضافة مؤشر تصيد توضيحي إلى سجل المثال.', color: '#56d5bc' },
  { enActor: 'THREAT INTELLIGENCE AGENT', arActor: 'وكيل استخبارات التهديدات', enType: 'Intel', arType: 'استخبارات', enText: 'Example enrichment step — no external intelligence source queried.', arText: 'خطوة إثراء نموذجية — لم يتم الاستعلام من مصادر استخبارات خارجية.', color: '#7bb8df' },
  { enActor: 'MALWARE ANALYSIS AGENT', arActor: 'وكيل تحليل البرمجيات الخبيثة', enType: 'Analysis', arType: 'تحليل', enText: 'Illustrative attachment review; no file was analyzed.', arText: 'مراجعة توضيحية للمرفق؛ لم يتم تحليل أي ملف.', color: '#e8aa72' },
  { enActor: 'INCIDENT RESPONSE AGENT', arActor: 'وكيل الاستجابة للحوادث', enType: 'Response', arType: 'استجابة', enText: 'Example containment recommendations displayed.', arText: 'عرض توصيات احتواء نموذجية.', color: '#ee8b85' },
  { enActor: 'COMPLIANCE AGENT', arActor: 'وكيل الامتثال', enType: 'Compliance', arType: 'امتثال', enText: 'Example incident mapped to relevant security controls.', arText: 'مواءمة مثال الحادثة مع ضوابط أمنية ذات صلة.', color: '#bca9e6' },
  { enActor: 'REPORTING AGENT', arActor: 'وكيل إعداد التقارير', enType: 'Report', arType: 'تقرير', enText: 'Sample technical and executive report entry.', arText: 'سجل نموذجي لتقرير تقني وتنفيذي.', color: '#e3cb75' },
] as const;
const techStack = [
  { en: 'Frontend', ar: 'الواجهة الأمامية', icon: Code2, items: ['Next.js', 'React', 'Tailwind CSS', 'shadcn/ui'] },
  { en: 'Backend', ar: 'الخلفية', icon: Cpu, items: ['FastAPI', 'Python'] },
  { en: 'Agent Framework', ar: 'إطار الوكلاء', icon: Boxes, items: ['LangGraph', 'OpenAI Agents SDK'] },
  { en: 'Data', ar: 'البيانات', icon: Database, items: ['PostgreSQL', 'ChromaDB / Vector Store'] },
  { en: 'Threat Intelligence', ar: 'استخبارات التهديدات', icon: Globe2, items: ['VirusTotal API', 'AbuseIPDB API', 'OSINT Sources'] },
  { en: 'Deployment', ar: 'النشر', icon: Layers3, items: ['Vercel', 'Railway', 'Docker'] },
];

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVisible(true); return; }
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.12 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

function SectionHeading({ eyebrow, title, subtitle, light = false, lang }: { eyebrow: string; title: string; subtitle?: string; light?: boolean; lang: Lang }) {
  return <div className={`section-heading ${light ? 'light-heading' : ''}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="eyebrow">{eyebrow}</div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>;
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span className="brand-shield"><Shield size={18} strokeWidth={1.8} /></span><span className="brand-word latin">CYBER<span>SHIELD</span></span></span>;
}

function Header({ lang, setLang }: { lang: Lang; setLang: (language: Lang) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const t = copy[lang];
  return <header className="topbar">
    <div className="nav-inner">
      <a href="#home" className="brand-link" aria-label="CyberShield AI — home"><BrandMark /></a>
      <nav className={`nav-links ${menuOpen ? 'open' : ''}`} aria-label={t.navAria}>
        {t.nav.map(([href, text]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{text}</a>)}
        <button className="language-toggle" data-testid="button-language-switch" onClick={() => { setLang(lang === 'ar' ? 'en' : 'ar'); setMenuOpen(false); }} aria-label={lang === 'ar' ? 'Switch language to English' : 'التبديل إلى العربية'}>{lang === 'ar' ? 'EN / AR' : 'AR / EN'}</button>
        <a className="nav-cta" href="#collaboration" onClick={() => setMenuOpen(false)}>{t.launch} <ArrowUpRight size={14} /></a>
      </nav>
      <button className="menu-toggle" aria-label={menuOpen ? t.menuClose : t.menuOpen} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} data-testid="button-menu-toggle">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
    </div>
  </header>;
}

function NetworkVisual({ lang, selected, onSelect, onHover }: { lang: Lang; selected: number | null; onSelect: (id: number) => void; onHover?: (id: number) => void }) {
  const coords = [{ x: 114, y: 66 }, { x: 283, y: 78 }, { x: 377, y: 180 }, { x: 286, y: 290 }, { x: 108, y: 290 }, { x: 26, y: 178 }];
  return <div className="network-visual" aria-label={lang === 'ar' ? 'تصور تفاعلي لشبكة الوكلاء' : 'Interactive agent network concept'}>
    <div className="network-topline"><span><i /> MULTI-AGENT FABRIC</span><span className="mono">SYS / 07 NODES</span></div>
    <svg className="network-svg" viewBox="0 0 410 360" role="group" aria-label={copy[lang].chooseAgent}>
      <defs><radialGradient id="core" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#137e70" stopOpacity=".42" /><stop offset="100%" stopColor="#137e70" stopOpacity="0" /></radialGradient></defs>
      <circle cx="204" cy="180" r="104" fill="url(#core)" className="pulse-ring" /><circle cx="204" cy="180" r="68" fill="none" stroke="#2b5b5d" strokeDasharray="2 7" /><circle cx="204" cy="180" r="94" fill="none" stroke="#284d50" strokeDasharray="2 9" />
      {coords.map((point, index) => {
        const active = selected === index + 1;
        const agent = agents[index];
        return <g key={agent.number}>
          <line x1="204" y1="180" x2={point.x + 20} y2={point.y + 20} className={`agent-link ${active ? 'line-active' : ''}`} stroke={active ? agent.color : '#3c6969'} strokeWidth={active ? 1.7 : 1} opacity={selected === null || active ? .75 : .25} />
          <g className={`agent-node node-float ${active ? 'node-active' : ''}`} transform={`translate(${point.x}, ${point.y})`} tabIndex={0} role="button" aria-label={`${agent.name[lang]}`} aria-pressed={active} onClick={() => onSelect(index + 1)} onMouseEnter={() => onHover?.(index + 1)} onFocus={() => onHover?.(index + 1)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(index + 1); } }}>
            <rect className="node-box" width="42" height="42" rx="12" stroke={active ? agent.color : '#466c6b'} /><circle cx="35" cy="7" r="3" fill={agent.color} /><text x="21" y="26" textAnchor="middle" className="node-number">{agent.number}</text><text x="21" y="60" textAnchor="middle" className="node-label">{agent.short[lang]}</text>
          </g>
        </g>;
      })}
      <g className="orchestrator-node"><circle cx="204" cy="180" r="46" fill="#14292f" stroke="#18b596" strokeWidth="1.3" /><circle cx="204" cy="180" r="37" fill="none" stroke="#18b596" strokeOpacity=".3" /><path d="M204 151l17 7v12c0 13-8 22-17 27-9-5-17-14-17-27v-12z" fill="#0e8e79" fillOpacity=".38" stroke="#57d8bd" /><path d="M197 174l5 5 10-12" fill="none" stroke="#b6f3e6" strokeWidth="2" /><text x="204" y="231" textAnchor="middle" className="core-label">ORCHESTRATOR</text></g>
    </svg>
    <div className="network-foot"><span><span className="live-dot" /> COORDINATION LAYER</span><span className="mono">CONCEPTUAL CONTEXT FLOW</span></div>
  </div>;
}

function Hero({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="home" className="hero"><div className="hero-grid" /><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
    <div className="section-wrap hero-inner">
      <div className="hero-copy" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="event-badge"><span className="badge-square" /> {t.event}</div><div className="hero-overline latin">{t.overline}</div>
        <h1 className="latin">CYBER<span>SHIELD</span><br />AI<span className="hero-period">.</span></h1>
        <div className="hero-subtitle latin">{t.heroSub}</div><p className="hero-arabic">{t.heroIntro}</p>
        <div className="hero-actions"><a className="button button-primary" href="#architecture">{t.exploreArchitecture} <ArrowUpRight size={16} /></a><a className="button button-ghost" href="#workflow">{t.exploreWorkflow} <ArrowDown size={15} /></a></div>
        <div className="hero-metrics" dir="ltr">{metrics.hero.map((metric, i) => <div className="hero-metric" key={metric.value} data-testid={`metric-hero-${i}`}><strong className="latin">{metric.value}</strong><span dir={lang === 'ar' ? 'rtl' : 'ltr'}>{metric.label[lang]}</span><small dir={lang === 'ar' ? 'rtl' : 'ltr'}>{metric.note[lang]}</small></div>)}</div>
        <div className="hero-disclaimer">{t.heroDisclaimer}</div>
      </div>
      <div className="hero-art"><NetworkVisual lang={lang} selected={null} onSelect={() => document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' })} /><div className="art-caption mono">FIG 01 — COOPERATIVE DEFENSE FABRIC · CONCEPT</div></div>
    </div>
    <a className="scroll-cue" href="#problem"><span>{t.scroll}</span><ArrowDown size={14} /></a><div className="hero-index mono">CS / 2026 — 01</div>
  </section>;
}

function Problem({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="problem" className="problem-section section-pad"><div className="section-wrap">
    <div className="problem-intro" dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="eyebrow">{t.signal}</div><h2>{t.problemTitleA}<br /><em>{t.problemTitleB}</em></h2><p>{t.problemBody}</p></div>
    <div className="problem-side"><div className="problem-cards" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{metrics.problem.map((metric, i) => <div className="problem-card" key={metric.value + i} data-testid={`metric-problem-${i}`}><span className="card-serial mono">0{i + 1} / INDICATOR</span><strong className="latin">{metric.value}</strong><span>{metric.label[lang]}</span><div className="card-ticks"><i /><i /><i /><i /><i /><i /><i /><i /></div></div>)}</div><div className="placeholder-note" dir={lang === 'ar' ? 'rtl' : 'ltr'}><ShieldAlert size={17} /> {t.placeholder}</div></div>
  </div></section>;
}

function Architecture({ lang, selectedAgent, onSelectAgent }: { lang: Lang; selectedAgent: number; onSelectAgent: (agentNumber: number) => void }) {
  const t = copy[lang];
  const currentAgent = agents[selectedAgent - 1];
  const principleIcons = [Workflow, Network, Fingerprint, LockKeyhole];
  return <section id="architecture" className="architecture-section section-pad"><div className="section-wrap">
    <SectionHeading lang={lang} eyebrow={t.architectureEyebrow} title={t.architectureTitle} subtitle={t.architectureSub} />
    <div className="architecture-layout"><div className="architecture-canvas"><div className="canvas-label"><span>{t.map}</span><span className="mono">{t.specialists}</span></div>
      <NetworkVisual lang={lang} selected={selectedAgent < 7 ? selectedAgent : null} onSelect={onSelectAgent} onHover={onSelectAgent} />
      <button className="coordination-node" type="button" aria-pressed={selectedAgent === 7} onClick={() => onSelectAgent(7)} onMouseEnter={() => onSelectAgent(7)} onFocus={() => onSelectAgent(7)}><span className="coord-icon"><GitBranch size={16} /></span><span><small>AGENT 07 — COORDINATION</small><strong>{t.coordinator}</strong></span><ArrowUpRight size={15} /></button>
    </div>
    <aside className="agent-inspector" dir={lang === 'ar' ? 'rtl' : 'ltr'} aria-live="polite"><div className="inspector-top"><span className="eyebrow">{t.selected}</span><span className="inspector-state"><i /> {t.activeView}</span></div>
      {currentAgent ? <><div className="inspector-number mono">AGENT {currentAgent.number}</div><div className="inspector-name">{(() => { const Icon = currentAgent.icon; return <Icon size={26} style={{ color: currentAgent.color }} />; })()}<h3>{currentAgent.name[lang]}</h3></div><p>{currentAgent.description[lang]}</p><div className="output-title">{t.expected}<span className="mono">OUTPUTS / 03</span></div><ul className="output-list" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{currentAgent.outputs.map((output) => <li key={output.en}><Check size={14} /> <span>{output[lang]}</span></li>)}</ul><div className="inspector-hint">{t.chooseNode}</div></> : <div className="inspector-empty">{t.chooseFromMap}</div>}
    </aside></div>
    <div className="architecture-principles" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t.principles.map(([title, text], i) => { const Icon = principleIcons[i]; return <div className="principle-card" key={title}><span className="principle-num mono">0{i + 1}</span><Icon size={19} strokeWidth={1.6} /><h3>{title}</h3><p>{text}</p></div>; })}</div>
  </div></section>;
}

function Agents({ lang, selectedAgent, onSelectAgent }: { lang: Lang; selectedAgent: number; onSelectAgent: (agentNumber: number) => void }) {
  const t = copy[lang];
  return <section id="agents" className="agents-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.agentEyebrow} title={t.agentTitle} subtitle={t.agentSub} />
    <div className="agents-grid">{agents.map((agent) => { const Icon = agent.icon; const agentNumber = Number(agent.number); return <article className={`agent-card ${selectedAgent === agentNumber ? 'agent-card-selected' : ''}`} key={agent.number} dir={lang === 'ar' ? 'rtl' : 'ltr'} tabIndex={0} role="button" aria-pressed={selectedAgent === agentNumber} aria-label={agent.name[lang]} onMouseEnter={() => onSelectAgent(agentNumber)} onFocus={() => onSelectAgent(agentNumber)} onClick={() => { onSelectAgent(agentNumber); document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' }); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectAgent(agentNumber); document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' }); } }}>
      <div className="agent-card-top"><span className="mono">AGENT {agent.number}</span><Icon size={19} style={{ color: agent.color }} /></div>
      <div className="agent-card-title"><small>{agent.label[lang]}</small><h3>{agent.name[lang]}</h3></div><p>{agent.description[lang]}</p>
      <div className="agent-output-heading"><span>{t.expected}</span><span className="mono">{t.deliverables}</span></div><div className="agent-tags" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{agent.outputs.map((output) => <span key={output.en}>{output[lang]}</span>)}</div><span className="agent-card-index latin">{agent.number}</span>
    </article>; })}</div>
  </div></section>;
}

function WorkflowSection({ lang }: { lang: Lang }) {
  const t = copy[lang]; const { ref, visible } = useReveal(); const [selectedStep, setSelectedStep] = useState<number | null>(null);
  return <section id="workflow" className="workflow-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.workflowEyebrow} title={t.workflowTitle} subtitle={t.workflowSub} light />
    <div className={`workflow-track ${visible ? 'workflow-enter' : ''}`} ref={ref} dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t.workflow.map(([title, body], i) => <article className={`workflow-step ${selectedStep === i ? 'step-selected' : ''}`} key={title} tabIndex={0} role="button" aria-pressed={selectedStep === i} onClick={() => setSelectedStep(selectedStep === i ? null : i)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedStep(selectedStep === i ? null : i); } }}><div className="step-head"><span className="step-number mono">{String(i + 1).padStart(2, '0')}</span><span className="step-dot"><i /></span></div><h3>{title}</h3><p>{body}</p><div className="step-connector" /></article>)}</div>
    <div className="workflow-foot"><span><CircleDot size={14} /> {t.sequence}</span><span className="mono">{t.evidence}</span></div>
  </div></section>;
}

function Collaboration({ lang }: { lang: Lang }) {
  const t = copy[lang]; const [count, setCount] = useState(4); const [running, setRunning] = useState(false); const interval = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearInterval(interval.current), []);
  const runSimulation = () => {
    if (running) return;
    setCount(0); setRunning(true); let index = 0;
    interval.current = window.setInterval(() => { index += 1; setCount(Math.min(index, workflowData.length)); if (index >= workflowData.length) { window.clearInterval(interval.current); window.setTimeout(() => setRunning(false), 650); } }, 680);
  };
  return <section id="collaboration" className="collab-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.collabEyebrow} title={t.collabTitle} subtitle={t.collabSub} />
    <div className="simulation-warning" role="note"><ShieldAlert size={18} /><strong>{t.warning}</strong><span>{t.exampleLog}</span></div>
    <div className="terminal-window" dir="ltr"><div className="terminal-bar"><div className="terminal-lights"><i /><i /><i /></div><div className="terminal-title mono"><Terminal size={14} /> CYBERSHIELD / AGENT COLLABORATION</div><span className="terminal-status"><i /> {t.simulated}</span></div>
      <div className="terminal-body"><div className="terminal-meta mono"><span>{t.session}</span><span>{t.notLive}</span></div><div className="terminal-stream">
        {workflowData.slice(0, count).map((event, i) => <div className="terminal-row" key={event.enActor} style={{ animationDelay: `${i * 30}ms` }}><span className="terminal-time mono">00:{String(12 + i * 2).padStart(2, '0')}.{String(14 + i * 7).padStart(2, '0')}</span><span className="terminal-actor mono" style={{ color: event.color }}>{lang === 'ar' ? event.arActor : event.enActor}</span><span className="terminal-type">{lang === 'ar' ? event.arType : event.enType}</span><span className="terminal-message">{lang === 'ar' ? event.arText : event.enText}</span><Check className="terminal-check" size={14} /></div>)}
        {!running && count === workflowData.length && <div className="consensus-block"><div className="consensus-title"><span className="consensus-check"><Check size={15} /></span><strong>{t.consensus}</strong><span className="mono">{t.illustrative}</span></div><div className="consensus-grid"><span><small>{t.verdict}</small><strong className="verdict">{lang === 'ar' ? 'نموذجي' : 'EXAMPLE'}</strong></span><span><small>{t.agentsLabel}</small><strong>7 · {lang === 'ar' ? 'تصوري' : 'conceptual'}</strong></span><span><small>{t.total}</small><strong>{lang === 'ar' ? 'غير مقاس' : 'not measured'}</strong></span><span><small>{t.human}</small><strong>—</strong></span></div></div>}
        {running && <div className="typing-line"><span /><span /><span /> {t.running}</div>}
      </div><div className="terminal-bottom"><span><i /> {t.safeMode}</span><button className="run-simulation" onClick={runSimulation} disabled={running} data-testid="button-run-simulation">{running ? t.running : count === workflowData.length ? t.rerun : t.run} <ArrowRight size={14} /></button></div></div>
    </div><p className="sim-note" dir={lang === 'ar' ? 'rtl' : 'ltr'}><Shield size={14} /> {t.simulationNote}</p>
  </div></section>;
}

function WhySection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="why-section section-pad"><div className="section-wrap"><div className="why-layout"><div className="why-copy" dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="eyebrow">{t.diffEyebrow}</div><h2>{t.diffTitleA}<br /><em>{t.diffTitleB}</em></h2><p>{t.diffBody}</p><a href="#architecture" className="text-link">{t.coordinationLink} <ArrowLeft size={16} /></a></div>
    <div className="difference-list">{differentiators.map(({ icon: Icon, title, body }, i) => <article className="difference-row" key={title.en} dir={lang === 'ar' ? 'rtl' : 'ltr'}><span className="difference-index mono">0{i + 1}</span><span className="difference-icon"><Icon size={19} /></span><div><h3>{title[lang]}</h3><p>{body[lang]}</p></div><ArrowUpRight className="difference-arrow" size={17} /></article>)}</div>
  </div></div></section>;
}

function Capabilities({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="capabilities" className="capabilities-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.capabilityEyebrow} title={t.capabilityTitle} />
    <div className="capability-grid">{capabilities.map(({ icon: Icon, title, body }, i) => <a className="capability-card" href="#technology" key={title.en} dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="capability-top"><span className="mono">CAP / 0{i + 1}</span><Icon size={20} /></div><h3>{title[lang]}</h3><p>{body[lang]}</p><span className="learn-more">{t.learnMore} <ArrowUpRight size={13} /></span></a>)}</div>
  </div></section>;
}

function Technology({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="technology" className="technology-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.techEyebrow} title={t.techTitle} subtitle={t.techSub} light />
    <div className="stack-layout"><div className="stack-intro" dir={lang === 'ar' ? 'rtl' : 'ltr'}><span className="stack-mark"><Layers3 size={24} /></span><div className="eyebrow">{t.referenceStack}</div><h3>{t.techDesign}</h3><p>{t.techBody}</p><span className="planned-chip"><span /> {t.planned}</span></div>
      <div className="stack-layers">{techStack.map(({ en, ar, icon: Icon, items }, i) => <div className="stack-row" key={en} dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="stack-label"><Icon size={16} /><span>{lang === 'ar' ? ar : en}</span><small className="mono">LAYER 0{i + 1}</small></div><div className="stack-items">{items.map((item) => <span className="stack-pill latin" key={item}>{item}</span>)}</div></div>)}</div>
    </div><div className="stack-disclaimer"><LockKeyhole size={14} /> {t.stackDisclaimer}</div>
  </div></section>;
}

function Impact({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="impact-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.impactEyebrow} title={t.impactTitle} subtitle={t.impactSub} /><div className="impact-grid" dir="ltr">{metrics.impact.map((metric, i) => <article className="impact-card" key={metric.value + i} data-testid={`metric-impact-${i}`}><span className="mono">INDICATOR / 0{i + 1}</span><strong className="latin">{metric.value}</strong><p>{metric.label[lang]}</p><div className="impact-line"><i /></div></article>)}</div><div className="placeholder-note impact-note" dir={lang === 'ar' ? 'rtl' : 'ltr'}><ShieldAlert size={17} /> {t.impactNote}</div></div></section>;
}

function Roadmap({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="roadmap" className="roadmap-section section-pad"><div className="section-wrap"><SectionHeading lang={lang} eyebrow={t.roadmapEyebrow} title={t.roadmapTitle} subtitle={t.roadmapSub} light />
    <div className="roadmap-status"><ShieldAlert size={17} /><span>{t.roadmapNote}</span></div>
    <div className="roadmap-track" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{roadmap.map((phase) => <article className="roadmap-card" key={phase.phase} tabIndex={0}><div className="roadmap-card-top"><span className="roadmap-phase mono">PHASE {phase.phase}</span><span className="planned-mini">{lang === 'ar' ? 'مخطط' : 'PLANNED'}</span></div><h3>{phase.title[lang]}</h3><p dir="auto">{phase.description[lang]}</p><span className="roadmap-index">{phase.phase}</span></article>)}</div>
  </div></section>;
}

function FinalCTA({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="final-cta section-pad"><div className="cta-grid" /><div className="section-wrap final-cta-inner" dir={lang === 'ar' ? 'rtl' : 'ltr'}><div className="eyebrow">{lang === 'ar' ? 'التصور القادم / 11' : 'THE NEXT HORIZON / 11'}</div><h2>{t.finalTitle}</h2><p>{t.finalText}</p><div className="hero-actions"><a className="button button-primary" href="#architecture">{t.exploreArchitecture} <ArrowUpRight size={16} /></a><a className="button button-ghost" href="#workflow">{t.exploreWorkflow} <ArrowDown size={15} /></a></div><small>{t.noClaim}</small></div></section>;
}

function Footer({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <footer className="site-footer"><div className="section-wrap"><div className="footer-main"><div className="footer-brand"><a href="#home" className="brand-link"><BrandMark /></a><p dir={lang === 'ar' ? 'rtl' : 'ltr'} dangerouslySetInnerHTML={{ __html: t.footerLine }} /></div>
    <div className="footer-nav" dir={lang === 'ar' ? 'rtl' : 'ltr'}><div><span className="mono">{t.explore}</span><a href="#architecture">{lang === 'ar' ? 'البنية' : 'Architecture'}</a><a href="#agents">{lang === 'ar' ? 'الوكلاء' : 'Agents'}</a><a href="#workflow">{lang === 'ar' ? 'سير العمل' : 'Workflow'}</a><a href="#roadmap">{lang === 'ar' ? 'خارطة الطريق' : 'Roadmap'}</a></div><div><span className="mono">{t.platform}</span><a href="#capabilities">{lang === 'ar' ? 'القدرات' : 'Capabilities'}</a><a href="#technology">{lang === 'ar' ? 'التقنيات' : 'Technology'}</a><a href="#collaboration">{t.simulation}</a></div></div>
    <a className="back-top" href="#home" aria-label={lang === 'ar' ? 'العودة إلى الأعلى' : 'Back to top'}><ArrowUpRight size={19} /></a></div>
    <div className="footer-track" dir={lang === 'ar' ? 'rtl' : 'ltr'}><span>Hack Agent AIX 2026 · Track 2</span><span>Agentic AI · Multi-Agent Systems</span><span>Autonomous Cyber Defense · SOC Automation</span><span>Threat Intelligence · Incident Response</span></div>
    <div className="footer-bottom" dir={lang === 'ar' ? 'rtl' : 'ltr'}><span>© 2026 CyberShield AI</span><span>{t.footerDescription}</span><span className="mono">{t.footerTag}</span></div>
  </div></footer>;
}

function App() {
  const [lang, setLang] = useState<Lang>('ar');
  const [selectedAgent, setSelectedAgent] = useState(1);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const sections = document.querySelectorAll<HTMLElement>('.section-pad');
    sections.forEach((section) => section.classList.add('scroll-reveal'));
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('scroll-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    const pageTitle = lang === 'ar' ? 'CyberShield AI — دفاع سيبراني متعدد الوكلاء' : 'CyberShield AI — Multi-Agent Cyber Defense';
    document.title = pageTitle;
    const description = lang === 'ar'
      ? 'تصور توضيحي لمنصة دفاع سيبراني متعددة الوكلاء. المحاكاة لا تنفذ تحليلًا أمنيًا حقيقيًا.'
      : 'A demonstration concept for multi-agent cyber defense. The simulation does not perform real security analysis.';
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', pageTitle);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', pageTitle);
  }, [lang]);
  return <div className={`site-shell grain ${lang === 'ar' ? 'locale-ar' : 'locale-en'}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <Header lang={lang} setLang={setLang} /><main><Hero lang={lang} /><Problem lang={lang} /><Architecture lang={lang} selectedAgent={selectedAgent} onSelectAgent={setSelectedAgent} /><Agents lang={lang} selectedAgent={selectedAgent} onSelectAgent={setSelectedAgent} /><WorkflowSection lang={lang} /><Collaboration lang={lang} /><WhySection lang={lang} /><Capabilities lang={lang} /><Technology lang={lang} /><Impact lang={lang} /><Roadmap lang={lang} /><FinalCTA lang={lang} /></main><Footer lang={lang} />
  </div>;
}

export default App;
