import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStores, getStoreDetail, getStoreAreas } from '../api/stores';
import type { StoreListItem } from '../api/stores';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Loading } from '../components/shared/Loading';
import { EmptyState } from '../components/shared/EmptyState';
import { Search, Store, X, MapPin, Infinity, Package } from 'lucide-react';

const CATEGORY_VARIANTS: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'default'> = {
  Armor: 'info',
  Weapons: 'danger',
  Potions: 'success',
  Miscellaneous: 'default',
  Special: 'warning',
};

export function StoreExplorer() {
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');

  const { data: areas } = useQuery({
    queryKey: ['storeAreas'],
    queryFn: getStoreAreas,
    staleTime: 300_000,
  });

  const { data: stores, isLoading } = useQuery({
    queryKey: ['stores', search, areaFilter],
    queryFn: () => getStores({
      search: search || undefined,
      area: areaFilter || undefined,
    }),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['storeDetail', selectedId],
    queryFn: () => getStoreDetail(selectedId!),
    enabled: selectedId !== null,
  });

  const areaOptions = areas?.map(a => ({ value: a.resref, label: a.name })) ?? [];

  const filteredItems = detail?.items.filter(
    item => !categoryFilter || item.category === categoryFilter
  );

  const categories = detail
    ? [...new Set(detail.items.map(i => i.category))].sort()
    : [];

  return (
    <div className="flex gap-4 h-screen">
      {/* Left panel - store list */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-border">
        <div className="p-3 space-y-2 border-b border-border">
          <h1 className="text-lg font-bold text-text">Stores</h1>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search stores..."
              className="w-full pl-8 pr-7 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-text-muted" />
              </button>
            )}
          </div>

          <Select
            className="text-xs !py-1"
            value={areaFilter}
            onChange={e => setAreaFilter(e.target.value)}
            options={areaOptions}
            placeholder="All Areas"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <Loading />
          ) : !stores?.length ? (
            <EmptyState icon={Store} title="No stores found" description="Try adjusting your filters" />
          ) : (
            <div className="divide-y divide-border">
              {stores.map(s => (
                <StoreRow
                  key={s.id}
                  store={s}
                  isSelected={s.id === selectedId}
                  onClick={() => { setSelectedId(s.id); setCategoryFilter(''); }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-border text-xs text-text-muted">
          {stores?.length ?? 0} stores
        </div>
      </div>

      {/* Right panel - detail */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedId === null ? (
          <EmptyState icon={Store} title="Select a merchant" description="Choose a store from the list to inspect their wares" />
        ) : detailLoading ? (
          <Loading />
        ) : !detail ? (
          <EmptyState icon={Store} title="Store not found" />
        ) : (
          <div className="space-y-6 max-w-5xl">
            {/* Header */}
            <div>
              <h2 className="text-xl font-bold text-text">{detail.store.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-text-muted font-mono">{detail.store.tag}</span>
                <Badge>{detail.store.item_count} items</Badge>
              </div>
            </div>

            {/* Properties */}
            <section>
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Properties</h3>
              <div className="rounded-lg border border-border bg-surface p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <div className="text-xs text-text-muted">Location</div>
                  <div className="text-sm font-medium flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-text-muted" />
                    {detail.store.area_name}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">Buy Markup</div>
                  <div className="text-sm font-medium">{detail.store.markup}%</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">Sell Markdown</div>
                  <div className="text-sm font-medium">{detail.store.markdown}%</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">Gold</div>
                  <div className="text-sm font-medium">{detail.store.store_gold === -1 ? 'Unlimited' : detail.store.store_gold.toLocaleString()}</div>
                </div>
              </div>
            </section>

            {/* Inventory */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                  <Package className="h-3.5 w-3.5 inline mr-1" />
                  Inventory ({filteredItems?.length ?? 0})
                </h3>
                {categories.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCategoryFilter('')}
                      className={`px-2 py-0.5 text-xs rounded ${!categoryFilter ? 'bg-primary text-white' : 'bg-surface-dim text-text-muted hover:text-text'}`}
                    >
                      All
                    </button>
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`px-2 py-0.5 text-xs rounded ${categoryFilter === cat ? 'bg-primary text-white' : 'bg-surface-dim text-text-muted hover:text-text'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border bg-surface overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-dim text-text-secondary text-left">
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium text-right">Value</th>
                      <th className="px-3 py-2 font-medium text-right">Store Price</th>
                      <th className="px-3 py-2 font-medium text-center">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredItems?.map((item, idx) => (
                      <tr key={`${item.resref}_${idx}`} className="hover:bg-surface-hover odd:bg-surface-dim/40">
                        <td className="px-3 py-1.5">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-text-muted font-mono">{item.resref}</div>
                        </td>
                        <td className="px-3 py-1.5">
                          <Badge variant={CATEGORY_VARIANTS[item.category] ?? 'default'}>
                            {item.category}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-text-muted">
                          {item.calculated_cost.toLocaleString()} gp
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {item.store_buy_price.toLocaleString()} gp
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {item.infinite ? (
                            <Infinity className="h-3.5 w-3.5 inline text-green-500" />
                          ) : (
                            <Badge variant="warning">Limited</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function StoreRow({ store, isSelected, onClick }: {
  store: StoreListItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 transition-colors ${
        isSelected ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-surface-hover border-l-2 border-transparent'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium truncate">{store.name}</span>
        <Badge className="text-[10px] flex-shrink-0 ml-2">{store.item_count}</Badge>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-xs text-text-muted font-mono truncate">{store.tag}</span>
      </div>
      <div className="text-[10px] text-text-muted mt-0.5 truncate">
        <MapPin className="h-2.5 w-2.5 inline mr-0.5" />
        {store.area_name}
      </div>
    </button>
  );
}
