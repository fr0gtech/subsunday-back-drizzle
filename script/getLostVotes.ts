import type { ChatUserstate } from "tmi.js"
import { and, between, eq } from "drizzle-orm"
import { isAfter } from "date-fns"
import { loadGames, getDateRange, getSteamAppIdFromURL, getGameOnDb, findClosestSteamGame, createGameOnDb, increment } from "../src/lib"
import { db } from "../src/db"
import { user, vote } from "../src/db/schema"

/**
 * This gets chat logs from a random api for x days and does the voting logic.
 * This could be cool to get subsunday data from before we started recording
 * TODO: figure out if this data is for streams only or also offline chat i quickly checked and it looks like this actually is every message also offline
 * so we could rebuild all of subsunday data at will as long as this api exists, very cool
 * I think this chat logs also include custom rewards so the 5k to vote for non subs thing
 */

(async () => {
    await loadGames()
    const fromTo = [12,13,14,15,16,17,18,19,20]
    const allChats = []
    for (const day in fromTo) {
        const toGet = parseInt(day) + (fromTo[0] as number)
        const data: any = await fetch("https://logs.zonian.dev/channel/lirik/2025/11/" + toGet + "?jsonBasic=1").then((e) => e.json())
        allChats.push(...data.messages)
    }
    for (const msg in allChats) {
        const chat = allChats[msg]
        if ((chat.text as string).startsWith('!vote')) {
            const gameDirty = chat.text.trim().split("!vote")
            const game = (gameDirty[1] as string).trim();
            await registerVoteWtime(chat.tags, game, chat.timestamp)
        }
    }

})()

async function registerVoteWtime(userstate: ChatUserstate, gameMsg: string, timestamp: string) {
    console.log("regvote: " + gameMsg + " by: " + userstate["user-id"] + " - " + timestamp);
    const now = new Date(timestamp)
    const range = getDateRange({ offset: now })

    let userById: any
    userById = await db.query.user.findFirst({
        where: ((user, { eq }) => eq(user.id, parseInt(userstate["user-id"] as string) || 0)),
    })
    if (!userById) {
        userById = await db.insert(user).values({
            id: parseInt(userstate["user-id"] as string) || 0,
            name: userstate["display-name"] as string,
            sub: userstate.subscriber || false,
            createdAt: now,
            updatedAt: now,
            streak: 0
        }).returning().then((res) => res[0])
    }

    const lastVote = await db.query.vote.findFirst({
        where:
            and(
                eq(vote.fromId, parseInt(userstate["user-id"] as string) || 0),
                between(vote.createdAt, range.currentPeriod.startDate,
                    range.currentPeriod.endDate
                ))
    })

    const isAfterEnd = isAfter(now, range.currentPeriod.endDate)

    if (isAfterEnd) {
        console.log(`[SUB] ${user.name} cannot vote out of range, game: ${gameMsg}`);
        return;
    }

    let idFromLink = getSteamAppIdFromURL(gameMsg)
    let gameOnDb = await getGameOnDb(gameMsg, idFromLink)

    if (!gameOnDb) {
        const match = idFromLink ? { name: "", appId: parseInt(idFromLink) } : await findClosestSteamGame(gameMsg)
        const newGame = await createGameOnDb(match, gameMsg)
        gameOnDb = newGame[0]
    }

    if (lastVote) {
        
        await db.update(vote).set({
            forId: gameOnDb?.id,
            updatedAt: now
        })
        .where(eq(vote.id, lastVote.id))

    } else {

        await db.insert(vote).values({
            forId: gameOnDb?.id as number,
            fromId: userById.id as number,
            voteText: gameMsg,
            updatedAt: now,
            createdAt: now
        }).returning()

        // we increment no matter what?
        await db.update(user).set({
            streak: increment(user.streak)
        })
        .where(eq(user.id, userById.id));
        
    }

    if (!gameOnDb) throw new Error("no game")
}
