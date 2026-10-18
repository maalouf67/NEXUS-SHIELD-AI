// Editable illustrative values are centralized here. Do not replace placeholders or targets without measured evidence.
export const metrics = {
  hero: [
    { value: '07', label: { en: 'Agent roles', ar: 'أدوار الوكلاء' }, note: { en: 'conceptual architecture', ar: 'بنية مفاهيمية' } },
    { value: '<10s', label: { en: 'Investigation', ar: 'التحقيق' }, note: { en: 'target only · not measured', ar: 'هدف فقط · غير مقاس' } },
    { value: '—', label: { en: 'Response improvement', ar: 'تحسن الاستجابة' }, note: { en: 'no verified result', ar: 'لا توجد نتيجة موثقة' } },
    { value: '24/7', label: { en: 'Autonomous defense', ar: 'دفاع مستقل' }, note: { en: 'capability concept', ar: 'تصور للقدرة' } },
  ],
  problem: [
    { value: 'XX%', label: { en: 'Unprocessed alerts', ar: 'تنبيهات غير مُعالجة' } },
    { value: 'XXK/day', label: { en: 'Security alerts per day', ar: 'تنبيه أمني يوميًا' } },
    { value: 'XX min', label: { en: 'Average investigation time', ar: 'متوسط وقت التحقيق' } },
    { value: 'XX%', label: { en: 'Time spent on triage', ar: 'وقت يُهدر في الفرز' } },
  ],
  impact: [
    { value: '—', label: { en: 'Investigation time', ar: 'وقت التحقيق' } },
    { value: '—', label: { en: 'Incident response', ar: 'الاستجابة للحوادث' } },
    { value: '—', label: { en: 'Threat visibility', ar: 'رؤية التهديدات' } },
    { value: '—', label: { en: 'Security readiness', ar: 'الجاهزية الأمنية' } },
  ],
} as const;
