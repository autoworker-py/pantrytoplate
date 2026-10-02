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
    "fastingPlan" TEXT,
    "fastingStart" TEXT,
    "fastingNotify" BOOLEAN NOT NULL DEFAULT true,
    "exerciseCalories" TEXT NOT NULL DEFAULT 'all',
    "heightCm" REAL,
    "weightKg" REAL,
    "birthYear" INTEGER,
    "sex" TEXT,
    "activityLevel" TEXT,
    "weeklyRateKg" REAL,
    "goalWeightKg" REAL,
    "goalDate" TEXT,
    "targetSetBy" TEXT NOT NULL DEFAULT 'app',
    "adaptedTdee" INTEGER,
    "adaptedAt" DATETIME,
    "onboardedAt" DATETIME,
    "privacyAcceptedAt" DATETIME,
    "privacyVersion" TEXT,
    "sessionsValidFrom" DATETIME,
    "emailUnconfirmed" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("activityLevel", "adPhotosDay", "adPhotosThatDay", "adaptedAt", "adaptedTdee", "adsEnabled", "autoShoppingEnabled", "birthYear", "carbsTargetGrams", "createdAt", "dailyCalorieTarget", "dietTags", "email", "emailUnconfirmed", "expiryWarningDays", "fastingNotify", "fastingPlan", "fastingStart", "fatTargetGrams", "goalDate", "goalWeightKg", "heightCm", "id", "notifyExpiry", "onboardedAt", "passwordHash", "plusSince", "privacyAcceptedAt", "privacyVersion", "proteinTargetGrams", "sessionsValidFrom", "sex", "snapsEarned", "snapsUsed", "targetSetBy", "unitSystem", "waterGoalMl", "weeklyRateKg", "weightGoal", "weightKg") SELECT "activityLevel", "adPhotosDay", "adPhotosThatDay", "adaptedAt", "adaptedTdee", "adsEnabled", "autoShoppingEnabled", "birthYear", "carbsTargetGrams", "createdAt", "dailyCalorieTarget", "dietTags", "email", "emailUnconfirmed", "expiryWarningDays", "fastingNotify", "fastingPlan", "fastingStart", "fatTargetGrams", "goalDate", "goalWeightKg", "heightCm", "id", "notifyExpiry", "onboardedAt", "passwordHash", "plusSince", "privacyAcceptedAt", "privacyVersion", "proteinTargetGrams", "sessionsValidFrom", "sex", "snapsEarned", "snapsUsed", "targetSetBy", "unitSystem", "waterGoalMl", "weeklyRateKg", "weightGoal", "weightKg" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

