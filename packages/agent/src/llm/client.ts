import Anthropic from '@anthropic-ai/sdk';

// Verified at https://platform.claude.com/docs/en/about-claude/models/overview
// on 2026-04-25. Sonnet 4.6 has no separate snapshot; Haiku 4.5 is pinned to
// the 20251001 snapshot for stable hackathon-week behavior.
export const MODELS = {
  judgment: 'claude-sonnet-4-6',
  summary: 'claude-haiku-4-5-20251001',
} as const;

export type ModelKey = keyof typeof MODELS;

export interface MessageBlock {
  text: string;
  cache?: boolean;
}

export interface CompleteOptions {
  model: ModelKey;
  system?: string;
  cachedSystem?: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AnthropicLike {
  messages: {
    create: (params: unknown) => Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

export interface LlmClientOptions {
  noLlm?: boolean;
  apiKey?: string;
  client?: AnthropicLike;
  maxRetries?: number;
  baseDelayMs?: number;
  warn?: (msg: string) => void;
}

export class LlmClient {
  private readonly noLlm: boolean;
  private readonly client: AnthropicLike | null;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly warn: (msg: string) => void;
  private warnedNoKey = false;

  constructor(opts: LlmClientOptions = {}) {
    this.noLlm = opts.noLlm ?? false;
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.warn = opts.warn ?? ((m) => process.stderr.write(m + '\n'));

    if (this.noLlm) {
      this.client = null;
      return;
    }

    if (opts.client) {
      this.client = opts.client;
      return;
    }

    const key = (opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '').trim();
    if (!key) {
      if (!this.warnedNoKey) {
        this.warn(
          '[devmap] ANTHROPIC_API_KEY is not set — LLM calls will be skipped and placeholders kept. Add it to .env or export it in your shell.',
        );
        this.warnedNoKey = true;
      }
      this.client = null;
      return;
    }

    this.client = new Anthropic({ apiKey: key }) as unknown as AnthropicLike;
  }

  /** True iff a real Anthropic call would be issued by complete(). */
  isLive(): boolean {
    return this.client !== null;
  }

  /** Returns null when LLM is disabled (--no-llm or missing key). */
  async complete(opts: CompleteOptions): Promise<string | null> {
    if (!this.client) return null;

    const systemBlocks: Array<Record<string, unknown>> = [];
    if (opts.cachedSystem) {
      systemBlocks.push({
        type: 'text',
        text: opts.cachedSystem,
        cache_control: { type: 'ephemeral' },
      });
    }
    if (opts.system) {
      systemBlocks.push({ type: 'text', text: opts.system });
    }

    const params: Record<string, unknown> = {
      model: MODELS[opts.model],
      max_tokens: opts.maxTokens ?? 256,
      messages: [{ role: 'user', content: opts.user }],
    };
    if (systemBlocks.length > 0) params.system = systemBlocks;
    if (opts.temperature !== undefined) params.temperature = opts.temperature;

    let attempt = 0;
    let lastError: unknown = null;
    while (attempt < this.maxRetries) {
      try {
        const res = await this.client.messages.create(params);
        const text = (res.content ?? [])
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('')
          .trim();
        return text;
      } catch (err) {
        lastError = err;
        if (!isRateLimitError(err)) throw err;
        attempt++;
        if (attempt >= this.maxRetries) break;
        const delay = this.baseDelayMs * 2 ** (attempt - 1);
        await sleep(delay);
      }
    }
    throw lastError;
  }
}

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; statusCode?: number };
  const code = e.status ?? e.statusCode;
  return code === 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
