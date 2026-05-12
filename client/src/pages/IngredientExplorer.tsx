import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getIngredientsEnhanced, getIngredientDetail, getProfessions, updateIngredient } from '../api/crafting';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Loading } from '../components/shared/Loading';
import { EmptyState } from '../components/shared/EmptyState';
import { Search, Leaf, X, FlaskConical, Pickaxe, Sparkles, MapPin, ChevronRight, Weight, Percent, Package } from 'lucide-react';
import type { IngredientListItem, DropChanceInfo } from '../types';

const PROFESSION_TYPE_LABELS: Record<string, string> = {
  gathering: 'Gathered',
  crafting: 'Crafted',
  refining: 'Refined',
};

const PROFESSION_TYPE_VARIANTS: Record<string, 'success' | 'info' | 'warning'> = {
  gathering: 'success',
  crafting: 'info',
  refining: 'warning',
};

const TIER_LABELS: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };

export function IngredientExplorer() {
  const [search, setSearch] = useState('');
  const [professionType, setProfessionType] = useState('');
  const [professionId, setProfessionId] = useState<number | undefined>();
  const [tier, setTier] = useState<number | undefined>();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const [editingWeight, setEditingWeight] = useState<string | null>(null);

  const weightMutation = useMutation({
    mutationFn: ({ id, yield_weight }: { id: number; yield_weight: number }) =>
      updateIngredient(id, { yield_weight }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ingredientDetail', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['ingredientsEnhanced'] });
      setEditingWeight(null);
    },
  });

  const { data: professions } = useQuery({
    queryKey: ['professions'],
    queryFn: getProfessions,
    staleTime: 300_000,
  });

  const { data: ingredients, isLoading } = useQuery({
    queryKey: ['ingredientsEnhanced', search, professionType, professionId, tier],
    queryFn: () => getIngredientsEnhanced({
      search: search || undefined,
      profession_type: professionType || undefined,
      profession_id: professionId,
      tier,
    }),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['ingredientDetail', selectedId],
    queryFn: () => getIngredientDetail(selectedId!),
    enabled: selectedId !== null,
  });

  const professionOptions = professions
    ? professions
        .filter(p => !professionType || p.profession_type === professionType)
        .map(p => ({ value: p.profession_id, label: p.profession_name }))
    : [];

  const tierOptions = [1, 2, 3, 4, 5].map(t => ({ value: t, label: `Tier ${TIER_LABELS[t]}` }));

  return (
    <div className="flex gap-4 h-[calc(100vh-4rem)]">
      {/* Left panel - ingredient list */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-border">
        <div className="p-3 space-y-2 border-b border-border">
          <h1 className="text-lg font-bold text-text">Ingredients</h1>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ingredients..."
              className="w-full pl-8 pr-7 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-text-muted" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-1.5">
            <Select
              className="flex-1 text-xs !py-1"
              value={professionType}
              onChange={e => { setProfessionType(e.target.value); setProfessionId(undefined); }}
              options={[
                { value: 'gathering', label: 'Gathered' },
                { value: 'crafting', label: 'Crafted' },
                { value: 'refining', label: 'Refined' },
              ]}
              placeholder="Source"
            />
            <Select
              className="flex-1 text-xs !py-1"
              value={professionId ?? ''}
              onChange={e => setProfessionId(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              options={professionOptions}
              placeholder="Profession"
            />
            <Select
              className="w-20 text-xs !py-1"
              value={tier ?? ''}
              onChange={e => setTier(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              options={tierOptions}
              placeholder="Tier"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <Loading />
          ) : !ingredients?.length ? (
            <EmptyState icon={Leaf} title="No ingredients found" description="Try adjusting your filters" />
          ) : (
            <div className="divide-y divide-border">
              {ingredients.map(ing => (
                <IngredientRow
                  key={ing.ingredient_id}
                  ingredient={ing}
                  isSelected={ing.ingredient_id === selectedId}
                  onClick={() => setSelectedId(ing.ingredient_id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-border text-xs text-text-muted">
          {ingredients?.length ?? 0} ingredients
        </div>
      </div>

      {/* Right panel - detail */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedId === null ? (
          <EmptyState icon={Leaf} title="Select an ingredient" description="Choose an ingredient from the list to see its details" />
        ) : detailLoading ? (
          <Loading />
        ) : !detail ? (
          <EmptyState icon={Leaf} title="Ingredient not found" />
        ) : (
          <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div>
              <h2 className="text-xl font-bold text-text">{detail.ingredient_name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-text-muted font-mono">{detail.ingredient_resref}</span>
                {detail.ingredient_tier && (
                  <Badge>Tier {TIER_LABELS[detail.ingredient_tier] ?? detail.ingredient_tier}</Badge>
                )}
              </div>
            </div>

            {/* Source */}
            <section>
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Source</h3>
              <div className="rounded-lg border border-border bg-surface p-3">
                {detail.source.profession_name ? (
                  <div className="flex items-center gap-2">
                    {detail.source.profession_type === 'gathering' ? (
                      <Pickaxe className="h-4 w-4 text-green-500" />
                    ) : detail.source.profession_type === 'refining' ? (
                      <Sparkles className="h-4 w-4 text-amber-500" />
                    ) : (
                      <FlaskConical className="h-4 w-4 text-blue-500" />
                    )}
                    <span className="text-sm font-medium capitalize">{detail.source.profession_name}</span>
                    <Badge variant={PROFESSION_TYPE_VARIANTS[detail.source.profession_type ?? ''] ?? 'default'}>
                      {PROFESSION_TYPE_LABELS[detail.source.profession_type ?? ''] ?? 'Unknown'}
                    </Badge>
                  </div>
                ) : (
                  <span className="text-sm text-text-muted">No profession source (base/purchased ingredient)</span>
                )}
              </div>
            </section>

            {/* Drop Weight */}
            {detail.source.profession_type === 'gathering' && (
              <section>
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  <Weight className="h-3.5 w-3.5 inline mr-1" />
                  Drop Chance Weight
                </h3>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center gap-3">
                    {editingWeight !== null && selectedId === detail.ingredient_id ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={e => {
                          e.preventDefault();
                          const val = parseFloat(editingWeight);
                          if (!isNaN(val) && val >= 0) {
                            weightMutation.mutate({ id: detail.ingredient_id, yield_weight: val });
                          }
                        }}
                      >
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={editingWeight}
                          onChange={e => setEditingWeight(e.target.value)}
                          className="w-24 px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={weightMutation.isPending}
                          className="px-2 py-1 text-xs font-medium rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingWeight(null)}
                          className="px-2 py-1 text-xs font-medium rounded border border-border hover:bg-surface-hover"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="text-lg font-bold tabular-nums">{detail.yield_weight}</span>
                        <button
                          onClick={() => setEditingWeight(String(detail.yield_weight))}
                          className="px-2 py-1 text-xs font-medium rounded border border-border hover:bg-surface-hover"
                        >
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-1.5">
                    Relative weight for secondary yield drops. Default is 1.0 — higher values make this ingredient more likely to drop.
                  </p>
                </div>
              </section>
            )}

            {/* Biomes */}
            {detail.biomes.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  <MapPin className="h-3.5 w-3.5 inline mr-1" />
                  Gathering Locations
                </h3>
                <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                  {detail.biomes.map(b => (
                    <div key={b.biome_name} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <span className="text-sm font-medium capitalize">{b.biome_name.replace(/_/g, ' ')}</span>
                        {b.biome_description && (
                          <p className="text-xs text-text-muted">{b.biome_description}</p>
                        )}
                      </div>
                      <Badge variant={b.spawn_rate >= 70 ? 'success' : b.spawn_rate >= 30 ? 'warning' : 'danger'}>
                        {b.spawn_rate}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Drop Chance */}
            {detail.drop_chance && <DropChanceSection dropChance={detail.drop_chance} />}

            {/* Loot Tables */}
            {detail.loot_tables.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  <Package className="h-3.5 w-3.5 inline mr-1" />
                  Loot Tables
                </h3>
                <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                  {detail.loot_tables.map(lt => (
                    <div key={`${lt.category}_${lt.tier}`} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-sm font-medium capitalize">{lt.category}</span>
                      <Badge>{lt.tier.toUpperCase()}</Badge>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recipes */}
            <section>
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Used in Recipes ({detail.recipes.length})
              </h3>
              {detail.recipes.length === 0 ? (
                <p className="text-sm text-text-muted">This ingredient is not used in any recipes.</p>
              ) : (
                <div className="rounded-lg border border-border bg-surface overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-dim text-text-secondary text-left">
                        <th className="px-3 py-2 font-medium">Recipe</th>
                        <th className="px-3 py-2 font-medium">Profession</th>
                        <th className="px-3 py-2 font-medium text-center">Lvl</th>
                        <th className="px-3 py-2 font-medium text-center">Qty</th>
                        <th className="px-3 py-2 font-medium">Product</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {detail.recipes.map(r => (
                        <tr key={r.recipe_id} className="hover:bg-surface-hover">
                          <td className="px-3 py-1.5">
                            <div className="font-medium">{r.recipe_name}</div>
                            <div className="text-xs text-text-muted font-mono">{r.recipe_resref}</div>
                          </td>
                          <td className="px-3 py-1.5 capitalize">{r.profession_name}</td>
                          <td className="px-3 py-1.5 text-center">{r.recipe_crafting_level}</td>
                          <td className="px-3 py-1.5 text-center">
                            {r.quantity > 1 ? (
                              <Badge variant="info">x{r.quantity}</Badge>
                            ) : (
                              <span className="text-text-muted">x1</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1">
                              <ChevronRight className="h-3 w-3 text-text-muted" />
                              {r.product_name}
                            </div>
                          </td>
                          <td className="px-3 py-1.5">
                            <Badge>{r.recipe_type_name}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function IngredientRow({ ingredient, isSelected, onClick }: {
  ingredient: IngredientListItem;
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
        <span className="text-sm font-medium truncate">{ingredient.ingredient_name}</span>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {ingredient.yield_weight !== 1.0 && (
            <Badge variant="warning" className="text-[10px] !px-1">w:{ingredient.yield_weight}</Badge>
          )}
          {ingredient.ingredient_tier && (
            <span className="text-[10px] text-text-muted">{TIER_LABELS[ingredient.ingredient_tier]}</span>
          )}
          {ingredient.recipe_count > 0 && (
            <Badge className="text-[10px]">{ingredient.recipe_count}</Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-xs text-text-muted font-mono truncate">{ingredient.ingredient_resref}</span>
        {ingredient.profession_type && (
          <Badge
            variant={PROFESSION_TYPE_VARIANTS[ingredient.profession_type] ?? 'default'}
            className="text-[10px] !px-1.5"
          >
            {ingredient.profession_name}
          </Badge>
        )}
      </div>
    </button>
  );
}

function DropChanceSection({ dropChance }: { dropChance: DropChanceInfo }) {
  const hasSecondary = dropChance.secondary_yield_pct !== null;
  const hasBiome = dropChance.biome_drop_pcts !== null && dropChance.biome_drop_pcts.length > 0;
  const hasFishing = dropChance.fishing_drop_pcts !== null && dropChance.fishing_drop_pcts.length > 0;

  if (!hasSecondary && !hasBiome && !hasFishing) return null;

  return (
    <section>
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
        <Percent className="h-3.5 w-3.5 inline mr-1" />
        Drop Chance
      </h3>
      <div className="rounded-lg border border-border bg-surface p-3 space-y-3">
        {/* Secondary yield (mining/woodcutting/skinning) */}
        {hasSecondary && (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="text-center">
                <div className="text-lg font-bold tabular-nums">{dropChance.secondary_yield_pct}%</div>
                <div className="text-[10px] text-text-muted">per gather</div>
              </div>
              <div className="text-xs text-text-muted leading-relaxed">
                = <span className="font-medium text-text">{dropChance.secondary_trigger_pct}%</span> secondary trigger
                {' '}&times;{' '}
                <span className="font-medium text-text">{dropChance.pool_weight_pct}%</span> selection from pool
                {' '}({dropChance.pool_size} ingredients)
              </div>
            </div>
          </div>
        )}

        {/* Herbalism biome drops */}
        {hasBiome && (
          <div>
            <div className="text-xs font-medium text-text-secondary mb-1.5">Spawn chance per biome (when herb spawns at this tier)</div>
            <div className="space-y-1">
              {dropChance.biome_drop_pcts!.map(b => (
                <div key={b.biome_name} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{b.biome_name.replace(/_/g, ' ')}</span>
                  <PercentBar pct={b.pct} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fishing biome drops */}
        {hasFishing && (
          <div>
            <div className="text-xs font-medium text-text-secondary mb-1.5">Catch chance per biome (flat random)</div>
            <div className="space-y-1">
              {dropChance.fishing_drop_pcts!.map(b => (
                <div key={b.biome_name} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{b.biome_name.replace(/_/g, ' ')}</span>
                  <PercentBar pct={b.pct} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PercentBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className={`h-full rounded-full ${pct >= 50 ? 'bg-green-500' : pct >= 20 ? 'bg-amber-500' : 'bg-red-400'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium tabular-nums w-12 text-right">{pct}%</span>
    </div>
  );
}
