-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "discriminator" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "avatar" TEXT,
    "banner" TEXT,
    "about" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ONLINE',
    "customStatus" TEXT,
    "superAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_users" ("about", "avatar", "banner", "createdAt", "customStatus", "discriminator", "displayName", "id", "lastSeen", "passwordHash", "status", "updatedAt", "username") SELECT "about", "avatar", "banner", "createdAt", "customStatus", "discriminator", "displayName", "id", "lastSeen", "passwordHash", "status", "updatedAt", "username" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_discriminator_key" ON "users"("discriminator");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
