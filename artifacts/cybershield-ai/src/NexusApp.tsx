import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowDown, ArrowRight, ArrowUpRight, Bug, Check, ChevronDown,
  CircleDot, ClipboardCheck, Code2, Cpu, Database, FileBarChart2, FileText, Fingerprint,
  GitBranch, Globe2, Layers3, LockKeyhole, Menu, Network, Radar, Radio,
  ShieldAlert, ShieldCheck, Terminal, Workflow, X,
} from 'lucide-react';
import { NexusLogo, NexusSymbol } from './components/NexusLogo';
import { agents, capabilities, differentiators } from './data/agents';
import { metrics } from './data/metrics';
import { roadmap } from './data/roadmap';

type Lang = 'ar' | 'en';
const copy = {
  en: {
    nav: { platform: 'Platform', agents: 'Agents', architecture: 'Architecture', intel: 'Threat Intel', workflow: 'Workflow', technology: 'Technology' },
    command: 'ENTER COMMAND CENTER', language: 'AR', menuOpen: 'Open navigation', menuClose: 'Close navigation',
    badge: 'AUTONOMOUS AI CYBER DEFENSE', heroTop: 'THE AI DEFENSE', heroBottom: 'NETWORK',
    heroBody: 'A coordinated network of AI agent roles designed to help detect, investigate, analyze and respond to cyber threats.',
    heroNote: 'Concept preview · no live analysis, threat feed or response is connected.',
    explore: 'EXPLORE NEXUS', viewArchitecture: 'VIEW ARCHITECTURE',
    platformLabel: 'COMMAND NETWORK / 01', architectureLabel: 'SYSTEM MAP / 02',
    metricsLabel: 'NETWORK AT A GLANCE', metricsNote: 'Targets and concepts are labeled; nothing here is a measured production result.',
    problemEyebrow: 'SIGNAL / NOISE', problemTitle: 'SECURITY TEAMS ARE DROWNING IN SIGNALS.',
    problemBody: 'Security teams must review a growing volume of alerts. Manual triage takes time, consumes specialist attention and can miss context.',
    signalFlag: 'SIMULATED SIGNAL FLOW', signalCaption: 'Abstract visual only · no real alerts are ingested.',
    pipeline: ['SIGNAL', 'INVESTIGATION', 'EVIDENCE', 'DECISION', 'RESPONSE'],
    metricPlaceholder: 'Unverified metric placeholder · add a sourced benchmark before publication.',
    architectureEyebrow: 'ONE NETWORK · MULTIPLE MINDS', architectureTitle: 'A coordinated defense architecture.',
    architectureBody: 'Explore the seven conceptual roles. Select, focus or tap a node to inspect its purpose and proposed outputs.',
    core: 'NEXUS AI CORE', orchestration: 'ORCHESTRATION', selectedRole: 'AGENT ROLE / CONCEPT',
    proposedOutputs: 'PROPOSED OUTPUTS', roleStatus: 'SIMULATION · NOT RUNNING',
    agentEyebrow: 'SPECIALIST NETWORK', agentTitle: 'Seven roles. One shared mission.',
    agentBody: 'Each card describes a proposed responsibility. Status and sample fields are illustrative, not live telemetry.',
    demo: 'DEMO', signals: 'SIGNALS', confidence: 'CONFIDENCE', notMeasured: 'NOT MEASURED', notConnected: 'NOT CONNECTED',
    inspectAgent: 'INSPECT ROLE', statusSimulation: 'ROLE PREVIEW · SIMULATION',
    capabilityEyebrow: 'PLATFORM CAPABILITIES', capabilityTitle: 'Designed for security operations.',
    capabilityNote: 'Product capabilities below are a design blueprint; integrations and analysis are not connected.',
    learnMore: 'LEARN MORE',
    whyEyebrow: 'WHY NEXUS', whyTitle: 'Beyond detection. Toward coordinated investigation.',
    whyBody: 'Traditional tools surface signals. NEXUS SHIELD AI is designed to connect investigation, analysis and response support through collaborative agent roles.',
    consoleEyebrow: 'NEXUS LIVE', consoleTitle: 'A transparent SOC collaboration preview.',
    consoleIntro: 'Illustrative events show how the interface could communicate agent handoffs—no files are uploaded or analyzed.',
    simulationMode: 'SIMULATION MODE · NOT LIVE', sampleStream: 'SAMPLE EVENTS · NOT SECURITY FINDINGS',
    replay: 'REPLAY DEMO', replaying: 'PLAYING DEMO', exampleOnly: 'EXAMPLE ONLY',
    consoleFooter: 'No external sources queried · no security action taken · no real verdict produced.',
    threatEyebrow: 'THREAT INTELLIGENCE', threatTitle: 'Context only when provenance is clear.',
    threatIntro: 'A schematic network and reserved demonstration indicators. No live feeds, reputation lookups or sensitive data.',
    staticMap: 'STATIC ILLUSTRATION · NO LIVE FEED', indicatorTypes: ['IP', 'DOMAIN', 'HASH', 'URL'],
    reputation: 'REPUTATION', threatLevel: 'THREAT LEVEL', confidenceLabel: 'CONFIDENCE',
    notQueried: 'NOT QUERIED', notAvailable: 'NOT AVAILABLE', noScore: '—',
    workflowEyebrow: 'FROM SIGNAL TO DECISION', workflowTitle: 'A reviewable investigation path.',
    workflowIntro: 'A proposed sequence with human review before consequential action. Steps are illustrative, not currently executed.',
    reasoningEyebrow: 'EXPLAINABILITY', reasoningTitle: 'AI THAT SHOWS ITS WORK.',
    reasoningIntro: 'A safe explanation surface: evidence, decision factors and a concise summary—not hidden model chain-of-thought.',
    illustrativeAssessment: 'ILLUSTRATIVE EXAMPLE · NOT AN ASSESSMENT', riskScore: 'RISK SCORE', evidence: 'VERIFIED EVIDENCE',
    explainSummary: 'EXPLAINABILITY SUMMARY', decisionFactors: 'DECISION FACTORS', recommendation: 'RECOMMENDED NEXT STEP',
    noVerifiedData: 'No verified evidence', noAssessment: 'No assessment run', reviewSample: 'Review sample only',
    reasoningSteps: ['Input type is a demonstration placeholder.', 'No external source was queried.', 'No file or URL was analyzed.', 'Human review is required before any real action.'],
    layersEyebrow: 'DEFENSE IN DEPTH', layersTitle: 'Security layers, one coordinated core.',
    layersIntro: 'A conceptual model—not a deployed security control plane.',
    technologyEyebrow: 'TECHNOLOGY', technologyTitle: 'A clear line between current and planned.',
    currentFoundation: 'CURRENT WEBSITE FOUNDATION', plannedStack: 'PLANNED / NOT CONFIGURED',
    currentNote: 'These technologies power this website only; they do not provide threat analysis.',
    plannedNote: 'Proposed options, not active integrations. Providers are not configured or queried.',
    roadmapEyebrow: 'DEVELOPMENT ROADMAP', roadmapTitle: 'BUILDING THE AUTONOMOUS DEFENSE NETWORK.',
    plannedRoadmap: 'PLANNED · NOT AVAILABLE TODAY',
    roadmapNote: 'Aspirational phases only. Dates, delivery status and integrations are not represented as commitments.',
    impactEyebrow: 'MEASUREMENT FRAMEWORK', impactTitle: 'Impact must be measured, not implied.',
    impactBody: 'Values remain editable placeholders until a documented benchmark and methodology are available.',
    finalEyebrow: 'THE NEXT GENERATION', finalTitle: 'OF CYBER DEFENSE',
    finalBody: 'Powered by collaborative AI agent concepts.', enter: 'ENTER THE NEXUS',
    footerTag: 'AUTONOMOUS AI CYBER DEFENSE · CONCEPT PREVIEW',
    footerTruth: 'Simulation only. No live security services are connected.',
    showDetails: 'Show role details', networkAria: 'Interactive conceptual network of seven agent roles connected to the Nexus AI Core',
    workflow: [
      ['INPUT', 'Receive a user-provided signal in a future verified product.'],
      ['DETECT', 'Classify a signal for human review; no detection runs in this preview.'],
      ['ENRICH', 'Query authorized sources only after connection and approval.'],
      ['ANALYZE', 'Review evidence in a safe, isolated workflow.'],
      ['RESPOND', 'Draft options; require human approval for consequential actions.'],
      ['VALIDATE', 'Check evidence, policy and control references.'],
      ['REPORT', 'Prepare a traceable summary from verified results.'],
    ],
    events: [
      ['14:02:31', 'INPUT', 'invoice_october.eml · example name only · no file uploaded.'],
      ['14:02:32', 'DETECTION', 'Demo event · no threat detection was performed.'],
      ['14:02:34', 'INTELLIGENCE', 'Lookup skipped · no intelligence provider is connected.'],
      ['14:02:37', 'ANALYSIS', 'Queued as a visual sample · no attachment was analyzed.'],
      ['14:02:40', 'RESPONSE', 'Example review option · no action was taken.'],
      ['14:02:43', 'GOVERNANCE', 'Framework reference preview · not a validated control mapping.'],
      ['14:02:46', 'REPORTING', 'Sample summary state · no incident report was produced.'],
    ],
    layerNames: ['DETECTION', 'INTELLIGENCE', 'ANALYSIS', 'RESPONSE', 'GOVERNANCE'],
    techGroups: [
      ['Frontend · planned', ['Next.js', 'shadcn/ui']],
      ['Backend', ['FastAPI', 'Python']],
      ['Agent architecture', ['OpenAI Agents SDK', 'LangGraph']],
      ['Data', ['PostgreSQL', 'Vector database']],
      ['Threat intelligence', ['VirusTotal', 'AbuseIPDB', 'OSINT']],
      ['Deployment', ['Vercel', 'Docker']],
    ],
  },
  ar: {
    nav: { platform: 'المنصة', agents: 'الوكلاء', architecture: 'البنية', intel: 'استخبارات التهديدات', workflow: 'سير العمل', technology: 'التقنيات' },
    command: 'دخول مركز القيادة', language: 'EN', menuOpen: 'فتح التنقل', menuClose: 'إغلاق التنقل',
    badge: 'دفاع سيبراني ذاتي بالذكاء الاصطناعي', heroTop: 'شبكة الدفاع', heroBottom: 'بالذكاء الاصطناعي',
    heroBody: 'شبكة منسقة من أدوار وكلاء الذكاء الاصطناعي صُممت للمساعدة على كشف التهديدات السيبرانية والتحقيق فيها وتحليلها والاستجابة لها.',
    heroNote: 'معاينة تصورية · لا يوجد تحليل مباشر أو مصدر تهديدات أو استجابة متصلة.',
    explore: 'استكشف نيكسس', viewArchitecture: 'عرض البنية',
    platformLabel: 'شبكة القيادة / 01', architectureLabel: 'خريطة النظام / 02',
    metricsLabel: 'لمحة عن الشبكة', metricsNote: 'الأهداف والتصورات موسومة بوضوح؛ ولا تمثل أي قيمة هنا نتيجة إنتاج مقاسة.',
    problemEyebrow: 'الإشارة / الضجيج', problemTitle: 'فرق الأمن غارقة في الإشارات.',
    problemBody: 'تراجع فرق الأمن حجمًا متزايدًا من التنبيهات. يستغرق الفرز اليدوي وقتًا ويستهلك انتباه المختصين وقد يفوّت السياق.',
    signalFlag: 'مسار إشارات محاكى', signalCaption: 'تصور بصري فقط · لا تُستقبل تنبيهات حقيقية.',
    pipeline: ['إشارة', 'تحقيق', 'أدلة', 'قرار', 'استجابة'],
    metricPlaceholder: 'قيمة مؤقتة غير موثقة · أضف معيارًا بمصدر واضح قبل النشر.',
    architectureEyebrow: 'شبكة واحدة · عقول متعددة', architectureTitle: 'بنية دفاعية منسقة.',
    architectureBody: 'استكشف الأدوار التصورية السبعة. اختر عقدة أو ركّز عليها أو المسها لعرض دورها ومخرجاتها المقترحة.',
    core: 'نواة نيكسس للذكاء الاصطناعي', orchestration: 'التنسيق', selectedRole: 'دور الوكيل / تصور',
    proposedOutputs: 'المخرجات المقترحة', roleStatus: 'محاكاة · لا يعمل',
    agentEyebrow: 'شبكة المتخصصين', agentTitle: 'سبعة أدوار. مهمة مشتركة.',
    agentBody: 'توضح كل بطاقة مسؤولية مقترحة. الحالات والحقول النموذجية توضيحية وليست بيانات مباشرة.',
    demo: 'تجريبي', signals: 'الإشارات', confidence: 'الثقة', notMeasured: 'غير مقاس', notConnected: 'غير متصل',
    inspectAgent: 'استعرض الدور', statusSimulation: 'معاينة الدور · محاكاة',
    capabilityEyebrow: 'قدرات المنصة', capabilityTitle: 'مصممة لعمليات الأمن.',
    capabilityNote: 'القدرات التالية مخطط للمنتج؛ ولا تتصل بها تكاملات أو تحليلات فعلية.',
    learnMore: 'معرفة المزيد',
    whyEyebrow: 'لماذا نيكسس؟', whyTitle: 'ما بعد الكشف. نحو تحقيق منسق.',
    whyBody: 'تعرض الأدوات التقليدية الإشارات. صُمم NEXUS SHIELD AI لربط التحقيق والتحليل ودعم الاستجابة عبر أدوار وكلاء متعاونة.',
    consoleEyebrow: 'NEXUS LIVE', consoleTitle: 'معاينة شفافة لتعاون مركز العمليات.',
    consoleIntro: 'تعرض الأحداث التوضيحية كيف يمكن للواجهة إظهار انتقال المهام بين الوكلاء؛ لا تُرفع ملفات ولا تُحلل.',
    simulationMode: 'وضع المحاكاة · ليس مباشرًا', sampleStream: 'أحداث نموذجية · ليست نتائج أمنية',
    replay: 'إعادة العرض التجريبي', replaying: 'العرض التجريبي يعمل', exampleOnly: 'مثال فقط',
    consoleFooter: 'لم يتم الاستعلام من مصادر خارجية · لم يُنفذ إجراء أمني · لم تصدر نتيجة حقيقية.',
    threatEyebrow: 'استخبارات التهديدات', threatTitle: 'السياق يبدأ من وضوح المصدر.',
    threatIntro: 'شبكة تخطيطية ومؤشرات توضيحية محجوزة للأمثلة. لا توجد تغذية مباشرة أو استعلامات سمعة أو بيانات حساسة.',
    staticMap: 'رسم توضيحي ثابت · بلا مصدر مباشر', indicatorTypes: ['IP', 'نطاق', 'بصمة', 'رابط'],
    reputation: 'السمعة', threatLevel: 'مستوى التهديد', confidenceLabel: 'الثقة',
    notQueried: 'لم يُستعلم', notAvailable: 'غير متاح', noScore: '—',
    workflowEyebrow: 'من الإشارة إلى القرار', workflowTitle: 'مسار تحقيق قابل للمراجعة.',
    workflowIntro: 'تسلسل مقترح يتضمن مراجعة بشرية قبل أي إجراء مؤثر. الخطوات توضيحية وليست منفذة حاليًا.',
    reasoningEyebrow: 'قابلية التفسير', reasoningTitle: 'ذكاء اصطناعي يوضح أساس القرار.',
    reasoningIntro: 'واجهة تفسير آمنة تعرض الأدلة وعوامل القرار وملخصًا موجزًا، لا سلسلة التفكير الداخلية للنموذج.',
    illustrativeAssessment: 'مثال توضيحي · ليس تقييمًا', riskScore: 'درجة المخاطر', evidence: 'الأدلة الموثقة',
    explainSummary: 'ملخص التفسير', decisionFactors: 'عوامل القرار', recommendation: 'الخطوة الموصى بها',
    noVerifiedData: 'لا توجد أدلة موثقة', noAssessment: 'لم يُنفذ تقييم', reviewSample: 'راجع المثال فقط',
    reasoningSteps: ['نوع الإدخال قيمة توضيحية.', 'لم يُستعلم من أي مصدر خارجي.', 'لم يُحلل ملف أو رابط.', 'تتطلب أي خطوة فعلية مراجعة بشرية.'],
    layersEyebrow: 'الدفاع متعدد الطبقات', layersTitle: 'طبقات أمنية حول نواة منسقة.',
    layersIntro: 'نموذج تصوري، لا منصة ضوابط أمنية منشورة.',
    technologyEyebrow: 'التقنيات', technologyTitle: 'فصل واضح بين القائم والمخطط.',
    currentFoundation: 'أساس الموقع الحالي', plannedStack: 'مخطط / غير مهيأ',
    currentNote: 'تشغّل هذه التقنيات الموقع فقط؛ ولا توفر تحليلًا للتهديدات.',
    plannedNote: 'خيارات مقترحة وليست تكاملات فعالة. لم تتم تهيئة المزوّدين أو الاستعلام منهم.',
    roadmapEyebrow: 'خارطة التطوير', roadmapTitle: 'بناء شبكة الدفاع الذاتية.',
    plannedRoadmap: 'مخطط · غير متاح حاليًا',
    roadmapNote: 'مراحل طموحة فقط؛ لا تمثل التواريخ أو حالات التسليم أو التكاملات التزامات مؤكدة.',
    impactEyebrow: 'إطار القياس', impactTitle: 'الأثر يُقاس ولا يُفترض.',
    impactBody: 'تبقى القيم مؤشرات مؤقتة إلى حين توفر معيار موثق ومنهجية قياس واضحة.',
    finalEyebrow: 'الجيل القادم', finalTitle: 'من الدفاع السيبراني',
    finalBody: 'مدعوم بتصور لوكلاء ذكاء اصطناعي تعاونيين.', enter: 'ادخل إلى نيكسس',
    footerTag: 'دفاع سيبراني بالذكاء الاصطناعي · معاينة تصورية',
    footerTruth: 'محاكاة فقط. لا توجد خدمات أمنية مباشرة متصلة.',
    showDetails: 'عرض تفاصيل الدور', networkAria: 'شبكة تصورية تفاعلية من سبعة أدوار متصلة بنواة نيكسس للذكاء الاصطناعي',
    workflow: [
      ['إدخال', 'استلام إشارة من المستخدم ضمن منتج مستقبلي موثق.'],
      ['كشف', 'تصنيف الإشارة لمراجعتها بشريًا؛ لا يُنفذ الكشف في هذه المعاينة.'],
      ['إثراء', 'الاستعلام من مصادر مصرح بها بعد الاتصال والموافقة فقط.'],
      ['تحليل', 'مراجعة الأدلة ضمن مسار آمن ومعزول.'],
      ['استجابة', 'صياغة خيارات مع اشتراط الموافقة البشرية على الإجراءات المؤثرة.'],
      ['تحقق', 'مراجعة الأدلة والسياسات ومراجع الضوابط.'],
      ['تقرير', 'إعداد ملخص قابل للتتبع من نتائج موثقة.'],
    ],
    events: [
      ['14:02:31', 'إدخال', 'invoice_october.eml · اسم توضيحي فقط · لم يُرفع أي ملف.'],
      ['14:02:32', 'كشف', 'حدث تجريبي · لم يُنفذ كشف تهديدات.'],
      ['14:02:34', 'استخبارات', 'تم تجاوز الاستعلام · لا يوجد مزود استخبارات متصل.'],
      ['14:02:37', 'تحليل', 'عنصر مرئي في المثال · لم يُحلل أي مرفق.'],
      ['14:02:40', 'استجابة', 'خيار مراجعة توضيحي · لم يُتخذ أي إجراء.'],
      ['14:02:43', 'حوكمة', 'معاينة لمراجع الأطر · لم تُعتمد مواءمة للضوابط.'],
      ['14:02:46', 'تقرير', 'حالة ملخص تجريبي · لم يصدر أي تقرير حادثة.'],
    ],
    layerNames: ['الكشف', 'الاستخبارات', 'التحليل', 'الاستجابة', 'الحوكمة'],
    techGroups: [
      ['الواجهة الأمامية · مخطط', ['Next.js', 'shadcn/ui']],
      ['الخلفية', ['FastAPI', 'Python']],
      ['بنية الوكلاء', ['OpenAI Agents SDK', 'LangGraph']],
      ['البيانات', ['PostgreSQL', 'قاعدة متجهات']],
      ['استخبارات التهديدات', ['VirusTotal', 'AbuseIPDB', 'OSINT']],
      ['النشر', ['Vercel', 'Docker']],
    ],
  },
} as const;

