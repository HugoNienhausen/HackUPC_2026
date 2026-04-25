import { describe, it, expect, vi } from 'vitest';
import { scopeUseCase } from './scopeUseCase.js';
import { LlmClient, type AnthropicLike } from './client.js';
import type { UseCase } from './discoverUseCases.js';

function fakeClient(payload: unknown): LlmClient {
  const fake: AnthropicLike = {
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      })),
    },
  };
  return new LlmClient({ client: fake, apiKey: 'test' });
}

const useCase: UseCase = {
  id: 'addPetToOwner',
  name: 'Add a pet to an owner',
  entryEndpoint: 'POST /owners/{ownerId}/pets',
  entryController: 'PetResource',
  entryMicroservice: 'customers-service',
  summary: 'Creates a pet under an existing owner.',
  complexity: 'single-service',
};

describe('scopeUseCase — JSON parsing and shape', () => {
  it('returns components, core, entities, endpoints, rationale', async () => {
    const client = fakeClient({
      components: [
        'org.x.customers.web.PetResource',
        'org.x.customers.model.Pet',
        'org.x.customers.model.PetRepository',
        'org.x.customers.web.PetRequest',
        'org.x.customers.model.Owner',
      ],
      core: [
        'org.x.customers.web.PetResource',
        'org.x.customers.model.Pet',
        'org.x.customers.model.PetRepository',
      ],
      entities: ['org.x.customers.model.Pet', 'org.x.customers.model.Owner'],
      endpoints: [{ method: 'POST', path: '/owners/{ownerId}/pets' }],
      rationale: 'Spine: PetResource.addPet -> save via PetRepository.',
    });

    const r = await scopeUseCase({
      useCase,
      classes: [],
      endpoints: [],
      edges: [],
      client,
    });

    expect(r).not.toBeNull();
    expect(r!.components).toHaveLength(5);
    expect(r!.core).toHaveLength(3);
    // Core MUST be a subset of components.
    for (const fqn of r!.core) expect(r!.components).toContain(fqn);
    expect(r!.entities).toHaveLength(2);
    expect(r!.endpoints[0]).toEqual({ method: 'POST', path: '/owners/{ownerId}/pets' });
    expect(r!.rationale).toContain('Spine');
  });

  it('drops core FQNs not in components (defensive)', async () => {
    const client = fakeClient({
      components: ['a.A', 'a.B'],
      core: ['a.A', 'a.NotInComponents'], // second one should be dropped
      entities: [],
      endpoints: [],
      rationale: '',
    });
    const r = await scopeUseCase({
      useCase,
      classes: [],
      endpoints: [],
      edges: [],
      client,
    });
    expect(r!.core).toEqual(['a.A']);
  });

  it('returns null when client is in --no-llm mode', async () => {
    const noLlm = new LlmClient({ noLlm: true });
    const r = await scopeUseCase({
      useCase,
      classes: [],
      endpoints: [],
      edges: [],
      client: noLlm,
    });
    expect(r).toBeNull();
  });
});
