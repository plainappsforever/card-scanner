// Small persisted preferences (settings table): UI language, phone region, OCR languages, batch two-sided.
import { getSetting, setSetting } from '@/db/settings';
import type { Db } from '@/db/types';
import { deviceLanguageTags, LANGUAGE_PREFERENCES, resolveLanguage, setLanguage, type LanguagePreference } from '@/i18n';

export async function getLanguagePreference(db: Db): Promise<LanguagePreference> {
  const v = await getSetting(db, 'language');
  return (LANGUAGE_PREFERENCES as readonly string[]).includes(v ?? '') ? (v as LanguagePreference) : 'system';
}

export async function applyLanguagePreference(db: Db, pref?: LanguagePreference): Promise<void> {
  const p = pref ?? (await getLanguagePreference(db));
  if (pref) await setSetting(db, 'language', p);
  setLanguage(resolveLanguage(p, deviceLanguageTags()));
}

export async function getTwoSided(db: Db): Promise<boolean> {
  return (await getSetting(db, 'batch_two_sided')) === '1';
}
