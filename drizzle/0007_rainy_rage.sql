DROP INDEX "name_search_index";--> statement-breakpoint
CREATE INDEX "name_search_index" ON "Game" USING gin (plainto_tsquery('english', "name"));