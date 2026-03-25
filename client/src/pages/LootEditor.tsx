import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCategoryItems, addLootItem, removeLootItem, updateLootItem, moveLootItems, searchLoot } from '../api/loot';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Loading } from '../components/shared/Loading';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { Search, Plus, X, Trash2, GripVertical, Pencil, Check } from 'lucide-react';
import { categoryLabel, tierLabel } from '../utils';
import type { LootItem } from '../types';

const CATEGORIES = ['weapon', 'armor', 'clothing', 'jewlery', 'misc', 'shield', 'ammo'];
const TIERS = ['a', 'b', 'c', 'd', 'e'];

const TIER_COLORS: Record<string, string> = {
  a: 'bg-tier-a border-amber-300',
  b: 'bg-tier-b border-blue-300',
  c: 'bg-tier-c border-green-300',
  d: 'bg-tier-d border-violet-300',
  e: 'bg-tier-e border-pink-300',
};

export function LootEditor() {
  const queryClient = useQueryClient();
  const { isEditor } = useAuth();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<Map<string, { item: LootItem; tier: string }>>(new Map());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newResref, setNewResref] = useState('');
  const [newName, setNewName] = useState('');
  const [editingItem, setEditingItem] = useState<{ tier: string; resref: string; name: string } | null>(null);
  const [deleteItem, setDeleteItem] = useState<{ tier: string; resref: string } | null>(null);
  const [dragItem, setDragItem] = useState<{ tier: string; item: LootItem } | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ['loot', category],
    queryFn: () => getCategoryItems(category),
  });

  const { data: searchResults } = useQuery({
    queryKey: ['lootSearch', searchQuery],
    queryFn: () => searchLoot(searchQuery),
    enabled: searchQuery.length >= 2,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['loot', category] });

  const addMutation = useMutation({ mutationFn: (p: { tier: string; item: LootItem }) => addLootItem(category, p.tier, p.item), onSuccess: invalidate });
  const removeMutation = useMutation({ mutationFn: (p: { tier: string; resref: string }) => removeLootItem(category, p.tier, p.resref), onSuccess: invalidate });
  const updateMutation = useMutation({ mutationFn: (p: { tier: string; resref: string; name: string }) => updateLootItem(category, p.tier, p.resref, p.name), onSuccess: invalidate });
  const moveMutation = useMutation({
    mutationFn: (p: { items: LootItem[]; fromTier: string; toTier: string }) =>
      moveLootItems(p.items, { category, tier: p.fromTier }, { category, tier: p.toTier }),
    onSuccess: () => { invalidate(); setSelectedItems(new Map()); },
  });

  const toggleSelect = useCallback((tier: string, item: LootItem) => {
    setSelectedItems(prev => {
      const next = new Map(prev);
      const key = `${tier}:${item.resref}`;
      if (next.has(key)) next.delete(key);
      else next.set(key, { item, tier });
      return next;
    });
  }, []);

  const handleDrop = useCallback((targetTier: string) => {
    if (!dragItem || dragItem.tier === targetTier) return;
    moveMutation.mutate({
      items: [dragItem.item],
      fromTier: dragItem.tier,
      toTier: targetTier,
    });
    setDragItem(null);
  }, [dragItem, moveMutation]);

  const handleBulkMove = (toTier: string) => {
    const groups = new Map<string, LootItem[]>();
    for (const { item, tier } of selectedItems.values()) {
      if (tier === toTier) continue;
      if (!groups.has(tier)) groups.set(tier, []);
      groups.get(tier)!.push(item);
    }
    for (const [fromTier, moveItems] of groups) {
      moveMutation.mutate({ items: moveItems, fromTier, toTier });
    }
  };

  const filteredItems = useCallback((tier: string): LootItem[] => {
    const tierItems = items?.[tier] ?? [];
    if (!searchQuery) return tierItems;
    const q = searchQuery.toLowerCase();
    return tierItems.filter(i => i.name.toLowerCase().includes(q) || i.resref.toLowerCase().includes(q));
  }, [items, searchQuery]);

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">Loot Editor</h1>
        {selectedItems.size > 0 && isEditor && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">{selectedItems.size} selected</span>
            <span className="text-sm text-text-secondary">Move to:</span>
            {TIERS.map(t => (
              <Button key={t} size="sm" variant="secondary" onClick={() => handleBulkMove(t)}>
                {tierLabel(t)}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSelectedItems(new Map())}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => { setCategory(cat); setSelectedItems(new Map()); setSearchQuery(''); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              category === cat
                ? 'bg-surface border border-b-surface border-border text-primary -mb-px'
                : 'text-text-secondary hover:text-text hover:bg-surface-hover'
            }`}
          >
            {categoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Filter items..."
          className="w-full pl-9 pr-3 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-text-muted" />
          </button>
        )}
      </div>

      {/* Tier columns */}
      <div className="grid grid-cols-5 gap-3">
        {TIERS.map(tier => {
          const tierItems = filteredItems(tier);
          return (
            <div
              key={tier}
              className={`rounded-lg border-2 ${TIER_COLORS[tier]} min-h-[300px] flex flex-col`}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-primary'); }}
              onDragLeave={e => { e.currentTarget.classList.remove('ring-2', 'ring-primary'); }}
              onDrop={e => { e.currentTarget.classList.remove('ring-2', 'ring-primary'); handleDrop(tier); }}
            >
              {/* Tier header */}
              <div className="px-3 py-2 border-b border-black/10 flex items-center justify-between">
                <span className="font-semibold text-sm">{tierLabel(tier)}</span>
                <Badge>{tierItems.length}</Badge>
              </div>

              {/* Items */}
              <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
                {tierItems.map(item => {
                  const isSelected = selectedItems.has(`${tier}:${item.resref}`);
                  const isEditingThis = editingItem?.tier === tier && editingItem?.resref === item.resref;

                  return (
                    <div
                      key={item.resref}
                      draggable={isEditor}
                      onDragStart={() => setDragItem({ tier, item })}
                      onDragEnd={() => setDragItem(null)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs group cursor-default
                        ${isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-surface/50'}
                        ${isEditor ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    >
                      {isEditor && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(tier, item)}
                          className="h-3 w-3 rounded border-gray-300 flex-shrink-0"
                        />
                      )}
                      {isEditor && <GripVertical className="h-3 w-3 text-text-muted opacity-0 group-hover:opacity-100 flex-shrink-0" />}

                      {isEditingThis ? (
                        <div className="flex-1 flex items-center gap-1">
                          <input
                            autoFocus
                            value={editingItem.name}
                            onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { updateMutation.mutate({ tier, resref: item.resref, name: editingItem.name }); setEditingItem(null); }
                              if (e.key === 'Escape') setEditingItem(null);
                            }}
                            className="flex-1 px-1 py-0 text-xs border border-primary rounded"
                          />
                          <button onClick={() => { updateMutation.mutate({ tier, resref: item.resref, name: editingItem.name }); setEditingItem(null); }}>
                            <Check className="h-3 w-3 text-success" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate" title={item.name}>{item.name}</div>
                            <div className="text-text-muted truncate" title={item.resref}>{item.resref}</div>
                          </div>
                          {isEditor && (
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                              <button onClick={() => setEditingItem({ tier, resref: item.resref, name: item.name })} className="p-0.5 hover:text-primary">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={() => setDeleteItem({ tier, resref: item.resref })} className="p-0.5 hover:text-danger">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add item */}
              {isEditor && (
                <div className="border-t border-black/10 p-2">
                  {addingTo === tier ? (
                    <div className="space-y-1">
                      <input
                        value={newResref}
                        onChange={e => setNewResref(e.target.value)}
                        placeholder="resref"
                        className="w-full px-2 py-0.5 text-xs border border-border rounded"
                      />
                      <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Item name"
                        className="w-full px-2 py-0.5 text-xs border border-border rounded"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newResref && newName) {
                            addMutation.mutate({ tier, item: { resref: newResref, name: newName } });
                            setNewResref(''); setNewName(''); setAddingTo(null);
                          }
                        }}
                      />
                      <div className="flex gap-1">
                        <Button size="sm" className="flex-1 text-xs" onClick={() => {
                          if (newResref && newName) {
                            addMutation.mutate({ tier, item: { resref: newResref, name: newName } });
                            setNewResref(''); setNewName(''); setAddingTo(null);
                          }
                        }}>Add</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAddingTo(null); setNewResref(''); setNewName(''); }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingTo(tier)}
                      className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary w-full justify-center py-0.5"
                    >
                      <Plus className="h-3 w-3" /> Add Item
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Search results (cross-table) */}
      {searchQuery.length >= 2 && searchResults && searchResults.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-text-secondary mb-2">
            Search results across all categories ({searchResults.length})
          </h3>
          <div className="border border-border rounded-lg bg-surface divide-y divide-border max-h-64 overflow-y-auto">
            {searchResults.filter(r => r.category !== category).slice(0, 50).map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                <Badge>{categoryLabel(r.category)}</Badge>
                <Badge variant="info">{tierLabel(r.tier)}</Badge>
                <span className="font-medium">{r.name}</span>
                <span className="text-text-muted">{r.resref}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteItem !== null}
        onClose={() => setDeleteItem(null)}
        onConfirm={() => {
          if (deleteItem) {
            removeMutation.mutate(deleteItem);
            setDeleteItem(null);
          }
        }}
        title="Remove Item"
        description="Remove this item from the loot table?"
        confirmLabel="Remove"
      />
    </div>
  );
}
