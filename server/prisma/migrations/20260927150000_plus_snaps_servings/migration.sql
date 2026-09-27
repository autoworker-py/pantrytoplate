-- Pantry2Plate Plus, the free meal-photo allowance, and servings on cooked meals
ALTER TABLE "User" ADD COLUMN "plusSince" DATETIME;
ALTER TABLE "User" ADD COLUMN "snapsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ConsumptionLog" ADD COLUMN "servings" REAL;
