-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FoodReference" (
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
    "shelfLifeDays" INTEGER,
    "pricePerUnit" REAL,
    "sponsorName" TEXT,
    "sponsorTagline" TEXT,
    "canonicalId" TEXT,
    "canonicalSource" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FoodReference_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "FoodReference" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FoodReference" ("barcode", "brand", "caloriesPerUnit", "carbsPerUnit", "category", "createdAt", "defaultUnit", "externalId", "fatPerUnit", "id", "name", "nameNorm", "pricePerUnit", "proteinPerUnit", "servingSizeGrams", "shelfLifeDays", "source", "sponsorName", "sponsorTagline", "updatedAt") SELECT "barcode", "brand", "caloriesPerUnit", "carbsPerUnit", "category", "createdAt", "defaultUnit", "externalId", "fatPerUnit", "id", "name", "nameNorm", "pricePerUnit", "proteinPerUnit", "servingSizeGrams", "shelfLifeDays", "source", "sponsorName", "sponsorTagline", "updatedAt" FROM "FoodReference";
DROP TABLE "FoodReference";
ALTER TABLE "new_FoodReference" RENAME TO "FoodReference";
CREATE UNIQUE INDEX "FoodReference_barcode_key" ON "FoodReference"("barcode");
CREATE INDEX "FoodReference_nameNorm_idx" ON "FoodReference"("nameNorm");
CREATE INDEX "FoodReference_canonicalId_idx" ON "FoodReference"("canonicalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
