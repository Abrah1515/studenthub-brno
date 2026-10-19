import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { contentSources } from '@/lib/sources/registry';
import { fetchSourcePayload } from '@/lib/sources/payload';
import { runConnector } from '@/lib/sources/connectors';
import { currentAcademicYear, inspectConnectorResult, SourceBlockedError } from '@/lib/sources/validation';

// Read-only audit: completing this test does NOT mean all sources are available.
// Every source has its own explicit outcome in the saved report.
it.runIf(process.env.RUN_ACADEMIC_AUDIT === 'true')('records actual status of every registered academic source without publishing', async () => {
  const selectedIds = process.env.ACADEMIC_AUDIT_SOURCE_IDS?.split(',').filter(Boolean);
  const discoveryProbe = process.env.ACADEMIC_AUDIT_DISCOVERY_PROBE === 'true';
  const sources = contentSources.filter(source => source.enabled && source.sourceType === 'academic_calendar' && (!selectedIds || selectedIds.includes(source.id)));
  const results: Array<Record<string, unknown>> = [];
  const blockedPolicies = new Map<string, SourceBlockedError>();
  let index = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (index < sources.length) {
      const registered = sources[index++];
      const source = discoveryProbe ? { ...registered, parserKey: 'linked-document-review', monitoringMode: 'automatic_review' as const } : registered;
      const row: Record<string, unknown> = { id: source.id, city: source.cityId, university: source.universityId, faculty: source.facultyId, url: source.sourceUrl, mode: source.monitoringMode, checkedAt: new Date().toISOString() };
      try {
        const policyKey = new URL(source.sourceUrl).origin;
        const blocked = blockedPolicies.get(policyKey); if (blocked) throw blocked;
        const payload = await fetchSourcePayload(source, {}, new Date());
        const parsed = await runConnector({ source: payload.effectiveSource, body: payload.fetched.body, contentType: payload.fetched.contentType, checkedAt: String(row.checkedAt) });
        const issue = inspectConnectorResult(payload.effectiveSource, parsed, new Date());
        Object.assign(row, { status: issue ? 'NEEDS_REVIEW' : 'OK', http: payload.fetched.status, finalUrl: payload.fetched.finalUrl, events: parsed.events.length, currentYearEvents: parsed.events.filter(event => event.academicYear === currentAcademicYear()).length, issue: issue?.code, detail: issue?.message });
      } catch (error) {
        const issue = error instanceof SourceBlockedError ? error.issue : null;
        if (error instanceof SourceBlockedError && issue?.code === 'challenge' && error.metadata.finalUrl?.includes('/robots.txt')) blockedPolicies.set(new URL(source.sourceUrl).origin, error);
        Object.assign(row, { status: issue?.status === 'blocked' ? 'BLOCKED' : issue ? 'NEEDS_REVIEW' : 'TEMPORARY', issue: issue?.code || 'network_or_document', detail: issue?.message || (error instanceof Error ? error.message : 'Unknown error') });
      }
      results.push(row);
      console.info('ACADEMIC_SOURCE', JSON.stringify(row));
    }
  }));
  const counts = Object.fromEntries(['OK', 'TEMPORARY', 'BLOCKED', 'NEEDS_REVIEW'].map(status => [status, results.filter(row => row.status === status).length]));
  await mkdir('artifacts/release-2026-10-19', { recursive: true });
  const suffix = discoveryProbe ? '-discovery-probe' : selectedIds ? '-targeted' : '';
  await writeFile(`artifacts/release-2026-10-19/academic-sources${suffix}.json`, JSON.stringify({ at: new Date().toISOString(), counts, results }, null, 2));
  console.info('ACADEMIC_AUDIT_COUNTS', JSON.stringify(counts));
  expect(results).toHaveLength(sources.length);
}, 900_000);
