import { describe, expect, it } from 'vitest';
import { hostTargets, inSite, matchGscProperties, siteFolder, siteHost, siteKey, siteLabel, siteUrl } from '../src';

describe('site keys', () => {
  it('keeps the host for root websites and adds the folder for websites in a folder', () => {
    expect(siteKey('https://www.Example.com/')).toBe('example.com');
    expect(siteKey('example.com')).toBe('example.com');
    expect(siteKey('https://example.com')).toBe('example.com');
    expect(siteKey('https://awais.mssoftsites.com/srm/')).toBe('awais.mssoftsites.com~srm');
    expect(siteKey('https://awais.mssoftsites.com/elementor/')).toBe('awais.mssoftsites.com~elementor');
    expect(siteKey('https://example.com/shop/en/')).toBe('example.com~shop~en');
    // A page address (no trailing slash) is not a folder website.
    expect(siteKey('https://example.com/srm/about')).toBe('example.com');
    // Keys are returned as they are.
    expect(siteKey('awais.mssoftsites.com~srm')).toBe('awais.mssoftsites.com~srm');
  });

  it('two folders of one host are two websites that never share pages', () => {
    const srm = siteKey('https://awais.mssoftsites.com/srm/');
    const el = siteKey('https://awais.mssoftsites.com/elementor/');
    expect(srm).not.toBe(el);
    expect(inSite('https://awais.mssoftsites.com/srm/about/', srm)).toBe(true);
    expect(inSite('https://awais.mssoftsites.com/srm', srm)).toBe(true);
    expect(inSite('https://awais.mssoftsites.com/elementor/about/', srm)).toBe(false);
    expect(inSite('https://awais.mssoftsites.com/srmx/', srm)).toBe(false);
    expect(inSite('https://www.example.com/anything', 'example.com')).toBe(true);
  });

  it('turns a key back into its host, folder, address and label', () => {
    expect(siteHost('awais.mssoftsites.com~srm')).toBe('awais.mssoftsites.com');
    expect(siteFolder('example.com~shop~en')).toBe('shop/en');
    expect(siteUrl('awais.mssoftsites.com~srm')).toBe('https://awais.mssoftsites.com/srm/');
    expect(siteUrl('example.com')).toBe('https://example.com/');
    expect(siteLabel('awais.mssoftsites.com~srm')).toBe('awais.mssoftsites.com/srm');
  });

  it('sends DataForSEO the host, never a folder key', () => {
    expect(hostTargets({ target: 'awais.mssoftsites.com~srm', limit: 10 })).toEqual({ target: 'awais.mssoftsites.com', limit: 10 });
    expect(hostTargets({ targets: { 1: 'a.com~x', 2: 'b.com' }, exclude_targets: ['a.com~x'] })).toEqual({ targets: { 1: 'a.com', 2: 'b.com' }, exclude_targets: ['a.com'] });
    expect(hostTargets({ keyword: 'site:a.com~x' })).toEqual({ keyword: 'site:a.com' });
    expect(hostTargets({ keyword: 'ac repair' })).toEqual({ keyword: 'ac repair' });
  });

  it('matches Search Console properties by folder', () => {
    const props = ['sc-domain:mssoftsites.com', 'https://awais.mssoftsites.com/elementor/', 'https://awais.mssoftsites.com/srm/', 'https://awais.mssoftsites.com/'];
    expect(matchGscProperties(props, siteUrl('awais.mssoftsites.com~srm'))).toEqual(['https://awais.mssoftsites.com/srm/', 'sc-domain:mssoftsites.com', 'https://awais.mssoftsites.com/']);
    expect(matchGscProperties(props, siteUrl('awais.mssoftsites.com~elementor'))[0]).toBe('https://awais.mssoftsites.com/elementor/');
    expect(matchGscProperties(props, siteUrl('awais.mssoftsites.com~srm'))).not.toContain('https://awais.mssoftsites.com/elementor/');
  });
});
