// Public-facing metrics stay centralized. Replace placeholders only with sourced measurements.
export const metrics = {
  hero: [
    { value: '07', label: { en: 'AI agent roles', ar: 'أدوار للوكلاء' }, note: { en: 'architecture concept', ar: 'بنية تصورية' } },
    { value: '<10s', label: { en: 'Investigation target', ar: 'هدف زمن التحقيق' }, note: { en: 'target · not measured', ar: 'هدف · غير مقاس' } },
    { value: '24/7', label: { en: 'Autonomous monitoring', ar: 'مراقبة ذاتية' }, note: { en: 'concept · not live', ar: 'تصور · غير مباشر' } },
    { value: '∞', label: { en: 'Collaborative context', ar: 'سياق تعاوني' }, note: { en: 'architecture concept', ar: 'تصور للبنية' } },
  ],
  problem: [
    { value: 'XX%', label: { en: 'Unprocessed alerts', ar: 'تنبيهات غير مُعالجة' } },
    { value: 'XXK/day', label: { en: 'Security alerts per day', ar: 'تنبيه أمني يوميًا' } },
    { value: 'XX min', label: { en: 'Average investigation time', ar: 'متوسط وقت التحقيق' } },
    { value: 'XX%', label: { en: 'Time spent on triage', ar: 'وقت يُهدر في الفرز' } },
  ],
  impact: [
    { value: 'XX%', label: { en: 'Reduction in investigation time', ar: 'انخفاض زمن التحقيق' } },
    { value: 'XX×', label: { en: 'Faster incident response', ar: 'تسريع الاستجابة للحوادث' } },
    { value: 'XX', label: { en: 'Threat visibility improvement', ar: 'تحسن رؤية التهديدات' } },
    { value: 'X.X / 5', label: { en: 'Security readiness score', ar: 'درجة الجاهزية الأمنية' } },
  ],
} as const;
