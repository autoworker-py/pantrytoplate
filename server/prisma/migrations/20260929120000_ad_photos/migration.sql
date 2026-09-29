-- Meal photos earned by watching an ad, and the daily cap on them
ALTER TABLE "User" ADD COLUMN "snapsEarned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "adPhotosDay" TEXT;
ALTER TABLE "User" ADD COLUMN "adPhotosThatDay" INTEGER NOT NULL DEFAULT 0;
