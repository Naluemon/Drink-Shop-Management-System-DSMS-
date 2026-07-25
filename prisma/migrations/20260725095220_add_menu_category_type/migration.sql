-- CreateEnum
CREATE TYPE "menu_category_type" AS ENUM ('food', 'drink');

-- AlterTable
ALTER TABLE "menu_categories" ADD COLUMN     "type" "menu_category_type" NOT NULL DEFAULT 'drink';
