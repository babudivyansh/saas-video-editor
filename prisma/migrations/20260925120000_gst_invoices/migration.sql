-- GST tax invoicing (2026-09). Clipiro Technologies, GSTIN 09DAWPB8753E1Z7.
--
-- Purchase.currency: USD and INR both landed in amountInPaise with nothing to
-- tell them apart. Existing rows default to INR; any historical USD rows
-- predate GST go-live, so no invoice is ever generated from that default.
--
-- User.billing*: optional customer billing details printed on the invoice.
-- Invoice: an immutable snapshot per purchase. InvoiceCounter: gapless
-- per-financial-year sequence (see lib/invoice/issue.ts).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "billingGstin" TEXT,
ADD COLUMN     "billingName" TEXT,
ADD COLUMN     "billingPincode" TEXT,
ADD COLUMN     "billingState" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR';

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "sellerName" TEXT NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "sellerGstin" TEXT NOT NULL,
    "sellerState" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerAddress" TEXT,
    "buyerState" TEXT,
    "buyerPincode" TEXT,
    "buyerGstin" TEXT,
    "placeOfSupply" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sac" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "taxable" INTEGER NOT NULL,
    "cgst" INTEGER NOT NULL DEFAULT 0,
    "sgst" INTEGER NOT NULL DEFAULT 0,
    "igst" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "paymentRef" TEXT NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "fy" TEXT NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("fy")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_purchaseId_key" ON "Invoice"("purchaseId");

-- CreateIndex
CREATE INDEX "Invoice_userId_issuedAt_idx" ON "Invoice"("userId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_fy_seq_key" ON "Invoice"("fy", "seq");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

