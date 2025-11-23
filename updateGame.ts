import { eq } from "drizzle-orm";
import { db } from "./src/db";
import { game, vote } from "./src/db/schema";

/**
 * this script helps if our game matching matches wrong we can force a steamID
 * 
 * input would be cool to be able to search or at least input wrong game by id and then steamId, it should update the info
 */
(async () => {
    const games = await db.select().from(game);

    const groups = new Map<number, typeof games>();

    for (const g of games) {
        if (g.steamId === 0) continue; 

        if (!groups.has(g.steamId)) groups.set(g.steamId, []);
        groups.get(g.steamId)!.push(g);
    }

    for (const [steamId, group] of groups) {
        if (group.length <= 1) continue; 

        console.log(
            `SteamID ${steamId} has duplicates: ${group
                .map((g) => `${g.name}:${g.id}`)
                .join(" ")}`
        );

        const master = group[0];
        const duplicates = group.slice(1);

        for (const dup of duplicates) {
            console.log(` → deleting duplicate ${dup.id}`);
             await db.update(vote)
                .set({ forId: master?.id })
                .where(eq(vote.forId, dup.id));
            await db.delete(game).where(eq(game.id, dup.id))
        }
    }
})();
