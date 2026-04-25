import { describe, it, expect } from 'vitest';
import { buildEvents } from './events.js';
import { EventsSchema } from '@devmap/schema';

describe('events — placeholder block', () => {
  it('returns detected:false + scannedPatterns + placeholderMessage; validates against schema', () => {
    const e = buildEvents();
    expect(e.detected).toBe(false);
    expect(e.scannedPatterns.length).toBeGreaterThanOrEqual(8);
    expect(e.scannedPatterns).toContain('@KafkaListener');
    expect(e.scannedPatterns).toContain('@RabbitListener');
    expect(e.placeholderMessage).toMatch(/No asynchronous messaging/);
    expect(EventsSchema.safeParse(e).success).toBe(true);
  });
});
