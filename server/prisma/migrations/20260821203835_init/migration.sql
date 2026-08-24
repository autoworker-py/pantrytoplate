-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FoodReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "brand" TEXT,
    "barcode" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "category" TEXT,
    "defaultUnit" TEXT NOT NULL,
    "caloriesPerUnit" REAL,
    "proteinPerUnit" REAL,
    "fatPerUnit" REAL,
    "carbsPerUnit" REAL,
    "servingSizeGrams" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FoodSynonym" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "foodReferenceId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    CONSTRAINT "FoodSynonym_foodReferenceId_fkey" FOREIGN KEY ("foodReferenceId") REFERENCES "FoodReference" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "foodReferenceId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "expirationDate" DATETIME,
    "purchasedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_foodReferenceId_fkey" FOREIGN KEY ("foodReferenceId") REFERENCES "FoodReference" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT NOT NULL,
    "servings" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'seeded',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "foodReferenceId" TEXT NOT NULL,
    "quantityRequired" REAL NOT NULL,
    "unitRequired" TEXT NOT NULL,
    "note" TEXT,
    CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeIngredient_foodReferenceId_fkey" FOREIGN KEY ("foodReferenceId") REFERENCES "FoodReference" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsumptionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "foodReferenceId" TEXT NOT NULL,
    "quantityConsumed" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "recipeId" TEXT,
    "calories" REAL,
    "consumedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsumptionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsumptionLog_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ConsumptionLog_foodReferenceId_fkey" FOREIGN KEY ("foodReferenceId") REFERENCES "FoodReference" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsumptionLog_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShoppingListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "foodReferenceId" TEXT,
    "name" TEXT NOT NULL,
    "quantityNeeded" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "addedFrom" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShoppingListItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShoppingListItem_foodReferenceId_fkey" FOREIGN KEY ("foodReferenceId") REFERENCES "FoodReference" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnitConversion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "foodReferenceId" TEXT,
    "fromUnit" TEXT NOT NULL,
    "toUnit" TEXT NOT NULL,
    "multiplier" REAL NOT NULL,
    CONSTRAINT "UnitConversion_foodReferenceId_fkey" FOREIGN KEY ("foodReferenceId") REFERENCES "FoodReference" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FoodReference_barcode_key" ON "FoodReference"("barcode");

-- CreateIndex
CREATE INDEX "FoodReference_nameNorm_idx" ON "FoodReference"("nameNorm");

-- CreateIndex
CREATE UNIQUE INDEX "FoodSynonym_term_key" ON "FoodSynonym"("term");

-- CreateIndex
CREATE INDEX "FoodSynonym_foodReferenceId_idx" ON "FoodSynonym"("foodReferenceId");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_expirationDate_idx" ON "InventoryItem"("userId", "expirationDate");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_foodReferenceId_idx" ON "InventoryItem"("userId", "foodReferenceId");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_idx" ON "RecipeIngredient"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeIngredient_foodReferenceId_idx" ON "RecipeIngredient"("foodReferenceId");

-- CreateIndex
CREATE INDEX "ConsumptionLog_userId_consumedAt_idx" ON "ConsumptionLog"("userId", "consumedAt");

-- CreateIndex
CREATE INDEX "ShoppingListItem_userId_isChecked_idx" ON "ShoppingListItem"("userId", "isChecked");

-- CreateIndex
CREATE INDEX "UnitConversion_foodReferenceId_idx" ON "UnitConversion"("foodReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitConversion_foodReferenceId_fromUnit_toUnit_key" ON "UnitConversion"("foodReferenceId", "fromUnit", "toUnit");
