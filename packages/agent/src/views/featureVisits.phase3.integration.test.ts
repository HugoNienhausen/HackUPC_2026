import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { orchestrate } from '../orchestrator.js';
import { FeatureSchema } from '@devmap/schema';

const PETCLINIC = '/Users/hugonienhausen/Desktop/spring-petclinic-microservices';

describe('feature visits — Phase 3 integration (full feature.json)', () => {
  it('produces a schema-valid artifact hitting every PLAN.md §2 acceptance bullet', async () => {
    try {
      await fs.access(PETCLINIC);
    } catch {
      return;
    }
    const start = Date.now();
    const artifact = await orchestrate({
      feature: 'visits',
      repo: PETCLINIC,
    });
    const ms = Date.now() - start;

    expect(FeatureSchema.safeParse(artifact).success).toBe(true);
    expect(ms).toBeLessThan(8000);

    expect(artifact.components.length).toBeGreaterThanOrEqual(6);
    const componentNames = artifact.components.map((c) => c.simpleName);
    expect(componentNames).not.toContain('MetricConfig');
    expect(componentNames.every((n) => !n.endsWith('Application'))).toBe(true);

    expect(artifact.persistence.entities.length).toBeGreaterThanOrEqual(1);
    const visit = artifact.persistence.entities.find((e) => e.simpleName === 'Visit');
    expect(visit).toBeDefined();
    expect(visit!.table).toBe('visits');
    const petId = visit!.fields.find((f) => f.name === 'petId');
    expect(petId?.relation).toEqual({
      kind: 'ForeignKeyByValue',
      target: 'Pet (customers-service)',
      joinColumn: 'pet_id',
    });

    expect(artifact.endpoints.length).toBeGreaterThanOrEqual(3);
    const visitGateway = artifact.endpoints.find(
      (e) => e.gatewayPath === '/api/visit/pets/visits',
    );
    expect(visitGateway).toBeDefined();

    const gatewayToVisits = artifact.dependencies.edges.find(
      (e) =>
        e.type === 'gateway-route' && e.from === 'api-gateway' && e.to === 'visits-service',
    );
    expect(gatewayToVisits).toBeDefined();

    expect(artifact.events.detected).toBe(false);

    const csc = artifact.components.find((c) => c.simpleName === 'CustomersServiceClient');
    expect(csc?.core).toBe(false);

    expect(artifact.persistence.operations.length).toBeGreaterThanOrEqual(2);
    const findByPetId = artifact.persistence.operations.find((o) =>
      o.method.startsWith('findByPetId('),
    );
    expect(findByPetId?.inferredSql).toContain('WHERE v.pet_id = ?');
  });
});
