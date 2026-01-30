import { eq } from "drizzle-orm";
import { db } from "./src/db";
import { game, vote } from "./src/db/schema";
import { sleep } from "bun";

const [num1, num2] = Bun.argv.slice(2).map(Number);;

(async () => {

    if (num1 === num2) {
        throw new Error("cannot be same game")
    }
    if (!num1 || !num2) {
        throw new Error("not both id's provided")
    }

    // we transfer votes from one game to another
    // after we delete other game

    const fromGame = await db.query.game.findFirst({
        where: eq(game.id, num1),
    })
    const toGame = await db.query.game.findFirst({
        where: eq(game.id, num2),
    })

    if (!toGame || !fromGame) {
        throw new Error("one of both games not found")
    }

    const answer = prompt(`do you want to transfer votes from ${fromGame.name} to ${toGame.name} (y/n)`);

    if (answer?.toLowerCase() === 'y' || answer?.toLowerCase() === 'yes') {
        
        const updated = await db.update(vote).set({
           forId: toGame.id
        }).where(eq(vote.forId, fromGame.id)).returning()
        await sleep(1000)
        
        await db.delete(game).where(eq(game.id, fromGame.id))

    } else {
        console.log("Cancelled");
        process.exit(0);
    }
})()