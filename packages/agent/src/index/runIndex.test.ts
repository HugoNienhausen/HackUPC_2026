import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { runIndex } from './runIndex.js';

const PETCLINIC = '/Users/hugonienhausen/Desktop/spring-petclinic-microservices';

describe('runIndex — PetClinic cross-service edge coverage', () => {
  it('emits at least one edge of each cross-service type and covers all 4 expected pairs', async () => {
    try {
      await fs.access(PETCLINIC);
    } catch {
      return;
    }
    const idx = await runIndex(PETCLINIC);
    const cross = idx.edges.filter((e) => e.from !== e.to);
    const types = new Set(cross.map((e) => e.type));
    expect(types).toContain('http');
    expect(types).toContain('gateway-route');
    expect(types).toContain('discovery');

    const pairs = new Set(cross.map((e) => `${e.from}->${e.to}`));
    expect(pairs).toContain('api-gateway->customers-service');
    expect(pairs).toContain('api-gateway->visits-service');
    expect(pairs).toContain('genai-service->vets-service');
    expect(pairs).toContain('genai-service->customers-service');
  });
});
