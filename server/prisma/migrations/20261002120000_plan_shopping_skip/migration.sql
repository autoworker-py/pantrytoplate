-- CreateTable
CREATE TABLE "PlanShoppingSkip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "foodReferenceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanShoppingSkip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanShoppingSkip_foodReferenceId_fkey" FOREIGN KEY ("foodReferenceId") REFERENCES "FoodReference" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanShoppingSkip_userId_foodReferenceId_key" ON "PlanShoppingSkip"("userId", "foodReferenceId");

