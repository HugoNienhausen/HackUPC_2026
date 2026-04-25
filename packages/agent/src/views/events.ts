import type { EventsSchema } from '@devmap/schema';
import type { z } from 'zod';

type Events = z.infer<typeof EventsSchema>;

const SCANNED_PATTERNS = [
  '@KafkaListener',
  'KafkaTemplate',
  '@RabbitListener',
  'RabbitTemplate',
  '@JmsListener',
  'JmsTemplate',
  '@StreamListener',
  '@EnableBinding',
  'StreamBridge',
  'ApplicationEventPublisher',
  '@EventListener (excluding lifecycle)',
];

const PLACEHOLDER_MESSAGE =
  'No asynchronous messaging detected. All inter-service communication is synchronous HTTP via the api-gateway. The only @EventListener match is a startup lifecycle hook in genai-service (VectorStoreController.loadVetDataToVectorStoreOnStartup) — not inter-service messaging.';

export function buildEvents(): Events {
  return {
    detected: false,
    scannedPatterns: SCANNED_PATTERNS,
    subscribers: [],
    publishers: [],
    placeholderMessage: PLACEHOLDER_MESSAGE,
  };
}
