import { useEffect, useState } from 'react';
import type { Feature } from '@devmap/schema';

interface FeatureState {
  feature: Feature | null;
  loading: boolean;
  error: string | null;
}

export function useFeature(): FeatureState {
  const [state, setState] = useState<FeatureState>({
    feature: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/feature.json')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching /feature.json`);
        return (await r.json()) as Feature;
      })
      .then((feature) => {
        if (!cancelled) setState({ feature, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled)
          setState({
            feature: null,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
