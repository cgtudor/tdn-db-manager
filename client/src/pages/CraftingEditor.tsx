import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRecipes, getRecipeDetail, updateRecipe, deleteRecipe, getProfessions, getRecipeTypes, getIngredients, createRecipe } from '../api/crafting';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Loading } from '../components/shared/Loading';
import { EmptyState } from '../components/shared/EmptyState';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { Search, ChevronLeft, ChevronRight, Plus, Trash2, FlaskConical, X, Save, Pencil } from 'lucide-react';
import type { RecipeDetail, Ingredient } from '../types';

export function CraftingEditor() {
  const queryClient = useQueryClient();
  const { isEditor } = useAuth();

  const [professionFilter, setProfessionFilter] = useState<number | undefined>();
  const [typeFilter, setTypeFilter] = useState<number | undefined>();
  const [searchFilter, setSearchFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<RecipeDetail>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Ingredient search for adding
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [showIngredientPicker, setShowIngredientPicker] = useState(false);

  // Reference data
  const { data: professions } = useQuery({ queryKey: ['professions'], queryFn: getProfessions, staleTime: 300_000 });
  const { data: recipeTypes } = useQuery({ queryKey: ['recipeTypes'], queryFn: getRecipeTypes, staleTime: 300_000 });

  // Recipe list
  const { data: recipesData, isLoading } = useQuery({
    queryKey: ['recipes', professionFilter, typeFilter, searchFilter, page],
    queryFn: () => getRecipes({
      profession_id: professionFilter,
      type_id: typeFilter,
      search: searchFilter || undefined,
      page,
      limit: 30,
    }),
  });

  // Selected recipe detail
  const { data: recipeDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['recipe', selectedRecipeId],
    queryFn: () => getRecipeDetail(selectedRecipeId!),
    enabled: selectedRecipeId !== null,
  });

  // Ingredient search
  const { data: ingredientResults } = useQuery({
    queryKey: ['ingredients', ingredientSearch],
    queryFn: () => getIngredients(ingredientSearch),
    enabled: ingredientSearch.length >= 1,
  });

  const invalidateRecipes = () => {
    queryClient.invalidateQueries({ queryKey: ['recipes'] });
    queryClient.invalidateQueries({ queryKey: ['recipe', selectedRecipeId] });
  };

  const updateMutation = useMutation({ mutationFn: (d: { id: number; data: unknown }) => updateRecipe(d.id, d.data), onSuccess: invalidateRecipes });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRecipe(id),
    onSuccess: () => { invalidateRecipes(); setSelectedRecipeId(null); },
  });
  const createMutation = useMutation({
    mutationFn: (d: unknown) => createRecipe(d),
    onSuccess: (result) => {
      invalidateRecipes();
      setSelectedRecipeId((result as { recipe_id: number }).recipe_id);
      setShowCreateForm(false);
    },
  });

  const startEdit = () => {
    if (!recipeDetail) return;
    setEditData({
      recipe_name: recipeDetail.recipe_name,
      recipe_resref: recipeDetail.recipe_resref,
      recipe_crafting_level: recipeDetail.recipe_crafting_level,
      profession_id: recipeDetail.profession_id,
      recipe_type_id: recipeDetail.recipe_type_id,
      product: { ...recipeDetail.product },
      ingredients: recipeDetail.ingredients.map(i => ({ ...i })),
    });
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (!selectedRecipeId || !editData) return;
    updateMutation.mutate({
      id: selectedRecipeId,
      data: {
        recipe_name: editData.recipe_name,
        recipe_resref: editData.recipe_resref,
        recipe_crafting_level: editData.recipe_crafting_level,
        profession_id: editData.profession_id,
        recipe_type_id: editData.recipe_type_id,
        product: editData.product,
        ingredients: editData.ingredients?.map(i => ({ ingredient_id: i.ingredient_id, quantity: i.quantity })),
      },
    });
    setIsEditing(false);
  };

  const addIngredientToEdit = (ingredient: Ingredient) => {
    setEditData(prev => ({
      ...prev,
      ingredients: [...(prev.ingredients || []), { ...ingredient, quantity: 1 }],
    }));
    setShowIngredientPicker(false);
    setIngredientSearch('');
  };

  const removeIngredientFromEdit = (index: number) => {
    setEditData(prev => ({
      ...prev,
      ingredients: prev.ingredients?.filter((_, i) => i !== index),
    }));
  };

  const handleCreate = (formData: Record<string, unknown>) => {
    createMutation.mutate(formData);
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-7rem)]">
      {/* Left panel: Recipe list */}
      <div className="w-96 flex-shrink-0 flex flex-col border border-border rounded-lg bg-surface overflow-hidden">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text">Recipes</h2>
            {isEditor && (
              <Button size="sm" onClick={() => setShowCreateForm(true)}>
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              value={searchFilter}
              onChange={e => { setSearchFilter(e.target.value); setPage(1); }}
              placeholder="Search recipes..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={professionFilter || ''}
              onChange={e => { setProfessionFilter(e.target.value ? parseInt(e.target.value) : undefined); setPage(1); }}
              className="flex-1 px-2 py-1 text-xs border border-border rounded bg-surface"
            >
              <option value="">All professions</option>
              {professions?.map(p => <option key={p.profession_id} value={p.profession_id}>{p.profession_name}</option>)}
            </select>
            <select
              value={typeFilter || ''}
              onChange={e => { setTypeFilter(e.target.value ? parseInt(e.target.value) : undefined); setPage(1); }}
              className="flex-1 px-2 py-1 text-xs border border-border rounded bg-surface"
            >
              <option value="">All types</option>
              {recipeTypes?.map(t => <option key={t.recipe_type_id} value={t.recipe_type_id}>{t.recipe_type_name}</option>)}
            </select>
          </div>
        </div>

        {/* Recipe list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {isLoading ? <Loading /> : recipesData?.data.map(recipe => (
            <button
              key={recipe.recipe_id}
              onClick={() => { setSelectedRecipeId(recipe.recipe_id); setIsEditing(false); }}
              className={`w-full text-left px-3 py-2.5 hover:bg-surface-hover transition-colors ${
                selectedRecipeId === recipe.recipe_id ? 'bg-primary-light border-l-2 border-primary' : ''
              }`}
            >
              <div className="font-medium text-sm text-text truncate">{recipe.recipe_name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge>{recipe.profession_name}</Badge>
                <span className="text-xs text-text-muted">Lv.{recipe.recipe_crafting_level}</span>
                <span className="text-xs text-text-muted truncate">{recipe.recipe_type_name}</span>
              </div>
            </button>
          ))}
          {recipesData?.data.length === 0 && <EmptyState icon={FlaskConical} title="No recipes found" />}
        </div>

        {/* Pagination */}
        {recipesData && recipesData.totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-text-secondary">
            <span>{recipesData.total} recipes</span>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1 hover:bg-surface-hover rounded disabled:opacity-30">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span>{page}/{recipesData.totalPages}</span>
              <button disabled={page >= recipesData.totalPages} onClick={() => setPage(p => p + 1)} className="p-1 hover:bg-surface-hover rounded disabled:opacity-30">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right panel: Recipe detail */}
      <div className="flex-1 overflow-y-auto">
        {!selectedRecipeId && !showCreateForm && (
          <EmptyState icon={FlaskConical} title="Select a recipe" description="Choose a recipe from the list to view details" />
        )}

        {showCreateForm && <CreateRecipeForm professions={professions || []} recipeTypes={recipeTypes || []} onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} isLoading={createMutation.isPending} />}

        {selectedRecipeId && recipeDetail && !showCreateForm && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-text">{recipeDetail.recipe_name}</h2>
              <div className="flex gap-2">
                {isEditor && !isEditing && (
                  <>
                    <Button size="sm" variant="secondary" onClick={startEdit}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleteConfirmId(selectedRecipeId)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                  </>
                )}
                {isEditing && (
                  <>
                    <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending}><Save className="h-3.5 w-3.5" /> Save</Button>
                    <Button size="sm" variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                  </>
                )}
              </div>
            </div>

            {/* Recipe info */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name" value={isEditing ? editData.recipe_name : recipeDetail.recipe_name}
                editing={isEditing} onChange={v => setEditData(p => ({ ...p, recipe_name: v }))} />
              <Field label="Resref" value={isEditing ? editData.recipe_resref : recipeDetail.recipe_resref}
                editing={isEditing} onChange={v => setEditData(p => ({ ...p, recipe_resref: v }))} />
              <Field label="Crafting Level" value={String(isEditing ? editData.recipe_crafting_level : recipeDetail.recipe_crafting_level)}
                editing={isEditing} onChange={v => setEditData(p => ({ ...p, recipe_crafting_level: parseInt(v) || 0 }))} type="number" />
              {isEditing ? (
                <>
                  <Select label="Profession" value={editData.profession_id} onChange={e => setEditData(p => ({ ...p, profession_id: parseInt(e.target.value) }))}
                    options={professions?.map(p => ({ value: p.profession_id, label: p.profession_name })) || []} />
                  <Select label="Type" value={editData.recipe_type_id} onChange={e => setEditData(p => ({ ...p, recipe_type_id: parseInt(e.target.value) }))}
                    options={recipeTypes?.map(t => ({ value: t.recipe_type_id, label: t.recipe_type_name })) || []} />
                </>
              ) : (
                <>
                  <Field label="Profession" value={recipeDetail.profession_name} />
                  <Field label="Type" value={recipeDetail.recipe_type_name} />
                </>
              )}
            </div>

            {/* Product */}
            <div>
              <h3 className="text-sm font-semibold text-text mb-2 uppercase tracking-wider">Product</h3>
              <div className="grid grid-cols-2 gap-4 p-4 bg-surface-dim rounded-lg border border-border">
                <Field label="Name" value={isEditing ? editData.product?.product_name : recipeDetail.product.product_name}
                  editing={isEditing} onChange={v => setEditData(p => ({ ...p, product: { ...p.product!, product_name: v } }))} />
                <Field label="Resref" value={isEditing ? editData.product?.product_resref : recipeDetail.product.product_resref}
                  editing={isEditing} onChange={v => setEditData(p => ({ ...p, product: { ...p.product!, product_resref: v } }))} />
                <Field label="Quantity" value={String(isEditing ? editData.product?.product_quantity : recipeDetail.product.product_quantity)}
                  editing={isEditing} onChange={v => setEditData(p => ({ ...p, product: { ...p.product!, product_quantity: parseInt(v) || 1 } }))} type="number" />
                <Field label="Effects" value={isEditing ? editData.product?.product_effects : recipeDetail.product.product_effects}
                  editing={isEditing} onChange={v => setEditData(p => ({ ...p, product: { ...p.product!, product_effects: v } }))} />
                <div className="col-span-2">
                  <Field label="Description" value={isEditing ? editData.product?.product_description : recipeDetail.product.product_description}
                    editing={isEditing} onChange={v => setEditData(p => ({ ...p, product: { ...p.product!, product_description: v } }))} />
                </div>
              </div>
            </div>

            {/* Ingredients */}
            <div>
              <h3 className="text-sm font-semibold text-text mb-2 uppercase tracking-wider">Ingredients</h3>
              <div className="border border-border rounded-lg bg-surface overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-dim border-b border-border">
                      <th className="text-left px-3 py-2 font-medium text-text-secondary">Ingredient</th>
                      <th className="text-left px-3 py-2 font-medium text-text-secondary">Resref</th>
                      <th className="text-left px-3 py-2 font-medium text-text-secondary w-24">Quantity</th>
                      {isEditing && <th className="w-10"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(isEditing ? editData.ingredients : recipeDetail.ingredients)?.map((ing, idx) => (
                      <tr key={idx} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">{ing.ingredient_name}</td>
                        <td className="px-3 py-2 text-text-muted">{ing.ingredient_resref}</td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input
                              type="number"
                              min="1"
                              value={ing.quantity}
                              onChange={e => {
                                const newIngs = [...(editData.ingredients || [])];
                                newIngs[idx] = { ...newIngs[idx], quantity: parseInt(e.target.value) || 1 };
                                setEditData(p => ({ ...p, ingredients: newIngs }));
                              }}
                              className="w-16 px-2 py-0.5 text-sm border border-border rounded"
                            />
                          ) : ing.quantity}
                        </td>
                        {isEditing && (
                          <td className="px-2">
                            <button onClick={() => removeIngredientFromEdit(idx)} className="p-1 text-text-muted hover:text-danger">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {isEditing && (
                  <div className="p-2 border-t border-border">
                    {showIngredientPicker ? (
                      <div className="space-y-1">
                        <div className="relative">
                          <input
                            autoFocus
                            value={ingredientSearch}
                            onChange={e => setIngredientSearch(e.target.value)}
                            placeholder="Search ingredients..."
                            className="w-full px-3 py-1.5 text-sm border border-border rounded"
                          />
                        </div>
                        {ingredientResults && (
                          <div className="max-h-40 overflow-y-auto border border-border rounded bg-surface">
                            {ingredientResults.slice(0, 20).map(ing => (
                              <button
                                key={ing.ingredient_id}
                                onClick={() => addIngredientToEdit(ing)}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-hover border-b border-border last:border-0"
                              >
                                <span className="font-medium">{ing.ingredient_name}</span>
                                <span className="text-text-muted ml-2">{ing.ingredient_resref}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => { setShowIngredientPicker(false); setIngredientSearch(''); }}>Cancel</Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowIngredientPicker(true)}
                        className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary"
                      >
                        <Plus className="h-3 w-3" /> Add Ingredient
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {detailLoading && <Loading />}
      </div>

      <ConfirmDialog
        open={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => { if (deleteConfirmId) { deleteMutation.mutate(deleteConfirmId); setDeleteConfirmId(null); } }}
        title="Delete Recipe"
        description="This will permanently delete the recipe and its ingredient list."
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

function Field({ label, value, editing, onChange, type = 'text' }: {
  label: string; value?: string | null; editing?: boolean; onChange?: (v: string) => void; type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      {editing && onChange ? (
        <input
          type={type}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      ) : (
        <div className="text-sm text-text">{value || <span className="text-text-muted italic">empty</span>}</div>
      )}
    </div>
  );
}

function CreateRecipeForm({ professions, recipeTypes, onSubmit, onCancel, isLoading }: {
  professions: { profession_id: number; profession_name: string }[];
  recipeTypes: { recipe_type_id: number; recipe_type_name: string }[];
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({
    recipe_name: '', recipe_resref: '', recipe_crafting_level: 1,
    profession_id: professions[0]?.profession_id || 1,
    recipe_type_id: recipeTypes[0]?.recipe_type_id || 1,
    product: { product_name: '', product_resref: '', product_quantity: 1, product_effects: '', product_description: '' },
    ingredients: [] as { ingredient_id: number; quantity: number }[],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-text">New Recipe</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onSubmit(form)} disabled={isLoading || !form.recipe_name}>
            <Save className="h-3.5 w-3.5" /> Create
          </Button>
          <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Name" value={form.recipe_name} onChange={e => setForm(f => ({ ...f, recipe_name: e.target.value }))} />
        <Input label="Resref" value={form.recipe_resref} onChange={e => setForm(f => ({ ...f, recipe_resref: e.target.value }))} />
        <Input label="Crafting Level" type="number" value={form.recipe_crafting_level} onChange={e => setForm(f => ({ ...f, recipe_crafting_level: parseInt(e.target.value) || 1 }))} />
        <Select label="Profession" value={form.profession_id} onChange={e => setForm(f => ({ ...f, profession_id: parseInt(e.target.value) }))}
          options={professions.map(p => ({ value: p.profession_id, label: p.profession_name }))} />
        <Select label="Type" value={form.recipe_type_id} onChange={e => setForm(f => ({ ...f, recipe_type_id: parseInt(e.target.value) }))}
          options={recipeTypes.map(t => ({ value: t.recipe_type_id, label: t.recipe_type_name }))} />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text mb-2 uppercase tracking-wider">Product</h3>
        <div className="grid grid-cols-2 gap-4 p-4 bg-surface-dim rounded-lg border border-border">
          <Input label="Product Name" value={form.product.product_name} onChange={e => setForm(f => ({ ...f, product: { ...f.product, product_name: e.target.value } }))} />
          <Input label="Product Resref" value={form.product.product_resref} onChange={e => setForm(f => ({ ...f, product: { ...f.product, product_resref: e.target.value } }))} />
          <Input label="Quantity" type="number" value={form.product.product_quantity} onChange={e => setForm(f => ({ ...f, product: { ...f.product, product_quantity: parseInt(e.target.value) || 1 } }))} />
        </div>
      </div>
    </div>
  );
}
