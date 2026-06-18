-- CreateTable
CREATE TABLE "PendingDecisionNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderRequestId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingDecisionNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingDecisionNotification_sentAt_decidedAt_idx" ON "PendingDecisionNotification"("sentAt", "decidedAt");

-- CreateIndex
CREATE INDEX "PendingDecisionNotification_userId_idx" ON "PendingDecisionNotification"("userId");

-- AddForeignKey
ALTER TABLE "PendingDecisionNotification" ADD CONSTRAINT "PendingDecisionNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDecisionNotification" ADD CONSTRAINT "PendingDecisionNotification_orderRequestId_fkey" FOREIGN KEY ("orderRequestId") REFERENCES "OrderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
