import { TestBed } from '@angular/core/testing';
import { I18nService } from './translation.service';

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
