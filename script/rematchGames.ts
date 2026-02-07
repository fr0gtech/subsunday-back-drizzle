/**
 * We load all non matched games and try to match them
 * 
 * 1. Load all unmatched games
 * 2. Try to match with IGDB
 *  3. Check if new match already exists
 * 3. Rename game with info
 */

import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { game } from "../src/db/schema";
import { findGame } from "../src";
import { findOnIGDB, IGDBToGameForDb, initIGDB } from "../src/igdb";
import { TZDate } from "@date-fns/tz";
import { checkIfSteamBanned, findClosestSteamGame, getInfobyId, getSteamAppIdFromURL, loadGames } from "../src/lib";

(async ()=>{
    await initIGDB()
    await checkIfSteamBanned()
    await loadGames()
   const games = await db.query.game.findMany({
     where: and(
            eq(game.igdbId, 0),
            eq(game.steamId, 0)
     ),
   });
   
   for (const gameEl of games) {
        // we try to find game, this will return the game on db tho
        
        // we first try to match steam maybe last time we did we had older code or other issues maybe it works now
        let idFromLink = getSteamAppIdFromURL(gameEl.name)
        const match = idFromLink ? { name: "", appId: parseInt(idFromLink) } : await findClosestSteamGame(gameEl.name)
        if (match.appId){
            // we found a steam game
            const steamAppDetails = await getInfobyId(match.appId)
            const moreInfo = (steamAppDetails as any)[match.appId].data;
            if (!moreInfo || !moreInfo.name) continue; 
            await db.update(game).set({
                name: moreInfo.name,
                picture: moreInfo.header_image || "",
                link: "",
                steamId: match.appId,
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
            }).where(eq(game.id, gameEl.id))
            console.log(`able to find game on steam: ${gameEl.name}`);
            
        }else{
            const gameIGDB = await findOnIGDB(gameEl.name)
            console.log(`found game on IGDB for ${gameEl.name} - ${gameEl.id}: ${gameIGDB?.name}`);
            if (!gameIGDB) {
                console.log(`not able to find game for ${gameEl.name} skip`);
                continue;
            }
            const data = IGDBToGameForDb(gameIGDB)
            await db.update(game).set(data).where(eq(game.id, gameEl.id));
        }

   }
})()
