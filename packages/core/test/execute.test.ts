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
