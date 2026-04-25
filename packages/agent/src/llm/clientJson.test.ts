import { describe, it, expect, vi } from 'vitest';
import { LlmClient, type AnthropicLike } from './client.js';

function mockClient(
  impl: AnthropicLike['messages']['create'],
): { client: AnthropicLike; calls: () => number } {
  const fn = vi.fn(impl);
  return {
    client: { messages: { create: fn } } as AnthropicLike,
    calls: () => fn.mock.calls.length,
  };
}

describe('LlmClient.completeJson', () => {
  it('parses a clean JSON response', async () => {
    const m = mockClient(async () => ({
      content: [{ type: 'text', text: '{"a": 1, "b": "two"}' }],
    }));
    const c = new LlmClient({ client: m.client });
    const out = await c.completeJson<{ a: number; b: string }>({
      model: 'judgment',
      user: 'go',
    });
    expect(out).toEqual({ a: 1, b: 'two' });
    expect(m.calls()).toBe(1);
  });

  it('strips ```json fences before parsing', async () => {
    const m = mockClient(async () => ({
      content: [
        {
          type: 'text',
          text: '```json\n{"x": [1,2,3]}\n```',
        },
      ],
    }));
    const c = new LlmClient({ client: m.client });
    const out = await c.completeJson<{ x: number[] }>({
      model: 'judgment',
      user: 'go',
    });
    expect(out).toEqual({ x: [1, 2, 3] });
  });

  it('retries ONCE with "Return ONLY valid JSON" appendix on parse failure', async () => {
    let n = 0;
    const m = mockClient(async (params: any) => {
      n++;
      if (n === 1) return { content: [{ type: 'text', text: 'sure thing! {"ok": true}' }] };
      const userMsg: string = params.messages[0].content;
      // confirm the second call appended the strict instruction
      expect(userMsg).toMatch(/Return ONLY valid JSON/);
      return { content: [{ type: 'text', text: '{"ok": true}' }] };
    });
    const c = new LlmClient({ client: m.client });
    const out = await c.completeJson<{ ok: boolean }>({
      model: 'judgment',
      user: 'go',
    });
    expect(out).toEqual({ ok: true });
    expect(m.calls()).toBe(2);
  });

  it('throws after retry if response is still non-JSON', async () => {
    const m = mockClient(async () => ({
      content: [{ type: 'text', text: 'still talking, no JSON here' }],
    }));
    const c = new LlmClient({ client: m.client });
    await expect(
      c.completeJson({ model: 'judgment', user: 'go' }),
    ).rejects.toThrow(/non-JSON after retry/);
  });

  it('returns null when LLM is disabled (no-llm)', async () => {
    const c = new LlmClient({ noLlm: true });
    expect(await c.completeJson({ model: 'judgment', user: 'go' })).toBeNull();
  });
});
