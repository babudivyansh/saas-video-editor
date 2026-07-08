-- DropIndex
DROP INDEX "CouponRedemption_couponId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_couponId_userId_key" ON "CouponRedemption"("couponId", "userId");
