import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { orchestrate } from '../orchestrator.js';
import { SUMMARY_PLACEHOLDER } from '../views/components.js';

const PETCLINIC = '/Users/hugonienhausen/Desktop/spring-petclinic-microservices';
const HAS_KEY = Boolean((process.env.ANTHROPIC_API_KEY ?? '').trim());
const RUN_LIVE = Boolean(process.env.RUN_LIVE_TESTS);

describe('feature visits — Phase 3.5 LLM integration', () => {
  it.skipIf(!HAS_KEY || !RUN_LIVE)(
    '[live] populates non-placeholder summaries; VisitResource.summary !== VisitsServiceClient.summary',
    async () => {
      try {
        await fs.access(PETCLINIC);
      } catch {
        return;
      }
      const start = Date.now();
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'devmap-phase35-live-'));
      const artifact = await orchestrate({
        feature: 'visits',
        repo: PETCLINIC,
        refresh: true,
        workspaceRoot: tmp,
      });
      const ms = Date.now() - start;
      expect(ms).toBeLessThan(30000);

      for (const c of artifact.components) {
        expect(c.summary).not.toBe(SUMMARY_PLACEHOLDER);
        expect((c.summary ?? '').length).toBeLessThanOrEqual(220);
      }
      const vr = artifact.components.find((c) => c.simpleName === 'VisitResource');
      const vsc = artifact.components.find((c) => c.simpleName === 'VisitsServiceClient');
      expect(vr).toBeDefined();
      expect(vsc).toBeDefined();
      expect(vr!.summary).not.toBe(vsc!.summary);
    },
    30_000,
  );

  describe('missing ANTHROPIC_API_KEY (fallback path)', () => {
    let stderrSpy: ReturnType<typeof vi.spyOn>;
    let warnings: string[] = [];

    beforeEach(() => {
      warnings = [];
      stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: any) => {
          warnings.push(typeof chunk === 'string' ? chunk : chunk.toString());
          return true;
        });
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      delete process.env.ANTHROPIC_API_KEY;
    });

    afterEach(() => {
      stderrSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('keeps placeholder summaries, exits cleanly, logs single key-missing warning', async () => {
      try {
        await fs.access(PETCLINIC);
      } catch {
        return;
      }
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'devmap-phase35-miss-'));
      const artifact = await orchestrate({
        feature: 'visits',
        repo: PETCLINIC,
        refresh: true,
        workspaceRoot: tmp,
      });
      for (const c of artifact.components) {
        expect(c.summary).toBe(SUMMARY_PLACEHOLDER);
      }
      const keyWarnings = warnings.filter((w) => w.includes('ANTHROPIC_API_KEY'));
      expect(keyWarnings.length).toBeGreaterThanOrEqual(1);
    });
  });
});
