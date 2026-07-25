export type Lang = 'jp' | 'en';

export function getInitialLang(browserLanguage: string): Lang {
  return browserLanguage.toLowerCase().startsWith('ja') ? 'jp' : 'en';
}
