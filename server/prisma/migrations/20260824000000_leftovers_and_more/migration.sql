-- Leftovers, substitutions, ratings, meal planning, and per-user preferences.
ALTER TABLE "User" ADD COLUMN "unitSystem" TEXT NOT NULL DEFAULT 'metric';
ALTER TABLE "User" ADD COLUMN "dietTags" TEXT;
ALTER TABLE "User" ADD COLUMN "notifyExpiry" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "FoodReference" ADD COLUMN "cookedFromRecipeId" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "isLeftover" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Substitution" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "foodReferenceId" TEXT NOT NULL,
  "substituteId" TEXT NOT NULL,
  "ratio" REAL NOT NULL DEFAULT 1,
  "note" TEXT,
  "rank" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Substitution_foodReferenceId_fkey" FOREIGN KEY ("foodReferenceId") REFERENCES "FoodReference" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Substitution_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "FoodReference" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Substitution_foodReferenceId_substituteId_key" ON "Substitution"("foodReferenceId", "substituteId");
CREATE INDEX "Substitution_foodReferenceId_idx" ON "Substitution"("foodReferenceId");

CREATE TABLE "RecipeRating" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "note" TEXT,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "RecipeRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecipeRating_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecipeRating_userId_recipeId_key" ON "RecipeRating"("userId", "recipeId");
CREATE INDEX "RecipeRating_recipeId_idx" ON "RecipeRating"("recipeId");

CREATE TABLE "MealPlanEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "plannedFor" DATETIME NOT NULL,
  "servings" INTEGER NOT NULL DEFAULT 1,
  "mealSlot" TEXT NOT NULL DEFAULT 'dinner',
  "cookedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MealPlanEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MealPlanEntry_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MealPlanEntry_userId_plannedFor_idx" ON "MealPlanEntry"("userId", "plannedFor");
