import { Loader2 } from 'lucide-react';

export function Loading({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-text-secondary">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loading />
    </div>
  );
}
