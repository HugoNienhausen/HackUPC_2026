import { Database } from 'lucide-react';
import { TabPlaceholder } from '@/components/TabPlaceholder';

export function PersistenceTab() {
  return (
    <TabPlaceholder
      title="Persistence"
      description="ER diagram of feature entities and their relationships"
      icon={Database}
    />
  );
}
