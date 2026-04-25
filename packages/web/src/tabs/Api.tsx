import { Network } from 'lucide-react';
import { TabPlaceholder } from '@/components/TabPlaceholder';

export function ApiTab() {
  return (
    <TabPlaceholder
      title="API"
      description="REST endpoints exposed by this feature"
      icon={Network}
    />
  );
}
