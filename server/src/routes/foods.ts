import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { limit } from '../limits.js';
import type { FoodReference } from '@prisma/client';
import {
  findOrCreateFoodByName,
  importUsdaFood,
  linkCanonical,
  packageGramsFor,
  packageSizeFor,
  resolveBarcode,
  searchLocalFoods,
  searchUsda,
  setCanonical,
} from '../services/foodRef.js';
import { searchProducts } from '../external/openfoodfacts.js';
import { invalidateUniversalConversionCache } from '../services/conversions.js';
import { normalizeName } from '../services/matching.js';
import { KNOWN_UNITS, normalizeUnit } from '../services/units.js';

/**
 * A food this person may see: the shared catalogue, every product with a
 * barcode (whoever first described it, the next person to scan it sees it),
 * and their own entries, but never someone else's typed-in food ("Nan's
 * stuffing" is theirs). Anything else reads as missing, not forbidden.
 */
async function visibleFood(id: string, userId: string): Promise<FoodReference> {
  const food = await prisma.foodReference.findUnique({ where: { id } });
  if (!food || (food.ownerId && food.ownerId !== userId && !food.barcode)) throw notFound('Food not found.');
  return food;
}

/** lookups that reach an outside service, per address: plenty for a person, short of a script */
const LOOKUPS = limit(60, '1 minute');

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  /** Local catalog search — the manual-add autocomplete. */
  app.get('/search', async (request) => {
    const { q = '', limit: count = '10' } = request.query as { q?: string; limit?: string };
    const foods = await searchLocalFoods(q.slice(0, 100), Math.min(Number(count) || 10, 50), undefined, request.userId);
    return { foods };
  });

  /**
   * Free-text search of Open Food Facts, for when the local catalogue does not
   * know the product. Never fatal: a failure here just means the person adds
   * the food by hand, exactly as before.
   */
  app.get('/search/external', LOOKUPS, async (request) => {
    const { q = '', limit: count = '12' } = request.query as { q?: string; limit?: string };
    const result = await searchProducts(q.slice(0, 100), Math.min(Number(count) || 12, 24));
    if (!result.ok) return { results: [], unavailable: result.reason };
    return { results: result.data };
  });

  app.get('/units', async () => ({ units: KNOWN_UNITS }));

  /**
   * Barcode lookup: local cache first, Open Food Facts second. A failure here
   * is not fatal — the client falls back to manual entry.
   */
  app.get('/barcode/:code', LOOKUPS, async (request, reply) => {
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
      // the pack in its own unit (500 ml, 12 count), when it is known rather than guessed
      packageAmount: result.result.packageAmount,
      packageUnit: result.result.packageUnit,
    };
  });

  /** USDA free-text search for raw ingredients not yet in the catalog. */
  app.get('/usda/search', LOOKUPS, async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q?.trim()) return { results: [] };
    const result = await searchUsda(q.slice(0, 100));
    if (!result.ok) {
      return reply.code(502).send({ error: result.reason, message: result.message, fallback: 'manual_entry' });
    }
    return { results: result.data };
  });

  /** Import a USDA food into the local catalog (and cache it forever). */
  app.post('/usda/import', LOOKUPS, async (request, reply) => {
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
        name: z.string().min(1).max(120),
        defaultUnit: z.string().max(30).default('count'),
        category: z.string().nullish(),
        caloriesPerUnit: z.number().nonnegative().nullish(),
        proteinPerUnit: z.number().nonnegative().nullish(),
        fatPerUnit: z.number().nonnegative().nullish(),
        carbsPerUnit: z.number().nonnegative().nullish(),
        servingSizeGrams: z.number().positive().nullish(),
      })
      .parse(request.body);

    // typed by hand, so it belongs to the person who typed it
    const result = await findOrCreateFoodByName(body, undefined, request.userId);
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
  app.post('/barcode/:code', LOOKUPS, async (request, reply) => {
    const { code } = request.params as { code: string };
    const barcode = code.replace(/\D/g, '');
    if (barcode.length < 6 || barcode.length > 14) throw badRequest('That does not look like a barcode.');

    const body = z
      .object({
        name: z.string().min(1, 'Give the product a name.').max(120),
        brand: z.string().max(80).nullish(),
        defaultUnit: z.string().max(30).default('g'),
        category: z.string().nullish(),
        /** per one of defaultUnit — the label's per-100g figures divided by 100 */
        caloriesPerUnit: z.number().nonnegative().nullish(),
        proteinPerUnit: z.number().nonnegative().nullish(),
        carbsPerUnit: z.number().nonnegative().nullish(),
        fatPerUnit: z.number().nonnegative().nullish(),
        servingSizeGrams: z.number().positive().nullish(),
        /** how much one whole pack holds, so "full pack" means something */
        packageGrams: z.number().positive().nullish(),
        /** the unit that amount is in; grams when not said */
        packageUnit: z.string().nullish(),
      })
      .parse(request.body);

    const existing = await prisma.foodReference.findUnique({ where: { barcode } });
    // one person's description of a product is theirs to correct; a product someone else
    // described, or one from the barcode database, is not theirs to rewrite for everybody
    if (existing && existing.ownerId !== request.userId) {
      throw conflict('That barcode is already known. Scan it again to add it.', 'barcode_known');
    }
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
      // anyone who scans it later sees this description; only its author can change it
      ownerId: request.userId,
    };

    // a second scan by the same person corrects their description rather than
    // failing on the unique barcode
    const food = existing
      ? await prisma.foodReference.update({ where: { id: existing.id }, data })
      : await prisma.foodReference.create({ data });

    if (body.packageGrams) {
      const packUnit = normalizeUnit(body.packageUnit ?? 'g');
      await prisma.unitConversion.upsert({
        where: {
          foodReferenceId_fromUnit_toUnit: {
            foodReferenceId: food.id,
            fromUnit: 'package',
            toUnit: packUnit,
          },
        },
        create: { foodReferenceId: food.id, fromUnit: 'package', toUnit: packUnit, multiplier: body.packageGrams },
        update: { multiplier: body.packageGrams },
      });
      await prisma.unitConversion.deleteMany({ where: { foodReferenceId: food.id, fromUnit: 'package', NOT: { toUnit: packUnit } } });
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
    await visibleFood(id, request.userId);
    const food = await prisma.foodReference.findUnique({
      where: { id },
      include: { unitConversions: true, synonyms: true },
    });
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

    // only a scanned product counts as something; the catalogue's own foods are not anyone's to relink
    const product = await visibleFood(id, request.userId);
    if (!product.barcode) throw forbidden('Only a scanned product can be linked to a food.', 'not_a_product');
    if (canonicalId) await visibleFood(canonicalId, request.userId);

    const food = await setCanonical(id, canonicalId);
    return { food };
  });

  /** Ask the app to guess again (used after the catalog grows). */
  app.post('/:id/counts-as/suggest', async (request) => {
    const { id } = request.params as { id: string };
    await visibleFood(id, request.userId);
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
    const food = await visibleFood(id, request.userId);

    // the person's own answer for this food comes first: their packs, not the catalogue's guess
    const mine = food.packageGramsScanned ? null : await prisma.userPackSize.findUnique({ where: { userId_foodReferenceId: { userId: request.userId, foodReferenceId: id } } });
    if (mine) {
      return { foodReferenceId: food.id, name: food.name, defaultUnit: food.defaultUnit, amount: mine.amount, unit: mine.unit, grams: mine.unit === 'g' ? mine.amount : null, estimated: false, known: true };
    }

    const pack = await packageSizeFor(food);
    return {
      foodReferenceId: food.id,
      name: food.name,
      defaultUnit: food.defaultUnit,
      amount: pack.amount,
      unit: pack.unit,
      // for app versions that only know grams
      grams: pack.unit === 'g' ? pack.amount : null,
      estimated: pack.estimated,
      known: pack.amount !== null && !pack.estimated,
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
        fromUnit: z.string().min(1).max(30),
        toUnit: z.string().min(1).max(30),
        multiplier: z.number().positive().max(100_000),
      })
      .parse(request.body);

    const food = await visibleFood(id, request.userId);

    const fromUnit = normalizeUnit(body.fromUnit);
    const toUnit = normalizeUnit(body.toUnit);
    // a scanned product's pack size is the product database's; nothing overwrites it
    if (fromUnit === 'package' && food.packageGramsScanned && food.packageGramsScanned > 0) {
      const kept = await prisma.unitConversion.findFirst({ where: { foodReferenceId: id, fromUnit, toUnit } });
      return reply.code(200).send({ conversion: kept, kept: 'scanned' });
    }
    // how big your pack is, is yours: one person's 5 kg sack of rice is not everyone's.
    // Only a food you added yourself (and so a product you described) changes for everyone.
    if (fromUnit === 'package' && food.ownerId !== request.userId) {
      const key = { userId: request.userId, foodReferenceId: id };
      await prisma.userPackSize.upsert({ where: { userId_foodReferenceId: key }, create: { ...key, amount: body.multiplier, unit: toUnit }, update: { amount: body.multiplier, unit: toUnit } });
      return reply.code(201).send({ conversion: { foodReferenceId: id, fromUnit, toUnit, multiplier: body.multiplier }, scope: 'yours' });
    }
    // any other conversion changes the food for everyone who has it: only for foods you added
    if (food.ownerId !== request.userId) throw forbidden('Only foods you added can be changed.', 'not_yours');
    const conversion = await prisma.unitConversion.upsert({
      where: { foodReferenceId_fromUnit_toUnit: { foodReferenceId: id, fromUnit, toUnit } },
      create: { foodReferenceId: id, fromUnit, toUnit, multiplier: body.multiplier },
      update: { multiplier: body.multiplier },
    });
    // one pack size at a time: a pack now given in ml replaces one given in g
    if (fromUnit === 'package') {
      await prisma.unitConversion.deleteMany({ where: { foodReferenceId: id, fromUnit: 'package', NOT: { toUnit } } });
    }
    invalidateUniversalConversionCache();
    return reply.code(201).send({ conversion });
  });
};

export default routes;
