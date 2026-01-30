import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { findOnIGDBBySlug, IGDBToGameForDb, initIGDB } from "../src/igdb";
import { game } from "../src/db/schema";

// we provide a igdb link? and a id?
const args = process.argv.slice(2);

const link = args[0];
const id = parseInt(args[1] as any);

(async()=>{
    await initIGDB()

    if (!link || !id) {
        throw new Error("not both args provided")
    }
    const toUpdate =  await db.query.game.findFirst({
        where: eq(game.id, id),
    })
    if (!toUpdate){
        throw new Error("not able to find game to update")
    }

    const gameName = link.split("/").pop()

    const IGDBGame = await findOnIGDBBySlug(gameName as string)

      if (!IGDBGame){
        throw new Error("not able to find game on igdb")
    }

    const data = IGDBToGameForDb(IGDBGame)
    console.log(data);
    
    await db.update(game).set(data)

    // then update game to use igdb
})()