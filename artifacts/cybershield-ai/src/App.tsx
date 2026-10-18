import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Boxes,
  BrainCircuit, Bug, Check, CircleDot, ClipboardCheck, Code2, Cpu, Database,
  FileBarChart2, Fingerprint, GitBranch, Globe2, Layers3, LockKeyhole, Menu,
  Network, Radar, ScanSearch, Shield, ShieldAlert, ShieldCheck, Siren,
  Terminal, Workflow, X,
} from 'lucide-react';

// All mutable claim/metric values live here. Replace placeholders only when supported by reliable evidence.
const METRICS = {
  hero: [
    { value: '6+1', label: 'Agents', note: 'architecture count' },
    { value: '<10s', label: 'Investigation', note: 'target · illustrative' },
    { value: '70%', label: 'Faster Response', note: 'target · illustrative' },
    { value: '24/7', label: 'Autonomous Defense', note: 'capability statement' },
  ],
  problem: [
    { value: 'XX%', label: 'تنبيهات غير مُعالجة' },
    { value: 'XXK/day', label: 'تنبيه أمني يوميًا' },
    { value: 'XX min', label: 'متوسط وقت التحقيق' },
    { value: 'XX%', label: 'وقت يُهدر في الفرز' },
  ],
  impact: [
    { value: 'XX%', label: 'Reduction in Investigation Time' },
    { value: 'XXx', label: 'Faster Incident Response' },
    { value: 'XX', label: 'Threat Visibility Improvement' },
    { value: 'X.X / 5', label: 'Security Readiness Score' },
  ],
};

const agents = [
  {
    number: '01', short: 'Detection', name: 'Threat Detection Agent', label: 'Detection',
    description: 'يحلل رسائل البريد المشبوهة ومحاولات التصيد والروابط والمرفقات الضارة، ويحسب مستوى المخاطر الأولي.',
    outputs: ['Threat Indicators', 'Initial Severity', 'Investigation Trigger'],
    icon: Radar, color: '#56d5bc',
  },
  {
    number: '02', short: 'Intel', name: 'Threat Intelligence Agent', label: 'Intel',
    description: 'يستعلم من مصادر استخبارات التهديدات وقواعد IOC وخدمات السمعة لإثراء المؤشرات والتحقق منها.',
    outputs: ['Reputation Score', 'Intelligence Summary', 'Attack Correlations'],
    icon: Globe2, color: '#7bb8df',
  },
  {
    number: '03', short: 'Analysis', name: 'Malware Analysis Agent', label: 'Analysis',
    description: 'يفحص الملفات المشبوهة، ويبحث عن مؤشرات البرمجيات الخبيثة، ويقيّم المخاطر السلوكية.',
    outputs: ['Malware Classification', 'Behavioral Report', 'Risk Assessment'],
    icon: Bug, color: '#e8aa72',
  },
  {
    number: '04', short: 'Response', name: 'Incident Response Agent', label: 'Response',
    description: 'يخطط للاحتواء، ويرتب أولويات الاستجابة، وينشئ أدلة عمل خاصة بكل حادثة.',
    outputs: ['Recommendations', 'Response Plan', 'Containment Steps'],
    icon: Siren, color: '#ee8b85',
  },
  {
    number: '05', short: 'Governance', name: 'Compliance Agent', label: 'Compliance',
    description: 'يربط النتائج بأطر NIST وISO 27001 وSOC 2 وMITRE ATT&CK.',
    outputs: ['Compliance Report', 'Audit Trail', 'Governance Notes'],
    icon: ClipboardCheck, color: '#bca9e6',
  },
  {
    number: '06', short: 'Reporting', name: 'Reporting Agent', label: 'Reporting',
    description: 'يجمع المخرجات في ملخصات تنفيذية وتقارير تقنية ووثائق للحوادث.',
    outputs: ['Executive Report', 'Technical Report', 'Incident Documentation'],
    icon: FileBarChart2, color: '#e3cb75',
  },
  {
    number: '07', short: 'Coordination', name: 'Coordination Agent', label: 'Coordination',
    description: 'يفوض المهام، ويحاول حل التعارضات بين الوكلاء، ويتأكد من اكتمال سير العمل.',
    outputs: ['Task Delegation', 'Conflict Resolution', 'Final Judgment'],
    icon: GitBranch, color: '#85cbb2',
  },
];

