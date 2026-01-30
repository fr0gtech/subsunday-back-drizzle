import type { ChatUserstate } from "tmi.js"
import { and, between, eq } from "drizzle-orm"
import { isAfter } from "date-fns"
import { loadGames, getDateRange, getSteamAppIdFromURL, getGameOnDb, findClosestSteamGame, createGameOnDb, increment } from "../src/lib"
import { db } from "../src/db"
import { user, vote } from "../src/db/schema"
import { findGame, registerVote } from "../src"
import { initIGDB } from "../src/igdb"

/**
 * This gets chat logs from a random api for x days and does the voting logic.
 * This could be cool to get subsunday data from before we started recording
 * TODO: figure out if this data is for streams only or also offline chat i quickly checked and it looks like this actually is every message also offline
 * so we could rebuild all of subsunday data at will as long as this api exists, very cool
 * I think this chat logs also include custom rewards so the 5k to vote for non subs thing
 */

(async () => {
    await loadGames()
    await initIGDB()
    // const fromTo = [26]
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
            // we need to map stuff?
            console.log(chat.tags);
            
            const data: ChatUserstate = {
                ...chat.tags,
                username: chat.tags["display-name"],
            }
            await registerVoteWTime(data, game, chat.timestamp)
        }
    }

})()



export async function registerVoteWTime(userstate: ChatUserstate, gameMsg: string, timestamp?: string) {
  // how we match games.
  /**
   * @param userstate
   * metadata of chat msg
   * 
   * @param gameMsg
   * chat string
   * 
   * @description:
   * 1. Check for id in steam url if someone inputs a steam url to vote
   * 2. Try to find game on db by id from url or name
   * 3. Try to find game on steam from id or input
   * 4. If we cannot find it try finding it from IGDB
   * 5. Add game with no info or with info that we found
   */

  const now = new Date(timestamp as string) 

  const range = getDateRange({ offset: now })

  let userById: any
  userById = await db.query.user.findFirst({
    where: ((user, { eq }) => eq(user.id, parseInt(userstate["user-id"] as string) || 0)),
  })

  if (!userById) {
    userById = await db.insert(user).values({
      id: parseInt(userstate["user-id"] as string) || 0,
      name: userstate.username as string,
      sub: userstate.subscriber || false,
      createdAt: now,
      updatedAt: now,
      streak: 0
    }).returning().then((res) => res[0]);
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

  // lets say someone votes for a game that we cannot match with like $steamgame LULW
  // but there is a game for it now. how can we make it so we will still match it? and avoid adding votes to the wrong game?
  // if we start filtering out emotes and stuff this will just create new problems we never know if its actually part of the game name

  // there is also a problem with how game manage numbers like $steamgame 2 or $steamgame II
  // not sure how to fix without creating new problems
  // we could just regex for a roman number at the end of a game and search in both direction but idk kinda messy, igdb does also not handle this well example: CODE VEIN II

  const gameOnDb = await findGame(gameMsg)

  // if (!gameOnDb.id) throw new Error("no game found")
  // if we have a vote for this period just update it
  if (lastVote) {
    console.log("updating vote");
    
    await db.update(vote).set({
      forId: gameOnDb?.id,
      updatedAt: now
    })
      .where(eq(vote.id, lastVote.id))

     
  } else {
    // new vote for this period
    console.log({
         forId: gameOnDb?.id as number,
      fromId: userById.id as number,
      voteText: gameMsg,
      updatedAt: now,
      createdAt: now
    });
    
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
