import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware';
import { p } from '../utils/params';
import * as craftingService from '../services/crafting';

const router = Router();

const requireEditor = requireRole('admin', 'editor');

// Recipes
router.get('/recipes', requireAuth, (req, res) => {
  try {
    const result = craftingService.getRecipes({
      professionId: req.query.profession_id ? parseInt(req.query.profession_id as string, 10) : undefined,
      typeId: req.query.type_id ? parseInt(req.query.type_id as string, 10) : undefined,
      levelMin: req.query.level_min ? parseInt(req.query.level_min as string, 10) : undefined,
      levelMax: req.query.level_max ? parseInt(req.query.level_max as string, 10) : undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/recipes/:id', requireAuth, (req, res) => {
  try {
    const detail = craftingService.getRecipeDetail(parseInt(p(req.params.id), 10));
    if (!detail) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    res.json(detail);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/recipes', requireEditor, (req, res) => {
  try {
    const id = craftingService.createRecipe(req.body, req.user!);
    res.status(201).json({ recipe_id: id });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/recipes/:id', requireEditor, (req, res) => {
  try {
    craftingService.updateRecipe(parseInt(p(req.params.id), 10), req.body, req.user!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/recipes/:id', requireEditor, (req, res) => {
  try {
    craftingService.deleteRecipe(parseInt(p(req.params.id), 10), req.user!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Ingredients
router.get('/ingredients', requireAuth, (req, res) => {
  try {
    res.json(craftingService.getIngredients(req.query.search as string | undefined));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ingredients', requireEditor, (req, res) => {
  try {
    const id = craftingService.createIngredient(req.body, req.user!);
    res.status(201).json({ ingredient_id: id });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/ingredients/:id', requireEditor, (req, res) => {
  try {
    craftingService.updateIngredient(parseInt(p(req.params.id), 10), req.body, req.user!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/ingredients/:id', requireEditor, (req, res) => {
  try {
    craftingService.deleteIngredient(parseInt(p(req.params.id), 10), req.user!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Reference data
router.get('/professions', requireAuth, (_req, res) => {
  try { res.json(craftingService.getProfessions()); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/recipe-types', requireAuth, (_req, res) => {
  try { res.json(craftingService.getRecipeTypes()); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/products', requireAuth, (req, res) => {
  try { res.json(craftingService.getProducts(req.query.search as string | undefined)); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});

export default router;