const workflow = [
  ['Input Received', 'يرفع المستخدم بريدًا أو رابطًا أو ملفًا مشبوهًا.'],
  ['Threat Detection Agent', 'تصنيف Phishing / Malware / Suspicious URL.'],
  ['Threat Intelligence Agent', 'إثراء المؤشرات من مصادر الاستخبارات والسمعة.'],
  ['Malware Analysis Agent', 'تحليل ثابت وسلوكي للملفات.'],
  ['Incident Response Agent', 'خطة احتواء وتخفيف للمخاطر.'],
  ['Compliance Agent', 'ربط النتائج بأطر الأمن ذات الصلة.'],
  ['Reporting Agent', 'Executive Summary + Technical Report.'],
  ['Final Security Assessment', 'Verdict، Risk Score، وRecommended Actions.'],
];

const simulatedEvents = [
  { actor: 'USER', type: 'Input', text: 'Uploaded suspicious file: invoice_october.eml', color: '#9aabb1' },
  { actor: 'THREAT DETECTION AGENT', type: 'Detection', text: 'Potential phishing attempt detected.', color: '#56d5bc' },
  { actor: 'THREAT INTELLIGENCE AGENT', type: 'Intel', text: 'Sender domain found in multiple threat intelligence sources.', color: '#7bb8df' },
  { actor: 'MALWARE ANALYSIS AGENT', type: 'Analysis', text: 'Attachment classified as suspicious.', color: '#e8aa72' },
  { actor: 'INCIDENT RESPONSE AGENT', type: 'Response', text: 'Recommended containment actions generated.', color: '#ee8b85' },
  { actor: 'COMPLIANCE AGENT', type: 'Compliance', text: 'Incident mapped to relevant security controls.', color: '#bca9e6' },
  { actor: 'REPORTING AGENT', type: 'Report', text: 'Final technical and executive report generated.', color: '#e3cb75' },
];

const differentiators = [
  { icon: BrainCircuit, title: 'Collaborative Reasoning', body: 'يتبادل الوكلاء الأدلة والسياق لبناء صورة مشتركة للحادثة.' },
  { icon: Workflow, title: 'Autonomous Decision Support', body: 'تحقيق متكامل من الإشارة الأولى حتى التقييم الأمني.' },
  { icon: Fingerprint, title: 'Explainable by Design', body: 'الاستنتاجات مدعومة بالأدلة ومسارات الاستدلال.' },
  { icon: Network, title: 'SOC-Mirrored Architecture', body: 'بنية مستوحاة من سير عمل مراكز عمليات الأمن.' },
];

const capabilities = [
  { icon: ScanSearch, title: 'Autonomous Threat Investigation', body: 'تحويل الإشارات إلى تحقيق منسق ومتعدد المراحل.' },
  { icon: Network, title: 'Multi-Agent Collaboration', body: 'وكلاء متخصصون يتشاركون السياق والأدلة.' },
  { icon: Fingerprint, title: 'Explainable AI Decisions', body: 'إظهار الأساس والأدلة خلف كل استنتاج.' },
  { icon: Globe2, title: 'Real-Time Threat Intelligence', body: 'إثراء المؤشرات بسياق استخباراتي عند توفر المصادر.' },
  { icon: Bug, title: 'Malware Analysis', body: 'فحص مؤشرات الملفات والسلوك ضمن سير التحقيق.' },
  { icon: ClipboardCheck, title: 'Compliance Mapping', body: 'ربط نتائج التحقيق بأطر الأمن والحوكمة.' },
  { icon: Activity, title: 'Contextual Risk Assessment', body: 'تقييم المخاطر في ضوء سياق الحادثة.' },
  { icon: ShieldCheck, title: 'Automated Response with Human Approval', body: 'اقتراح إجراءات مع موافقة بشرية للحالات الحرجة.' },
];

