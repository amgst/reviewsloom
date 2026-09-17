-- CreateIndex
CREATE INDEX "Question_shop_createdAt_idx" ON "Question"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewRequest_shop_sentAt_idx" ON "ReviewRequest"("shop", "sentAt");
