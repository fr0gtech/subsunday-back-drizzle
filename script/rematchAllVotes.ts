import { db } from "../src/db";
import { user, vote } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { createGameOnDb, findClosestSteamGame, getGameOnDb, getSteamAppIdFromURL, loadGames } from "../src/lib";
import type { Game } from "../src/db/types";
import { createGameFromIGDB, findOnIGDB, initIGDB } from "../src/igdb";

(async () => {
  await loadGames()
  await initIGDB()
  const BATCH_SIZE = 100;
  let offset = 0;
  let processedCount = 0;

  while (true) {
    const users = await db.query.user.findMany({
      limit: BATCH_SIZE,
      offset: offset,
      with: {
        votes: {
          with: {
            game: {
              columns: {
                name: true
              }
            }
          }
        },
      },
    });

    if (users.length === 0) {
      break;
    }

    console.log(`Processing batch: ${offset} to ${offset + users.length}`);

    for (const userWithStreak of users) {
      const votes = [...userWithStreak.votes].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );

      for (const voteEl of votes) {
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

        console.log(`matched ${voteEl.voteText} with ${gameOnDb?.name} - ${isFullMatch(voteEl.voteText, gameOnDb?.name as string)}`);
        
        await db.update(vote).set({
          forId: gameOnDb?.id
        }).where(eq(vote.id, voteEl.id ))
      }

      processedCount++;
    }

    offset += BATCH_SIZE;
    console.log(`processed ${processedCount} users so far...`);
  }

  console.log(`finished processing ${processedCount} users`);
})();

function isFullMatch(string1: string, string2: string){
  if (string1.toLowerCase() === string2.toLowerCase()){
    return true
  }
}