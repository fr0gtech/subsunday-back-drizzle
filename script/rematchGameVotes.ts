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
import { game, vote } from "../src/db/schema";
import { findGame } from "../src";
import { createGameFromIGDB, findOnIGDB, IGDBToGameForDb, initIGDB } from "../src/igdb";
import { TZDate } from "@date-fns/tz";
import { checkIfSteamBanned, createGameOnDb, findClosestSteamGame, getGameOnDb, getInfobyId, getSteamAppIdFromURL, loadGames } from "../src/lib";
import type { Game } from "../src/db/types";


const args = process.argv.slice(2);

const gameId = args[0];


(async ()=>{

    if (!gameId){
        throw new Error("no input game")
    }

   const gameToUpdate = await db.query.game.findFirst({
        where: eq(game.id, parseInt(gameId as string)),
        with:{
            votes: {
                with: {
                    game: true
                }
            }
        }
    })
   
    if (!gameToUpdate){
        throw new Error("no game found")
    }
      for (const voteEl of gameToUpdate.votes) {
        if (voteEl.voteText.toLowerCase() === voteEl.game.name.toLowerCase()) continue;
        let idFromLink = getSteamAppIdFromURL(voteEl.voteText)
        let gameOnDb: Game | undefined = await getGameOnDb(voteEl.voteText, idFromLink)
        const match = idFromLink ? { name: "", appId: parseInt(idFromLink) } : await findClosestSteamGame(voteEl.voteText)

        if (!match.appId && !gameOnDb) {
          const gameOnIGDB = await findOnIGDB(voteEl.voteText)

          if (gameOnIGDB) {
            const newGame = await createGameFromIGDB(gameOnIGDB)
            gameOnDb = newGame[0]
          } else {
            const newGame = await createGameOnDb(match, voteEl.voteText)
            gameOnDb = newGame[0]
          }
        } else if (!gameOnDb) {
          const newGame = await createGameOnDb(match, voteEl.voteText)
          gameOnDb = newGame[0]
        }

        console.log(`matched ${voteEl.voteText} with ${gameOnDb?.name}`);
        
        await db.update(vote).set({
          forId: gameOnDb?.id
        }).where(eq(vote.id, voteEl.id ))
      }
})()
