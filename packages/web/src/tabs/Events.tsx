import { Radio } from 'lucide-react';
import { TabPlaceholder } from '@/components/TabPlaceholder';

export function EventsTab() {
  return (
    <TabPlaceholder
      title="Events"
      description="Asynchronous messaging publishers and subscribers"
      icon={Radio}
    />
  );
}
