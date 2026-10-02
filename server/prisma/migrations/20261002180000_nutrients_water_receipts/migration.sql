-- AlterTable
ALTER TABLE "ConsumptionLog" ADD COLUMN "asLogged" TEXT;
ALTER TABLE "ConsumptionLog" ADD COLUMN "eatenShare" REAL;
ALTER TABLE "ConsumptionLog" ADD COLUMN "fiberGrams" REAL;
ALTER TABLE "ConsumptionLog" ADD COLUMN "mealName" TEXT;
ALTER TABLE "ConsumptionLog" ADD COLUMN "restRef" TEXT;
ALTER TABLE "ConsumptionLog" ADD COLUMN "restTo" TEXT;
ALTER TABLE "ConsumptionLog" ADD COLUMN "satFatGrams" REAL;
ALTER TABLE "ConsumptionLog" ADD COLUMN "sodiumMg" REAL;
ALTER TABLE "ConsumptionLog" ADD COLUMN "sugarGrams" REAL;

-- AlterTable
ALTER TABLE "FoodReference" ADD COLUMN "fiberPerUnit" REAL;
ALTER TABLE "FoodReference" ADD COLUMN "satFatPerUnit" REAL;
ALTER TABLE "FoodReference" ADD COLUMN "sodiumPerUnit" REAL;
ALTER TABLE "FoodReference" ADD COLUMN "sugarPerUnit" REAL;

-- CreateTable
CREATE TABLE "WaterLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ml" INTEGER NOT NULL,
    "loggedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaterLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "adsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoShoppingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "expiryWarningDays" INTEGER NOT NULL DEFAULT 3,
    "unitSystem" TEXT NOT NULL DEFAULT 'metric',
    "plusSince" DATETIME,
    "snapsUsed" INTEGER NOT NULL DEFAULT 0,
    "snapsEarned" INTEGER NOT NULL DEFAULT 0,
    "adPhotosDay" TEXT,
    "adPhotosThatDay" INTEGER NOT NULL DEFAULT 0,
    "dietTags" TEXT,
    "notifyExpiry" BOOLEAN NOT NULL DEFAULT true,
    "waterGoalMl" INTEGER NOT NULL DEFAULT 2500,
    "heightCm" REAL,
    "weightKg" REAL,
    "birthYear" INTEGER,
    "sex" TEXT,
    "activityLevel" TEXT,
    "weeklyRateKg" REAL,
    "onboardedAt" DATETIME,
    "privacyAcceptedAt" DATETIME,
    "privacyVersion" TEXT,
    "sessionsValidFrom" DATETIME,
    "emailUnconfirmed" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("activityLevel", "adPhotosDay", "adPhotosThatDay", "adsEnabled", "autoShoppingEnabled", "birthYear", "carbsTargetGrams", "createdAt", "dailyCalorieTarget", "dietTags", "email", "emailUnconfirmed", "expiryWarningDays", "fatTargetGrams", "heightCm", "id", "notifyExpiry", "onboardedAt", "passwordHash", "plusSince", "privacyAcceptedAt", "privacyVersion", "proteinTargetGrams", "sessionsValidFrom", "sex", "snapsEarned", "snapsUsed", "unitSystem", "weeklyRateKg", "weightGoal", "weightKg") SELECT "activityLevel", "adPhotosDay", "adPhotosThatDay", "adsEnabled", "autoShoppingEnabled", "birthYear", "carbsTargetGrams", "createdAt", "dailyCalorieTarget", "dietTags", "email", "emailUnconfirmed", "expiryWarningDays", "fatTargetGrams", "heightCm", "id", "notifyExpiry", "onboardedAt", "passwordHash", "plusSince", "privacyAcceptedAt", "privacyVersion", "proteinTargetGrams", "sessionsValidFrom", "sex", "snapsEarned", "snapsUsed", "unitSystem", "weeklyRateKg", "weightGoal", "weightKg" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WaterLog_userId_loggedAt_idx" ON "WaterLog"("userId", "loggedAt");

