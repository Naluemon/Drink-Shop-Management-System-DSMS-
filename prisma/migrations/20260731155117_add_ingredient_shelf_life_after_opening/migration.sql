-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "shelf_life_days_after_opening" INTEGER,
ADD COLUMN     "opened_at" TIMESTAMP(3);
