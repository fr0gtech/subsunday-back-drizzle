ALTER TABLE "Game" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "Game" ALTER COLUMN "id" DROP IDENTITY;--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "id" DROP IDENTITY;--> statement-breakpoint
ALTER TABLE "Vote" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "Vote" ALTER COLUMN "id" DROP IDENTITY;