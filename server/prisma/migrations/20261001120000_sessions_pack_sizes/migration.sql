-- Signing out every device on a password change, and pack sizes that belong to one person
ALTER TABLE "User" ADD COLUMN "sessionsValidFrom" DATETIME;

CREATE TABLE "UserPackSize" (
    "userId" TEXT NOT NULL,
    "foodReferenceId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "foodReferenceId"),
    CONSTRAINT "UserPackSize_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserPackSize_foodReferenceId_fkey" FOREIGN KEY ("foodReferenceId") REFERENCES "FoodReference" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
