-- CreateTable
CREATE TABLE "bans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "bannedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bans_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bans_bannedById_fkey" FOREIGN KEY ("bannedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "timeouts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "timeouts_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "timeouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "targetType" TEXT,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "automod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rules" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "automod_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "bans_serverId_idx" ON "bans"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "bans_serverId_userId_key" ON "bans"("serverId", "userId");

-- CreateIndex
CREATE INDEX "timeouts_serverId_idx" ON "timeouts"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "timeouts_serverId_userId_key" ON "timeouts"("serverId", "userId");

-- CreateIndex
CREATE INDEX "audit_logs_serverId_idx" ON "audit_logs"("serverId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "automod_serverId_key" ON "automod"("serverId");
