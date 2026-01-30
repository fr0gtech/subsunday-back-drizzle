import "dotenv/config";
import type { ChatUserstate } from "tmi.js";
import { demoMsg, usernames } from "./data";
import { TZDate } from "@date-fns/tz";
import { addDays, isAfter } from "date-fns";

import {
  checkENV,
  loadGames,
  getDateRange,
  getSteamAppIdFromURL,
  getGameOnDb,
  findClosestSteamGame,
  createGameOnDb,
  delay,
  increment,
  updateGame,
  checkIfSteamBanned,
  updateGameIGDB
} from "./lib";
import { sleep } from "bun";

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

import { game, user, vote } from "./db/schema";
import { createGameFromIGDB, findOnIGDB, IGDBToGameForDb } from "./igdb";
import type { Game } from "./db/types";

const CHANNEL = process.env.TWITCH_CHANNEL_NAME;
await init()

async function init() {
  console.log(`${new TZDate(new Date(), process.env.TIMEZONE)}`);
  await checkIfSteamBanned()
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

export async function registerVote(userstate: ChatUserstate, gameMsg: string, timestamp?: string) {
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

  const now = timestamp ? new Date(timestamp) : new Date()

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
    // new vote for this period
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


export async function findGame(gameMsg: string){

  let idFromLink = getSteamAppIdFromURL(gameMsg)

  // lets say someone votes for a game that we cannot match with like $steamgame LULW
  // but there is a game for it now. how can we make it so we will still match it? and avoid adding votes to the wrong game?
  // if we start filtering out emotes and stuff this will just create new problems we never know if its actually part of the game name

  // there is also a problem with how game manage numbers like $steamgame 2 or $steamgame II
  // not sure how to fix without creating new problems
  // we could just regex for a roman number at the end of a game and search in both direction but idk kinda messy, igdb does also not handle this well example: CODE VEIN II

  let gameOnDb: Game | undefined = await getGameOnDb(gameMsg, idFromLink)
  
  // game on db was updated more than 24h ago so update it again and try to match to steam
  if (gameOnDb && gameOnDb.steamId > 0){
    if (isAfter(addDays(gameOnDb?.updatedAt as Date, 1), new Date()) ){
        
      const updatedGame = await updateGame(gameOnDb)
      if (updatedGame){
        gameOnDb = updatedGame[0]
      }
    }
  }else if (gameOnDb?.steamId === 0 && gameOnDb.igdbId){
      const gameOnIGDB = await findOnIGDB("", gameOnDb.igdbId)
      if (!gameOnIGDB) return
      const data = IGDBToGameForDb(gameOnIGDB)
      await db.update(game).set(data).where((eq(game.igdbId, gameOnDb.igdbId)))
    // update non steam game
    // for now we do not upload non steam games but would be easy
  }
  // we try to find a steam game
  const match = idFromLink ? { name: "", appId: parseInt(idFromLink) } : await findClosestSteamGame(gameMsg)
  
  if (!match.appId && !gameOnDb){
    const gameOnIGDB = await findOnIGDB(gameMsg)
    // console.log("found game", gameOnIGDB, gameMsg);
    
    if (gameOnIGDB){
      const newGame = await createGameFromIGDB(gameOnIGDB)
      gameOnDb = newGame[0]
    }else{
      const newGame = await createGameOnDb(match, gameMsg)
      gameOnDb = newGame[0]     
    }
  }else if (!gameOnDb){
      const newGame = await createGameOnDb(match, gameMsg)
      gameOnDb = newGame[0]   
  }

  return gameOnDb
}