const reservedIndicators = [
  { type: 'IP', value: '192.0.2.14', tag: 'RFC 5737 · EXAMPLE' },
  { type: 'DOMAIN', value: 'example.invalid', tag: 'RESERVED · EXAMPLE' },
  { type: 'HASH', value: 'sha256: DEMO—NOT A HASH', tag: 'PLACEHOLDER' },
  { type: 'URL', value: 'https://example.invalid/path', tag: 'RESERVED · EXAMPLE' },
];

const layerIcons = [Radar, Globe2, Bug, ShieldCheck, ClipboardCheck];
const workflowIcons = [Radio, Radar, Globe2, Bug, ShieldCheck, ClipboardCheck, FileBarChart2];
const techIcons = [Code2, Cpu, GitBranch, Database, Globe2, Layers3];

function useReveal() {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.12 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

function SectionHeading({ eyebrow, title, body, lang, align = 'start' }: { eyebrow: string; title: string; body?: string; lang: Lang; align?: 'start' | 'center' }) {
  return <div className={`nx-section-heading nx-align-${align}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <span className="nx-eyebrow"><i />{eyebrow}</span>
    <h2>{title}</h2>
    {body && <p>{body}</p>}
  </div>;
}

function TopBar({ lang, setLang }: { lang: Lang; setLang: (next: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const t = copy[lang];
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const links: [string, string][] = [
    ['#platform', t.nav.platform], ['#agents', t.nav.agents], ['#architecture', t.nav.architecture],
    ['#intel', t.nav.intel], ['#workflow', t.nav.workflow], ['#technology', t.nav.technology],
  ];
  return <header className={`nx-topbar ${scrolled ? 'is-scrolled' : ''}`}>
    <div className="nx-nav-inner">
      <a className="nx-brand" href="#platform" aria-label="NEXUS SHIELD AI — home" onClick={() => setOpen(false)}><NexusLogo /></a>
      <nav className={`nx-nav-links ${open ? 'is-open' : ''}`} aria-label={lang === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}>
        {links.map(([href, label]) => <a key={href} href={href} onClick={() => setOpen(false)} dir={lang === 'ar' ? 'rtl' : 'ltr'}>{label}</a>)}
      </nav>
      <div className="nx-nav-actions">
        <button className="nx-language" type="button" onClick={() => { setLang(lang === 'ar' ? 'en' : 'ar'); setOpen(false); }} aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'} data-testid="button-language-switch"><span>{lang === 'ar' ? 'AR' : 'EN'}</span><i />{lang === 'ar' ? 'EN' : 'AR'}</button>
        <a className="nx-nav-cta" href="#console" onClick={() => setOpen(false)} dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t.command}<ArrowUpRight size={14} /></a>
        <button className="nx-menu-button" type="button" onClick={() => setOpen(!open)} aria-label={open ? t.menuClose : t.menuOpen} aria-expanded={open} data-testid="button-menu-toggle">{open ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </div>
  </header>;
}

function AgentNetwork({ lang, selected, onSelect, compact = false }: { lang: Lang; selected: string; onSelect: (number: string) => void; compact?: boolean }) {
  const cx = 260;
  const cy = 192;
  const points = agents.map((agent, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / agents.length;
    return { agent, x: cx + Math.cos(angle) * 168, y: cy + Math.sin(angle) * 134 };
  });
  return <div className={`nx-network ${compact ? 'is-compact' : ''}`}>
    <div className="nx-network-topline"><span><i className="nx-status-dot" /> NEXUS / AGENT FABRIC</span><span className="nx-mono">07 NODES · DEMO</span></div>
    <div className="nx-network-desktop">
    <svg viewBox="0 0 520 390" className="nx-network-svg" role="group" aria-label={copy[lang].networkAria}>
      <defs>
        <radialGradient id={compact ? 'nx-core-glow-compact' : 'nx-core-glow'}><stop offset="0" stopColor="#c4ff31" stopOpacity=".16" /><stop offset="1" stopColor="#3de4ff" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r="132" className="nx-orbit nx-orbit-one" />
      <circle cx={cx} cy={cy} r="173" className="nx-orbit nx-orbit-two" />
      <circle cx={cx} cy={cy} r="110" fill={`url(#${compact ? 'nx-core-glow-compact' : 'nx-core-glow'})`} />
      {points.map(({ agent, x, y }, index) => {
        const active = selected === agent.number;
        return <g key={agent.number}>
          <line x1={cx} y1={cy} x2={x} y2={y} className={`nx-network-line ${active ? 'is-active' : ''}`} />
          <line x1={cx} y1={cy} x2={x} y2={y} className="nx-network-flow" style={{ animationDelay: `${index * -0.48}s` }} />
          <g className={`nx-node ${active ? 'is-active' : ''}`} transform={`translate(${x - 34},${y - 25})`} role="button" tabIndex={0} aria-label={agent.name[lang]} aria-pressed={active} data-testid={`node-agent-${agent.number}`} onPointerEnter={() => onSelect(agent.number)} onFocus={() => onSelect(agent.number)} onClick={() => onSelect(agent.number)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(agent.number); } }}>
            <rect className="nx-node-box" width="68" height="50" rx="9" />
            <circle className="nx-node-accent" cx="56" cy="9" r="3" />
            <text className="nx-node-number" x="34" y="22" textAnchor="middle">{agent.number}</text>
            <text className="nx-node-name" x="34" y="39" textAnchor="middle">{agent.short[lang]}</text>
          </g>
        </g>;
      })}
      <g className="nx-core">
        <circle cx={cx} cy={cy} r="52" className="nx-core-ring" />
        <circle cx={cx} cy={cy} r="42" className="nx-core-disc" />
        <path d="M260 165 277 172V187c0 12-7 21-17 27-10-6-17-15-17-27v-15l17-7Z" className="nx-core-shield" />
        <path d="m252 188 6 6 11-13" className="nx-core-check" />
        <text x={cx} y="230" textAnchor="middle" className="nx-core-label">NEXUS AI CORE</text>
      </g>
    </svg>
    </div>
    <div className="nx-network-mobile" role="group" aria-label={copy[lang].networkAria}>
      <div className="nx-mobile-core"><NexusSymbol title="NEXUS AI Core" /><span>NEXUS<br />AI CORE</span></div>
      <div className="nx-mobile-node-list">
        {agents.map((agent) => {
          const Icon = agent.icon;
          return <button type="button" key={agent.number} className={`nx-mobile-node ${selected === agent.number ? 'is-active' : ''}`} onClick={() => onSelect(agent.number)} onFocus={() => onSelect(agent.number)} aria-pressed={selected === agent.number} data-testid={`mobile-node-agent-${agent.number}`}>
            <span className="nx-mobile-number nx-mono">{agent.number}</span><Icon className="nx-mobile-icon" size={17} strokeWidth={1.6} /><span className="nx-mobile-name">{agent.name[lang]}</span><i />
          </button>;
        })}
      </div>
    </div>
    <div className="nx-network-footer"><span><CircleDot size={12} /> CONCEPTUAL DATA FLOW</span><span>NO LIVE AGENTS</span></div>
  </div>;
}

function AgentInspector({ lang, selected }: { lang: Lang; selected: string }) {
  const agent = agents.find((entry) => entry.number === selected) ?? agents[0];
  const Icon = agent.icon;
  return <aside className="nx-inspector" dir={lang === 'ar' ? 'rtl' : 'ltr'} aria-live="polite" data-testid="agent-inspector">
    <div className="nx-inspector-top"><span className="nx-eyebrow">{copy[lang].selectedRole}</span><span className="nx-demo-pill"><i /> {copy[lang].roleStatus}</span></div>
    <span className="nx-inspector-number nx-mono">AGENT {agent.number} / 07</span>
    <div className="nx-inspector-title"><span className="nx-icon-frame"><Icon size={20} strokeWidth={1.65} /></span><h3>{agent.name[lang]}</h3></div>
    <p>{agent.description[lang]}</p>
    <div className="nx-inspector-outputs"><span>{copy[lang].proposedOutputs}</span><small className="nx-mono">PREVIEW</small></div>
    <ul>{agent.outputs[lang].map((output) => <li key={output}><Check size={13} />{output}</li>)}</ul>
  </aside>;
}

function Hero({ lang, selected, onSelect }: { lang: Lang; selected: string; onSelect: (number: string) => void }) {
  const t = copy[lang];
  return <section id="platform" className="nx-hero">
    <div className="nx-hero-grid" aria-hidden="true" />
    <div className="nx-hero-light" aria-hidden="true" />
    <div className="nx-shell nx-hero-layout">
      <div className="nx-hero-copy" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="nx-badge"><span className="nx-badge-dot" />{t.badge}</div>
        <span className="nx-overline nx-mono">NEXUS SHIELD AI / 2026</span>
        <h1 className="nx-display">{t.heroTop}<br /><span>{t.heroBottom}<i>.</i></span></h1>
        <p className="nx-hero-subtitle">AI-POWERED AUTONOMOUS CYBER DEFENSE</p>
        <p className="nx-hero-body">{t.heroBody}</p>
        <div className="nx-hero-actions">
          <a className="nx-button nx-button-primary" href="#architecture">{t.explore}<ArrowUpRight size={16} /></a>
          <a className="nx-button nx-button-secondary" href="#architecture">{t.viewArchitecture}<ArrowDown size={15} /></a>
        </div>
        <p className="nx-hero-truth"><ShieldAlert size={14} />{t.heroNote}</p>
      </div>
      <div className="nx-hero-visual">
        <div className="nx-visual-caption"><span className="nx-mono">{t.platformLabel}</span><span className="nx-live-label"><i /> {t.statusSimulation}</span></div>
        <AgentNetwork lang={lang} selected={selected} onSelect={onSelect} compact />
        {(() => {
          const activeAgent = agents.find((agent) => agent.number === selected) ?? agents[0];
          return <div className="nx-hero-selected" dir={lang === 'ar' ? 'rtl' : 'ltr'} aria-live="polite"><span className="nx-mono">AGENT {activeAgent.number} / SIMULATED FLOW</span><strong>{activeAgent.name[lang]}</strong><p>{activeAgent.description[lang]}</p><small>{lang === 'ar' ? 'تدفق بيانات توضيحي · لا توجد مهمة مباشرة' : 'Illustrative data flow · no live task'}</small></div>;
        })()}
        <div className="nx-hero-agent-hint" dir={lang === 'ar' ? 'rtl' : 'ltr'}><span>{t.showDetails}</span><ChevronDown size={14} /></div>
      </div>
    </div>
    <div className="nx-hero-bottom"><span className="nx-mono">DEFEND / ANALYZE / ADAPT</span><a href="#metrics">{lang === 'ar' ? 'تابع إلى الشبكة' : 'SCROLL TO EXPLORE'} <ArrowDown size={13} /></a><span className="nx-mono">NX / 001</span></div>
  </section>;
}

function MetricsBar({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="metrics" className="nx-metrics-section">
    <div className="nx-shell">
      <div className="nx-metrics-intro"><span className="nx-eyebrow">{t.metricsLabel}</span><p>{t.metricsNote}</p></div>
      <div className="nx-metrics-grid" dir="ltr">
        {metrics.hero.map((metric, index) => <article className="nx-metric" key={metric.value} data-testid={`metric-hero-${index}`}>
          <strong className="nx-metric-value">{metric.value}</strong>
          <span className="nx-metric-label" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{metric.label[lang]}</span>
          <small>{metric.note[lang]}</small>
        </article>)}
      </div>
    </div>
  </section>;
}

function SignalField() {
  const signalLabels = ['SMTP · DEMO', 'URL · DEMO', 'IOC · DEMO', 'MAIL · DEMO', 'DNS · DEMO', 'FILE · DEMO', 'AUTH · DEMO', 'WEB · DEMO', 'LOG · DEMO', 'API · DEMO', 'HASH · DEMO', 'HOST · DEMO'];
  return <div className="nx-signal-field" aria-label="Abstract demonstration signals">
    {signalLabels.map((label, index) => <span className="nx-signal-chip" key={label} style={{ '--signal-index': index, '--signal-left': `${(index % 5) * 22}%`, '--signal-right': `${(index % 5) * 18}%`, '--signal-top': `${15 + (index % 4) * 20}%`, '--signal-alt-top': `${70 - (index % 4) * 10}%`, '--signal-duration': `${8 + index * 0.34}s`, '--signal-delay': `${-index * 0.47}s` } as React.CSSProperties}><i />{label}</span>)}
    <div className="nx-signal-core"><NexusSymbol title="Nexus network symbol" /><span>NEXUS<br />INTELLIGENCE CORE</span></div>
    <div className="nx-signal-caption"><i /> SIMULATED INPUT · NO REAL ALERTS</div>
  </div>;
}

function ProblemSection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const { ref, visible } = useReveal();
  return <section className="nx-problem nx-section" ref={(node) => { ref.current = node; }} data-revealed={visible}>
    <div className="nx-shell">
      <div className="nx-problem-layout">
        <div className="nx-problem-copy" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <span className="nx-eyebrow"><i />{t.problemEyebrow}</span>
          <h2>{t.problemTitle}</h2>
          <p>{t.problemBody}</p>
          <div className="nx-pipeline">{t.pipeline.map((item, index) => <span key={item}><b>0{index + 1}</b>{item}{index < t.pipeline.length - 1 && <ArrowRight size={13} />}</span>)}</div>
        </div>
        <div className="nx-problem-visual">
          <SignalField />
          <p className="nx-visual-note" dir={lang === 'ar' ? 'rtl' : 'ltr'}><Activity size={14} />{t.signalCaption}</p>
        </div>
      </div>
      <div className="nx-placeholder-grid" dir="ltr">
        {metrics.problem.map((metric, index) => <article key={`${metric.value}-${index}`} className="nx-placeholder-card" data-testid={`metric-problem-${index}`}>
          <span className="nx-mono">INDICATOR / 0{index + 1}</span>
          <strong>{metric.value}</strong>
          <p dir={lang === 'ar' ? 'rtl' : 'ltr'}>{metric.label[lang]}</p>
        </article>)}
      </div>
      <p className="nx-placeholder-note" dir={lang === 'ar' ? 'rtl' : 'ltr'}><ShieldAlert size={15} />{t.metricPlaceholder}</p>
    </div>
  </section>;
}

function ArchitectureSection({ lang, selected, onSelect }: { lang: Lang; selected: string; onSelect: (number: string) => void }) {
  const t = copy[lang];
  return <section id="architecture" className="nx-architecture nx-section">
    <div className="nx-shell">
      <SectionHeading lang={lang} eyebrow={t.architectureEyebrow} title={t.architectureTitle} body={t.architectureBody} />
      <div className="nx-architecture-layout">
        <div className="nx-architecture-map">
          <div className="nx-map-title"><span>{t.architectureLabel}</span><span className="nx-mono">CORE / 07 AGENT ROLES</span></div>
          <AgentNetwork lang={lang} selected={selected} onSelect={onSelect} />
        </div>
        <AgentInspector lang={lang} selected={selected} />
      </div>
      <div className="nx-architecture-principles" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {[
          [Workflow, lang === 'ar' ? 'المنسق' : 'Orchestrator', lang === 'ar' ? 'يوجه المهام وينسق التعاون بين الأدوار.' : 'Routes tasks and coordinates the proposed agent roles.'],
          [Network, lang === 'ar' ? 'ناقل الرسائل' : 'Message bus', lang === 'ar' ? 'تصور لتبادل سياق مشترك غير متزامن.' : 'A concept for asynchronous, shared-context messaging.'],
          [FileText, lang === 'ar' ? 'قابلية التفسير' : 'Explainability', lang === 'ar' ? 'يعرض الأدلة وعوامل القرار القابلة للمراجعة.' : 'Surfaces evidence and reviewable decision factors.'],
          [LockKeyhole, lang === 'ar' ? 'طبقة الأمان' : 'Safety layer', lang === 'ar' ? 'مراجعة بشرية قبل الإجراءات المؤثرة.' : 'Human review before consequential actions.'],
        ].map(([Icon, title, body], index) => {
          const PrincipleIcon = Icon as typeof Workflow;
          return <article className="nx-principle" key={String(title)}><span className="nx-principle-index nx-mono">0{index + 1}</span><PrincipleIcon size={18} strokeWidth={1.6} /><h3>{String(title)}</h3><p>{String(body)}</p></article>;
        })}
      </div>
    </div>
  </section>;
}

function AgentsSection({ lang, selected, onSelect }: { lang: Lang; selected: string; onSelect: (number: string) => void }) {
  const t = copy[lang];
  return <section id="agents" className="nx-agents nx-section">
    <div className="nx-shell">
      <SectionHeading lang={lang} eyebrow={t.agentEyebrow} title={t.agentTitle} body={t.agentBody} />
      <div className="nx-agent-grid">
        {agents.map((agent, index) => {
          const Icon = agent.icon;
          return <article className={`nx-agent-card ${selected === agent.number ? 'is-selected' : ''}`} key={agent.number} dir={lang === 'ar' ? 'rtl' : 'ltr'} data-testid={`card-agent-${agent.number}`}>
            <div className="nx-agent-card-top"><span className="nx-mono">AGENT {agent.number}</span><span className="nx-agent-icon"><Icon size={19} strokeWidth={1.6} /></span></div>
            <span className="nx-agent-category">{agent.short[lang]}</span>
            <h3>{agent.name[lang]}</h3>
            <p>{agent.description[lang]}</p>
          <ul className="nx-agent-outputs" aria-label={t.proposedOutputs}>
            {agent.outputs[lang].map((output) => <li key={output}><Check size={12} />{output}</li>)}
          </ul>
          <div className="nx-agent-data" dir="ltr">
              <div><span>{t.signals}</span><strong>—</strong><small>{t.notConnected}</small></div>
              <div><span>{t.confidence}</span><strong>—</strong><small>{t.notMeasured}</small></div>
            </div>
            <span className="nx-agent-demo"><i />{t.statusSimulation}</span>
            <button type="button" className="nx-text-button" onClick={() => { onSelect(agent.number); const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; document.getElementById('architecture')?.scrollIntoView({ behavior }); }} data-testid={`button-inspect-agent-${agent.number}`}>{t.inspectAgent}<ArrowUpRight size={14} /></button>
            <span className="nx-agent-index">{agent.number}</span>
          </article>;
        })}
      </div>
    </div>
  </section>;
}

function CapabilitiesSection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="nx-capabilities nx-section">
    <div className="nx-shell">
      <SectionHeading lang={lang} eyebrow={t.capabilityEyebrow} title={t.capabilityTitle} body={t.capabilityNote} align="center" />
      <div className="nx-capability-grid">
        {capabilities.map(({ icon: Icon, title, body }, index) => <article className="nx-capability" key={title.en} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <span className="nx-capability-icon"><Icon size={19} strokeWidth={1.55} /></span><small className="nx-mono">CAP / 0{index + 1}</small>
          <h3>{title[lang]}</h3><p>{body[lang]}</p><a className="nx-capability-link" href="#workflow">{t.learnMore}<ArrowUpRight size={13} /></a>
        </article>)}
      </div>
    </div>
  </section>;
}

