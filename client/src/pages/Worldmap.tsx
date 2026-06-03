import { lazy, Suspense } from 'react';
import { Loading } from '../components/shared/Loading';

const AreaWorldmapView = lazy(() => import('../components/AreaWorldmapView').then(m => ({ default: m.AreaWorldmapView })));

export function Worldmap() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Suspense fallback={<Loading message="Loading worldmap..." />}>
        <AreaWorldmapView />
      </Suspense>
    </div>
  );
}
