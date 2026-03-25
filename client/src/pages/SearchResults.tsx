import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { globalSearch } from '../api/search';
import { Link } from 'react-router-dom';
import { Search, Database, Table } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Loading } from '../components/shared/Loading';
import { EmptyState } from '../components/shared/EmptyState';

export function SearchResults() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  const { data: results, isLoading } = useQuery({
    queryKey: ['globalSearch', submittedQuery],
    queryFn: () => globalSearch(submittedQuery),
    enabled: submittedQuery.length >= 2,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(query);
  };

  // Group results by database
  const grouped = results?.reduce((acc, r) => {
    if (!acc[r.database]) acc[r.database] = [];
    acc[r.database].push(r);
    return acc;
  }, {} as Record<string, typeof results>) ?? {};

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text">Search</h1>

      <form onSubmit={handleSubmit} className="flex gap-2 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search across all databases..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
        </div>
        <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-hover">
          Search
        </button>
      </form>

      {isLoading && <Loading />}

      {results && results.length === 0 && (
        <EmptyState icon={Search} title="No results found" description={`No matches for "${submittedQuery}"`} />
      )}

      {Object.entries(grouped).map(([db, dbResults]) => (
        <div key={db}>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text mb-2">
            <Database className="h-4 w-4 text-text-muted" />
            {db}
            <Badge>{dbResults!.length}</Badge>
          </h3>
          <div className="border border-border rounded-lg bg-surface divide-y divide-border">
            {dbResults!.map((r, i) => (
              <Link
                key={i}
                to={`/db/${r.database}/${r.table}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors"
              >
                <Table className="h-3.5 w-3.5 text-text-muted flex-shrink-0" />
                <Badge variant="info">{r.table}</Badge>
                <span className="text-xs text-text-muted">{r.column}:</span>
                <span className="text-sm text-text truncate">{r.value}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
