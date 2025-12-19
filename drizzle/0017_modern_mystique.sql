ALTER TABLE "SubSundayMoment" RENAME COLUMN "startTime" TO "durationMilliseconds";--> statement-breakpoint
ALTER TABLE "SubSundayMoment" RENAME COLUMN "endTime" TO "positionMilliseconds";--> statement-breakpoint
ALTER TABLE "SubSundayStream" ADD COLUMN "publishedAt" timestamp (6) with time zone NOT NULL;