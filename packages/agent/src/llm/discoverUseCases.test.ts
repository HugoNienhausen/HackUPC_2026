import { describe, it, expect, vi } from 'vitest';
import { discoverUseCases } from './discoverUseCases.js';
import { LlmClient, type AnthropicLike } from './client.js';
import type { ClassRecord, Edge as IndexEdge } from '../index/types.js';

function fakeClient(payload: unknown): { client: LlmClient; calls: number } {
  const state = { calls: 0 };
  const fake: AnthropicLike = {
    messages: {
      create: vi.fn(async () => {
        state.calls++;
        return {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
        };
      }),
    },
  };
  const client = new LlmClient({ client: fake, apiKey: 'test' });
  return { client, calls: state.calls };
}

const empty: { classes: ClassRecord[]; edges: IndexEdge[] } = {
  classes: [],
  edges: [],
};

describe('discoverUseCases — JSON parsing and shape', () => {
  it('returns sanitized use-cases with sensible defaults', async () => {
    const { client } = fakeClient({
      useCases: [
        {
          id: 'addPetToOwner',
          name: 'Add a pet to an owner',
          entryEndpoint: 'POST /api/customer/owners/{ownerId}/pets',
          entryController: 'PetResource',
          entryMicroservice: 'customers-service',
          summary: 'Creates a pet under an existing owner.',
          complexity: 'single-service',
        },
        {
          id: 'getOwnerDetailsWithPetsAndVisits',
          name: 'Get owner with pets and visits',
          entryEndpoint: 'GET /api/gateway/owners/{ownerId}',
          entryController: 'ApiGatewayController',
          entryMicroservice: 'api-gateway',
          summary: 'Aggregates customer + visits service data.',
          complexity: 'cross-service',
        },
      ],
    });

    const result = await discoverUseCases({
      ...empty,
      microservices: [{ name: 'api-gateway' }, { name: 'customers-service' }],
      endpoints: [],
      client,
    });
    expect(result).not.toBeNull();
    expect(result!.useCases).toHaveLength(2);
    expect(result!.useCases[0]!.id).toBe('addPetToOwner');
    expect(result!.useCases[1]!.complexity).toBe('cross-service');
  });

  it('drops malformed entries (missing id/name/entryEndpoint/entryController)', async () => {
    const { client } = fakeClient({
      useCases: [
        { id: 'good', name: 'Good', entryEndpoint: 'GET /x', entryController: 'X', entryMicroservice: 'a', summary: '', complexity: 'single-service' },
        { id: '', name: 'No id', entryEndpoint: 'GET /y', entryController: 'Y' },
        { name: 'Missing id field', entryEndpoint: 'GET /z', entryController: 'Z' },
        { id: 'no-endpoint', name: 'No endpoint', entryEndpoint: '', entryController: 'Q' },
      ],
    });
    const r = await discoverUseCases({ ...empty, microservices: [], endpoints: [], client });
    expect(r!.useCases.map((u) => u.id)).toEqual(['good']);
  });

  it('caps the output at 20 use-cases and dedupes by id', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: i < 5 ? 'duplicateId' : `uc${i}`,
      name: `Use case ${i}`,
      entryEndpoint: `GET /x${i}`,
      entryController: 'X',
      entryMicroservice: 'a',
      summary: '',
      complexity: 'single-service',
    }));
    const { client } = fakeClient({ useCases: many });
    const r = await discoverUseCases({ ...empty, microservices: [], endpoints: [], client });
    expect(r!.useCases.length).toBe(20);
    const ids = r!.useCases.map((u) => u.id);
    const dupCount = ids.filter((x) => x === 'duplicateId').length;
    expect(dupCount).toBe(1);
  });

  it('returns null when client is in --no-llm mode', async () => {
    const noLlm = new LlmClient({ noLlm: true });
    const r = await discoverUseCases({ ...empty, microservices: [], endpoints: [], client: noLlm });
    expect(r).toBeNull();
  });
});
