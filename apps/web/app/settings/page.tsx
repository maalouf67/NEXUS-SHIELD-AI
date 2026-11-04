'use client';
import Link from 'next/link';

import { useEffect, useState } from 'react';

type Language = 'en' | 'ar' | 'fr';
type Preferences = { productUpdates: boolean; optionalAnalytics: boolean };
const DEFAULT_PREFERENCES: Preferences = { productUpdates: false, optionalAnalytics: false };

const copy = {
  en: { title: 'Settings & Privacy Center', subtitle: 'Manage language and optional privacy preferences on this browser.', language: 'Application language', languageNote: 'Saved locally. Full dashboard translation is not yet wired across all screens.', privacy: 'Privacy preferences', updates: 'Optional product updates', analytics: 'Optional usage analytics', note: 'Both options are off by default. Preferences are stored in this browser only and do not currently activate server-side collection.', save: 'Save preferences', saved: 'Preferences saved in this browser.', links: 'Application information', license: 'Application license', policy: 'Privacy policy', help: 'Help center', contact: 'Contact us', back: 'Back to dashboard' },
  ar: { title: 'مركز الإعدادات والخصوصية', subtitle: 'إدارة اللغة والتفضيلات الاختيارية للخصوصية في هذا المتصفح.', language: 'لغة التطبيق', languageNote: 'يُحفظ الاختيار محلياً. لم تكتمل ترجمة جميع صفحات لوحة التحكم بعد.', privacy: 'تفضيلات الخصوصية', updates: 'تحديثات المنتج الاختيارية', analytics: 'تحليلات الاستخدام الاختيارية', note: 'الخياران متوقفان افتراضياً. تُحفظ التفضيلات في هذا المتصفح فقط ولا تُفعّل حالياً جمع البيانات من الخادم.', save: 'حفظ التفضيلات', saved: 'تم حفظ التفضيلات في هذا المتصفح.', links: 'معلومات التطبيق', license: 'ترخيص التطبيق', policy: 'سياسة الخصوصية', help: 'مركز المساعدة', contact: 'اتصل بنا', back: 'العودة إلى لوحة التحكم' },
  fr: { title: 'Centre des paramètres et de confidentialité', subtitle: 'Gérez la langue et les préférences facultatives dans ce navigateur.', language: 'Langue de l’application', languageNote: 'Le choix est enregistré localement. La traduction complète reste à intégrer.', privacy: 'Préférences de confidentialité', updates: 'Mises à jour facultatives', analytics: 'Analyses d’utilisation facultatives', note: 'Les deux options sont désactivées par défaut et enregistrées dans ce navigateur uniquement.', save: 'Enregistrer les préférences', saved: 'Préférences enregistrées dans ce navigateur.', links: 'Informations sur l’application', license: 'Licence de l’application', policy: 'Politique de confidentialité', help: 'Centre d’aide', contact: 'Nous contacter', back: 'Retour au tableau de bord' }
} as const;

export default function SettingsPage() {
  const [language, setLanguage] = useState<Language>('en');
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const storedLanguage = localStorage.getItem('nexus.language');
      if (storedLanguage === 'en' || storedLanguage === 'ar' || storedLanguage === 'fr') setLanguage(storedLanguage);
      const storedPreferences = localStorage.getItem('nexus.privacy.preferences');
      if (storedPreferences) {
        const parsed = JSON.parse(storedPreferences) as Partial<Preferences>;
        setPreferences({ productUpdates: parsed.productUpdates === true, optionalAnalytics: parsed.optionalAnalytics === true });
      }
    } catch {
      // Browser storage may be unavailable; safe defaults remain.
    }
  }, []);

  const t = copy[language];
  function savePreferences() {
    try {
      localStorage.setItem('nexus.language', language);
      localStorage.setItem('nexus.privacy.preferences', JSON.stringify(preferences));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }

  return (
    <main className="trust-center" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <header className="trust-header"><Link className="trust-brand" href="/">◈ NEXUS SHIELD AI</Link><Link href="/">{t.back}</Link></header>
      <section className="trust-hero"><div className="eyebrow">NEXUS · TRUST CENTER</div><h1>{t.title}</h1><p>{t.subtitle}</p></section>
      <section className="trust-card">
        <h2>{t.language}</h2>
        <select value={language} onChange={(event) => { setLanguage(event.target.value as Language); setSaved(false); }}>
          <option value="en">English</option><option value="ar">العربية</option><option value="fr">Français</option>
        </select>
        <p className="trust-muted">{t.languageNote}</p>
      </section>
      <section className="trust-card">
        <h2>{t.privacy}</h2>
        <label className="trust-toggle"><span>{t.updates}</span><input type="checkbox" checked={preferences.productUpdates} onChange={(event) => { setPreferences((old) => ({ ...old, productUpdates: event.target.checked })); setSaved(false); }} /></label>
        <label className="trust-toggle"><span>{t.analytics}</span><input type="checkbox" checked={preferences.optionalAnalytics} onChange={(event) => { setPreferences((old) => ({ ...old, optionalAnalytics: event.target.checked })); setSaved(false); }} /></label>
        <p className="trust-muted">{t.note}</p><button className="primary-button" onClick={savePreferences}>{t.save}</button>
        {saved ? <p role="status" className="trust-saved">{t.saved}</p> : null}
      </section>
      <section className="trust-card"><h2>{t.links}</h2><div className="trust-links"><Link href="/license">{t.license} ↗</Link><Link href="/privacy">{t.policy} ↗</Link><Link href="/help">{t.help} ↗</Link><Link href="/contact">{t.contact} ↗</Link></div></section>
    </main>
  );
}
