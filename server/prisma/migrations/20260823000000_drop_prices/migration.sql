-- Remove price estimation.
--
-- Food prices move constantly, vary by shop and week, and we do not read
-- receipts — so any figure here was a confident-looking guess. Waste is
-- reported as counts and amounts instead, which are true.
ALTER TABLE "FoodReference" DROP COLUMN "pricePerUnit";
ALTER TABLE "InventoryRemoval" DROP COLUMN "estimatedValue";
