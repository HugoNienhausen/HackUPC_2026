import type { LucideIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

interface TabPlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function TabPlaceholder({ title, description, icon: Icon }: TabPlaceholderProps) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-muted p-2">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Coming up — Phase 4b.</p>
        </CardContent>
      </Card>
    </div>
  );
}
