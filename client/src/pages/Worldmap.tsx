import { lazy, Suspense } from 'react';
import { Loading } from '../components/shared/Loading';

const AreaWorldmapView = lazy(() => import('../components/AreaWorldmapView').then(m => ({ default: m.AreaWorldmapView })));

export function Worldmap() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-text">Worldmap</h1>
      <Suspense fallback={<Loading message="Loading worldmap..." />}>
        <AreaWorldmapView />
      </Suspense>
    </div>
  );
}
