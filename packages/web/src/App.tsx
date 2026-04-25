import { useState } from 'react';
import {
  GitGraph,
  Workflow,
  Database,
  Network,
  Radio,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import type { Feature } from '@devmap/schema';
import { Badge } from '@/components/ui/badge';
import { useFeature } from '@/lib/featureClient';
import { microserviceColor } from '@/lib/microserviceColors';
import { DependenciesTab } from '@/tabs/Dependencies';
import { FlowTab } from '@/tabs/Flow';
// keep file references stable for placeholder fallbacks during cut-from-bottom
//   screenshots/phase-4b-flow.png
//   screenshots/phase-4b-persistence.png
//   screenshots/phase-4b-api.png
//   screenshots/phase-4b-components.png
//   screenshots/phase-4b-events.png
import { PersistenceTab } from '@/tabs/Persistence';
import { ApiTab } from '@/tabs/Api';
import { EventsTab } from '@/tabs/Events';
import { ComponentsTab } from '@/tabs/Components';

type TabKey = 'flow' | 'dependencies' | 'persistence' | 'api' | 'events' | 'components';

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'flow', label: 'Flow', icon: Workflow },
  { key: 'dependencies', label: 'Dependencies', icon: GitGraph },
  { key: 'persistence', label: 'Persistence', icon: Database },
  { key: 'api', label: 'API', icon: Network },
  { key: 'events', label: 'Events', icon: Radio },
  { key: 'components', label: 'Components', icon: LayoutGrid },
];

function Header({ feature }: { feature: Feature }) {
  const services = feature.repository.microservices.map((m) => m.name);
  return (
    <header className="border-b bg-card">
      <div className="px-6 py-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {feature.feature.displayName}
          </h1>
          <span className="text-sm text-muted-foreground">{feature.repository.name}</span>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {feature.feature.summary}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {services.map((svc) => (
            <Badge
              key={svc}
              variant="outline"
              className="border-l-4 font-mono text-xs"
              style={{ borderLeftColor: microserviceColor(svc) }}
            >
              {svc}
            </Badge>
          ))}
        </div>
      </div>
    </header>
  );
}

function Sidebar({
  active,
  onSelect,
}: {
  active: TabKey;
  onSelect: (k: TabKey) => void;
}) {
  return (
    <nav className="w-48 border-r bg-card">
      <ul className="flex flex-col gap-1 p-2">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Loading() {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Loading feature.json…
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex h-screen items-center justify-center p-8">
      <div className="max-w-md rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-semibold text-destructive">Failed to load /feature.json</p>
        <p className="mt-1 text-muted-foreground">{message}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          The Express server is expected on :3000 with Vite proxying /feature.json.
          If you're developing the UI in isolation, run the agent CLI without
          --no-serve, or import a sample artifact directly.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const { feature, loading, error } = useFeature();
  const [active, setActive] = useState<TabKey>('dependencies');

  if (loading) return <Loading />;
  if (error || !feature) return <ErrorView message={error ?? 'no feature loaded'} />;

  const renderActive = () => {
    switch (active) {
      case 'dependencies':
        return <DependenciesTab feature={feature} />;
      case 'flow':
        return <FlowTab feature={feature} />;
      case 'persistence':
        return <PersistenceTab feature={feature} />;
      case 'api':
        return <ApiTab />;
      case 'events':
        return <EventsTab />;
      case 'components':
        return <ComponentsTab />;
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header feature={feature} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar active={active} onSelect={setActive} />
        <main className="flex-1 overflow-hidden">{renderActive()}</main>
      </div>
    </div>
  );
}
