import { db } from "../src/db";
import { user, vote } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { createGameOnDb, findClosestSteamGame, getGameOnDb, getSteamAppIdFromURL, loadGames } from "../src/lib";
import type { Game } from "../src/db/types";
import { createGameFromIGDB, findOnIGDB, initIGDB } from "../src/igdb";

const args = process.argv.slice(2);

const userId = args[0];

(async () => {

     if (!userId) {
        throw new Error("not both args provided")
    }
  await loadGames()
  await initIGDB()


    const userToUpdate = await db.query.user.findFirst({
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
      where: eq(user.id, parseInt(userId as string))
    });

    if (!userToUpdate){
        throw new Error("user not found")

    }

      for (const voteEl of userToUpdate.votes) {
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

})();

function isFullMatch(string1: string, string2: string){
  if (string1.toLowerCase() === string2.toLowerCase()){
    return true
  }
}