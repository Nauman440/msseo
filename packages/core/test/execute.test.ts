import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeAudit, newAuditSchema, newAuditRecord, type AuditRecord } from '../src';

const env = { dataforseo: { login: 'l', password: 'p', baseUrl: 'https://api.example.test' }, brand: 'B' };

describe('executeAudit', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('saves a readable failure instead of throwing when the site cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const record = newAuditRecord(newAuditSchema.parse({ url: 'https://unreachable.example.test/' }), 'user-1');
    const saved: AuditRecord[] = [];
    await executeAudit(record, env, async (r) => {
      saved.push(structuredClone(r));
    });
    expect(record.status).toBe('failed');
    expect(record.error).toMatch(/Could not reach a service/);
    expect(record.finishedAt).toBeTruthy();
    expect(record.createdById).toBe('user-1');
    // First save is the reset "running" state, the last one the failure.
    expect(saved[0]?.status).toBe('running');
    expect(saved.at(-1)?.status).toBe('failed');
    // Usage is recorded even for a failed audit (no paid calls happened here).
    expect(record.usage).toEqual([]);
  });

  it('explains an address that does not exist instead of "fetch failed"', async () => {
    const dns = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND', hostname: 'callmewallah.com' } });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(dns)));
    const record = newAuditRecord(newAuditSchema.parse({ url: 'https://callmewallah.com/' }));
    await executeAudit(record, env, async () => undefined);
    expect(record.error).toBe('The website address could not be found (callmewallah.com): the domain has no DNS record. Check the spelling, or whether the domain has expired.');
  });

  it('resets a record that is being retried after a worker restart', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const record = newAuditRecord(newAuditSchema.parse({ url: 'https://unreachable.example.test/' }));
    record.progress = 64;
    record.steps[0]!.state = 'done';
    let first: AuditRecord | undefined;
    await executeAudit(record, env, async (r) => {
      first ??= structuredClone(r);
    });
    expect(first?.progress).toBe(0);
    expect(first?.steps.every((s) => s.state === 'queued')).toBe(true);
  });
});
