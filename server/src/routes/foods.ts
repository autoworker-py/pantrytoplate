import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../errors.js';
import {
  findOrCreateFoodByName,
  importUsdaFood,
  linkCanonical,
  resolveBarcode,
  searchLocalFoods,
  searchUsda,
  setCanonical,
} from '../services/foodRef.js';
import { invalidateUniversalConversionCache } from '../services/conversions.js';
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
