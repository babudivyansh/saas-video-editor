-- AlterTable
ALTER TABLE "Commission" ADD COLUMN     "payoutEmailSent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "expiryReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "firstVideoAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lowCreditEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "onboardingDay1SentAt" TIMESTAMP(3),
ADD COLUMN     "onboardingDay3SentAt" TIMESTAMP(3),
ADD COLUMN     "onboardingDay7SentAt" TIMESTAMP(3),
ADD COLUMN     "reengagementSentAt" TIMESTAMP(3);
