-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT NOT NULL,
    "servings" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'seeded',
    "prepMinutes" INTEGER,
    "cookMinutes" INTEGER,
    "difficulty" TEXT,
    "cuisine" TEXT,
    "tags" TEXT,
    "sourceUrl" TEXT,
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recipe_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Recipe" ("cookMinutes", "createdAt", "cuisine", "description", "difficulty", "id", "instructions", "name", "prepMinutes", "servings", "source", "sourceUrl", "tags") SELECT "cookMinutes", "createdAt", "cuisine", "description", "difficulty", "id", "instructions", "name", "prepMinutes", "servings", "source", "sourceUrl", "tags" FROM "Recipe";
DROP TABLE "Recipe";
ALTER TABLE "new_Recipe" RENAME TO "Recipe";
CREATE INDEX "Recipe_ownerId_idx" ON "Recipe"("ownerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
