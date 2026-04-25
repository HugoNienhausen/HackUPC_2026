import { Workflow } from 'lucide-react';
import { TabPlaceholder } from '@/components/TabPlaceholder';

export function FlowTab() {
  return (
    <TabPlaceholder
      title="Flow"
      description="Sequence diagram of the request path through services and into the database"
      icon={Workflow}
    />
  );
}
