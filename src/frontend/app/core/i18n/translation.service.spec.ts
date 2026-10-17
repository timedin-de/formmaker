import { TestBed } from '@angular/core/testing';
import { I18nService, loadTranslations, TRANSLATIONS_CACHE_PREFIX } from './translation.service';

describe('loadTranslations', () => {
  const key = TRANSLATIONS_CACHE_PREFIX + 'de';

  beforeEach(() => localStorage.clear());

  it('caches the dictionary per build version', async () => {
    const dict = await loadTranslations('de', 'build-1');
    expect(dict['app.forms']).toBe('Formulare');
    expect(JSON.parse(localStorage.getItem(key) ?? '')).toEqual({ version: 'build-1', dict });
  });

  it('serves a cached dictionary from the same build', async () => {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 'build-1', dict: { 'app.forms': 'cached' } }),
    );
    expect((await loadTranslations('de', 'build-1'))['app.forms']).toBe('cached');
  });

  it('ignores a dictionary cached by another build', async () => {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 'build-0', dict: { 'app.forms': 'stale' } }),
    );
    expect((await loadTranslations('de', 'build-1'))['app.forms']).toBe('Formulare');
    expect(JSON.parse(localStorage.getItem(key) ?? '').version).toBe('build-1');
  });

  it('ignores a malformed cache entry', async () => {
    localStorage.setItem(key, '{"version":"build-1","dict":[1]}');
    expect((await loadTranslations('de', 'build-1'))['app.forms']).toBe('Formulare');
  });

  it('does not cache without a build version', async () => {
    await loadTranslations('de', null);
    expect(localStorage.getItem(key)).toBeNull();
  });
});

describe('I18nService', () => {
  let i18n: I18nService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    i18n = TestBed.inject(I18nService);
  });

  it('returns the key until a dictionary is loaded', () => {
    expect(i18n.t('app.forms')).toBe('app.forms');
  });

  it('loads the requested language on demand', async () => {
    await i18n.setLang('de');
    expect(i18n.lang()).toBe('de');
    expect(i18n.t('app.forms')).toBe('Formulare');
    expect(localStorage.getItem('formmaker.lang')).toBe('de');

    await i18n.setLang('en');
    expect(i18n.t('app.forms')).toBe('Forms');
  });

  it('interpolates params', async () => {
    await i18n.setLang('en');
    expect(i18n.t('pdf.receipt', { name: 'Demo' })).toBe('Demo-receipt');
  });

  it('keeps the last requested language when switches overlap', async () => {
    await Promise.all([i18n.setLang('de'), i18n.setLang('en')]);
    expect(i18n.lang()).toBe('en');
    expect(i18n.t('app.forms')).toBe('Forms');
  });

  it('init does not persist the language', async () => {
    await i18n.init();
    expect(localStorage.getItem('formmaker.lang')).toBeNull();
    expect(i18n.t('app.forms')).not.toBe('app.forms');
  });
});
