import { isSunday } from "date-fns";
import { apiClient, setUpApiClient } from "../src/twitchApiClient";
import { TZDate } from "@date-fns/tz";
import { db } from "../src/db";
import { subSundayMoment, subSundayStream } from "../src/db/schema";
import type { HelixVideo } from "@twurple/api";
import { eq } from "drizzle-orm";
import { getGameOnDb, getMoments, type MomentType } from "../src/lib";


(async () => {
    await setUpApiClient() // setup api client

    const user = await apiClient.users.getUserByName('lirik') // get user
    if (!user) throw new Error("User not found")

    // loop to get all vods
    let run = true;
    let lastCursor: string | undefined = undefined;
    let allStreams: HelixVideo[] = []
    while (run) {
        const data = await apiClient.videos.getVideosByUser(user, { limit: 20, after: lastCursor })
        allStreams.push(...data.data)
        if (lastCursor === data.cursor || !data.cursor) {
            run = false;
        } else {
            lastCursor = data.cursor;
        }
    }
    console.log(`Got ${allStreams.length} streams`);

    // filter only sunday vods
    const subSundays: HelixVideo[] = allStreams.filter(stream => isSunday(new TZDate(stream.publishDate, process.env.TIMEZONE)))

    for (const stream of subSundays) {

        if (!stream.streamId) continue; // if stream is not done skip
        // add stream to db
        const hasStream = await db.query.subSundayStream.findFirst({
            where: eq(subSundayStream.streamId, stream.id)
        })

        if (hasStream) {
            // check if it has moments
            const hasMoments = await db.query.subSundayMoment.findFirst({
                where: eq(subSundayMoment.streamId, stream.id)
            })
            if (hasMoments) {
                continue;
            } else {
                const moments = await getMoments(stream.id)
                if (moments.length === 0) continue;

                const momentsWithGamePromises = moments.map(async (e) => {
                    return {
                        ...e,
                        gameId: await getGameOnDb(e.description, undefined).then((game) => game?.id)
                    }

                })
                const momentsWithGame = await Promise.all(momentsWithGamePromises)

                await db.insert(subSundayMoment).values(momentsWithGame.map((m: MomentType) => ({
                    streamId: stream.id,
                    description: m.description,
                    durationMilliseconds: m.durationMilliseconds > 0 ? m.durationMilliseconds : 0,
                    positionMilliseconds: m.positionMilliseconds > 0 ? m.positionMilliseconds : 0,
                    gameId: m.gameId || 0,
                    createdAt: new TZDate(new Date(), process.env.TIMEZONE),
                    updatedAt: new TZDate(new Date(), process.env.TIMEZONE),
                })))

            }
        } // skip if we already got it
        await db.insert(subSundayStream).values({
            streamId: stream.id,
            title: stream.title,
            duration: stream.durationInSeconds,
            publishedAt: new TZDate(stream.publishDate, process.env.TIMEZONE),
            createdAt: new TZDate(new Date(), process.env.TIMEZONE),
            updatedAt: new TZDate(new Date(), process.env.TIMEZONE),
        }).then(() => console.log(`added ${stream.id}`))

        const moments = await getMoments(stream.id)
        if (moments.length === 0) continue;

        const momentsWithGamePromises = moments.map(async (e) => {
            return {
                ...e,
                gameId: await getGameOnDb(e.description, undefined).then((game) => game?.id)
            }

        })
        const momentsWithGame = await Promise.all(momentsWithGamePromises)

        await db.insert(subSundayMoment).values(momentsWithGame.map((m: MomentType) => ({
            streamId: stream.id,
            description: m.description,
            durationMilliseconds: m.durationMilliseconds > 0 ? m.durationMilliseconds : 0,
            positionMilliseconds: m.positionMilliseconds > 0 ? m.positionMilliseconds : 0,
            gameId: m.gameId || 0,
            createdAt: new TZDate(new Date(), process.env.TIMEZONE),
            updatedAt: new TZDate(new Date(), process.env.TIMEZONE),
        })))
    }
})()

