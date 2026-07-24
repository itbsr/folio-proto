import { describe, expect, it } from 'vitest';
import { getInitialLang } from '../src/lib/lang';

describe('getInitialLang', () => {
  it('returns jp for Japanese browser locales', () => {
    expect(getInitialLang('ja')).toBe('jp');
    expect(getInitialLang('ja-JP')).toBe('jp');
  });

  it('is case-insensitive', () => {
    expect(getInitialLang('JA-JP')).toBe('jp');
  });

  it('returns en for non-Japanese locales', () => {
    expect(getInitialLang('en')).toBe('en');
    expect(getInitialLang('en-US')).toBe('en');
    expect(getInitialLang('fr-FR')).toBe('en');
    expect(getInitialLang('zh-CN')).toBe('en');
  });
});
