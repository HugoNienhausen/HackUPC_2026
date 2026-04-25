import { LayoutGrid } from 'lucide-react';
import { TabPlaceholder } from '@/components/TabPlaceholder';

export function ComponentsTab() {
  return (
    <TabPlaceholder
      title="Components"
      description="Detailed inventory of every class involved"
      icon={LayoutGrid}
    />
  );
}
