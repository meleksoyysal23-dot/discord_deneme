-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "avatar" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhooks_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "webhooks_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'DARK',
    "language" TEXT NOT NULL DEFAULT 'tr',
    "fontSize" TEXT NOT NULL DEFAULT 'MEDIUM',
    "notifications" TEXT NOT NULL DEFAULT '{"desktop":true,"sound":true,"mentions":true}',
    "privacy" TEXT NOT NULL DEFAULT '{"showOnlineStatus":true,"allowFriendRequests":true,"allowDMsFromStrangers":false}',
    "audio" TEXT NOT NULL DEFAULT '{"inputVolume":100,"outputVolume":100,"noiseSuppression":true,"echoCancellation":true}',
    "developerMode" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "server_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "serverCount" INTEGER NOT NULL DEFAULT 0
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_servers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "category" TEXT,
    "tags" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "servers_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_servers" ("createdAt", "description", "icon", "id", "name", "ownerId", "updatedAt") SELECT "createdAt", "description", "icon", "id", "name", "ownerId", "updatedAt" FROM "servers";
DROP TABLE "servers";
ALTER TABLE "new_servers" RENAME TO "servers";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "webhooks_token_key" ON "webhooks"("token");

-- CreateIndex
CREATE INDEX "webhooks_serverId_idx" ON "webhooks"("serverId");

-- CreateIndex
CREATE INDEX "webhooks_channelId_idx" ON "webhooks"("channelId");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_read_idx" ON "notifications"("read");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_clientId_key" ON "user_settings"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "server_categories_name_key" ON "server_categories"("name");
