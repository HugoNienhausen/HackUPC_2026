import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LlmClient, MODELS, type AnthropicLike } from './client.js';

class RateLimitError extends Error {
  status = 429;
  constructor() {
    super('rate limited');
  }
}

function mockClient(
  impl: AnthropicLike['messages']['create'],
): { client: AnthropicLike; calls: () => number } {
  const fn = vi.fn(impl);
  return {
    client: { messages: { create: fn } } as AnthropicLike,
    calls: () => fn.mock.calls.length,
  };
}

const okResponse = { content: [{ type: 'text', text: 'a summary' }] };

describe('LlmClient', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) successful call returns text content', async () => {
    const m = mockClient(async () => okResponse);
    const c = new LlmClient({ client: m.client });
    const out = await c.complete({ model: 'summary', user: 'hi' });
    expect(out).toBe('a summary');
    expect(m.calls()).toBe(1);
  });

  it('(b) 429 retry succeeds on second attempt', async () => {
    let n = 0;
    const m = mockClient(async () => {
      n++;
      if (n < 2) throw new RateLimitError();
      return okResponse;
    });
    const c = new LlmClient({ client: m.client, baseDelayMs: 1 });
    const out = await c.complete({ model: 'summary', user: 'hi' });
    expect(out).toBe('a summary');
    expect(m.calls()).toBe(2);
  });

  it('(c) 3-retry cap then throws', async () => {
    const m = mockClient(async () => {
      throw new RateLimitError();
    });
    const c = new LlmClient({ client: m.client, baseDelayMs: 1, maxRetries: 3 });
    await expect(c.complete({ model: 'summary', user: 'hi' })).rejects.toThrow(/rate limited/);
    expect(m.calls()).toBe(3);
  });

  it('(d) --no-llm short-circuit returns null without calling SDK', async () => {
    const m = mockClient(async () => okResponse);
    const c = new LlmClient({ client: m.client, noLlm: true });
    expect(c.isLive()).toBe(false);
    expect(await c.complete({ model: 'summary', user: 'hi' })).toBeNull();
    expect(m.calls()).toBe(0);
  });

  it('(e) missing API key: warns once on stderr, isLive()===false, complete() returns null', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    delete process.env.ANTHROPIC_API_KEY;
    const warnSpy = vi.fn();
    const c = new LlmClient({ warn: warnSpy });
    expect(c.isLive()).toBe(false);
    expect(await c.complete({ model: 'summary', user: 'x' })).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toMatch(/ANTHROPIC_API_KEY/);
    vi.unstubAllEnvs();
  });

  it('cachedSystem is sent with cache_control: ephemeral', async () => {
    let captured: any = null;
    const m = mockClient(async (p) => {
      captured = p;
      return okResponse;
    });
    const c = new LlmClient({ client: m.client });
    await c.complete({ model: 'summary', user: 'hi', cachedSystem: 'CACHED' });
    expect(captured.system).toBeDefined();
    expect(captured.system[0]).toMatchObject({
      type: 'text',
      text: 'CACHED',
      cache_control: { type: 'ephemeral' },
    });
  });

  it('non-429 errors are NOT retried (e.g. 400 bubbles up immediately)', async () => {
    const err = Object.assign(new Error('bad request'), { status: 400 });
    const m = mockClient(async () => {
      throw err;
    });
    const c = new LlmClient({ client: m.client, baseDelayMs: 1 });
    await expect(c.complete({ model: 'summary', user: 'hi' })).rejects.toThrow(/bad request/);
    expect(m.calls()).toBe(1);
  });

  it('MODELS constant carries the verified IDs', () => {
    expect(MODELS.judgment).toBe('claude-sonnet-4-6');
    expect(MODELS.summary).toBe('claude-haiku-4-5-20251001');
  });
});
