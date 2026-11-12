import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_LIMIT, PAGE_LIMIT_OPTIONS, newAuditSchema, normaliseUrl } from '../src';

describe('normaliseUrl', () => {
  it('adds https and keeps paths', () => {
    expect(normaliseUrl('example.com')).toBe('https://example.com/');
    expect(normaliseUrl('http://www.example.com/services')).toBe('http://www.example.com/services');
  });

  it('rejects input without a real hostname', () => {
    expect(normaliseUrl('')).toBeNull();
    expect(normaliseUrl('localhost')).toBeNull();
    expect(normaliseUrl('not a url')).toBeNull();
  });
});

describe('newAuditSchema', () => {
  it('offers five page-limit ranges up to 50', () => {
    expect(PAGE_LIMIT_OPTIONS.map((o) => o.value)).toEqual([10, 20, 30, 40, 50]);
  });

  it('applies defaults', () => {
    const parsed = newAuditSchema.parse({ url: 'example.com' });
    expect(parsed).toMatchObject({ url: 'https://example.com/', audience: 'client', pageLimit: DEFAULT_PAGE_LIMIT });
    expect(parsed.notifyEmail).toBeUndefined();
  });

  it('accepts form strings for page limit and email', () => {
    const parsed = newAuditSchema.parse({ url: 'example.com', pageLimit: '30', notifyEmail: 'team@example.com' });
    expect(parsed.pageLimit).toBe(30);
    expect(parsed.notifyEmail).toBe('team@example.com');
  });

  it('rejects page limits outside the list and bad emails', () => {
    expect(newAuditSchema.safeParse({ url: 'example.com', pageLimit: 500 }).success).toBe(false);
    expect(newAuditSchema.safeParse({ url: 'example.com', notifyEmail: 'nope' }).success).toBe(false);
    expect(newAuditSchema.safeParse({ url: '' }).success).toBe(false);
  });

  it('treats an empty email as not provided', () => {
    expect(newAuditSchema.parse({ url: 'example.com', notifyEmail: '' }).notifyEmail).toBeUndefined();
  });
});
