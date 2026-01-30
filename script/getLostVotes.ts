import type { ChatUserstate } from "tmi.js"
import { and, between, eq } from "drizzle-orm"
import { isAfter } from "date-fns"
import { loadGames, getDateRange, getSteamAppIdFromURL, getGameOnDb, findClosestSteamGame, createGameOnDb, increment } from "../src/lib"
import { db } from "../src/db"
import { user, vote } from "../src/db/schema"
import { registerVote } from "../src"

/**
 * This gets chat logs from a random api for x days and does the voting logic.
 * This could be cool to get subsunday data from before we started recording
 * TODO: figure out if this data is for streams only or also offline chat i quickly checked and it looks like this actually is every message also offline
 * so we could rebuild all of subsunday data at will as long as this api exists, very cool
 * I think this chat logs also include custom rewards so the 5k to vote for non subs thing
 */

(async () => {
    await loadGames()
    const fromTo = [12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30]
    const allChats = []
    for (const day in fromTo) {
        const toGet = parseInt(day) + (fromTo[0] as number)
        const data: any = await fetch("https://logs.zonian.dev/channel/lirik/2026/1/" + toGet + "?jsonBasic=1").then((e) => e.json())
        allChats.push(...data.messages)
        console.log(`got ${allChats.length} messages`);
        
    }
    for (const msg in allChats) {
        const chat = allChats[msg]
        if ((chat.text as string).startsWith('!vote')) {
            const gameDirty = chat.text.trim().split("!vote")
            const game = (gameDirty[1] as string).trim();
            console.log("regvote: " + game + " by: " + chat.tags["user-id"] + " - " + chat.timestamp);
            await registerVote(chat.tags, game, chat.timestamp)
        }
    }

})()


