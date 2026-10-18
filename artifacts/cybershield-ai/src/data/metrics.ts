// Editable illustrative values are centralized here. Do not replace placeholders or targets without measured evidence.
export const metrics = {
  hero: [
    { value: '6+1', label: { en: 'Agents', ar: 'وكلاء' }, note: { en: 'architecture count', ar: 'عدد مكونات البنية' } },
    { value: '<10s', label: { en: 'Investigation', ar: 'التحقيق' }, note: { en: 'target · illustrative', ar: 'هدف توضيحي' } },
    { value: '70%', label: { en: 'Faster Response', ar: 'استجابة أسرع' }, note: { en: 'target · illustrative', ar: 'هدف توضيحي' } },
    { value: '24/7', label: { en: 'Autonomous Defense', ar: 'دفاع مستقل' }, note: { en: 'capability concept', ar: 'تصور للقدرة' } },
  ],
  problem: [
    { value: 'XX%', label: { en: 'Unprocessed alerts', ar: 'تنبيهات غير مُعالجة' } },
    { value: 'XXK/day', label: { en: 'Security alerts per day', ar: 'تنبيه أمني يوميًا' } },
    { value: 'XX min', label: { en: 'Average investigation time', ar: 'متوسط وقت التحقيق' } },
    { value: 'XX%', label: { en: 'Time spent on triage', ar: 'وقت يُهدر في الفرز' } },
  ],
  impact: [
    { value: 'XX%', label: { en: 'Reduction in Investigation Time', ar: 'انخفاض وقت التحقيق' } },
    { value: 'XXx', label: { en: 'Faster Incident Response', ar: 'سرعة الاستجابة للحوادث' } },
    { value: 'XX', label: { en: 'Threat Visibility Improvement', ar: 'تحسن رؤية التهديدات' } },
    { value: 'X.X / 5', label: { en: 'Security Readiness Score', ar: 'درجة الجاهزية الأمنية' } },
  ],
} as const;
