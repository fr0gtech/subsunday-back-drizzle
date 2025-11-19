import "dotenv/config";
import type { ChatUserstate } from "tmi.js";
import { demoMsg, usernames } from "./data";
import { TZDate } from "@date-fns/tz";
import { isAfter } from "date-fns";

import {
  checkENV,
  loadGames,
  getDateRange,
  getSteamAppIdFromURL,
  getGameOnDb,
  findClosestSteamGame,
  createGameOnDb,
  delay,
  increment
} from "./lib";

import { initSocket, io } from "./socket";
import { initTwitchIRC } from "./twitch";
import { db } from "./db";
import {
  and,
  between,
  eq,
  sql,
  type AnyColumn
} from "drizzle-orm";

import { user, vote } from "./db/schema";

const CHANNEL = process.env.TWITCH_CHANNEL_NAME;
await init()

async function init() {
  console.log(`${new TZDate(new Date(), process.env.TIMEZONE)}`);
  checkENV()
  // i could not find a good way to search for games on steam one by one so we just load all
  // but if process does not restart which it shouldn't we will be left with an old gamelist.
  // so we need to keep track of last time we loaded all games?
  await loadGames()
  // runDev()
  initSocket()
  initTwitchIRC(CHANNEL)

}

// we check every 1h if we need to reload games and maybe more in the future
// this could be fixed if we had a way to search for games by req and not by list of already loaded games in memory
setInterval(async () => {
  await loadGames()
}, 1000 * 60 * 60) // 1h in ms




export async function onMessage(message: string, userstate: ChatUserstate) {

  if (message.trim().startsWith("!vote")) {
    if (userstate["custom-reward-id"] && !userstate.subscriber) {
      const username = userstate.username;
      const gameDirty = message.trim().split("!vote")
      const game = (gameDirty[1] as string).trim();
      console.log(`[REWARD] ${username} issued !vote for ${game}`);
      registerVote(userstate, game);
    }
    if (userstate.subscriber || userstate["display-name"] === "dirtytomat0") {
      const username = userstate.username;
      const gameDirty = message.trim().split("!vote")
      const game = (gameDirty[1] as string).trim();
      console.log(`[SUB] ${username} issued !vote for ${game}`);
      registerVote(userstate, game);
    }
  }
}

async function registerVote(userstate: ChatUserstate, gameMsg: string) {
  const now = new TZDate(new Date(), process.env.TIMEZONE)

  const range = getDateRange()
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

  let idFromLink = getSteamAppIdFromURL(gameMsg)
  let gameOnDb = await getGameOnDb(gameMsg, idFromLink)
  
  if (!gameOnDb) {

    // match game to a steam game
    const match = idFromLink ? { name: "", appId: parseInt(idFromLink) } : await findClosestSteamGame(gameMsg)

    // overwrite gameondb if null with new game data
    const newGame = await createGameOnDb(match, gameMsg)

    gameOnDb = newGame[0]
  }

  if (lastVote) {

    await db.update(vote).set({
      forId: gameOnDb?.id,
      updatedAt: now
    })
      .where(eq(vote.id, lastVote.id))

    io.to("main")
      .emit("voteUpdate", {
        game: {
          name: gameOnDb?.name || gameMsg,
          id: gameOnDb?.id,
        },
        user: { name: userById.name, id: userById.id },
      });
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


    io.to("main")
      .emit("vote", {
        game: {
          name: gameOnDb?.name || gameMsg,
          id: gameOnDb?.id,
        },
        user: { name: userById.name, id: userById.id },
      });
  }
  
  if (!gameOnDb) throw new Error("no game")
}
