/**
 * @description This script updates all votes from arg1 to id from arg2
 */

import { TZDate } from "@date-fns/tz";
import { db } from "../src/db";
import { game, vote } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { getInfobyId } from "../src/lib";

const args = process.argv.slice(2);

const toGameId = args[0];

(async () => {

  if (!toGameId) {
    throw new Error("not both args provided")
  }
  const steamAppDetails = await getInfobyId(parseInt(toGameId))

    const moreInfo = (steamAppDetails as any)[parseInt(toGameId)].data;

    return await db.insert(game).values({
      name: moreInfo.name,
      picture: moreInfo.header_image || "",
      link: "",
      steamId: parseInt(toGameId),
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
    }).returning()
})();