const stack = [
  { label: 'Frontend', icon: Code2, items: ['Next.js', 'React', 'Tailwind CSS', 'shadcn/ui'] },
  { label: 'Backend', icon: Cpu, items: ['FastAPI', 'Python'] },
  { label: 'Agent Framework', icon: Boxes, items: ['LangGraph', 'OpenAI Agents SDK'] },
  { label: 'Data', icon: Database, items: ['PostgreSQL', 'ChromaDB / Vector Store'] },
  { label: 'Threat Intelligence', icon: Globe2, items: ['VirusTotal API', 'AbuseIPDB API', 'OSINT Sources'] },
  { label: 'Deployment', icon: Layers3, items: ['Vercel', 'Railway', 'Docker'] },
];

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.12 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

function SectionHeading({ eyebrow, title, subtitle, light = false }: { eyebrow: string; title: string; subtitle?: string; light?: boolean }) {
  return (
    <div className={`section-heading ${light ? 'light-heading' : ''}`} dir="rtl">
      <div className="eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span className="brand-shield"><Shield size={18} strokeWidth={1.8} /></span>
      <span className="brand-word latin">CYBER<span>SHIELD</span></span>
    </span>
  );
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    ['#architecture', 'Architecture'],
    ['#agents', 'الوكلاء'],
    ['#workflow', 'سير العمل'],
    ['#technology', 'التقنيات'],
  ];
  return (
    <header className="topbar">
      <div className="nav-inner">
        <a href="#home" className="brand-link" aria-label="CyberShield AI — الصفحة الرئيسية"><BrandMark /></a>
        <nav className={`nav-links ${menuOpen ? 'open' : ''}`} aria-label="التنقل الرئيسي">
          {links.map(([href, text]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{text}</a>)}
          <a className="nav-cta" href="#collaboration" onClick={() => setMenuOpen(false)}>استكشف المنصة <ArrowUpRight size={14} /></a>
        </nav>
        <button className="menu-toggle" aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
    </header>
  );
}

function NetworkVisual({ selected, onSelect, onHover }: { selected: number | null; onSelect: (id: number) => void; onHover?: (id: number) => void }) {
  const coords = [
    { x: 114, y: 66 }, { x: 283, y: 78 }, { x: 377, y: 180 },
    { x: 286, y: 290 }, { x: 108, y: 290 }, { x: 26, y: 178 },
  ];
  return (
    <div className="network-visual" aria-label="تصور تفاعلي لشبكة الوكلاء">
      <div className="network-topline"><span><i /> MULTI-AGENT FABRIC</span><span className="mono">SYS / 07 NODES</span></div>
      <svg className="network-svg" viewBox="0 0 410 360" role="group" aria-label="اختر وكيلًا لعرض دوره">
        <defs>
          <radialGradient id="core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#137e70" stopOpacity=".42" />
            <stop offset="100%" stopColor="#137e70" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="204" cy="180" r="104" fill="url(#core)" className="pulse-ring" />
        <circle cx="204" cy="180" r="68" fill="none" stroke="#2b5b5d" strokeDasharray="2 7" />
        <circle cx="204" cy="180" r="94" fill="none" stroke="#284d50" strokeDasharray="2 9" />
        {coords.map((point, index) => {
          const active = selected === index + 1;
          const agent = agents[index];
          return (
            <g key={agent.number}>
              <line x1="204" y1="180" x2={point.x + 20} y2={point.y + 20} className={`agent-link ${active ? 'line-active' : ''}`} stroke={active ? agent.color : '#3c6969'} strokeWidth={active ? 1.7 : 1} opacity={selected === null || active ? .75 : .25} />
              <g
                className={`agent-node node-float ${active ? 'node-active' : ''}`}
                transform={`translate(${point.x}, ${point.y})`}
                tabIndex={0}
                role="button"
                aria-label={`Agent ${agent.number}: ${agent.name}`}
                aria-pressed={active}
                onClick={() => onSelect(index + 1)}
                onMouseEnter={() => onHover?.(index + 1)}
                onFocus={() => onHover?.(index + 1)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(index + 1); } }}
              >
                <rect className="node-box" width="42" height="42" rx="12" stroke={active ? agent.color : '#466c6b'} />
                <circle cx="35" cy="7" r="3" fill={agent.color} />
                <text x="21" y="26" textAnchor="middle" className="node-number">{agent.number}</text>
                <text x="21" y="60" textAnchor="middle" className="node-label">{agent.short}</text>
              </g>
            </g>
          );
        })}
        <g className="orchestrator-node">
          <circle cx="204" cy="180" r="46" fill="#14292f" stroke="#18b596" strokeWidth="1.3" />
          <circle cx="204" cy="180" r="37" fill="none" stroke="#18b596" strokeOpacity=".3" />
          <path d="M204 151l17 7v12c0 13-8 22-17 27-9-5-17-14-17-27v-12z" fill="#0e8e79" fillOpacity=".38" stroke="#57d8bd" />
          <path d="M197 174l5 5 10-12" fill="none" stroke="#b6f3e6" strokeWidth="2" />
          <text x="204" y="231" textAnchor="middle" className="core-label">ORCHESTRATOR</text>
        </g>
      </svg>
      <div className="network-foot"><span><span className="live-dot" /> COORDINATION LAYER</span><span className="mono">ENCRYPTED CONTEXT FLOW</span></div>
    </div>
  );
}

