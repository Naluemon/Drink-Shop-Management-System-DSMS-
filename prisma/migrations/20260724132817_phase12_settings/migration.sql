-- CreateEnum
CREATE TYPE "stock_deficit_policy" AS ENUM ('warn_only', 'strict_block');

-- CreateEnum
CREATE TYPE "receipt_paper_width" AS ENUM ('mm58', 'mm80');

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "close_time" TEXT,
ADD COLUMN     "company_phone" TEXT,
ADD COLUMN     "open_time" TEXT,
ADD COLUMN     "receipt_footer_message" TEXT,
ADD COLUMN     "receipt_paper_width" "receipt_paper_width" NOT NULL DEFAULT 'mm80',
ADD COLUMN     "stock_deficit_policy" "stock_deficit_policy" NOT NULL DEFAULT 'warn_only';

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "stock_deficit_policy_override" "stock_deficit_policy";

-- CreateTable
CREATE TABLE "reason_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "reason_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reason_codes_code_key" ON "reason_codes"("code");