function ConsoleSection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const [count, setCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const interval = useRef<number | null>(null);
  const runDemo = useCallback(() => {
    if (interval.current !== null) window.clearInterval(interval.current);
    setCount(0);
    setPlaying(true);
    let step = 0;
    interval.current = window.setInterval(() => {
      step += 1;
      setCount(step);
      if (step >= t.events.length) {
        if (interval.current !== null) window.clearInterval(interval.current);
        interval.current = null;
        window.setTimeout(() => setPlaying(false), 400);
      }
    }, 650);
  }, [t.events.length]);
  useEffect(() => {
    const node = document.getElementById('console');
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let started = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) { started = true; runDemo(); observer.disconnect(); }
    }, { threshold: 0.2 });
    observer.observe(node);
    return () => { observer.disconnect(); if (interval.current !== null) window.clearInterval(interval.current); };
  }, [runDemo]);
  return <section id="console" className="nx-console-section nx-section">
    <div className="nx-shell">
      <SectionHeading lang={lang} eyebrow={t.consoleEyebrow} title={t.consoleTitle} body={t.consoleIntro} />
      <div className="nx-console-warning"><ShieldAlert size={17} /><strong>{t.simulationMode}</strong><span>{t.sampleStream}</span></div>
      <div className="nx-console">
        <div className="nx-console-bar"><div className="nx-console-lights"><i /><i /><i /></div><div className="nx-console-title"><Terminal size={15} /><span>NEXUS / COLLABORATION TRACE</span></div><span className="nx-console-state"><i />{t.exampleOnly}</span></div>
        <div className="nx-console-meta"><span>nexus://agents/trace · DEMO</span><span>NO LIVE CONNECTION</span></div>
        <div className="nx-console-scroll" role="log" aria-live="polite" aria-label={t.sampleStream}>
          <div className="nx-console-stream">
            {t.events.slice(0, count).map(([time, role, message], index) => <div className="nx-event" key={`${time}-${role}`} style={{ animationDelay: `${index * 35}ms` }}>
              <span className="nx-event-time">{time}</span><span className="nx-event-mark">DEMO</span><strong>{role}</strong><p>{message}</p><Check size={14} />
            </div>)}
            {count === t.events.length && <div className="nx-console-complete"><span><Check size={15} />{t.exampleOnly}</span><strong>{lang === 'ar' ? 'انتهى العرض دون إجراء تحليل' : 'Demo ended · no analysis performed'}</strong></div>}
            {playing && <div className="nx-typing"><i /><i /><i />{t.replaying}</div>}
          </div>
        </div>
        <div className="nx-console-bottom"><span><LockKeyhole size={13} />{t.consoleFooter}</span><button type="button" onClick={runDemo} disabled={playing} data-testid="button-replay-demo">{playing ? t.replaying : t.replay}<ArrowRight size={14} /></button></div>
      </div>
    </div>
  </section>;
}

