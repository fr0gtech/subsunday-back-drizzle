import type { ChatUserstate } from "tmi.js"
import { and, asc, between, desc, eq } from "drizzle-orm"
import { isAfter, isBefore, isSameDay } from "date-fns"
import { getDateRange, getSteamAppIdFromURL, getGameOnDb, findClosestSteamGame, createGameOnDb, increment, loadGames } from "./src/lib"
import { db } from "./src/db"
import { user, vote } from "./src/db/schema"
import { readdir } from "node:fs/promises";


type AvailableLogs = {
    availableLogs: Array<{
        year: string;
        month: string;
        day: string;
    }>;
}
type ChatMessage = {
    text: string;
    displayName: string;
    timestamp: string;
    id: string;
    tags: ChatUserstate;

}
type ChatMessages = {
    messages: Array<ChatMessage>;
}

let apiBase = "https://logs.zonian.dev/";
let cacheDir = `${import.meta.dir}/cache`;
// let cachedFiles = [];

/**
 * Because of this api that tracks the chat even with offline chat messages we can build votes from scratch.
 * To not spam the api we save the logs locally so we can dev better this is not really needed once everything is done.
 */
(async () => {
    await loadGames()
    // cachedFiles = await readdir(import.meta.dir + "/cache");
    const lastVote = await db.select().from(vote).limit(1).orderBy(desc(vote.createdAt))
    // we only build data from day of last vote we got

    const availableLogsApiUrl = new URL("list", apiBase);
    availableLogsApiUrl.searchParams.set("channel", process.env.TWITCH_CHANNEL_NAME)
    const availableLogs: AvailableLogs = await fetch(availableLogsApiUrl).then((e) => e.json()) as AvailableLogs
    const availableDays = availableLogs.availableLogs
    const logsApiBase = new URL("channel" + process.env.TWITCH_CHANNEL_NAME, apiBase);

    for (const availableDay of availableDays) {
        const availableDayDate = new Date(
            Number(availableDay.year),
            Number(availableDay.month) - 1,
            Number(availableDay.day)
        );
        if (isSameDay(availableDayDate, lastVote[0]?.createdAt as Date) || isBefore(lastVote[0]?.createdAt as Date, availableDayDate)) {
            const apiUrl = new URL(
                `channel/${process.env.TWITCH_CHANNEL_NAME}/${availableDay.year}/${availableDay.month}/${availableDay.day}`,
                logsApiBase
            );
            apiUrl.searchParams.set("jsonBasic", "1")
            // const fileName = `${process.env.TWITCH_CHANNEL_NAME}_${availableDay.year}_${availableDay.month}_${availableDay.day}.json`

            // if (cachedFiles.includes(fileName)) {
            //     console.log("got file");
            //     const file = Bun.file(`${cacheDir}/${fileName}`);
            //     const chatMessages: ChatMessages = await file.json();
            //     await registerVoteWtimeWrapper(chatMessages)

            // } else {
            //     const chatMessages: ChatMessages = await fetch(apiUrl).then((e) => e.json()) as ChatMessages
            //     await Bun.write(`${cacheDir}/${fileName}`, JSON.stringify(chatMessages));
            //     await registerVoteWtimeWrapper(chatMessages)
            // }
            const chatMessages: ChatMessages = await fetch(apiUrl).then((e) => e.json()) as ChatMessages
            await registerVoteWtimeWrapper(chatMessages)
        }else{
            console.log("skipping day", availableDayDate);
            
        }


    }
})()

async function registerVoteWtimeWrapper(chatMessages: ChatMessages) {
    for (const msg of chatMessages.messages) {
        if ((msg.text as string).startsWith('!vote')) {
            const gameDirty = msg.text.trim().split("!vote")
            const game = (gameDirty[1] as string).trim();
            await registerVoteWtime(msg.tags, game, msg.timestamp)
        }
    }
}

async function registerVoteWtime(userstate: ChatUserstate, gameMsg: string, timestamp: string) {
    console.log("regvote: " + gameMsg + " by: " + userstate["user-id"] + " - " + timestamp);
    // this should convert utc+0 to America/New_York
    const now = new Date(timestamp);
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
