import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import {
  findOrCreateFoodByName,
  importUsdaFood,
  linkCanonical,
  packageGramsFor,
  resolveBarcode,
  searchLocalFoods,
  searchUsda,
  setCanonical,
} from '../services/foodRef.js';
import { invalidateUniversalConversionCache } from '../services/conversions.js';
import { normalizeName } from '../services/matching.js';
import { KNOWN_UNITS, normalizeUnit } from '../services/units.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /** Local catalog search — the manual-add autocomplete. */
  app.get('/search', async (request) => {
    const { q = '', limit = '10' } = request.query as { q?: string; limit?: string };
    const foods = await searchLocalFoods(q, Number(limit) || 10);
    return { foods };
  });

  app.get('/units', async () => ({ units: KNOWN_UNITS }));

  /**
   * Barcode lookup: local cache first, Open Food Facts second. A failure here
   * is not fatal — the client falls back to manual entry.
   */
  app.get('/barcode/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const result = await resolveBarcode(code);
    if (!result.ok) {
      return reply.code(result.reason === 'not_found' ? 404 : 502).send({
        error: result.reason,
        message: result.message,
        fallback: 'manual_entry',
      });
    }
    return {
      food: result.result.food,
      cached: result.result.cached,
      // the add screen defaults to the package, not a single serving
      packageGrams: result.result.packageGrams,
      packageEstimated: result.result.packageEstimated,
    };
  });

  /** USDA free-text search for raw ingredients not yet in the catalog. */
  app.get('/usda/search', async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q?.trim()) return { results: [] };
    const result = await searchUsda(q);
    if (!result.ok) {
      return reply.code(502).send({ error: result.reason, message: result.message, fallback: 'manual_entry' });
    }
    return { results: result.data };
  });

  /** Import a USDA food into the local catalog (and cache it forever). */
  app.post('/usda/import', async (request, reply) => {
    const { fdcId } = z.object({ fdcId: z.string().min(1) }).parse(request.body);
    const result = await importUsdaFood(fdcId);
    if (!result.ok) {
      return reply.code(502).send({ error: result.reason, message: result.message, fallback: 'manual_entry' });
    }
    return reply.code(result.cached ? 200 : 201).send({ food: result.food, cached: result.cached });
  });

  /** Create (or link to) a catalog entry by name. */
  app.post('/', async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        defaultUnit: z.string().default('count'),
        category: z.string().nullish(),
        caloriesPerUnit: z.number().nonnegative().nullish(),
        proteinPerUnit: z.number().nonnegative().nullish(),
        fatPerUnit: z.number().nonnegative().nullish(),
        carbsPerUnit: z.number().nonnegative().nullish(),
        servingSizeGrams: z.number().positive().nullish(),
      })
      .parse(request.body);

    const result = await findOrCreateFoodByName(body);
    return reply.code(result.created ? 201 : 200).send(result);
  });

  /**
   * Teach the app a product the barcode databases do not have.
   *
   * Open Food Facts is community-maintained and genuinely does not know a great
   * many products, particularly own-brand and non-European ones. Without this,
   * a failed scan is a dead end and the only way forward is to type the item in
   * by hand every single time.
   *
   * Stamping the barcode onto the row is the whole point: the next scan of the
   * same product resolves locally and instantly, which is the app's promise —
   * enter a food once.
   */
  app.post('/barcode/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const barcode = code.replace(/\D/g, '');
    if (barcode.length < 6) throw badRequest('That does not look like a barcode.');

    const body = z
      .object({
        name: z.string().min(1, 'Give the product a name.'),
        brand: z.string().nullish(),
        defaultUnit: z.string().default('g'),
        category: z.string().nullish(),
        /** per one of defaultUnit — the label's per-100g figures divided by 100 */
        caloriesPerUnit: z.number().nonnegative().nullish(),
        proteinPerUnit: z.number().nonnegative().nullish(),
        carbsPerUnit: z.number().nonnegative().nullish(),
        fatPerUnit: z.number().nonnegative().nullish(),
        servingSizeGrams: z.number().positive().nullish(),
        /** what one whole pack weighs, so "full pack" means something */
        packageGrams: z.number().positive().nullish(),
      })
      .parse(request.body);

    const existing = await prisma.foodReference.findUnique({ where: { barcode } });
    const data = {
      name: body.name.trim(),
      nameNorm: normalizeName(body.name),
      brand: body.brand ?? null,
      barcode,
      source: 'manual',
      category: body.category ?? null,
      defaultUnit: normalizeUnit(body.defaultUnit),
      caloriesPerUnit: body.caloriesPerUnit ?? null,
      proteinPerUnit: body.proteinPerUnit ?? null,
      carbsPerUnit: body.carbsPerUnit ?? null,
      fatPerUnit: body.fatPerUnit ?? null,
      servingSizeGrams: body.servingSizeGrams ?? null,
    };

    // a second scan of a product someone already described corrects it rather
    // than failing on the unique barcode
    const food = existing
      ? await prisma.foodReference.update({ where: { id: existing.id }, data })
      : await prisma.foodReference.create({ data });

    if (body.packageGrams) {
      await prisma.unitConversion.upsert({
        where: {
          foodReferenceId_fromUnit_toUnit: {
            foodReferenceId: food.id,
            fromUnit: 'package',
            toUnit: 'g',
          },
        },
        create: { foodReferenceId: food.id, fromUnit: 'package', toUnit: 'g', multiplier: body.packageGrams },
        update: { multiplier: body.packageGrams },
      });
    }

    /*
     * Work out what generic ingredient this is a version of, so recipes calling
     * for "olive oil" count it. Only a suggestion, and only when the name and
     * the calorie density agree — a wrong link is worse than none.
     */
    const suggestion = await linkCanonical(food.id);

    return reply.code(existing ? 200 : 201).send({
      food: { ...food, canonicalId: suggestion?.foodId ?? food.canonicalId },
      countsAs: suggestion ? { id: suggestion.foodId, name: suggestion.foodName } : null,
      updated: Boolean(existing),
    });
  });

  app.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const food = await prisma.foodReference.findUnique({
      where: { id },
      include: { unitConversions: true, synonyms: true },
    });
    if (!food) throw notFound('Food not found.');
    return { food };
  });

  /**
   * Tell the app what a product actually is: "this bottle counts as Olive Oil".
   *
   * The scan flow guesses from the name, but a guess can be wrong in both
   * directions — a garlic sauce that mentions olive oil, or an oil we did not
   * recognise. This is how a person settles it, and a decision made here is
   * never overwritten by a later guess.
   */
  app.put('/:id/counts-as', async (request) => {
    const { id } = request.params as { id: string };
    const { canonicalId } = z
      .object({ canonicalId: z.string().nullable() })
      .parse(request.body);

    const food = await setCanonical(id, canonicalId);
    return { food };
  });

  /** Ask the app to guess again (used after the catalog grows). */
  app.post('/:id/counts-as/suggest', async (request) => {
    const { id } = request.params as { id: string };
    return { suggestion: await linkCanonical(id) };
  });

  /**
   * How big is one pack of this?
   *
   * `known` is the part that matters to the UI: an estimate from the category
   * is a starting point to correct, not an answer. Asking once, the first time
   * something is added, is the difference between "1 pack of rice" meaning
   * something and meaning nothing.
   */
  app.get('/:id/pack', async (request) => {
    const { id } = request.params as { id: string };
    const food = await prisma.foodReference.findUnique({ where: { id } });
    if (!food) throw notFound('Food not found.');

    const pack = await packageGramsFor(food);
    return {
      foodReferenceId: food.id,
      name: food.name,
      defaultUnit: food.defaultUnit,
      grams: pack.grams,
      estimated: pack.estimated,
      known: pack.grams !== null && !pack.estimated,
    };
  });

  /**
   * Teach the app a conversion it did not know ("1 box of these = 10 count").
   * This is the escape hatch behind every "confirm this manually" prompt.
   */
  app.post('/:id/conversions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        fromUnit: z.string().min(1),
        toUnit: z.string().min(1),
        multiplier: z.number().positive(),
      })
      .parse(request.body);

    const food = await prisma.foodReference.findUnique({ where: { id } });
    if (!food) throw notFound('Food not found.');

    const fromUnit = normalizeUnit(body.fromUnit);
    const toUnit = normalizeUnit(body.toUnit);
    const conversion = await prisma.unitConversion.upsert({
      where: { foodReferenceId_fromUnit_toUnit: { foodReferenceId: id, fromUnit, toUnit } },
      create: { foodReferenceId: id, fromUnit, toUnit, multiplier: body.multiplier },
      update: { multiplier: body.multiplier },
    });
    invalidateUniversalConversionCache();
    return reply.code(201).send({ conversion });
  });
};

export default routes;