function ThreatIntelSection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="intel" className="nx-intel nx-section">
    <div className="nx-shell">
      <SectionHeading lang={lang} eyebrow={t.threatEyebrow} title={t.threatTitle} body={t.threatIntro} />
      <div className="nx-intel-layout">
        <div className="nx-map-panel">
          <div className="nx-map-panel-top"><span className="nx-mono">NEXUS / SOURCE MAP</span><span className="nx-demo-pill"><i />{t.staticMap}</span></div>
          <div className="nx-schematic-map" aria-hidden="true">
            <svg viewBox="0 0 680 340" role="presentation">
              <path className="nx-map-shape" d="m75 100 36-30 58 7 22 25 47 3 13 33-20 25-7 38-27 17-18 48-39-4-23-32-39-11-16-35-26-14 5-30-21-23zM287 106l24-31 47-6 22 19 45-5 22 20 33-3 16 19-14 19 16 25-12 25-24 4-11 28-34 5-13-23-29 5-27-15-28 8-22-19-33 7-18-26 11-24-17-19zM492 80l28-17 43 11 19 20 38 9 13 23-25 17-10 28-42 9-25-20-32-5-17-27 9-22zM394 254l24-17 30 8 10 24-24 23-30-8z" />
              {[['130','112'], ['178','155'], ['328','125'], ['383','172'], ['506','107'], ['548','153'], ['420','264']].map(([x, y], index) => <g key={`${x}-${y}`}><circle className="nx-map-node-halo" cx={x} cy={y} r="9" /><circle className="nx-map-node" cx={x} cy={y} r="3" /><text x={Number(x) + 8} y={Number(y) - 8}>DEMO / 0{index + 1}</text></g>)}
              <path className="nx-map-route" d="M130 112 178 155 328 125 383 172 506 107 548 153 420 264" />
            </svg>
          </div>
          <div className="nx-map-legend"><span><i />ILLUSTRATIVE NODE</span><span>NO GEOGRAPHIC OR THREAT CLAIMS</span></div>
        </div>
        <div className="nx-indicator-panel">
          <div className="nx-indicator-heading"><span>{lang === 'ar' ? 'أنواع المؤشرات' : 'INDICATOR TYPES'}</span><span className="nx-mono">RESERVED EXAMPLES</span></div>
          <div className="nx-indicator-grid">
            {reservedIndicators.map((indicator, index) => <article className="nx-indicator" key={indicator.type}>
              <span className="nx-indicator-type">{t.indicatorTypes[index] ?? indicator.type}</span>
              <strong className="nx-mono">{indicator.value}</strong><small>{indicator.tag}</small>
            </article>)}
          </div>
          <div className="nx-reputation">
            {[t.reputation, t.threatLevel, t.confidenceLabel].map((label) => <div key={label}><span>{label}</span><strong>{t.noScore}</strong><small>{t.notQueried}</small></div>)}
          </div>
          <p className="nx-intel-foot"><ShieldAlert size={14} />{lang === 'ar' ? 'قيم محجوزة للأمثلة فقط؛ لم تُجرَ أي عملية إثراء.' : 'Reserved demonstration values only; no enrichment was performed.'}</p>
        </div>
      </div>
    </div>
  </section>;
}