function Hero() {
  return (
    <section id="home" className="hero">
      <div className="hero-grid" />
      <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
      <div className="section-wrap hero-inner">
        <div className="hero-copy" dir="rtl">
          <div className="event-badge"><span className="badge-square" /> HACK AGENT AIX 2026 · TRACK 2 · MULTI-AGENT SYSTEMS</div>
          <div className="hero-overline latin">AUTONOMOUS SECURITY OPERATIONS</div>
          <h1 className="latin">CYBER<span>SHIELD</span><br />AI<span className="hero-period">.</span></h1>
          <div className="hero-subtitle latin">Autonomous Multi-Agent Cyber Defense Platform</div>
          <p className="hero-arabic">شبكة ذكية من وكلاء الأمن السيبراني المستقلين الذين يتعاونون للكشف عن التهديدات السيبرانية والتحقيق فيها وتحليلها والاستجابة لها في الوقت الفعلي.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#architecture">Explore Architecture <ArrowUpRight size={16} /></a>
            <a className="button button-ghost" href="#workflow">Explore Workflow <ArrowDown size={15} /></a>
          </div>
          <div className="hero-metrics" dir="ltr">
            {METRICS.hero.map((metric, i) => (
              <div className="hero-metric" key={metric.label} data-testid={`metric-hero-${i}`}>
                <strong className="latin">{metric.value}</strong><span>{metric.label}</span><small>{metric.note}</small>
              </div>
            ))}
          </div>
          <div className="hero-disclaimer">الأرقام أهداف توضيحية وليست نتائج مُثبتة.</div>
        </div>
        <div className="hero-art"><NetworkVisual selected={null} onSelect={() => document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' })} />
          <div className="art-caption mono">FIG 01 — COOPERATIVE DEFENSE FABRIC</div>
        </div>
      </div>
      <a className="scroll-cue" href="#problem"><span>SCROLL TO EXPLORE</span><ArrowDown size={14} /></a>
      <div className="hero-index mono">CS / 2026 — 01</div>
    </section>
  );
}

function Problem() {
  return (
    <section id="problem" className="problem-section section-pad">
      <div className="section-wrap">
        <div className="problem-intro" dir="rtl">
          <div className="eyebrow">THE SIGNAL-TO-NOISE GAP / 01</div>
          <h2>فرق الأمن<br /><em>غارقة في التنبيهات</em></h2>
          <p>تتلقى المؤسسات آلاف التنبيهات الأمنية يوميًا. التحقيق اليدوي بطيء، يستهلك موارد كبيرة، وعرضة للخطأ البشري.</p>
        </div>
        <div className="problem-side">
          <div className="problem-cards" dir="rtl">
            {METRICS.problem.map((metric, i) => (
              <div className="problem-card" key={metric.label} data-testid={`metric-problem-${i}`}>
                <span className="card-serial mono">0{i + 1} / INDICATOR</span>
                <strong className="latin">{metric.value}</strong>
                <span>{metric.label}</span>
                <div className="card-ticks"><i /><i /><i /><i /><i /><i /><i /><i /></div>
              </div>
            ))}
          </div>
          <div className="placeholder-note" dir="rtl"><ShieldAlert size={17} /> قيم مؤقتة غير موثقة — تستلزم مصادر موثوقة قبل النشر.</div>
        </div>
      </div>
    </section>
  );
}

function Architecture() {
  const [selected, setSelected] = useState<number | null>(0);
  const currentAgent = selected ? agents[selected - 1] : null;
  const explanations = [
    { icon: Workflow, title: 'Orchestrator', text: 'يوجه المهام، يدير الذاكرة، وينسق التوافق بين الوكلاء.' },
    { icon: Network, title: 'Message Bus', text: 'تواصل غير متزامن بين الوكلاء باستخدام سياق مشترك.' },
    { icon: Fingerprint, title: 'Explainability', text: 'كل قرار مرتبط بالأدلة وخطوات الاستدلال.' },
    { icon: LockKeyhole, title: 'Safety Layer', text: 'ضوابط للأفعال وHuman-in-the-loop للحالات الحرجة.' },
  ];
  return (
    <section id="architecture" className="architecture-section section-pad">
      <div className="section-wrap">
        <SectionHeading eyebrow="SYSTEM DESIGN / 02" title="بنية متعددة الوكلاء" subtitle="شبكة منسقة من وكلاء الذكاء الاصطناعي المتخصصين." />
        <div className="architecture-layout">
          <div className="architecture-canvas">
            <div className="canvas-label"><span>ARCHITECTURE MAP</span><span className="mono">6 SPECIALISTS + 1 COORDINATOR</span></div>
            <NetworkVisual selected={selected && selected < 7 ? selected : null} onSelect={setSelected} onHover={setSelected} />
            <div className="coordination-node" role="button" tabIndex={0} aria-pressed={selected === 7} onClick={() => setSelected(7)} onMouseEnter={() => setSelected(7)} onFocus={() => setSelected(7)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(7); } }}>
              <span className="coord-icon"><GitBranch size={16} /></span>
              <span><small>AGENT 07 — COORDINATION</small><strong>Coordination Agent</strong></span>
              <ArrowUpRight size={15} />
            </div>
          </div>
          <aside className="agent-inspector" dir="rtl" aria-live="polite">
            <div className="inspector-top"><span className="eyebrow">SELECTED NODE</span><span className="inspector-state"><i /> ACTIVE VIEW</span></div>
            {currentAgent ? (
              <>
                <div className="inspector-number mono">AGENT {currentAgent.number}</div>
                <div className="inspector-name"><currentAgent.icon size={26} style={{ color: currentAgent.color }} /><h3>{currentAgent.name}</h3></div>
                <p>{currentAgent.description}</p>
                <div className="output-title">المخرجات المتوقعة <span className="mono">OUTPUTS / 03</span></div>
                <ul className="output-list">{currentAgent.outputs.map((output) => <li key={output}><Check size={14} /> <span className="latin">{output}</span></li>)}</ul>
                <div className="inspector-hint">اختر عقدة أخرى من الخريطة لاستكشاف دورها.</div>
              </>
            ) : <div className="inspector-empty">اختر وكيلًا من المخطط لعرض دوره ومخرجاته.</div>}
          </aside>
        </div>
        <div className="architecture-principles" dir="rtl">
          {explanations.map(({ icon: Icon, title, text }, i) => (
            <div className="principle-card" key={title}>
              <span className="principle-num mono">0{i + 1}</span><Icon size={19} strokeWidth={1.6} />
              <h3 className="latin">{title}</h3><p>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Agents() {
  return (
    <section id="agents" className="agents-section section-pad">
      <div className="section-wrap">
        <SectionHeading eyebrow="SPECIALIST ROLES / 03" title="العملاء" subtitle="ستة متخصصين + منسق واحد" />
        <div className="agents-grid">
          {agents.map((agent) => {
            const Icon = agent.icon;
            return (
              <article className="agent-card" key={agent.number} dir="rtl">
                <div className="agent-card-top"><span className="mono">AGENT {agent.number}</span><Icon size={19} style={{ color: agent.color }} /></div>
                <div className="agent-card-title"><small className="latin">{agent.label}</small><h3>{agent.name}</h3></div>
                <p>{agent.description}</p>
                <div className="agent-output-heading"><span>المخرجات</span><span className="mono">DELIVERABLES</span></div>
                <div className="agent-tags">{agent.outputs.map((output) => <span className="latin" key={output}>{output}</span>)}</div>
                <span className="agent-card-index latin">{agent.number}</span>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const { ref, visible } = useReveal();
  return (
    <section id="workflow" className="workflow-section section-pad">
      <div className="section-wrap">
        <SectionHeading eyebrow="INVESTIGATION SEQUENCE / 04" title="سير عمل التحقيق" subtitle="من الإشارة إلى الحكم في ثوانٍ" light />
        <div className={`workflow-track ${visible ? 'workflow-enter' : ''}`} ref={ref} dir="rtl">
          {workflow.map(([title, body], i) => (
            <article className="workflow-step" key={title}>
              <div className="step-head"><span className="step-number mono">{String(i + 1).padStart(2, '0')}</span><span className="step-dot"><i /></span></div>
              <h3 className={i === 0 || i === 7 ? '' : 'latin'}>{title}</h3>
              <p>{body}</p>
              <div className="step-connector" />
            </article>
          ))}
        </div>
        <div className="workflow-foot"><span><CircleDot size={14} /> ORCHESTRATED SEQUENCE</span><span className="mono">EVIDENCE → CONTEXT → ASSESSMENT</span></div>
      </div>
    </section>
  );
}

function Collaboration() {
  const [count, setCount] = useState(4);
  const [running, setRunning] = useState(false);
  const interval = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearInterval(interval.current), []);
  const runSimulation = () => {
    if (running) return;
    setCount(0);
    setRunning(true);
    let index = 0;
    interval.current = window.setInterval(() => {
      index += 1;
      setCount(Math.min(index, simulatedEvents.length));
      if (index >= simulatedEvents.length) {
        window.clearInterval(interval.current);
        window.setTimeout(() => setRunning(false), 650);
      }
    }, 680);
  };
  return (
    <section id="collaboration" className="collab-section section-pad">
      <div className="section-wrap">
        <SectionHeading eyebrow="COLLABORATION CONSOLE / 05" title="التعاون المستقل" subtitle="يتفاوض الوكلاء ويتبادلون الأدلة للوصول إلى توافق." />
        <div className="simulation-warning" role="note"><ShieldAlert size={18} /><strong>محاكاة توضيحية للواجهة — لا يجري تحليل حقيقي</strong><span>كل سجل أدناه مثال تمثيلي فقط.</span></div>
        <div className="terminal-window" dir="ltr">
          <div className="terminal-bar">
            <div className="terminal-lights"><i /><i /><i /></div>
            <div className="terminal-title mono"><Terminal size={14} /> CYBERSHIELD / AGENT COLLABORATION</div>
            <span className="terminal-status"><i /> SIMULATED</span>
          </div>
          <div className="terminal-body">
            <div className="terminal-meta mono"><span>SESSION: DEMO-7A31</span><span>EXAMPLE STREAM · NOT LIVE</span></div>
            <div className="terminal-stream">
              {simulatedEvents.slice(0, count).map((event, i) => (
                <div className="terminal-row" key={event.actor} style={{ animationDelay: `${i * 30}ms` }}>
                  <span className="terminal-time mono">00:{String(12 + i * 2).padStart(2, '0')}.{String(14 + i * 7).padStart(2, '0')}</span>
                  <span className="terminal-actor mono" style={{ color: event.color }}>{event.actor}</span>
                  <span className="terminal-type">{event.type}</span>
                  <span className="terminal-message">{event.text}</span>
                  <Check className="terminal-check" size={14} />
                </div>
              ))}
              {!running && count === simulatedEvents.length && (
                <div className="consensus-block">
                  <div className="consensus-title"><span className="consensus-check"><Check size={15} /></span><strong>Consensus Reached</strong><span className="mono">ILLUSTRATIVE</span></div>
                  <div className="consensus-grid">
                    <span><small>Verdict</small><strong className="verdict">MALICIOUS</strong></span>
                    <span><small>Agents</small><strong>7 Agents</strong></span>
                    <span><small>Total</small><strong>8.4s</strong></span>
                    <span><small>Human Intervention</small><strong>0</strong></span>
                  </div>
                </div>
              )}
              {running && <div className="typing-line"><span /><span /><span /> SIMULATION IN PROGRESS</div>}
            </div>
            <div className="terminal-bottom"><span><i /> SAFE DEMONSTRATION MODE</span><button className="run-simulation" onClick={runSimulation} disabled={running} data-testid="button-run-simulation">{running ? 'جارٍ تشغيل المحاكاة' : count === simulatedEvents.length ? 'إعادة تشغيل المحاكاة' : 'تشغيل المحاكاة'} <ArrowRight size={14} /></button></div>
          </div>
        </div>
        <p className="sim-note" dir="rtl"><Shield size={14} /> هذه الواجهة محاكاة توضيحية فقط. لا يتم رفع ملفات أو الاتصال بمصادر أو تنفيذ أي تحليل فعلي.</p>
      </div>
    </section>
  );
}

function WhySection() {
  return (
    <section className="why-section section-pad">
      <div className="section-wrap">
        <div className="why-layout">
          <div className="why-copy" dir="rtl">
            <div className="eyebrow">THE DIFFERENCE / 06</div>
            <h2>لماذا يختلف<br /><em>CyberShield AI؟</em></h2>
            <p>الأدوات التقليدية تقوم بالكشف. أما CyberShield AI فيهدف إلى التحقيق والتحليل والمساعدة في الاستجابة من خلال التعاون بين الوكلاء.</p>
            <a href="#architecture" className="text-link">استكشف طريقة التنسيق <ArrowLeft size={16} /></a>
          </div>
          <div className="difference-list">
            {differentiators.map(({ icon: Icon, title, body }, i) => (
              <article className="difference-row" key={title} dir="rtl">
                <span className="difference-index mono">0{i + 1}</span><span className="difference-icon"><Icon size={19} /></span>
                <div><h3 className="latin">{title}</h3><p>{body}</p></div><ArrowUpRight className="difference-arrow" size={17} />
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section id="capabilities" className="capabilities-section section-pad">
      <div className="section-wrap">
        <SectionHeading eyebrow="PLATFORM CAPABILITIES / 07" title="مصمم للدفاع على مستوى المؤسسات" />
        <div className="capability-grid">
          {capabilities.map(({ icon: Icon, title, body }, i) => (
            <a className="capability-card" href="#technology" key={title} dir="rtl">
              <div className="capability-top"><span className="mono">CAP / 0{i + 1}</span><Icon size={20} /></div>
              <h3 className="latin">{title}</h3><p>{body}</p>
              <span className="learn-more">Learn more <ArrowUpRight size={13} /></span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function Technology() {
  return (
    <section id="technology" className="technology-section section-pad">
      <div className="section-wrap">
        <SectionHeading eyebrow="REFERENCE BLUEPRINT / 08" title="مجموعة التقنيات" subtitle="خيارات مرجعية مقترحة لبناء المنصة — لا تمثل تكاملات مهيأة أو مستخدمة حاليًا." light />
        <div className="stack-layout">
          <div className="stack-intro" dir="rtl"><span className="stack-mark"><Layers3 size={24} /></span><div className="eyebrow">REFERENCE STACK</div><h3>تصميم طبقي<br />لمنصة قابلة للتوسع.</h3><p>قائمة تقنية استرشادية للنقاش والتخطيط. لم يتم تهيئة أي من الخدمات الخارجية أو ربطها.</p><span className="planned-chip"><span /> PLANNED / NOT CONFIGURED</span></div>
          <div className="stack-layers">
            {stack.map(({ label, icon: Icon, items }, i) => (
              <div className="stack-row" key={label} dir="ltr">
                <div className="stack-label"><Icon size={16} /><span>{label}</span><small className="mono">LAYER 0{i + 1}</small></div>
                <div className="stack-items">{items.map((item) => <span className="stack-pill latin" key={item}>{item}</span>)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="stack-disclaimer"><LockKeyhole size={14} /> Reference / planned stack only. No services, APIs, or integrations are claimed as configured.</div>
      </div>
    </section>
  );
}

function Impact() {
  return (
    <section className="impact-section section-pad">
      <div className="section-wrap">
        <SectionHeading eyebrow="MEASUREMENT FRAMEWORK / 09" title="نتائج دفاعية قابلة للقياس" subtitle="مؤشرات مقترحة لتقييم الأثر عند توفر بيانات موثوقة." />
        <div className="impact-grid" dir="ltr">
          {METRICS.impact.map((metric, i) => (
            <article className="impact-card" key={metric.label} data-testid={`metric-impact-${i}`}>
              <span className="mono">INDICATOR / 0{i + 1}</span><strong className="latin">{metric.value}</strong><p className="latin">{metric.label}</p>
              <div className="impact-line"><i /></div>
            </article>
          ))}
        </div>
        <div className="placeholder-note impact-note" dir="rtl"><ShieldAlert size={17} /> قيم مؤقتة فقط — لا تمثل أداءً مثبتًا، وستظل كذلك حتى توفر بيانات وقياس فعلي موثوق.</div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="section-wrap">
        <div className="footer-main">
          <div className="footer-brand">
            <a href="#home" className="brand-link"><BrandMark /></a>
            <p dir="rtl">دفاع سيبراني منسق.<br />قرارات أوضح. إنسان في الحلقة.</p>
          </div>
          <div className="footer-nav">
            <div><span className="mono">EXPLORE</span><a href="#architecture">Architecture</a><a href="#agents">Agents</a><a href="#workflow">Workflow</a></div>
            <div><span className="mono">PLATFORM</span><a href="#capabilities">Capabilities</a><a href="#technology">Technology</a><a href="#collaboration">Simulation</a></div>
          </div>
          <a className="back-top" href="#home" aria-label="العودة إلى الأعلى"><ArrowUpRight size={19} /></a>
        </div>
        <div className="footer-bottom"><span>© 2026 CyberShield AI</span><span>نموذج تصوري لمنصة دفاع سيبراني متعددة الوكلاء.</span><span className="mono">BUILT FOR SECURITY OPERATIONS</span></div>
      </div>
    </footer>
  );
}

function App() {
  return (
    <div className="site-shell grain" dir="rtl">
      <Header />
      <main>
        <Hero />
        <Problem />
        <Architecture />
        <Agents />
        <WorkflowSection />
        <Collaboration />
        <WhySection />
        <Capabilities />
        <Technology />
        <Impact />
      </main>
      <Footer />
    </div>
  );
}

export default App;
