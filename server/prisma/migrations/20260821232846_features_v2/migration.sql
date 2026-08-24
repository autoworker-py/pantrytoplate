-- AlterTable
ALTER TABLE "FoodReference" ADD COLUMN "pricePerUnit" REAL;
ALTER TABLE "FoodReference" ADD COLUMN "shelfLifeDays" INTEGER;
ALTER TABLE "FoodReference" ADD COLUMN "sponsorName" TEXT;
ALTER TABLE "FoodReference" ADD COLUMN "sponsorTagline" TEXT;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "cookMinutes" INTEGER;
ALTER TABLE "Recipe" ADD COLUMN "cuisine" TEXT;
ALTER TABLE "Recipe" ADD COLUMN "difficulty" TEXT;
ALTER TABLE "Recipe" ADD COLUMN "prepMinutes" INTEGER;
ALTER TABLE "Recipe" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "Recipe" ADD COLUMN "tags" TEXT;

-- CreateTable
CREATE TABLE "InventoryRemoval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "foodReferenceId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "estimatedValue" REAL,
    "removedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryRemoval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryRemoval_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryRemoval_foodReferenceId_fkey" FOREIGN KEY ("foodReferenceId") REFERENCES "FoodReference" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShelfLife" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "pantryDays" INTEGER,
    "fridgeDays" INTEGER,
    "freezerDays" INTEGER
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ConsumptionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "foodReferenceId" TEXT NOT NULL,
    "quantityConsumed" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "recipeId" TEXT,
    "mealSlot" TEXT NOT NULL DEFAULT 'snack',
    "calories" REAL,
    "proteinGrams" REAL,
    "carbsGrams" REAL,
    "fatGrams" REAL,
    "consumedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsumptionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsumptionLog_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ConsumptionLog_foodReferenceId_fkey" FOREIGN KEY ("foodReferenceId") REFERENCES "FoodReference" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsumptionLog_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ConsumptionLog" ("calories", "consumedAt", "foodReferenceId", "id", "inventoryItemId", "quantityConsumed", "recipeId", "source", "unit", "userId") SELECT "calories", "consumedAt", "foodReferenceId", "id", "inventoryItemId", "quantityConsumed", "recipeId", "source", "unit", "userId" FROM "ConsumptionLog";
DROP TABLE "ConsumptionLog";
ALTER TABLE "new_ConsumptionLog" RENAME TO "ConsumptionLog";
CREATE INDEX "ConsumptionLog_userId_consumedAt_idx" ON "ConsumptionLog"("userId", "consumedAt");
CREATE TABLE "new_InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "foodReferenceId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "expirationDate" DATETIME,
    "purchasedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storageLocation" TEXT NOT NULL DEFAULT 'pantry',
    "lowStockThreshold" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_foodReferenceId_fkey" FOREIGN KEY ("foodReferenceId") REFERENCES "FoodReference" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InventoryItem" ("createdAt", "expirationDate", "foodReferenceId", "id", "purchasedAt", "quantity", "unit", "updatedAt", "userId") SELECT "createdAt", "expirationDate", "foodReferenceId", "id", "purchasedAt", "quantity", "unit", "updatedAt", "userId" FROM "InventoryItem";
DROP TABLE "InventoryItem";
ALTER TABLE "new_InventoryItem" RENAME TO "InventoryItem";
CREATE INDEX "InventoryItem_userId_expirationDate_idx" ON "InventoryItem"("userId", "expirationDate");
CREATE INDEX "InventoryItem_userId_foodReferenceId_idx" ON "InventoryItem"("userId", "foodReferenceId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weightGoal" TEXT NOT NULL DEFAULT 'maintain',
    "dailyCalorieTarget" INTEGER NOT NULL DEFAULT 2000,
    "proteinTargetGrams" INTEGER,
    "carbsTargetGrams" INTEGER,
    "fatTargetGrams" INTEGER,
    "adsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoShoppingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "expiryWarningDays" INTEGER NOT NULL DEFAULT 3
);
INSERT INTO "new_User" ("createdAt", "email", "id", "passwordHash") SELECT "createdAt", "email", "id", "passwordHash" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "InventoryRemoval_userId_removedAt_idx" ON "InventoryRemoval"("userId", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShelfLife_category_key" ON "ShelfLife"("category");
