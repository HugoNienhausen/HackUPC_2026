import { useState } from 'react';
import { Radio, Inbox, ChevronDown, ChevronRight } from 'lucide-react';
import type { Feature } from '@devmap/schema';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  feature: Feature;
}

function PlaceholderState({
  message,
  scannedPatterns,
}: {
  message: string;
  scannedPatterns: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-muted p-3">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>No async messaging detected</CardTitle>
              <CardDescription>
                The tool reasons about absence as well as presence — this is a
                feature, not a gap.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed">{message}</p>
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((s) => !s)}
              className="gap-1.5 -ml-2 text-xs"
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Patterns scanned ({scannedPatterns.length})
            </Button>
            {expanded && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {scannedPatterns.map((p) => (
                  <Badge key={p} variant="outline" className="font-mono text-[10px]">
                    {p}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetectedState() {
  // Spec'd but not implemented for the hackathon — PetClinic has zero async
  // messaging, so this branch never fires for the demo. Wire up properly when
  // a repo with @KafkaListener / @RabbitListener / etc. surfaces.
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Async messaging UI</CardTitle>
          <CardDescription>not implemented for this hackathon</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export function EventsTab({ feature }: Props) {
  const events = feature.events;
  return (
    <div className="h-full overflow-auto">
      <div className="flex h-12 items-center gap-3 border-b bg-card px-6">
        <Radio className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Events</span>
        <span className="text-xs text-muted-foreground">
          Asynchronous messaging publishers and subscribers
        </span>
      </div>
      {events.detected ? (
        <DetectedState />
      ) : (
        <PlaceholderState
          message={
            events.placeholderMessage ??
            'No async messaging primitives detected in this codebase.'
          }
          scannedPatterns={events.scannedPatterns}
        />
      )}
    </div>
  );
}
