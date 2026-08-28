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
    "dietTags" TEXT,
    "notifyExpiry" BOOLEAN NOT NULL DEFAULT true,
    "heightCm" REAL,
    "weightKg" REAL,
    "birthYear" INTEGER,
    "sex" TEXT,
    "activityLevel" TEXT,
    "weeklyRateKg" REAL,
    "onboardedAt" DATETIME,
    "privacyAcceptedAt" DATETIME,
    "privacyVersion" TEXT
);
INSERT INTO "new_User" ("activityLevel", "adsEnabled", "autoShoppingEnabled", "birthYear", "carbsTargetGrams", "createdAt", "dailyCalorieTarget", "dietTags", "email", "expiryWarningDays", "fatTargetGrams", "heightCm", "id", "notifyExpiry", "onboardedAt", "passwordHash", "privacyAcceptedAt", "privacyVersion", "proteinTargetGrams", "sex", "unitSystem", "weeklyRateKg", "weightGoal", "weightKg") SELECT "activityLevel", "adsEnabled", "autoShoppingEnabled", "birthYear", "carbsTargetGrams", "createdAt", "dailyCalorieTarget", "dietTags", "email", "expiryWarningDays", "fatTargetGrams", "heightCm", "id", "notifyExpiry", "onboardedAt", "passwordHash", "privacyAcceptedAt", "privacyVersion", "proteinTargetGrams", "sex", "unitSystem", "weeklyRateKg", "weightGoal", "weightKg" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
