-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "entityId" TEXT,
    "entityVersion" INTEGER,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "ignoreReason" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "correlationId" TEXT,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "nextRunAt" TIMESTAMP(3),

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLink" (
    "id" TEXT NOT NULL,
    "crmCustomerId" TEXT NOT NULL,
    "erpCustomerId" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealLink" (
    "id" TEXT NOT NULL,
    "crmDealId" TEXT NOT NULL,
    "crmCustomerId" TEXT NOT NULL,
    "erpCustomerId" TEXT,
    "erpOrderId" TEXT,
    "erpInvoiceId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "lastVersion" INTEGER NOT NULL,
    "invoiceStatus" TEXT,
    "crmNotified" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MappingConfig" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MappingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "dealsChecked" INTEGER NOT NULL DEFAULT 0,
    "divergencesOpen" INTEGER NOT NULL DEFAULT 0,
    "divergencesResolved" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Divergence" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "crmDealId" TEXT,
    "detail" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "lastRunId" TEXT,

    CONSTRAINT "Divergence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_idempotencyKey_key" ON "Event"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "Event_entityId_idx" ON "Event"("entityId");

-- CreateIndex
CREATE INDEX "Event_receivedAt_idx" ON "Event"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_eventId_key" ON "Job"("eventId");

-- CreateIndex
CREATE INDEX "Job_state_runAt_idx" ON "Job"("state", "runAt");

-- CreateIndex
CREATE INDEX "Attempt_eventId_idx" ON "Attempt"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLink_crmCustomerId_key" ON "CustomerLink"("crmCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLink_taxId_key" ON "CustomerLink"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "DealLink_crmDealId_key" ON "DealLink"("crmDealId");

-- CreateIndex
CREATE INDEX "DealLink_erpInvoiceId_idx" ON "DealLink"("erpInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "MappingConfig_version_key" ON "MappingConfig"("version");

-- CreateIndex
CREATE UNIQUE INDEX "Divergence_key_key" ON "Divergence"("key");

-- CreateIndex
CREATE INDEX "Divergence_status_idx" ON "Divergence"("status");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Divergence" ADD CONSTRAINT "Divergence_lastRunId_fkey" FOREIGN KEY ("lastRunId") REFERENCES "ReconciliationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

