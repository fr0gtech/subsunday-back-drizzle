import { eq } from "drizzle-orm";
import { db } from "./src/db";
import { game, vote } from "./src/db/schema";
import { getInfobyId } from "./src/lib";
import { TZDate } from "@date-fns/tz";

/**
 * this script helps if our game matching matches wrong we can force a steamID
 * 
 * input would be cool to be able to search or at least input wrong game by id and then steamId, it should update the info
 */
(async () => {
    const gameToUpdateId = 12
    const updateTo = 1422450
    const steamAppDetails = await getInfobyId(updateTo)
    const moreInfo = (steamAppDetails as any)[updateTo].data;

    await db.update(game).set({
        name: moreInfo.name,
        picture: moreInfo.header_image || "",
        link: "",
        steamId: updateTo,
        description: moreInfo.short_description || "",
        website: moreInfo.website || "",
        dev: moreInfo.developers || [""],
        price: moreInfo.is_free ? { final: "free" } : moreInfo.price_overview || { final: "n/a" },
        categories: moreInfo.genres || {},
        recommendations: moreInfo.recommendations ? moreInfo.recommendations.total : 0,
        screenshots: moreInfo.screenshots,
        detailedDescription: JSON.stringify({ html: moreInfo.detailed_description }),
        movies: moreInfo.movies,
        createdAt: new TZDate(new Date(), process.env.TIMEZONE),
        updatedAt: new TZDate(new Date(), process.env.TIMEZONE),
    }).where(eq(game.id, gameToUpdateId))
})();
