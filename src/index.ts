import "dotenv/config";
import type { ChatUserstate, Userstate } from "tmi.js";
import { demoMsg, usernames } from "./data";
import { TZDate } from "@date-fns/tz";
import { isAfter, isBefore, subDays } from "date-fns";
import { checkENV, loadGames, getDateRange, getSteamAppIdFromURL, getGameOnDb, updateGame, findClosestSteamGame, createGameOnDb, delay } from "./lib";
import { initSocket, io } from "./socket";
import { initTwitchIRC } from "./twitch";
import { db } from "./db";
import { and, between, eq } from "drizzle-orm";
import { user, vote, vote } from "./db/schema";

const CHANNEL = process.env.TWITCH_CHANNEL_NAME;

console.log(process.env.SOCKET_ORIGIN);
await init()

async function init(){
   checkENV(CHANNEL as string)
   await loadGames()
    // runDev()
   initSocket()
   initTwitchIRC(CHANNEL)
}

export async function onMessage(message: string, userstate: ChatUserstate) {
  if (message.trim().startsWith("!vote")) {
    if (userstate["custom-reward-id"] && !userstate.subscriber) {
      const username = userstate.username;
      const gameDirty = message.trim().split("!vote")
      const game = (gameDirty[1] as string).trim();
      console.log(`[REWARD] ${username} issued !vote for ${game}`);
      registerVote(userstate, game);
    }
    if (userstate.subscriber) {
      const username = userstate.username;
      const gameDirty = message.trim().split("!vote")
      const game = (gameDirty[1] as string).trim();
      console.log(`[SUB] ${username} issued !vote for ${game}`);
      registerVote(userstate, game);
    }
  }
}
// this gets triggered if valid vote string
async function registerVote(userstate: ChatUserstate, gameMsg: string) {
  const now = new TZDate(new Date(), process.env.TZ)
  const range = getDateRange()
  // get current vote range
  let userById: any
    userById = await db.query.user.findFirst({
        where: ((user, {eq} )=> eq(user.id, parseInt(userstate["user-id"] as string) || 0)),
    })
    
    if (!userById){
        // create user
        userById = await db.insert(user).values({
            id: parseInt(userstate["user-id"] as string) || 0,
            name: userstate.username,
            sub: userstate.subscriber || false,
            createdAt: now,
            updatedAt: now,
            streak: 0
        }).returning()
    }
    const lastVote = await db.query.vote.findFirst({
        where: 
        and(eq(vote.fromId, parseInt(userstate["user-id"] as string) || 0),
          between(vote.createdAt, range.currentPeriod.startDate.toDateString(),
          range.currentPeriod.endDate.toDateString()
        )) 
    })

  const isAfterEnd = isAfter(now, range.currentPeriod.endDate)

  if (isAfterEnd){
    console.log(`[SUB] ${user.name} cannot vote out of range, game: ${gameMsg}`);
    return;
  }

  
  // https://github.com/fr0gtech/subsunday-back/issues/1
  // a user vote should change if already votes no need to check if already voted
  // const userCanVote = await canUserVote(user.id, range.currentPeriod);
  // if (!userCanVote) {
  //   console.log(`[SUB] ${user.name} cannot vote, game: ${gameMsg}`);
  //   return;
  // }

  // parse vote if not just game name
    // some vote with a steam link so maybe support that?
    // not sure what else should be supported
  let idFromLink = getSteamAppIdFromURL(gameMsg)

  // check if we got game on db with exact title match
  let gameOnDb = await getGameOnDb(gameMsg, idFromLink)
  // console.log(gameOnDb);
  
  
  // if we got game check when it last was updated
  // if we don't already have game do matching
  if (!gameOnDb) {
    
    // match game to a steam game
    const match = idFromLink ? { name: "", appId: parseInt(idFromLink)} : await findClosestSteamGame(gameMsg)
    
    // overwrite gameondb if null with new game data
    const newGame = await createGameOnDb(match, gameMsg)
    gameOnDb = newGame[0]
  }

  // if game is older than x we update its contents
  // if (isBefore(gameOnDb?.updatedAt as any, subDays(new Date(), 1)) && gameOnDb){
  //   // update game on db data
  //   await updateGame(gameOnDb)
  // }

  // at last we create the vote
  if(lastVote){
    await db.update(vote).set({
      forId: gameOnDb?.id,
      updatedAt: now.toDateString()
    })
    .where(eq(vote.fromId, lastVote.id))
    // await prisma.vote.update({
    //   where:{
    //     id: user.votes[0].id
    //   },
    //   data:{
    //     updatedAt: new TZDate(new Date(), process.env.TZ),
    //     for:{
    //       connect:{
    //         name: gameOnDb?.name || gameMsg,
    //       }
    //     }
    //   }
    // })

    io.to("main")
    .emit("voteUpdate", {
      for: {
        name: gameOnDb?.name || gameMsg,
        id: gameOnDb?.id,
      },
      from: { name: user.name, id: user.id },
    });

  }else{
        console.log("create new vote");

    // update user to have vote so we are able to increment streak here
      
     const newVote = await db.insert(vote).values({
      forId: gameOnDb?.id as number,
      fromId: userById[0].id as number,
      voteText: gameMsg,
      updatedAt: now,
      createdAt: now
        }).returning()
    // await prisma.user.update({
    //   where:{
    //     id: user.id
    //   },
    //   data:{
    //     streak: {increment: 1},
    //     votes:{
    //       create:{
    //         for:{
    //           connect:{
    //             name: gameOnDb?.name
    //           }
    //         },
    //         createdAt: new TZDate(new Date(), process.env.TZ),
    //       }
    //     }
    //   }
    // })

    io.to("main")
    .emit("vote", {
      for: {
        name: gameOnDb?.name || gameMsg,
        id: gameOnDb?.id,
      },
      from: { name: userById[0].name, id: userById[0].id },
    });
  }
  if (!gameOnDb) throw new Error("no game")
  // also send ws messages to every room

}

// // FOR DEVING IGNORE THIS
function runDev(){
  setInterval(async()=>{
    const randomId = demoMsg.sub.userstate
    randomId["user-id"] = (Math.ceil(Math.random() * 10000)).toString()
    randomId.username = usernames[Math.floor(Math.random() * usernames.length)] as string;

    await onMessage(`!vote https://store.steampowered.com/app/578080/PUBG_BATTLEGROUNDS/`, randomId as any)
    await delay(300);
  }, 5000)
}
    //  setInterval(() => {
    //      io.to("main").emit("vote", {for: {name: "Sea of Stars", id: 123}, from: {name: "gaggi", id: 123}})
    //      console.log("send msg");
    //  }, 1000);