function WorkflowSection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const { ref, visible } = useReveal();
  return <section id="workflow" className="nx-workflow nx-section" ref={(node) => { ref.current = node; }} data-revealed={visible}>
    <div className="nx-shell">
      <SectionHeading lang={lang} eyebrow={t.workflowEyebrow} title={t.workflowTitle} body={t.workflowIntro} />
      <div className={`nx-workflow-track ${visible ? 'is-visible' : ''}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {t.workflow.map(([label, body], index) => {
          const Icon = workflowIcons[index];
          return <article className="nx-workflow-step" key={label} style={{ animationDelay: `${index * 90}ms` }} data-testid={`workflow-step-${index + 1}`}>
            <div className="nx-step-marker"><span className="nx-mono">0{index + 1}</span><span className="nx-step-icon"><Icon size={17} strokeWidth={1.6} /></span></div>
            <h3>{label}</h3><p>{body}</p>
          </article>;
        })}
      </div>
      <div className="nx-workflow-footer"><span><CircleDot size={13} />{lang === 'ar' ? 'سير عمل مقترح' : 'PROPOSED WORKFLOW'}</span><span className="nx-mono">INPUT → EVIDENCE → HUMAN REVIEW</span></div>
    </div>
  </section>;
}

function ReasoningSection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="nx-reasoning nx-section">
    <div className="nx-shell nx-reasoning-layout">
      <div className="nx-reasoning-copy" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <SectionHeading lang={lang} eyebrow={t.reasoningEyebrow} title={t.reasoningTitle} body={t.reasoningIntro} />
        <p className="nx-reasoning-truth"><ShieldAlert size={15} />{t.illustrativeAssessment}</p>
      </div>
      <div className="nx-decision-card">
        <div className="nx-decision-top"><span><Fingerprint size={16} /> NEXUS / EXPLAINABILITY</span><span className="nx-mono">DEMO ONLY</span></div>
        <div className="nx-decision-head"><div><small>{t.riskScore}</small><strong>—</strong><span>{t.noAssessment}</span></div><div><small>{t.evidence}</small><strong>00</strong><span>{t.noVerifiedData}</span></div><div><small>{t.confidenceLabel}</small><strong>—</strong><span>{t.notMeasured}</span></div></div>
        <div className="nx-explain-block"><span className="nx-eyebrow">{t.explainSummary}</span><p>{lang === 'ar' ? 'لا يوجد تقييم أمني. توضح هذه البطاقة شكل عرض الأدلة وعوامل القرار عند توفر نتائج موثقة.' : 'No security assessment exists. This card illustrates how evidence and decision factors could be presented after verified results.'}</p></div>
        <div className="nx-reasoning-trace"><span className="nx-eyebrow">{t.decisionFactors}</span>{t.reasoningSteps.map((step, index) => <div key={step}><small className="nx-mono">0{index + 1}</small><span>{step}</span></div>)}</div>
        <div className="nx-recommendation"><span><ShieldCheck size={15} />{t.recommendation}</span><strong>{t.reviewSample}</strong></div>
      </div>
    </div>
  </section>;
}

function DifferentiatorsSection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="nx-differentiators nx-section">
    <div className="nx-shell">
      <SectionHeading lang={lang} eyebrow={t.whyEyebrow} title={t.whyTitle} body={t.whyBody} />
      <div className="nx-differentiator-grid">
        {differentiators.map(({ icon: Icon, title, body }, index) => <article className="nx-differentiator" key={title.en} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <span className="nx-differentiator-index nx-mono">0{index + 1}</span>
          <span className="nx-differentiator-icon"><Icon size={18} strokeWidth={1.6} /></span>
          <h3>{title[lang]}</h3><p>{body[lang]}</p>
        </article>)}
      </div>
    </div>
  </section>;
}

function SecurityLayers({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="nx-layers nx-section">
    <div className="nx-shell">
      <SectionHeading lang={lang} eyebrow={t.layersEyebrow} title={t.layersTitle} body={t.layersIntro} align="center" />
      <div className="nx-layer-system">
        <div className="nx-layer-rings" aria-hidden="true"><i /><i /><i /><i /><i /><div><NexusSymbol title="Nexus core symbol" /><span>NEXUS<br />CORE</span></div></div>
        <div className="nx-layer-list">
          {t.layerNames.map((name, index) => { const Icon = layerIcons[index]; return <article className="nx-layer-row" key={name}><span className="nx-mono">LAYER 0{index + 1}</span><Icon size={17} /><strong>{name}</strong><span>{index === 0 ? '01' : '—'}</span></article>; })}
        </div>
      </div>
      <p className="nx-layer-note"><i />{lang === 'ar' ? 'تصور معماري · لا توجد طبقات حماية مباشرة منشورة' : 'Architecture concept · no live protection layers are deployed'}</p>
    </div>
  </section>;
}

function TechnologySection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section id="technology" className="nx-technology nx-section">
    <div className="nx-shell">
      <SectionHeading lang={lang} eyebrow={t.technologyEyebrow} title={t.technologyTitle} />
      <div className="nx-current-stack" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="nx-stack-head"><div><span className="nx-eyebrow">{t.currentFoundation}</span><h3>React <i>+</i> Vite <i>+</i> Tailwind</h3><p>{t.currentNote}</p></div><span className="nx-verified"><Check size={13} /> WEBSITE STACK</span></div>
        <div className="nx-stack-tags"><span>React</span><span>Vite</span><span>Tailwind CSS</span><span>Lucide</span></div>
      </div>
      <div className="nx-planned-stack" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="nx-stack-head"><div><span className="nx-eyebrow">{t.plannedStack}</span><p>{t.plannedNote}</p></div><span className="nx-planned-label"><i />NOT CONNECTED</span></div>
        <div className="nx-tech-grid">
          {t.techGroups.map(([label, items], index) => { const Icon = techIcons[index]; return <article className="nx-tech-group" key={label}>
            <div className="nx-tech-label"><Icon size={16} /><span>{label}</span><small className="nx-mono">LAYER 0{index + 1}</small></div>
            <div className="nx-tech-tags">{items.map((item) => <span key={item}>{item}</span>)}</div>
            <small className="nx-unconfigured">{lang === 'ar' ? 'مخطط · غير مهيأ' : 'PLANNED · UNCONFIGURED'}</small>
          </article>; })}
        </div>
      </div>
    </div>
  </section>;
}

function ImpactSection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="nx-impact nx-section">
    <div className="nx-shell">
      <SectionHeading lang={lang} eyebrow={t.impactEyebrow} title={t.impactTitle} body={t.impactBody} />
      <div className="nx-impact-grid" dir="ltr">
        {metrics.impact.map((metric, index) => <article className="nx-impact-card" key={metric.label.en} data-testid={`metric-impact-${index}`}><span className="nx-mono">METRIC / 0{index + 1}</span><strong>{metric.value}</strong><p dir={lang === 'ar' ? 'rtl' : 'ltr'}>{metric.label[lang]}</p></article>)}
      </div>
      <p className="nx-placeholder-note" dir={lang === 'ar' ? 'rtl' : 'ltr'}><ShieldAlert size={15} />{t.metricPlaceholder}</p>
    </div>
  </section>;
}

function RoadmapSection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="nx-roadmap nx-section">
    <div className="nx-shell">
      <SectionHeading lang={lang} eyebrow={t.roadmapEyebrow} title={t.roadmapTitle} />
      <div className="nx-roadmap-status"><span><Activity size={15} />{t.plannedRoadmap}</span><p>{t.roadmapNote}</p></div>
      <div className="nx-roadmap-track" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {roadmap.map((phase, index) => <article className="nx-roadmap-card" key={phase.phase}>
          <div className="nx-roadmap-node"><span /></div><div className="nx-roadmap-meta"><span className="nx-mono">PHASE {phase.phase}</span><span>{lang === 'ar' ? 'مخطط' : 'PLANNED'}</span></div>
          <h3>{phase.title[lang]}</h3><p>{phase.description[lang]}</p><small className="nx-mono">0{index + 1} / 05</small>
        </article>)}
      </div>
    </div>
  </section>;
}

function FinalCTA({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="nx-final">
    <div className="nx-final-network" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
    <div className="nx-final-content" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <NexusSymbol className="nx-final-symbol" title="NEXUS SHIELD AI symbol" />
      <span className="nx-eyebrow">{t.finalEyebrow}</span>
      <h2>{t.finalTitle}</h2><p>{t.finalBody}</p>
      <a className="nx-button nx-button-primary" href="#architecture">{t.enter}<ArrowUpRight size={17} /></a>
      <small>{t.footerTruth}</small>
    </div>
  </section>;
}

function Footer({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <footer className="nx-footer">
    <div className="nx-shell nx-footer-main" dir="ltr">
      <div><a href="#platform" aria-label="NEXUS SHIELD AI — home"><NexusLogo /></a><p dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t.footerTag}</p></div>
      <div className="nx-footer-links" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <a href="#architecture">{t.nav.architecture}</a><a href="#agents">{t.nav.agents}</a><a href="#intel">{t.nav.intel}</a><a href="#workflow">{t.nav.workflow}</a>
      </div>
      <a className="nx-back-top" href="#platform" aria-label={lang === 'ar' ? 'العودة للأعلى' : 'Back to top'}><ArrowUpRight size={18} /></a>
    </div>
    <div className="nx-shell nx-footer-bottom" dir={lang === 'ar' ? 'rtl' : 'ltr'}><span>© 2026 NEXUS SHIELD AI</span><span>{t.footerTruth}</span><span className="nx-mono">DEMO / SIMULATION / PREVIEW</span></div>
  </footer>;
}

export default function NexusApp() {
  const [lang, setLang] = useState<Lang>('ar');
  const [selected, setSelected] = useState('01');
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    const description = lang === 'ar'
      ? 'NEXUS SHIELD AI: معاينة تصورية ثنائية اللغة لبنية دفاع سيبراني متعددة الوكلاء. المحاكاة لا تنفذ تحليلًا أمنيًا حقيقيًا.'
      : 'NEXUS SHIELD AI: a bilingual concept preview of a multi-agent cyber defense network. The simulation performs no real security analysis.';
    const title = lang === 'ar' ? 'NEXUS SHIELD AI — دفاع سيبراني ذاتي' : 'NEXUS SHIELD AI — Autonomous AI Cyber Defense';
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
  }, [lang]);
  return <div className={`nx-site nx-locale-${lang}`} data-testid="nexus-site">
    <TopBar lang={lang} setLang={setLang} />
    <main>
      <Hero lang={lang} selected={selected} onSelect={setSelected} />
      <MetricsBar lang={lang} />
      <ProblemSection lang={lang} />
      <ArchitectureSection lang={lang} selected={selected} onSelect={setSelected} />
      <AgentsSection lang={lang} selected={selected} onSelect={setSelected} />
      <DifferentiatorsSection lang={lang} />
      <CapabilitiesSection lang={lang} />
      <ThreatIntelSection lang={lang} />
      <ConsoleSection lang={lang} />
      <WorkflowSection lang={lang} />
      <ReasoningSection lang={lang} />
      <SecurityLayers lang={lang} />
      <TechnologySection lang={lang} />
      <ImpactSection lang={lang} />
      <RoadmapSection lang={lang} />
      <FinalCTA lang={lang} />
    </main>
    <Footer lang={lang} />
  </div>;
}
