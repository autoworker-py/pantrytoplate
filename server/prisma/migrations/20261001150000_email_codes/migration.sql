-- Six-digit codes sent by email, to confirm an address or set a new password
ALTER TABLE "User" ADD COLUMN "emailUnconfirmed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "EmailCode" (
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "windowStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sends" INTEGER NOT NULL DEFAULT 0,
    "misses" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("userId", "purpose"),
    CONSTRAINT "EmailCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
